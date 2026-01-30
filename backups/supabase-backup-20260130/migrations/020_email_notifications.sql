/**
 * Email Notifications System Migration
 * Email queue, templates, preferences, and delivery tracking
 */

-- Email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template details
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template type
  category TEXT NOT NULL CHECK (
    category IN ('order', 'station', 'loading', 'system', 'digest', 'alert')
  ),
  
  -- Content
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  
  -- Variables used in template
  variables TEXT[] DEFAULT '{}',
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  
  -- Version control
  version INTEGER DEFAULT 1
);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Email preferences
  email_enabled BOOLEAN DEFAULT true,
  
  -- Notification types
  order_created BOOLEAN DEFAULT true,
  order_updated BOOLEAN DEFAULT true,
  order_assigned BOOLEAN DEFAULT true,
  order_completed BOOLEAN DEFAULT false,
  
  station_issue BOOLEAN DEFAULT true,
  station_rework BOOLEAN DEFAULT true,
  station_quality_check BOOLEAN DEFAULT false,
  
  loading_day_full BOOLEAN DEFAULT true,
  loading_reminder BOOLEAN DEFAULT true,
  
  comment_mentioned BOOLEAN DEFAULT true,
  photo_added BOOLEAN DEFAULT false,
  
  -- Digest preferences
  daily_digest BOOLEAN DEFAULT false,
  weekly_digest BOOLEAN DEFAULT true,
  digest_time TIME DEFAULT '09:00:00',
  
  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  
  UNIQUE(user_id)
);

-- Email queue table
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Email details
  template_key TEXT REFERENCES email_templates(template_key),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  
  -- Template variables
  variables JSONB,
  
  -- Priority
  priority TEXT DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')
  ),
  error_message TEXT,
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email delivery log
CREATE TABLE IF NOT EXISTS email_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  email_queue_id UUID REFERENCES email_queue(id) ON DELETE CASCADE,
  
  -- Delivery details
  provider TEXT, -- 'sendgrid', 'postmark', 'resend', etc.
  provider_message_id TEXT,
  
  -- Status
  event_type TEXT NOT NULL CHECK (
    event_type IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed')
  ),
  
  -- Additional info
  error_message TEXT,
  metadata JSONB,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_templates_key ON email_templates(template_key);
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_email_templates_active ON email_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);
CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_scheduled ON email_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_email_queue_priority ON email_queue(priority, created_at);
CREATE INDEX idx_email_delivery_log_queue ON email_delivery_log(email_queue_id);
CREATE INDEX idx_email_delivery_log_event ON email_delivery_log(event_type, created_at DESC);

-- RLS Policies
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active email templates"
  ON email_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own notification preferences"
  ON notification_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own email queue"
  ON email_queue FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "System can manage email queue"
  ON email_queue FOR ALL
  TO authenticated
  USING (true); -- Service role should handle this

CREATE POLICY "Users can view own delivery logs"
  ON email_delivery_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM email_queue eq
      WHERE eq.id = email_delivery_log.email_queue_id
        AND eq.recipient_user_id = auth.uid()
    )
  );

