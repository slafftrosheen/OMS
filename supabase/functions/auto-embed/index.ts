import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * auto-embed Edge Function
 * ────────────────────────
 * Backfills missing embeddings for the three vector tables:
 *
 *   - public.company_knowledge   (corporate knowledge from reclamefabriek.eu)
 *   - public.framework_docs      (external docs: Svelte, MDN, ...)
 *   - public.code_chunks         (codebase chunks used by match_code_chunks)
 *
 * Configuration (per Q9a):
 *   - Batch up to 50 rows per invocation, distributed across tables
 *   - Triggered every minute by pg_cron (see migration 20260425000012)
 *   - Uses nomic-embed-text via Ollama on the AI node
 *
 * Required environment:
 *   SUPABASE_URL                 set automatically by the Edge runtime
 *   SUPABASE_SERVICE_ROLE_KEY    set via supabase secrets set
 *   OLLAMA_URL                   default http://100.93.147.108:11434
 */

const TOTAL_BATCH = 50;
const TABLES = ["company_knowledge", "framework_docs", "code_chunks"] as const;
type Table = typeof TABLES[number];

Deno.serve(async (_req) => {
    const startedAt = new Date().toISOString();

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseKey =
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
            Deno.env.get("SUPABASE_ANON_KEY") ??
            "";

        if (!supabaseUrl || !supabaseKey) {
            return Response.json(
                { success: false, error: "Supabase credentials missing" },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const ollamaBase = Deno.env.get("OLLAMA_URL") ?? "http://100.93.147.108:11434";
        const ollamaUrl = `${ollamaBase.replace(/\/$/, "")}/api/embeddings`;
        const modelName = Deno.env.get("EMBED_MODEL") ?? "nomic-embed-text";

        // Distribute the 50-row budget across tables.  ceil(50 / 3) = 17, so
        // each table is allowed at most 17 rows per invocation; the global
        // counter ensures we never exceed 50 in total.
        const perTable = Math.ceil(TOTAL_BATCH / TABLES.length);
        let remaining = TOTAL_BATCH;
        let processed = 0;
        const errors: string[] = [];

        for (const table of TABLES) {
            if (remaining <= 0) break;
            const limit = Math.min(perTable, remaining);

            const { data: rows, error: fetchError } = await supabase
                .from(table)
                .select("id, content")
                .is("embedding", null)
                .order("crawled_at", { ascending: true })
                .limit(limit);

            if (fetchError) {
                errors.push(`${table}.fetch: ${fetchError.message}`);
                continue;
            }
            if (!rows || rows.length === 0) continue;

            for (const row of rows as Array<{ id: string; content: string }>) {
                try {
                    const r = await fetch(ollamaUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ model: modelName, prompt: row.content })
                    });

                    if (!r.ok) {
                        errors.push(`${table}.${row.id}.ollama: HTTP ${r.status}`);
                        continue;
                    }
                    const result = await r.json();
                    const embedding = result?.embedding;
                    if (!Array.isArray(embedding) || embedding.length === 0) {
                        errors.push(`${table}.${row.id}: empty embedding`);
                        continue;
                    }

                    const { error: updateError } = await supabase
                        .from(table)
                        .update({ embedding })
                        .eq("id", row.id);

                    if (updateError) {
                        errors.push(`${table}.${row.id}.update: ${updateError.message}`);
                        continue;
                    }
                    processed++;
                    remaining--;
                    if (remaining <= 0) break;
                } catch (err) {
                    errors.push(`${table}.${row.id}: ${(err as Error).message}`);
                }
            }
        }

        return Response.json({
            success: errors.length === 0,
            startedAt,
            finishedAt: new Date().toISOString(),
            processedCount: processed,
            budget: TOTAL_BATCH,
            tables: TABLES,
            errors
        });
    } catch (err) {
        return Response.json(
            { success: false, error: String(err), startedAt },
            { status: 500 }
        );
    }
});
