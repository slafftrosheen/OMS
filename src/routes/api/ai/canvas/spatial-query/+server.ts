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

    for (const shape of shapes) {
        if (shape.type === 'maker' && shape.props) {
            spatialContext += `\n--- Maker.js Shape ---\n`;
            spatialContext += `Position: (x: ${Math.round(shape.x)}, y: ${Math.round(shape.y)})\n`;
            spatialContext += `Dimensions: ${shape.props.w}x${shape.props.h}\n`;
            spatialContext += `Parameters: ${JSON.stringify(shape.props.params)}\n`;
            spatialContext += `Code:\n${shape.props.code}\n`;
            hasContext = true;
        } else if (shape.type === 'text' && shape.props) {
            spatialContext += `\n--- Text Shape ---\n`;
            spatialContext += `Position: (x: ${Math.round(shape.x)}, y: ${Math.round(shape.y)})\n`;
            spatialContext += `Content: ${shape.props.text}\n`;
            hasContext = true;
        } else if (shape.type === 'document' && shape.props) {
            spatialContext += `\n--- Document Shape ---\n`;
            spatialContext += `Position: (x: ${Math.round(shape.x)}, y: ${Math.round(shape.y)})\n`;
            spatialContext += `Title: ${shape.props.title}\n`;
            spatialContext += `Content Summary: ${shape.props.content}\n`;
            hasContext = true;
        }
    }

    if (!hasContext) {
        spatialContext = '[No relevant spatial context found in the provided bounding box]\n';
    }

    const systemPrompt = `You are a spatial-aware AI operating on an infinite 2D canvas.
You have visibility into the user's workspace based on the [Spatial Context from Canvas] below.
When asked to modify code or generate content, consider the spatial relationships (e.g. shapes close to the user's prompt).
Output valid responses. If the user asks you to modify Maker.js code, output ONLY valid JavaScript code that can be run by Maker.js.

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