-- Function to queue email
CREATE OR REPLACE FUNCTION queue_email(
  p_recipient_email TEXT,
  p_recipient_user_id UUID,
  p_template_key TEXT,
  p_variables JSONB DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_id UUID;
  v_template RECORD;
  v_subject TEXT;
  v_body_html TEXT;
  v_body_text TEXT;
  v_prefs RECORD;
BEGIN
  -- Get user preferences
  SELECT * INTO v_prefs
  FROM notification_preferences
  WHERE user_id = p_recipient_user_id;
  
  -- Check if email notifications are enabled
  IF v_prefs.user_id IS NOT NULL AND v_prefs.email_enabled = false THEN
    RAISE NOTICE 'Email notifications disabled for user %', p_recipient_user_id;
    RETURN NULL;
  END IF;
  
  -- Check quiet hours
  IF v_prefs.quiet_hours_enabled THEN
    IF CURRENT_TIME BETWEEN v_prefs.quiet_hours_start AND v_prefs.quiet_hours_end THEN
      -- Reschedule after quiet hours
      p_scheduled_at := CURRENT_DATE + v_prefs.quiet_hours_end;
    END IF;
  END IF;
  
  -- Get template
  SELECT * INTO v_template
  FROM email_templates
  WHERE template_key = p_template_key AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template not found: %', p_template_key;
  END IF;
  
  -- Process template variables
  v_subject := v_template.subject;
  v_body_html := v_template.body_html;
  v_body_text := v_template.body_text;
  
  IF p_variables IS NOT NULL THEN
    -- Replace variables in subject and body
    FOR i IN SELECT jsonb_object_keys(p_variables) LOOP
      v_subject := REPLACE(v_subject, '{{' || i || '}}', p_variables->>i);
      v_body_html := REPLACE(v_body_html, '{{' || i || '}}', p_variables->>i);
      IF v_body_text IS NOT NULL THEN
        v_body_text := REPLACE(v_body_text, '{{' || i || '}}', p_variables->>i);
      END IF;
    END LOOP;
  END IF;
  
  -- Queue email
  INSERT INTO email_queue (
    recipient_email,
    recipient_user_id,
    template_key,
    subject,
    body_html,
    body_text,
    variables,
    priority,
    scheduled_at
  )
  VALUES (
    p_recipient_email,
    p_recipient_user_id,
    p_template_key,
    v_subject,
    v_body_html,
    v_body_text,
    p_variables,
    p_priority,
    COALESCE(p_scheduled_at, NOW())
  )
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$;

-- Function to send order notification
CREATE OR REPLACE FUNCTION send_order_notification(
  p_order_id UUID,
  p_notification_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_user RECORD;
  v_template_key TEXT;
  v_variables JSONB;
BEGIN
  -- Get order details
  SELECT * INTO v_order
  FROM draft_orders
  WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Determine template
  v_template_key := 'order_' || p_notification_type;
  
  -- Build variables
  v_variables := jsonb_build_object(
    'order_id', v_order.id,
    'po_number', v_order.po_number,
    'title', v_order.title,
    'client', v_order.client,
    'status', v_order.status,
    'order_url', 'https://app.example.com/orders/' || v_order.id
  );
  
  -- Send to assignees
  FOR v_user IN 
    SELECT u.id, u.email, np.*
    FROM auth.users u
    JOIN notification_preferences np ON np.user_id = u.id
    WHERE u.id = ANY(v_order.assignees)
  LOOP
    -- Check if user wants this notification type
    IF (p_notification_type = 'created' AND v_user.order_created) OR
       (p_notification_type = 'updated' AND v_user.order_updated) OR
       (p_notification_type = 'assigned' AND v_user.order_assigned) OR
       (p_notification_type = 'completed' AND v_user.order_completed) THEN
      
      PERFORM queue_email(
        v_user.email,
        v_user.id,
        v_template_key,
        v_variables,
        'normal'
      );
    END IF;
  END LOOP;
END;
$$;

-- Function to generate daily digest
CREATE OR REPLACE FUNCTION generate_daily_digest(
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_digest_data JSONB;
  v_queue_id UUID;
BEGIN
  -- Get user info
  SELECT u.*, np.*
  INTO v_user
  FROM auth.users u
  JOIN notification_preferences np ON np.user_id = u.id
  WHERE u.id = p_user_id;
  
  IF NOT FOUND OR v_user.daily_digest = false THEN
    RETURN NULL;
  END IF;
  
  -- Collect digest data
  v_digest_data := jsonb_build_object(
    'user_name', v_user.email,
    'date', CURRENT_DATE,
    
    'orders_created', (
      SELECT COUNT(*) FROM draft_orders
      WHERE created_at >= CURRENT_DATE
        AND p_user_id = ANY(assignees)
    ),
    
    'orders_updated', (
      SELECT COUNT(*) FROM draft_orders
      WHERE updated_at >= CURRENT_DATE
        AND updated_at::date = CURRENT_DATE
        AND p_user_id = ANY(assignees)
    ),
    
    'orders_completed', (
      SELECT COUNT(*) FROM draft_orders
      WHERE status = 'completed'
        AND updated_at >= CURRENT_DATE
        AND p_user_id = ANY(assignees)
    ),
    
    'open_issues', (
      SELECT COUNT(*) FROM station_logs
      WHERE is_issue = true
        AND issue_resolved = false
        AND order_id IN (
          SELECT id FROM draft_orders
          WHERE p_user_id = ANY(assignees)
        )
    ),
    
    'activities', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'station', station,
          'message', message,
          'created_at', created_at
        )
        ORDER BY created_at DESC
      )
      FROM station_logs
      WHERE created_at >= CURRENT_DATE
        AND order_id IN (
          SELECT id FROM draft_orders
          WHERE p_user_id = ANY(assignees)
        )
      LIMIT 10
    )
  );
  
  -- Queue digest email
  v_queue_id := queue_email(
    v_user.email,
    p_user_id,
    'daily_digest',
    v_digest_data,
    'low',
    CURRENT_DATE + v_user.digest_time
  );
  
  RETURN v_queue_id;
