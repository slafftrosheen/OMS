-- Enable RLS for all public tables
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_event_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_capacities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- FILES
CREATE POLICY "Authenticated users can view files" ON public.files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can upload files" ON public.files FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- PROFILE TEMPLATES (Read-only for most)
CREATE POLICY "Authenticated users can view templates" ON public.profile_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view profile sections" ON public.profile_sections FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view profile fields" ON public.profile_fields FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view template versions" ON public.template_versions FOR SELECT USING (auth.role() = 'authenticated');

-- DRAFT ORDERS
CREATE POLICY "Authenticated users can view orders" ON public.draft_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create orders" ON public.draft_orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update orders" ON public.draft_orders FOR UPDATE USING (auth.role() = 'authenticated');

-- ORDER PROFILES
CREATE POLICY "Authenticated users can view order profiles" ON public.order_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create order profiles" ON public.order_profiles FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update order profiles" ON public.order_profiles FOR UPDATE USING (auth.role() = 'authenticated');

-- MATERIALS
CREATE POLICY "Authenticated users can view materials" ON public.materials FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage materials" ON public.materials FOR ALL USING (auth.role() = 'authenticated');

-- USER PREFERENCES
CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

-- AUDIT LOG
CREATE POLICY "Authenticated users can view audit logs" ON public.audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "System can insert audit logs" ON public.audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ORDER FILES
CREATE POLICY "Authenticated users can view order files" ON public.order_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can attach files" ON public.order_files FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- DELIVERY PRESETS
CREATE POLICY "Authenticated users can view delivery presets" ON public.delivery_presets FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage presets" ON public.delivery_presets FOR ALL USING (auth.role() = 'authenticated');

-- CALENDAR & LOADING
CREATE POLICY "Authenticated users can view calendar events" ON public.calendar_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage calendar events" ON public.calendar_events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view loading events" ON public.loading_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage loading events" ON public.loading_events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view meeting events" ON public.meeting_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage meeting events" ON public.meeting_events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view loading pos" ON public.loading_event_pos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage loading pos" ON public.loading_event_pos FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view loading days" ON public.loading_days FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage loading days" ON public.loading_days FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view capacity config" ON public.capacity_config FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view day capacities" ON public.day_capacities FOR SELECT USING (auth.role() = 'authenticated');

-- CHAT
CREATE POLICY "Authenticated users can view chat rooms" ON public.chat_rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create rooms" ON public.chat_rooms FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view messages" ON public.chat_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can send messages" ON public.chat_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- NOTIFICATIONS
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- STATION LOGS
CREATE POLICY "Authenticated users can view station logs" ON public.station_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create station logs" ON public.station_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- INVENTORY
CREATE POLICY "Authenticated users can view inventory items" ON public.inventory_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage inventory items" ON public.inventory_items FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view inventory stock" ON public.inventory_stock FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage inventory stock" ON public.inventory_stock FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view movements" ON public.inventory_movements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create movements" ON public.inventory_movements FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- FAQS
CREATE POLICY "Authenticated users can view faqs" ON public.faqs FOR SELECT USING (auth.role() = 'authenticated');