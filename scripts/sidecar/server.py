"""
Reclame AI Lab — node sidecar (FastAPI).

Runs alongside Ollama on each AI node. Exposes the endpoints Ollama doesn't:

    POST /extract       — Qwen2.5-VL PDF/image extractor → markdown + tables
    POST /embed-image   — nomic-embed-vision-v1.5 cross-modal embed
    POST /rerank        — bge-reranker-v2-m3 cross-encoder
    POST /colpali/embed — vidore/colqwen2-v1.0 page embeddings
    POST /asr           — faster-whisper large-v3-turbo (file)
    POST /asr/url       — faster-whisper from URL
    POST /tts           — Kokoro-82M / Piper TTS
    POST /image/generate — Flux.1-dev/schnell text-to-image
    POST /image/edit     — Flux Fill inpaint / edit
    POST /image/matting  — RMBG-2.0 / BiRefNet
    POST /mesh/generate  — TRELLIS / Hunyuan3D image-to-mesh

Heavy models are loaded lazily on first request and kept warm. Capability
sets are partitioned by node via the SIDE_CAPS env var:

    SIDE_CAPS=vision,embed,asr      # ai1 — reasoning + RAG helpers
    SIDE_CAPS=image-gen,mesh-gen,asr,tts,rerank,colpali  # ai2 — generative

Capabilities the node doesn't have return 501 (Not Implemented). The swarm
router knows which node to ask, but this lets either node serve as a quick
fallback when one is offline.

Run:
    uvicorn server:app --host 0.0.0.0 --port 8800

For the production install scripts see install-node1.ps1 / install-node2.ps1.
"""

from __future__ import annotations

import base64
import io
import os
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

CAPS = set(os.environ.get("SIDE_CAPS", "vision,embed,asr").split(","))
PORT = int(os.environ.get("SIDE_PORT", "8800"))
DEVICE = os.environ.get("SIDE_DEVICE", "cuda")

app = FastAPI(title="Reclame AI Lab sidecar")


@app.get("/health")
async def health() -> dict[str, Any]:
    # Map high-level capabilities to actual exposed sub-features
    exposed_features = []
    if "vision" in CAPS: exposed_features.append("extract")
    if "embed" in CAPS: exposed_features.append("embed-image")
    if "rerank" in CAPS: exposed_features.append("rerank")
    if "colpali" in CAPS: exposed_features.append("colpali")
    if "asr" in CAPS: exposed_features.extend(["asr", "asr-url"])
    if "tts" in CAPS: exposed_features.append("tts")
    if "image-gen" in CAPS: exposed_features.extend(["image-generate", "image-edit", "image-matting"])
    if "mesh-gen" in CAPS: exposed_features.append("mesh-generate")

    return {
        "status": "up",
        "caps": sorted(CAPS),
        "features": exposed_features,
        "device": DEVICE
    }


def _require(cap: str) -> None:
    if cap not in CAPS:
        raise HTTPException(status_code=501, detail=f"capability '{cap}' disabled")


def _b64(buf: bytes) -> str:
    return base64.b64encode(buf).decode("ascii")


# ─── Vision extraction (Qwen2.5-VL) ───────────────────────────────────────────

@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    mime: str = Form("application/pdf"),
    dpi: int = Form(200),
    model: str = Form("hf.co/unsloth/Qwen2.5-VL-7B-Instruct-GGUF:Q5_K_M"),
    fallback_model: str = Form(""),
) -> JSONResponse:
    _require("vision")
    from extract_vision import extract_pages  # type: ignore[import-not-found]
    data = await file.read()
    pages = extract_pages(data, mime=mime, dpi=dpi, model=model, fallback=fallback_model)
    return JSONResponse({"pages": pages})


# ─── Cross-modal image embed (nomic-embed-vision) ────────────────────────────

@app.post("/embed-image")
async def embed_image(
    file: UploadFile = File(...),
    model: str = Form("nomic-embed-vision-v1.5"),
) -> JSONResponse:
    _require("embed")
    from embed_image import embed  # type: ignore[import-not-found]
    data = await file.read()
    vec = embed(data, model=model)
    return JSONResponse({"embedding": vec, "model": model})


# ─── Reranker (bge-reranker-v2-m3) ───────────────────────────────────────────

