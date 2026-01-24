/**
 * Webhooks and Integrations System Migration
 * Event-driven webhooks, integrations, and delivery tracking
 */

-- Webhook endpoints table
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Endpoint details
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  
  -- Authentication
  auth_type TEXT DEFAULT 'none' CHECK (
    auth_type IN ('none', 'bearer', 'basic', 'api_key', 'oauth2')
  ),
  auth_config JSONB,
  
  -- Events to listen to
  events TEXT[] NOT NULL DEFAULT '{}',
  
  -- Filters
  filters JSONB,
  
  -- Configuration
  headers JSONB DEFAULT '{}'::jsonb,
  timeout_seconds INTEGER DEFAULT 30,
  retry_enabled BOOLEAN DEFAULT true,
  max_retries INTEGER DEFAULT 3,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  last_triggered_at TIMESTAMPTZ,
  
  -- Ownership
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  
  -- Event details
  event_type TEXT NOT NULL,
  event_id UUID,
  
  -- Payload
  payload JSONB NOT NULL,
  headers JSONB,
  
  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sending', 'success', 'failed', 'cancelled')
  ),
  
  -- Response
  response_status_code INTEGER,
  response_body TEXT,
  response_headers JSONB,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  
  -- Timing
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Integration configurations
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Integration type
  integration_type TEXT NOT NULL CHECK (
    integration_type IN ('slack', 'teams', 'discord', 'zapier', 'custom')
  ),
  
  -- Configuration
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  
  -- Channel/destination mapping
  channels JSONB DEFAULT '{}'::jsonb,
  
  -- Event subscriptions
  subscribed_events TEXT[] NOT NULL DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  
  -- Ownership
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Event subscriptions
CREATE TABLE IF NOT EXISTS event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Subscriber
  subscriber_type TEXT NOT NULL CHECK (
    subscriber_type IN ('webhook', 'integration', 'user')
  ),
  subscriber_id UUID NOT NULL,
  
  -- Event configuration
  event_type TEXT NOT NULL,
  filters JSONB,
  
  -- Delivery preferences
  batch_enabled BOOLEAN DEFAULT false,
  batch_size INTEGER DEFAULT 10,
  batch_interval_seconds INTEGER DEFAULT 60,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event queue table (for async processing)
CREATE TABLE IF NOT EXISTS event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event details
  event_type TEXT NOT NULL,
  event_id UUID,
  
  -- Payload
  payload JSONB NOT NULL,
  metadata JSONB,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  
  -- Processing
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Priority
  priority INTEGER DEFAULT 5,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_webhook_endpoints_active ON webhook_endpoints(is_active) WHERE is_active = true;
CREATE INDEX idx_webhook_endpoints_events ON webhook_endpoints USING GIN(events);
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event_type, event_id);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(status, next_retry_at) WHERE status = 'failed' AND retry_count < 3;
CREATE INDEX idx_integrations_type ON integrations(integration_type);
CREATE INDEX idx_integrations_active ON integrations(is_active) WHERE is_active = true;
CREATE INDEX idx_event_subscriptions_subscriber ON event_subscriptions(subscriber_type, subscriber_id);
CREATE INDEX idx_event_subscriptions_event ON event_subscriptions(event_type);
CREATE INDEX idx_event_queue_status ON event_queue(status, priority DESC);
CREATE INDEX idx_event_queue_created ON event_queue(created_at);

-- RLS Policies
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhooks"
  ON webhook_endpoints FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can manage own webhooks"
  ON webhook_endpoints FOR ALL
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can view own webhook deliveries"
  ON webhook_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM webhook_endpoints we
      WHERE we.id = webhook_deliveries.webhook_endpoint_id
        AND we.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can view own integrations"
  ON integrations FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can manage own integrations"
  ON integrations FOR ALL
  TO authenticated
  USING (created_by = auth.uid());

