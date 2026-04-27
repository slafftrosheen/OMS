<script lang="ts">
  // Forge — generative tools: image, mesh, ASR, TTS, matting.
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  type Artifact = { bucket: string; key: string; url: string; mime: string; bytes: number };
  type Tab = 'image' | 'mesh' | 'asr' | 'tts' | 'matting';
  let tab = $state<Tab>('image');

  // Image gen state
  let imgPrompt = $state('');
  let imgNeg = $state('');
  let imgW = $state(1024);
  let imgH = $state(1024);
  let imgSteps = $state(28);
  let imgBusy = $state(false);
  let imgArtifact = $state<Artifact | null>(null);
  let imgErr = $state('');

  async function genImage() {
    imgBusy = true; imgErr = ''; imgArtifact = null;
    try {
      const r = await fetch('/api/ai/forge/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt, negative: imgNeg || undefined,
          width: imgW, height: imgH, steps: imgSteps
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'failed');
      imgArtifact = j.artifact;
    } catch (e) { imgErr = (e as Error).message; }
    finally { imgBusy = false; }
  }

  // Mesh
  let meshUrl = $state('');
  let meshBusy = $state(false);
  let meshArtifact = $state<Artifact | null>(null);
  let meshErr = $state('');
  async function genMesh() {
    meshBusy = true; meshErr = ''; meshArtifact = null;
    try {
      const r = await fetch('/api/ai/forge/mesh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: meshUrl })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'failed');
      meshArtifact = j.artifact;
    } catch (e) { meshErr = (e as Error).message; }
    finally { meshBusy = false; }
  }

  // ASR
  let asrFile = $state<File | null>(null);
  let asrLang = $state('');
  let asrBusy = $state(false);
  let asrText = $state('');
  let asrErr = $state('');
  async function runAsr() {
    if (!asrFile) return;
    asrBusy = true; asrErr = ''; asrText = '';
    try {
      const fd = new FormData();
      fd.append('file', asrFile);
      if (asrLang) fd.append('language', asrLang);
      const r = await fetch('/api/ai/forge/asr', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'failed');
      asrText = j.text ?? '';
    } catch (e) { asrErr = (e as Error).message; }
    finally { asrBusy = false; }
  }

  // TTS
  let ttsText = $state('');
  let ttsVoice = $state('af');
  let ttsBusy = $state(false);
  let ttsArtifact = $state<Artifact | null>(null);
  let ttsErr = $state('');
  async function runTts() {
    ttsBusy = true; ttsErr = ''; ttsArtifact = null;
    try {
      const r = await fetch('/api/ai/forge/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText, voice: ttsVoice })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'failed');
      ttsArtifact = j.artifact;
    } catch (e) { ttsErr = (e as Error).message; }
    finally { ttsBusy = false; }
  }

  // Matting
  let matUrl = $state('');
  let matBusy = $state(false);
  let matArtifact = $state<Artifact | null>(null);
  let matErr = $state('');
  async function runMatting() {
    matBusy = true; matErr = ''; matArtifact = null;
    try {
      const r = await fetch('/api/ai/forge/matting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: matUrl })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'failed');
      matArtifact = j.artifact;
    } catch (e) { matErr = (e as Error).message; }
    finally { matBusy = false; }
  }
</script>

<div class="forge">
  <nav class="tabs">
    {#each [
      { k: 'image',   l: 'Image',   i: 'image' as IconName },
      { k: 'mesh',    l: '3D mesh', i: 'box' as IconName },
      { k: 'asr',     l: 'Transcribe', i: 'mic' as IconName },
      { k: 'tts',     l: 'Speak',   i: 'volume-2' as IconName },
      { k: 'matting', l: 'Cut-out', i: 'eraser' as IconName }
    ] as t}
      <button class:active={tab === t.k} onclick={() => (tab = t.k as Tab)}>
        <Icon name={t.i} size="sm" /> {t.l}
      </button>
    {/each}
  </nav>

  <section class="panel">
    {#if tab === 'image'}
      <div class="grid">
        <textarea bind:value={imgPrompt} placeholder="Prompt — describe the desired image" rows="4"></textarea>
        <textarea bind:value={imgNeg} placeholder="Negative prompt (optional)" rows="2"></textarea>
        <div class="row">
          <label>W <input type="number" bind:value={imgW} min="256" max="1536" step="64" /></label>
          <label>H <input type="number" bind:value={imgH} min="256" max="1536" step="64" /></label>
          <label>Steps <input type="number" bind:value={imgSteps} min="4" max="50" /></label>
          <button class="btn" onclick={genImage} disabled={imgBusy || !imgPrompt}>
            <Icon name="sparkles" size="sm" /> {imgBusy ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {#if imgErr}<p class="err">{imgErr}</p>{/if}
        {#if imgArtifact}<img class="result" src={imgArtifact.url} alt="Generated" />{/if}
      </div>

    {:else if tab === 'mesh'}
      <div class="grid">
        <input bind:value={meshUrl} placeholder="Image URL (paste a forge URL or any signed URL)" />
        <button class="btn" onclick={genMesh} disabled={meshBusy || !meshUrl}>
          <Icon name="box" size="sm" /> {meshBusy ? 'Generating…' : 'Generate mesh (GLB)'}
        </button>
        {#if meshErr}<p class="err">{meshErr}</p>{/if}
        {#if meshArtifact}
          <a class="dl" href={meshArtifact.url} download>
            <Icon name="download" size="sm" /> Download {meshArtifact.key.split('/').pop()}
          </a>
        {/if}
      </div>

    {:else if tab === 'asr'}
      <div class="grid">
        <input type="file" accept="audio/*,video/*" onchange={(e) => (asrFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
        <input bind:value={asrLang} placeholder="Language hint (optional, e.g. nl, en, de)" />
        <button class="btn" onclick={runAsr} disabled={asrBusy || !asrFile}>
          <Icon name="mic" size="sm" /> {asrBusy ? 'Transcribing…' : 'Transcribe'}
        </button>
        {#if asrErr}<p class="err">{asrErr}</p>{/if}
        {#if asrText}<pre class="result-text">{asrText}</pre>{/if}
      </div>

    {:else if tab === 'tts'}
      <div class="grid">
        <textarea bind:value={ttsText} placeholder="Text to speak…" rows="4"></textarea>
        <input bind:value={ttsVoice} placeholder="Voice (e.g. af, am_michael, bf_emma)" />
        <button class="btn" onclick={runTts} disabled={ttsBusy || !ttsText}>
          <Icon name="volume-2" size="sm" /> {ttsBusy ? 'Synthesising…' : 'Synthesise'}
        </button>
        {#if ttsErr}<p class="err">{ttsErr}</p>{/if}
        {#if ttsArtifact}
          <audio controls src={ttsArtifact.url}></audio>
        {/if}
      </div>

    {:else if tab === 'matting'}
      <div class="grid">
        <input bind:value={matUrl} placeholder="Image URL" />
        <button class="btn" onclick={runMatting} disabled={matBusy || !matUrl}>
          <Icon name="eraser" size="sm" /> {matBusy ? 'Working…' : 'Remove background'}
        </button>
        {#if matErr}<p class="err">{matErr}</p>{/if}
        {#if matArtifact}<img class="result" src={matArtifact.url} alt="Cut-out" />{/if}
      </div>
    {/if}
  </section>
</div>

<style>
  .forge { display: flex; flex-direction: column; gap: 12px; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .tabs button {
    background: transparent; border: 1px solid var(--glass-border); color: inherit;
    padding: 8px 12px; border-radius: var(--radius-full); cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px; font: inherit;
  }
  .tabs button.active {
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
    color: var(--brand);
  }
  .panel {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 16px;
  }
  .grid { display: grid; gap: 10px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  input, textarea {
    background: var(--surface, transparent);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 8px 10px; color: inherit; font: inherit;
  }
  input:focus, textarea:focus { outline: none; border-color: var(--brand); box-shadow: var(--focus-ring); }
  label { display: inline-flex; gap: 6px; align-items: center; }
  label input { width: 90px; }
  .btn {
    padding: 8px 14px; border-radius: var(--radius-full);
    background: var(--brand); color: white; border: 0;
    cursor: pointer; font: inherit;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .err { color: #ff453a; }
  .result { max-width: 100%; border-radius: var(--radius-md); border: 1px solid var(--glass-border); }
  .result-text { white-space: pre-wrap; }
  .dl { display: inline-flex; gap: 6px; align-items: center; color: var(--brand); text-decoration: none; }
</style>
