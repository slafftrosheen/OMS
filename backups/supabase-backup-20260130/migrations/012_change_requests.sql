/**
 * Change Requests System Migration
 * Implements PR-style approval workflow for order modifications
 */

-- Change requests table
CREATE TABLE IF NOT EXISTS change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES draft_orders(id) ON DELETE CASCADE,
  
  -- Request metadata
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  
  -- Proposed changes (JSONB for flexibility)
  changes JSONB NOT NULL, -- Format: { field: { old: value, new: value } }
  
  -- Actors
  proposed_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  applied_by UUID REFERENCES auth.users(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  
  -- Metadata
  station TEXT, -- Which station proposed the change
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Indexes
  CONSTRAINT valid_review CHECK (
    (status IN ('pending') AND reviewed_by IS NULL) OR
    (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL) OR
    (status = 'applied' AND applied_by IS NOT NULL)
  )
);

-- CR comments table (discussion thread)
CREATE TABLE IF NOT EXISTS cr_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cr_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- CR activity log
CREATE TABLE IF NOT EXISTS cr_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cr_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'created', 'commented', 'approved', 'rejected', 'applied'
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cr_order ON change_requests(order_id);
CREATE INDEX idx_cr_status ON change_requests(status);
CREATE INDEX idx_cr_proposed_by ON change_requests(proposed_by);
CREATE INDEX idx_cr_created_at ON change_requests(created_at DESC);
CREATE INDEX idx_cr_comments_cr ON cr_comments(cr_id);
CREATE INDEX idx_cr_activity_cr ON cr_activity(cr_id);

-- RLS Policies
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr_activity ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view CRs
CREATE POLICY "Users can view change requests"
  ON change_requests FOR SELECT
  TO authenticated
  USING (true);

-- Users can create CRs
CREATE POLICY "Users can create change requests"
  ON change_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = proposed_by);

-- Only admins can approve/reject
CREATE POLICY "Admins can update change requests"
  ON change_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Comments policies
CREATE POLICY "Users can view CR comments"
  ON cr_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add CR comments"
  ON cr_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Activity log policies
CREATE POLICY "Users can view CR activity"
  ON cr_activity FOR SELECT
  TO authenticated
  USING (true);

-- Function to create CR and log activity
CREATE OR REPLACE FUNCTION create_change_request(
  p_order_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_changes JSONB,
  p_station TEXT,
  p_priority TEXT DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cr_id UUID;
BEGIN
  -- Create change request
  INSERT INTO change_requests (
    order_id, title, description, changes, proposed_by, station, priority
  )
  VALUES (
    p_order_id, p_title, p_description, p_changes, auth.uid(), p_station, p_priority
  )
  RETURNING id INTO v_cr_id;
  
  -- Log activity
  INSERT INTO cr_activity (cr_id, user_id, action, metadata)
  VALUES (v_cr_id, auth.uid(), 'created', jsonb_build_object('station', p_station));
  
  -- Create notification for admins
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT 
    user_id,
    'change_request',
    'New Change Request: ' || p_title,
    'A change request needs review for order',
    v_cr_id
  FROM user_profiles
  WHERE role = 'admin';
  
  RETURN v_cr_id;
END;
$$;

-- Function to approve/reject CR
CREATE OR REPLACE FUNCTION review_change_request(
  p_cr_id UUID,
  p_status TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_proposed_by UUID;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can review change requests';
  END IF;
  
  -- Update CR status
  UPDATE change_requests
  SET 
    status = p_status,
    reviewed_by = auth.uid(),
    reviewed_at = NOW()
  WHERE id = p_cr_id
  RETURNING order_id, proposed_by INTO v_order_id, v_proposed_by;
  
  -- Log activity
  INSERT INTO cr_activity (cr_id, user_id, action, metadata)
  VALUES (p_cr_id, auth.uid(), p_status, jsonb_build_object('comment', p_comment));
  
  -- Add comment if provided
  IF p_comment IS NOT NULL THEN
    INSERT INTO cr_comments (cr_id, user_id, comment)
    VALUES (p_cr_id, auth.uid(), p_comment);
  END IF;
  
  -- Notify proposer
  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_proposed_by,
    'change_request_' || p_status,
    'Change Request ' || UPPER(p_status),
    'Your change request has been ' || p_status,
    p_cr_id
  );
  
  RETURN TRUE;
END;
$$;

-- Function to apply approved CR
CREATE OR REPLACE FUNCTION apply_change_request(p_cr_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_changes JSONB;
  v_status TEXT;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can apply change requests';
  END IF;
  
  -- Get CR details
  SELECT order_id, changes, status
  INTO v_order_id, v_changes, v_status
  FROM change_requests
  WHERE id = p_cr_id;
  
  -- Check if CR is approved
  IF v_status != 'approved' THEN
    RAISE EXCEPTION 'Can only apply approved change requests';
  END IF;
  
  -- Apply changes to order (simplified - extend based on your order schema)
  -- This would need to be customized based on your specific fields
  UPDATE draft_orders
  SET 
    updated_at = NOW(),
    updated_by = auth.uid()
  WHERE id = v_order_id;
  
  -- Mark CR as applied
  UPDATE change_requests
  SET 
    status = 'applied',
    applied_by = auth.uid(),
    applied_at = NOW()
  WHERE id = p_cr_id;
  
  -- Log activity
  INSERT INTO cr_activity (cr_id, user_id, action)
  VALUES (p_cr_id, auth.uid(), 'applied');
  
  RETURN TRUE;
END;
$$;

COMMENT ON TABLE change_requests IS 'PR-style approval workflow for order modifications';
COMMENT ON FUNCTION create_change_request IS 'Create new change request with automatic activity logging';
COMMENT ON FUNCTION review_change_request IS 'Admin function to approve/reject change requests';
COMMENT ON FUNCTION apply_change_request IS 'Admin function to apply approved changes to orders';