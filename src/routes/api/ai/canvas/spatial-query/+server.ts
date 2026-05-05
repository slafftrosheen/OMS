import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';
import { swarmChat } from '$lib/server/ai/swarm';
import { MODEL } from '$lib/server/config';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.prompt || !Array.isArray(body.shapes)) {
        return json({ error: 'Valid prompt and shapes array required' }, { status: 400 });
    }

    const { prompt, shapes, center } = body;

    // Parse the spatial shapes into a cohesive context
    let spatialContext = '[Spatial Context from Canvas]:\n';
    spatialContext += `User's prompt originated from roughly (x: ${Math.round(center?.x || 0)}, y: ${Math.round(center?.y || 0)}).\n`;
    
    let hasContext = false;

    const calcShapes = new Set(['lumigrid', 'led-strip', 'led-matrix', 'boxletter']);
    for (const shape of shapes) {
        if (!shape.props) continue;
        const pos = `(x: ${Math.round(shape.x)}, y: ${Math.round(shape.y)})`;
        if (shape.type === 'maker') {
            spatialContext += `\n--- Maker.js Shape ${pos} ---\n`;
            spatialContext += `Dimensions: ${shape.props.w}x${shape.props.h}\n`;
            spatialContext += `Parameters: ${JSON.stringify(shape.props.params)}\n`;
            spatialContext += `Code:\n${shape.props.code}\n`;
            hasContext = true;
        } else if (shape.type === 'text') {
            spatialContext += `\n--- Text Shape ${pos} ---\n${shape.props.text}\n`;
            hasContext = true;
        } else if (shape.type === 'document') {
            spatialContext += `\n--- Document ${pos} ---\nTitle: ${shape.props.title}\n${shape.props.content ?? ''}\n`;
            hasContext = true;
        } else if (shape.type === 'web-search' && shape.props.output?.hits) {
            const top = shape.props.output.hits.slice(0, 3)
                .map((h: { title: string; url: string; snippet: string }, i: number) =>
                    `  ${i + 1}. ${h.title} — ${h.url}\n     ${h.snippet?.slice(0, 200)}`)
                .join('\n');
            spatialContext += `\n--- Web Search ${pos} ---\nQuery: "${shape.props.output.query}"\n${top}\n`;
            hasContext = true;
        } else if (shape.type === 'crawl' && shape.props.output) {
            spatialContext += `\n--- Crawl ${pos} ---\n`;
            spatialContext += `URL: ${shape.props.output.final_url}\nTitle: ${shape.props.output.title}\n`;
            spatialContext += `${(shape.props.output.text ?? '').slice(0, 1500)}\n`;
            hasContext = true;
        } else if (calcShapes.has(shape.type) && shape.props.output) {
            spatialContext += `\n--- ${shape.type} ${pos} ---\n`;
            spatialContext += `Inputs: ${JSON.stringify(shape.props.inputs)}\n`;
            spatialContext += `Output: ${JSON.stringify(shape.props.output)}\n`;
            hasContext = true;
        }
    }

    if (!hasContext) {
        spatialContext = '[No relevant spatial context found in the provided bounding box]\n';
    }

    const systemPrompt = `You are Reclame AI operating on an infinite 2D canvas
inside the AI Lab. You can read the user's nearby shapes through the
[Spatial Context from Canvas] block below — Maker.js sketches, document
cards, web-search hits, crawl payloads, LumiGrid / LED-strip / LED-matrix /
box-letter calculator outputs.

Treat shapes that sit close to the user's prompt origin as the most relevant
context. If a calculator shape is upstream, quote its peak amps / PSU
sizing / refresh feasibility verbatim — never re-invent the numbers.
If the user asks to modify Maker.js code, output ONLY valid JavaScript that
runs through makerjs. Otherwise reply in concise plain English with bullet
points where it helps the floor staff.

${spatialContext}`;

    try {
        const result = await swarmChat({
            model: MODEL.chat,
            cap: 'coder', // Assuming coding capabilities might be needed often here
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            stream: false,
            temperature: 0.3
        });

        const data = await result.response.json();
        
        return json({ reply: data.message?.content || "No response" });
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
};
