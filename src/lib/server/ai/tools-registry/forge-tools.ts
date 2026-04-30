import { swarmSidecar } from '../swarm';

export async function generateImage(args: { prompt: string; width?: number; height?: number; steps?: number; guidance?: number }) {
    const res = await swarmSidecar<{ b64_png: string; seed: string }>('image-gen', '/image/generate', {
        prompt: args.prompt,
        width: args.width ?? 1024,
        height: args.height ?? 1024,
        steps: args.steps ?? 28,
        guidance: args.guidance ?? 3.5
    });
    // Return the generated image URL or base64 so the AI can see it or link it
    // Often it's better to save it to storage and return the URL, but returning base64 directly might be too large for the LLM context.
    // However, if we just return a success message with the data URI, the UI can render it.
    return { status: "success", info: "Image generated successfully. Base64 omitted from text response to save context.", image_data: "data:image/png;base64," + res.data.b64_png };
}

export async function generateMesh(args: { image_url: string; steps?: number }) {
    const res = await swarmSidecar<{ b64_glb: string }>('mesh-gen', '/mesh/generate', {
        image_url: args.image_url,
        steps: args.steps ?? 50
    });
    return { status: "success", info: "Mesh generated successfully. Base64 omitted from text response to save context.", mesh_data: "data:model/gltf-binary;base64," + res.data.b64_glb };
}

export async function removeBackground(args: { image_url: string }) {
    const res = await swarmSidecar<{ b64_png: string }>('image-gen', '/image/matting', {
        image_url: args.image_url
    });
    return { status: "success", info: "Background removed successfully. Base64 omitted from text response.", image_data: "data:image/png;base64," + res.data.b64_png };
}

export async function textToSpeech(args: { text: string; voice?: string; speed?: number }) {
    const res = await swarmSidecar<{ b64_wav: string }>('tts', '/tts', {
        text: args.text,
        voice: args.voice ?? 'af',
        speed: args.speed ?? 1.0
    });
    return { status: "success", info: "Audio generated successfully.", audio_data: "data:audio/wav;base64," + res.data.b64_wav };
}

export async function transcribeAudio(args: { audio_url: string; language?: string }) {
    const res = await swarmSidecar<{ text: string }>('asr', '/asr/url', {
        audio_url: args.audio_url,
        language: args.language
    });
    return { status: "success", text: res.data.text };
}