-- Function to trigger webhook
CREATE OR REPLACE FUNCTION trigger_webhook(
  p_event_type TEXT,
  p_event_id UUID,
  p_payload JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_endpoint RECORD;
  v_delivery_id UUID;
BEGIN
  -- Find active webhooks subscribed to this event
  FOR v_endpoint IN
    SELECT * FROM webhook_endpoints
    WHERE is_active = true
      AND p_event_type = ANY(events)
  LOOP
    -- Check filters if present
    IF v_endpoint.filters IS NOT NULL THEN
      -- Basic filter matching (expand as needed)
      CONTINUE WHEN NOT (p_payload @> v_endpoint.filters);
    END IF;
    
    -- Create delivery record
    INSERT INTO webhook_deliveries (
      webhook_endpoint_id,
      event_type,
      event_id,
      payload,
      status
    )
    VALUES (
      v_endpoint.id,
      p_event_type,
      p_event_id,
      p_payload,
      'pending'
    )
    RETURNING id INTO v_delivery_id;
    
    -- Update last triggered
    UPDATE webhook_endpoints
    SET last_triggered_at = NOW()
    WHERE id = v_endpoint.id;
  END LOOP;
  
  -- Also add to event queue for integrations
  INSERT INTO event_queue (event_type, event_id, payload)
  VALUES (p_event_type, p_event_id, p_payload);
END;
$$;

-- Function to process integrations
CREATE OR REPLACE FUNCTION trigger_integrations(
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_integration RECORD;
BEGIN
  FOR v_integration IN
    SELECT * FROM integrations
    WHERE is_active = true
      AND p_event_type = ANY(subscribed_events)
  LOOP
    -- Add to event queue for async processing
    INSERT INTO event_queue (
      event_type,
      payload,
      metadata,
      priority
    )
    VALUES (
      p_event_type,
      p_payload,
      jsonb_build_object('integration_id', v_integration.id, 'integration_type', v_integration.integration_type),
      7 -- Higher priority for integrations
    );
  END LOOP;
END;
$$;

-- Trigger function to emit events on order changes
CREATE OR REPLACE FUNCTION emit_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'order.created';
    v_payload := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_event_type := 'order.updated';
    v_payload := jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW),
      'changes', jsonb_object_agg(key, value)
    )
    FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(OLD) -> key IS DISTINCT FROM value;
  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'order.deleted';
    v_payload := to_jsonb(OLD);
  END IF;
  
  -- Trigger webhooks and integrations
  PERFORM trigger_webhook(v_event_type, COALESCE(NEW.id, OLD.id), v_payload);
  PERFORM trigger_integrations(v_event_type, v_payload);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for draft_orders
DROP TRIGGER IF EXISTS trigger_emit_order_event ON draft_orders;
CREATE TRIGGER trigger_emit_order_event
  AFTER INSERT OR UPDATE OR DELETE ON draft_orders
  FOR EACH ROW
  EXECUTE FUNCTION emit_order_event();

-- Trigger for station logs
CREATE OR REPLACE FUNCTION emit_station_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_issue THEN
      v_event_type := 'station.issue_reported';
    ELSE
      v_event_type := 'station.log_created';
    END IF;
    v_payload := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_event_type := 'station.log_updated';
    v_payload := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  END IF;
  
  PERFORM trigger_webhook(v_event_type, NEW.id, v_payload);
  PERFORM trigger_integrations(v_event_type, v_payload);
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_emit_station_event ON station_logs;
CREATE TRIGGER trigger_emit_station_event
  AFTER INSERT OR UPDATE ON station_logs
  FOR EACH ROW
  EXECUTE FUNCTION emit_station_event();

-- View for webhook statistics
CREATE OR REPLACE VIEW webhook_statistics AS
SELECT
  we.id,
  we.name,
  we.url,
  we.is_active,
  COUNT(wd.id) as total_deliveries,
  COUNT(*) FILTER (WHERE wd.status = 'success') as successful_deliveries,
  COUNT(*) FILTER (WHERE wd.status = 'failed') as failed_deliveries,
  AVG(wd.duration_ms) FILTER (WHERE wd.status = 'success') as avg_duration_ms,
  MAX(wd.created_at) as last_delivery_at
FROM webhook_endpoints we
LEFT JOIN webhook_deliveries wd ON wd.webhook_endpoint_id = we.id
GROUP BY we.id, we.name, we.url, we.is_active;

COMMENT ON TABLE webhook_endpoints IS 'Webhook endpoint configurations';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery tracking and history';
COMMENT ON TABLE integrations IS 'External service integrations';
COMMENT ON TABLE event_subscriptions IS 'Event subscription management';
COMMENT ON TABLE event_queue IS 'Async event processing queue';
COMMENT ON FUNCTION trigger_webhook IS 'Trigger webhook deliveries for event';
COMMENT ON FUNCTION trigger_integrations IS 'Trigger integration notifications';
COMMENT ON VIEW webhook_statistics IS 'Webhook delivery statistics';