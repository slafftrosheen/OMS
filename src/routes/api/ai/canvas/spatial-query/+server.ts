import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.prompt || !Array.isArray(body.shapes)) {
        return json({ error: 'Valid prompt and shapes array required' }, { status: 400 });
    }

    const { prompt, shapes } = body;

    // Parse the spatial shapes into a cohesive context
    let spatialContext = '[Spatial Context provided by the Canvas Bounding Box]:\n';
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
            spatialContext += `Content: ${shape.props.text}\n`;
            hasContext = true;
        } else if (shape.type === 'forge' && shape.props) {
            spatialContext += `\n--- Generative Image Shape ---\n`;
            spatialContext += `Prompt used: "${shape.props.prompt}"\n`;
            if (shape.props.imageUrl) {
                spatialContext += `Image available at: ${shape.props.imageUrl}\n`;
            }
            hasContext = true;
        }
    }

    if (!hasContext) {
        spatialContext = '[No relevant spatial context found in the provided bounding box]\n';
    }

    const fullPrompt = `${spatialContext}\nUser Request: ${prompt}`;

    try {
        // Forward the constructed prompt to the AI session or directly via swarmChat
        // For simplicity, we use the local /api/ai/sessions/canvas-temp/messages endpoint pattern,
        // or just directly use swarmChat if we don't need persistent sessions for spatial queries.
        
        // Since we are just making a simple query, let's use the local API
        const res = await fetch(`${request.headers.get('origin')}/api/ai/sessions/canvas-temp/messages`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': request.headers.get('cookie') || '' 
            },
            body: JSON.stringify({ content: fullPrompt })
        }).catch(() => null);

        if (res && res.ok) {
            const data = await res.json();
            return json({ reply: data.content });
        } else {
            // Fallback mock if internal routing fails due to session requirements
            return json({ 
                reply: `Based on the spatial context provided (found ${shapes.length} shapes), you asked: "${prompt}".\n\n(Note: This is a fallback mock response. Ensure the AI session is properly configured.)` 
            });
        }
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
};
