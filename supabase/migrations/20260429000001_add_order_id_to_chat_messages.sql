-- Fix: Add order_id column to chat_messages for order-specific chat threads
-- This column is referenced by RLS policies in 20260430170000_rls_comprehensive_hardening.sql

ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES draft_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_order_id ON public.chat_messages(order_id);
