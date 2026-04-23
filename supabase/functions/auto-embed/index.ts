import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
    try {
        // 1. Initialize the Supabase client using standard Deno environment variables
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        // Use SERVICE_ROLE_KEY if available to bypass RLS, otherwise fallback to ANON_KEY
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        const supabase = createClient(supabaseUrl, supabaseKey);

        const ollamaUrl = "http://100.93.147.108:11434/api/embeddings";
        const modelName = "nomic-embed-text";
        let processedCount = 0;

        // Helper to process a table
        const processTable = async (tableName: string) => {
            // 2. Query the table for rows where the embedding column is NULL
            const { data: rows, error: fetchError } = await supabase
                .from(tableName)
                .select("id, content")
                .is("embedding", null)
                .limit(25); // Process in batches

            if (fetchError) {
                console.error(`Error fetching from ${tableName}:`, fetchError);
                return;
            }

            if (!rows || rows.length === 0) return;

            // 3. For each missing embedding, make an HTTP POST to Ollama API
            for (const row of rows) {
                try {
                    const response = await fetch(ollamaUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: modelName,
                            prompt: row.content
                        })
                    });

                    if (!response.ok) {
                        console.error(`Ollama API error for ${tableName} id ${row.id}:`, await response.text());
                        continue;
                    }

                    const result = await response.json();
                    const embedding = result.embedding;

                    if (!embedding) continue;

                    // 4. Update the database row with the returned vector array
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ embedding })
                        .eq("id", row.id);

                    if (updateError) {
                        console.error(`Update error for ${tableName} id ${row.id}:`, updateError);
                    } else {
                        processedCount++;
                    }
                } catch (err) {
                    console.error(`Failed processing ${tableName} id ${row.id}:`, err);
                }
            }
        };

        await processTable("company_knowledge");
        await processTable("framework_docs"); // Translates to docs_vector as requested

        return new Response(JSON.stringify({ success: true, processedCount }), {
            headers: { "Content-Type": "application/json" },
            status: 200
        });
    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
