// Generative content via the AI node sidecars (Flux / TRELLIS / Whisper /
// Kokoro / RMBG-2.0). Each function dispatches to a capability tag and writes
// the result blob into the `forge` storage bucket so it can be reused across
// chats, attached to orders, or embedded into the knowledge base.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    BUCKET,
    MODEL,
    AILAB
} from '$lib/server/config';
import { swarmSidecar, swarmSidecarUpload } from '$lib/server/ai/swarm';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

interface ForgeArtifact {
    bucket: string;
    key: string;
    url: string;
    mime: string;
    bytes: number;
}

async function storeArtifact(
    folder: string,
    filename: string,
    data: Uint8Array,
    mime: string
): Promise<ForgeArtifact> {
    const key = `${folder}/${Date.now()}-${filename}`;
    const db = admin();
    const { error } = await db.storage
        .from(BUCKET.forge)
        .upload(key, data, { contentType: mime, upsert: false });
    if (error) throw new Error(`forge upload: ${error.message}`);
    const { data: signed } = await db.storage
        .from(BUCKET.forge)
        .createSignedUrl(key, 60 * 60 * 24 * 7);
    return {
        bucket: BUCKET.forge,
        key,
        url: signed?.signedUrl ?? '',
        mime,
        bytes: data.byteLength
    };
}

// ─── Image generation (Flux family) ─────────────────────────────────────────

export interface ImageGenArgs {
    prompt: string;
    negative?: string;
    width?: number;
    height?: number;
    steps?: number;
    guidance?: number;
    seed?: number;
}

export async function generateImage(args: ImageGenArgs): Promise<ForgeArtifact> {
    const body = {
        prompt: args.prompt,
        negative: args.negative,
        width: Math.min(args.width ?? 1024, AILAB.forge_imgMaxW),
        height: Math.min(args.height ?? 1024, AILAB.forge_imgMaxH),
        steps: args.steps ?? AILAB.forge_imgSteps,
        guidance: args.guidance ?? AILAB.forge_imgGuidance,
        seed: args.seed,
        model: MODEL.image.primary,
        fallback_model: MODEL.image.fallback
    };
    const { data } = await swarmSidecar<{ b64_png: string; seed: number }>(
        'image-gen',
        '/image/generate',
        body,
        { timeoutMs: 240_000 }
    );
    const buf = base64ToBytes(data.b64_png);
    return storeArtifact('image', `flux-${data.seed}.png`, buf, 'image/png');
}

// ─── Image edit / inpaint ──────────────────────────────────────────────────

export interface ImageEditArgs {
    image_url: string;
    mask_url?: string;
    prompt: string;
    strength?: number;
}

export async function editImage(args: ImageEditArgs): Promise<ForgeArtifact> {
    const { data } = await swarmSidecar<{ b64_png: string }>(
        'image-gen',
        '/image/edit',
        { ...args, model: MODEL.image.primary },
        { timeoutMs: 240_000 }
    );
    const buf = base64ToBytes(data.b64_png);
    return storeArtifact('image-edit', `edit-${Date.now()}.png`, buf, 'image/png');
}

// ─── Background removal / matting ──────────────────────────────────────────

export async function removeBackground(imageUrl: string): Promise<ForgeArtifact> {
    const { data } = await swarmSidecar<{ b64_png: string }>(
        'image-gen',
        '/image/matting',
        { image_url: imageUrl, model: MODEL.matting.primary },
        { timeoutMs: 120_000 }
    );
    const buf = base64ToBytes(data.b64_png);
    return storeArtifact('matting', `cutout-${Date.now()}.png`, buf, 'image/png');
}

// ─── Mesh generation (TRELLIS / Hunyuan3D) ─────────────────────────────────

export interface MeshGenArgs {
    image_url: string;
    steps?: number;
}

export async function generateMesh(args: MeshGenArgs): Promise<ForgeArtifact> {
    const body = {
        image_url: args.image_url,
        steps: args.steps ?? AILAB.forge_meshSteps,
        model: MODEL.mesh.primary,
        fallback_model: MODEL.mesh.fallback
    };
    const { data } = await swarmSidecar<{ b64_glb: string }>(
        'mesh-gen',
        '/mesh/generate',
        body,
        { timeoutMs: 600_000 }
    );
    const buf = base64ToBytes(data.b64_glb);
    return storeArtifact('mesh', `mesh-${Date.now()}.glb`, buf, 'model/gltf-binary');
}

// ─── ASR (whisper) ─────────────────────────────────────────────────────────

export interface AsrArgs {
    audio_url?: string;
    file?: { buf: Uint8Array; mime: string; filename: string };
    language?: string;
}

export async function transcribe(args: AsrArgs): Promise<{
    text: string;
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    artifact?: ForgeArtifact;
}> {
    if (args.file) {
        const form = new FormData();
        form.append('file', new Blob([args.file.buf as BlobPart], { type: args.file.mime }), args.file.filename);
        if (args.language) form.append('language', args.language);
        form.append('model', MODEL.asr.primary);
        const { response } = await swarmSidecarUpload('asr', '/asr', form, {
            timeoutMs: 600_000
        });
        const j = (await response.json()) as {
            text: string;
            language?: string;
            segments?: Array<{ start: number; end: number; text: string }>;
        };
        return j;
    }
    if (args.audio_url) {
        const { data } = await swarmSidecar<{
            text: string;
            language?: string;
            segments?: Array<{ start: number; end: number; text: string }>;
        }>('asr', '/asr/url', { audio_url: args.audio_url, model: MODEL.asr.primary, language: args.language });
        return data;
    }
    throw new Error('asr: audio_url or file required');
}

// ─── TTS (Kokoro / Piper) ──────────────────────────────────────────────────

export interface TtsArgs {
    text: string;
    voice?: string;
    speed?: number;
}

export async function speak(args: TtsArgs): Promise<ForgeArtifact> {
    const { data } = await swarmSidecar<{ b64_wav: string }>('tts', '/tts', {
        ...args,
        model: MODEL.tts.primary,
        fallback_model: MODEL.tts.fallback
    });
    const buf = base64ToBytes(data.b64_wav);
    return storeArtifact('tts', `speech-${Date.now()}.wav`, buf, 'audio/wav');
}

// ─── helpers ───────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
    if (!b64) throw new Error('empty base64');
    const pure = b64.includes(',') ? b64.split(',')[1] : b64;
    const binary = atob(pure);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}