@app.post("/rerank")
async def rerank(payload: dict[str, Any]) -> JSONResponse:
    _require("rerank")
    from rerank import score_pairs  # type: ignore[import-not-found]
    query = str(payload.get("query", ""))
    cands = list(payload.get("candidates", []))
    model = str(payload.get("model", "BAAI/bge-reranker-v2-m3"))
    scores = score_pairs(query, cands, model=model)
    return JSONResponse({"scores": scores})


# ─── ColQwen2 (document-as-image late interaction) ───────────────────────────

@app.post("/colpali/embed")
async def colpali_embed(
    file: UploadFile = File(...),
    model: str = Form("vidore/colqwen2-v1.0"),
) -> JSONResponse:
    _require("colpali")
    from colqwen import embed_page  # type: ignore[import-not-found]
    data = await file.read()
    vectors = embed_page(data, model=model)
    return JSONResponse({"vectors": vectors})


# ─── ASR (faster-whisper) ────────────────────────────────────────────────────

@app.post("/asr")
async def asr_file(
    file: UploadFile = File(...),
    language: str = Form(""),
    model: str = Form("large-v3-turbo"),
) -> JSONResponse:
    _require("asr")
    from asr import transcribe_bytes  # type: ignore[import-not-found]
    data = await file.read()
    out = transcribe_bytes(data, language=language or None, model=model)
    return JSONResponse(out)


@app.post("/asr/url")
async def asr_url(payload: dict[str, Any]) -> JSONResponse:
    _require("asr")
    from asr import transcribe_url  # type: ignore[import-not-found]
    out = transcribe_url(
        str(payload["audio_url"]),
        language=payload.get("language"),
        model=str(payload.get("model", "large-v3-turbo")),
    )
    return JSONResponse(out)


# ─── TTS (Kokoro / Piper) ────────────────────────────────────────────────────

@app.post("/tts")
async def tts(payload: dict[str, Any]) -> JSONResponse:
    _require("tts")
    from tts import speak  # type: ignore[import-not-found]
    wav = speak(
        text=str(payload["text"]),
        voice=str(payload.get("voice", "af")),
        speed=float(payload.get("speed", 1.0)),
        model=str(payload.get("model", "hexgrad/Kokoro-82M")),
    )
    return JSONResponse({"b64_wav": _b64(wav)})


# ─── Image generation (Flux) ─────────────────────────────────────────────────

@app.post("/image/generate")
async def image_generate(payload: dict[str, Any]) -> JSONResponse:
    _require("image-gen")
    from image_gen import generate  # type: ignore[import-not-found]
    png, seed = generate(
        prompt=str(payload["prompt"]),
        negative=payload.get("negative"),
        width=int(payload.get("width", 1024)),
        height=int(payload.get("height", 1024)),
        steps=int(payload.get("steps", 28)),
        guidance=float(payload.get("guidance", 3.5)),
        seed=payload.get("seed"),
        model=str(payload.get("model", "black-forest-labs/FLUX.1-dev")),
        fallback=str(payload.get("fallback_model", "")),
    )
    return JSONResponse({"b64_png": _b64(png), "seed": seed})


@app.post("/image/edit")
async def image_edit(payload: dict[str, Any]) -> JSONResponse:
    _require("image-gen")
    from image_gen import edit  # type: ignore[import-not-found]
    png = edit(
        image_url=str(payload["image_url"]),
        mask_url=payload.get("mask_url"),
        prompt=str(payload["prompt"]),
        strength=float(payload.get("strength", 0.8)),
        model=str(payload.get("model", "black-forest-labs/FLUX.1-dev")),
    )
    return JSONResponse({"b64_png": _b64(png)})


@app.post("/image/matting")
async def image_matting(payload: dict[str, Any]) -> JSONResponse:
    _require("image-gen")
    from matting import remove_bg  # type: ignore[import-not-found]
    png = remove_bg(image_url=str(payload["image_url"]),
                    model=str(payload.get("model", "briaai/RMBG-2.0")))
    return JSONResponse({"b64_png": _b64(png)})


# ─── Mesh generation (TRELLIS / Hunyuan3D) ───────────────────────────────────

@app.post("/mesh/generate")
async def mesh_generate(payload: dict[str, Any]) -> JSONResponse:
    _require("mesh-gen")
    from mesh_gen import generate_glb  # type: ignore[import-not-found]
    glb = generate_glb(
        image_url=str(payload["image_url"]),
        steps=int(payload.get("steps", 50)),
        model=str(payload.get("model", "microsoft/TRELLIS-image-large")),
        fallback=str(payload.get("fallback_model", "")),
    )
    return JSONResponse({"b64_glb": _b64(glb)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
