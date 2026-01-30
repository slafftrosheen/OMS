/**
 * QR Code System Migration
 * Enables QR code generation and scanning for orders
 */

-- QR codes table
CREATE TABLE IF NOT EXISTS order_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relations
  order_id UUID NOT NULL REFERENCES draft_orders(id) ON DELETE CASCADE,
  
  -- QR Code data
  qr_code TEXT NOT NULL UNIQUE, -- Unique identifier in QR
  qr_format TEXT NOT NULL DEFAULT 'QR' CHECK (
    qr_format IN ('QR', 'CODE128', 'CODE39', 'EAN13', 'DATAMATRIX')
  ),
  
  -- QR Code content structure
  payload JSONB NOT NULL, -- Full data encoded in QR
  
  -- Metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ, -- Optional expiry
  is_active BOOLEAN DEFAULT true,
  
  -- Usage tracking
  scan_count INTEGER DEFAULT 0,
  last_scanned_at TIMESTAMPTZ,
  last_scanned_by UUID REFERENCES auth.users(id)
);

-- QR scan history table
CREATE TABLE IF NOT EXISTS qr_scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  qr_code_id UUID NOT NULL REFERENCES order_qr_codes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES draft_orders(id) ON DELETE CASCADE,
  
  -- Scan details
  scanned_by UUID NOT NULL REFERENCES auth.users(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scan_location TEXT, -- GPS or station name
  device_info TEXT,
  
  -- Action taken after scan
  action_type TEXT CHECK (
    action_type IN ('view', 'stage_update', 'location_update', 'comment', 'photo', 'complete', 'rework')
  ),
  action_data JSONB,
  
  -- Context
  station TEXT,
  notes TEXT
);

-- Indexes
CREATE INDEX idx_qr_codes_order ON order_qr_codes(order_id);
CREATE INDEX idx_qr_codes_code ON order_qr_codes(qr_code);
CREATE INDEX idx_qr_codes_active ON order_qr_codes(is_active) WHERE is_active = true;
CREATE INDEX idx_qr_scan_history_code ON qr_scan_history(qr_code_id);
CREATE INDEX idx_qr_scan_history_order ON qr_scan_history(order_id);
CREATE INDEX idx_qr_scan_history_scanned ON qr_scan_history(scanned_at DESC);

-- RLS Policies
ALTER TABLE order_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view QR codes"
  ON order_qr_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can create QR codes"
  ON order_qr_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can view scan history"
  ON qr_scan_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can log scans"
  ON qr_scan_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = scanned_by);

-- Function to generate QR code for order
CREATE OR REPLACE FUNCTION generate_order_qr_code(
  p_order_id UUID,
  p_format TEXT DEFAULT 'QR'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qr_code_id UUID;
  v_qr_string TEXT;
  v_payload JSONB;
  v_order_data RECORD;
BEGIN
  -- Get order data
  SELECT id, po_number, title
  INTO v_order_data
  FROM draft_orders
  WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  -- Check if QR already exists
  IF EXISTS (
    SELECT 1 FROM order_qr_codes 
    WHERE order_id = p_order_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Active QR code already exists for this order';
  END IF;
  
  -- Generate unique QR string
  v_qr_string := 'OMS-' || p_order_id::text || '-' || EXTRACT(EPOCH FROM NOW())::TEXT;
  
  -- Build payload
  v_payload := jsonb_build_object(
    'orderId', p_order_id,
    'poNumber', v_order_data.po_number,
    'title', v_order_data.title,
    'type', 'order',
    'version', '1.0',
    'generatedAt', NOW()
  );
  
  -- Create QR code record
  INSERT INTO order_qr_codes (
    order_id,
    qr_code,
    qr_format,
    payload,
    generated_by
  )
  VALUES (
    p_order_id,
    v_qr_string,
    p_format,
    v_payload,
    auth.uid()
  )
  RETURNING id INTO v_qr_code_id;
  
  RETURN v_qr_code_id;
END;
$$;

-- Function to log QR scan
CREATE OR REPLACE FUNCTION log_qr_scan(
  p_qr_code TEXT,
  p_action_type TEXT DEFAULT 'view',
  p_action_data JSONB DEFAULT NULL,
  p_station TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_device_info TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qr_record RECORD;
  v_scan_id UUID;
BEGIN
  -- Get QR code record
  SELECT * INTO v_qr_record
  FROM order_qr_codes
  WHERE qr_code = p_qr_code AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR code not found or inactive';
  END IF;
  
  -- Check if expired
  IF v_qr_record.expires_at IS NOT NULL AND v_qr_record.expires_at < NOW() THEN
    RAISE EXCEPTION 'QR code has expired';
  END IF;
  
  -- Log scan
  INSERT INTO qr_scan_history (
    qr_code_id,
    order_id,
    scanned_by,
    action_type,
    action_data,
    station,
    notes,
    device_info
  )
  VALUES (
    v_qr_record.id,
    v_qr_record.order_id,
    auth.uid(),
    p_action_type,
    p_action_data,
    p_station,
    p_notes,
    p_device_info
  )
  RETURNING id INTO v_scan_id;
  
  -- Update QR code usage
  UPDATE order_qr_codes
  SET 
    scan_count = scan_count + 1,
    last_scanned_at = NOW(),
    last_scanned_by = auth.uid()
  WHERE id = v_qr_record.id;
  
  -- Return order data
  RETURN jsonb_build_object(
    'scanId', v_scan_id,
    'orderId', v_qr_record.order_id,
    'payload', v_qr_record.payload
  );
END;
$$;

-- View for QR scan statistics
CREATE OR REPLACE VIEW qr_scan_statistics AS
SELECT 
  oqr.id as qr_code_id,
  oqr.order_id,
  oqr.qr_code,
  oqr.scan_count,
  oqr.last_scanned_at,
  COUNT(qsh.id) as total_scans,
  COUNT(DISTINCT qsh.scanned_by) as unique_scanners,
  COUNT(DISTINCT qsh.station) as unique_stations,
  jsonb_object_agg(
    qsh.action_type, 
    COUNT(*)
  ) FILTER (WHERE qsh.action_type IS NOT NULL) as actions_by_type,
  MAX(qsh.scanned_at) as most_recent_scan
FROM order_qr_codes oqr
LEFT JOIN qr_scan_history qsh ON qsh.qr_code_id = oqr.id
GROUP BY oqr.id, oqr.order_id, oqr.qr_code, oqr.scan_count, oqr.last_scanned_at;

COMMENT ON TABLE order_qr_codes IS 'QR codes for order tracking and mobile scanning';
COMMENT ON TABLE qr_scan_history IS 'Audit trail of all QR code scans';
COMMENT ON FUNCTION generate_order_qr_code IS 'Generate unique QR code for order';
COMMENT ON FUNCTION log_qr_scan IS 'Log QR scan and return order data';
COMMENT ON VIEW qr_scan_statistics IS 'Statistics about QR code usage';