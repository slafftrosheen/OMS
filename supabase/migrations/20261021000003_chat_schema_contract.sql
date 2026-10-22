-- Existing-table installs missed room order links and message attachment data.
-- Keep the established text/content, reply_to_id and is_* message columns.
BEGIN;
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.chat_messages
SET content=COALESCE(content,text), is_edited=COALESCE(is_edited,FALSE),
    is_deleted=COALESCE(is_deleted,FALSE)
WHERE content IS NULL OR is_edited IS NULL OR is_deleted IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_order_id ON public.chat_rooms(order_id)
  WHERE order_id IS NOT NULL;

-- Resolve both paths: room-less order messages and room messages whose room
-- links an order. Requiring both IDs to agree prevents cross-order routing.
CREATE OR REPLACE FUNCTION public.can_access_chat_message(p_order_id UUID, p_room_id TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY INVOKER
SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
    AND (p_order_id IS NULL OR public.can_access_order(p_order_id))
    AND CASE WHEN p_room_id IS NULL THEN p_order_id IS NOT NULL ELSE EXISTS (
      SELECT 1 FROM public.chat_rooms r WHERE r.id=p_room_id
        AND (r.order_id IS NULL OR (
          public.can_access_order(r.order_id)
          AND (p_order_id IS NULL OR p_order_id=r.order_id)))
        AND (r.order_id IS NOT NULL OR NOT r.is_private OR public.is_admin()
          OR EXISTS (SELECT 1 FROM public.chat_room_members m
            WHERE m.room_id=r.id AND m.user_id=auth.uid()))
    ) END;
$$;
REVOKE ALL ON FUNCTION public.can_access_chat_message(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_chat_message(UUID,TEXT) TO authenticated;

DROP POLICY IF EXISTS chat_messages_read ON public.chat_messages;
CREATE POLICY chat_messages_read ON public.chat_messages FOR SELECT TO authenticated
USING (public.can_access_chat_message(order_id,room_id));
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK ((user_id=auth.uid() OR user_id IS NULL)
  AND public.can_access_chat_message(order_id,room_id));

-- The service uses soft deletion. Moderators may update visible messages;
-- author-only editing remains enforced by the HTTP service as before.
DROP POLICY IF EXISTS chat_messages_update_own ON public.chat_messages;
CREATE POLICY chat_messages_update_own ON public.chat_messages FOR UPDATE TO authenticated
USING (auth.uid()=user_id OR public.is_admin())
WITH CHECK ((auth.uid()=user_id OR public.is_admin())
  AND public.can_access_chat_message(order_id,room_id));

-- Existing room identity is reused by ensureRoom, not overwritten. Owners and
-- administrators may archive rooms through the existing DELETE HTTP route.
DROP POLICY IF EXISTS chat_rooms_update_owner ON public.chat_rooms;
CREATE POLICY chat_rooms_update_owner ON public.chat_rooms FOR UPDATE TO authenticated
USING (auth.uid()=created_by OR public.is_admin())
WITH CHECK (auth.uid()=created_by OR public.is_admin());
NOTIFY pgrst,'reload schema';
COMMIT;