END;
$$;

-- Insert default email templates
INSERT INTO email_templates (template_key, name, category, subject, body_html, variables) VALUES
(
  'order_created',
  'Order Created',
  'order',
  'New Order Created: {{po_number}}',
  '<html><body><h2>New Order Created</h2><p>Order <strong>{{po_number}}</strong> has been created.</p><p><strong>Title:</strong> {{title}}</p><p><strong>Client:</strong> {{client}}</p><p><a href="{{order_url}}">View Order</a></p></body></html>',
  ARRAY['po_number', 'title', 'client', 'order_url']
),
(
  'order_assigned',
  'Order Assigned',
  'order',
  'You have been assigned to order {{po_number}}',
  '<html><body><h2>Order Assignment</h2><p>You have been assigned to order <strong>{{po_number}}</strong>.</p><p><strong>Title:</strong> {{title}}</p><p><strong>Client:</strong> {{client}}</p><p><a href="{{order_url}}">View Order</a></p></body></html>',
  ARRAY['po_number', 'title', 'client', 'order_url']
),
(
  'station_issue',
  'Station Issue Reported',
  'station',
  'Issue Reported: {{station}} - {{order_po}}',
  '<html><body><h2>Station Issue</h2><p>An issue has been reported at <strong>{{station}}</strong> for order <strong>{{order_po}}</strong>.</p><p><strong>Message:</strong> {{message}}</p><p><strong>Severity:</strong> {{severity}}</p><p><a href="{{order_url}}">View Order</a></p></body></html>',
  ARRAY['station', 'order_po', 'message', 'severity', 'order_url']
),
(
  'loading_day_full',
  'Loading Day Capacity Full',
  'loading',
  'Loading Day Full: {{date}}',
  '<html><body><h2>Loading Day Capacity Alert</h2><p>Loading day on <strong>{{date}}</strong> has reached maximum capacity.</p><p><strong>Capacity:</strong> {{current_capacity}}/{{max_capacity}}</p><p>No more orders can be assigned to this day.</p></body></html>',
  ARRAY['date', 'current_capacity', 'max_capacity']
),
(
  'daily_digest',
  'Daily Digest',
  'digest',
  'Your Daily Summary - {{date}}',
  '<html><body><h2>Daily Summary for {{date}}</h2><h3>Orders</h3><ul><li>Created: {{orders_created}}</li><li>Updated: {{orders_updated}}</li><li>Completed: {{orders_completed}}</li></ul><h3>Issues</h3><p>Open issues: {{open_issues}}</p><h3>Recent Activities</h3>{{activities_html}}</body></html>',
  ARRAY['date', 'orders_created', 'orders_updated', 'orders_completed', 'open_issues', 'activities_html']
);

-- Create default notification preferences for existing users
INSERT INTO notification_preferences (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE email_templates IS 'Email template definitions with variables';
COMMENT ON TABLE notification_preferences IS 'User notification preferences and settings';
COMMENT ON TABLE email_queue IS 'Email queue for asynchronous delivery';
COMMENT ON TABLE email_delivery_log IS 'Email delivery tracking and events';
COMMENT ON FUNCTION queue_email IS 'Queue email for delivery with template processing';
COMMENT ON FUNCTION send_order_notification IS 'Send notification to order assignees';
COMMENT ON FUNCTION generate_daily_digest IS 'Generate daily digest email for user';