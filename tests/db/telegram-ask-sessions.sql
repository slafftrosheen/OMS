BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
DO $$
DECLARE c public.telegram_connections%ROWTYPE; r uuid; n bigint:=9007199254740000;
BEGIN
 SELECT * INTO STRICT c FROM public.telegram_connections LIMIT 1;
 UPDATE public.telegram_webhook_state SET last_command_at=now()-interval '2 minutes',last_ai_at=now()-interval '2 minutes' WHERE chat_id=c.chat_id;
 r:=public.process_telegram_bot_command(n,clock_timestamp(),'ask_followup',c.chat_id,c.telegram_user_id,'Unprompted text');
 IF r IS NOT NULL THEN RAISE EXCEPTION 'Unprompted text incorrectly queued'; END IF;
 UPDATE public.telegram_webhook_state SET last_ai_at=now() WHERE chat_id=c.chat_id;
 r:=public.process_telegram_bot_command(n,clock_timestamp(),'ask',c.chat_id,c.telegram_user_id,'');
 IF r IS NULL OR NOT EXISTS(SELECT 1 FROM public.telegram_bot_replies WHERE id=r AND payload->>'kind'='ask_prompt') THEN RAISE EXCEPTION 'Cooldown blocked menu prompt'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.telegram_ask_sessions WHERE user_id=c.user_id) THEN RAISE EXCEPTION 'Missing session'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.telegram_webhook_state WHERE chat_id=c.chat_id AND last_ai_at>=now()-interval '1 second') THEN RAISE EXCEPTION 'Prompt erased inference cooldown'; END IF;
 UPDATE public.telegram_webhook_state SET last_command_at=now()-interval '2 seconds',last_ai_at=now()-interval '2 minutes' WHERE chat_id=c.chat_id;
 r:=public.process_telegram_bot_command(n+1,clock_timestamp(),'ask_followup',c.chat_id,c.telegram_user_id,'Which orders need review?');
 IF r IS NULL OR NOT EXISTS(SELECT 1 FROM public.telegram_bot_replies WHERE id=r AND payload->>'question'='Which orders need review?') THEN RAISE EXCEPTION 'Followup not queued'; END IF;
 IF EXISTS(SELECT 1 FROM public.telegram_ask_sessions WHERE user_id=c.user_id) THEN RAISE EXCEPTION 'Consumed session retained'; END IF;
 r:=public.process_telegram_bot_command(n+2,clock_timestamp(),'ask_followup',c.chat_id,c.telegram_user_id,'Unexpected second message');
 IF r IS NOT NULL THEN RAISE EXCEPTION 'Followup reused session'; END IF;
 RAISE NOTICE 'PASS: menu during cooldown, inference cooldown preservation, followup and one-shot sessions';
END $$;
ROLLBACK;
