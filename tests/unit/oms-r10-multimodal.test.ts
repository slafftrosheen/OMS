import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { openRouterRequestBody } from '../../src/lib/server/ai/openrouter';
import { signatureMatches } from '../../src/lib/server/toolkit/assets';
import {
  toolkitMediaKind, toolkitMediaLimit, toolkitMediaContent, toolkitPdfEngine,
  extractedPdfEvidence, MAX_ANALYSIS_IMAGE_BYTES, MAX_ANALYSIS_PDF_BYTES
} from '../../src/lib/server/toolkit/media-analysis';

const read = (p: string) => readFileSync(p, 'utf8');

describe('OMS-R10 genuine Canvas image and PDF reasoning', () => {
  it('classifies uploaded formats strictly; never trust browser MIME guesses', () => {
    expect(toolkitMediaKind('image/png')).toBe('image');
    expect(toolkitMediaKind('image/jpeg')).toBe('image');
    expect(toolkitMediaKind('image/webp')).toBe('image');
    expect(toolkitMediaKind('application/pdf')).toBe('pdf');
    expect(toolkitMediaKind('image/svg+xml')).toBeNull();
    expect(toolkitMediaKind('image/gif')).toBeNull();
    expect(toolkitMediaKind('text/html')).toBeNull();
    expect(toolkitMediaLimit('image')).toBe(MAX_ANALYSIS_IMAGE_BYTES);
    expect(toolkitMediaLimit('pdf')).toBe(MAX_ANALYSIS_PDF_BYTES);
  });

  it('sends real image bytes as image_url base64 instead of a private OMS URL', () => {
    const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
    expect(signatureMatches('image/png', png)).toBe(true);
    const image = toolkitMediaContent('sample.png', 'image/png', png);
    expect(image).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${png.toString('base64')}` }
    });
    const body = openRouterRequestBody({ model: 'configured/vision',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Read this signage photo' },
        image
      ] }] });
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Read this signage photo' }, image
    ]);
  });

  it('sends private PDF bytes with correct file content type and explicit free parser', () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF');
    expect(signatureMatches('application/pdf', pdf)).toBe(true);
    const file = toolkitMediaContent('drawing.pdf', 'application/pdf', pdf);
    expect(file).toEqual({
      type: 'file', file: {
        filename: 'drawing.pdf',
        file_data: `data:application/pdf;base64,${pdf.toString('base64')}`
      }
    });
    expect(toolkitPdfEngine(undefined, false)).toBe('cloudflare-ai');
    expect(toolkitPdfEngine(false, false)).toBe('cloudflare-ai');
    expect(toolkitPdfEngine(true, false)).toBeNull();
    expect(toolkitPdfEngine(true, true)).toBe('mistral-ocr');
    const body = openRouterRequestBody({
      model: 'configured/pdf',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Read PDF' }, file] }],
      plugins: [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }]
    });
    expect(body).toHaveProperty('plugins', [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }]);
  });

  it('never returns embedded base64 page images as extracted text', () => {
    const annotations = [{
      type: 'file', file: {
        content: [
          { type: 'text', text: 'Panel dimensions: 900 x 600 mm' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,SENSITIVE' } },
          { type: 'text', text: 'Quantity: 3' }
        ]
      }
    }];
    const evidence = extractedPdfEvidence(annotations);
    expect(evidence).toContain('Panel dimensions');
    expect(evidence).toContain('Quantity: 3');
    expect(evidence).not.toContain('SENSITIVE');
    expect(extractedPdfEvidence(annotations, 5)).toHaveLength(5);
  });

  it('requires server-side RLS, board ownership, verified stored bytes and explicit paid-OCR gate', () => {
    const route = read('src/routes/api/toolkit/analyze-asset/+server.ts');
    expect(route).toContain('requireToolkitManager(locals.user)');
    expect(route).toContain('aiRateLimit(rateLimitIdentifier(event))');
    expect(route).toContain("from('canvas_documents')");
    expect(route).toContain("from('toolkit_assets')");
    expect(route).toContain(".eq('id', body.assetId).eq('canvas_id', body.boardId)");
    expect(route).toContain('signatureMatches(asset.mime_type');
    expect(route).toContain('bytes.length !== asset.bytes');
    expect(route).toContain("process.env.OPENROUTER_TOOLKIT_PDF_OCR === 'true'");
    expect(route).toContain("kind === 'pdf' ? toolkitPdfEngine(body.ocr, allowPaidOcr)");
    expect(route).toContain('openRouterCompleteWithMetadata(messages');
    expect(route).toContain('responseLanguageInstruction(locale)');
    expect(route).toContain("'Cache-Control': 'private, no-store'");
    expect(route).not.toContain('getPublicUrl');
    expect(route).not.toContain('createSignedUrl');
  });

  it('keeps media evidence private and never automatically mutates the shared drawing', () => {
    const ui = read('src/routes/toolkit/canvas/+page.svelte');
    expect(ui).toContain("fetch('/api/toolkit/analyze-asset'");
    expect(ui).toContain('originalBoard, token = activeLoadToken');
    expect(ui).toContain('token !== activeLoadToken');
    expect(ui).toContain('analyzedAssets = {');
    expect(ui).toContain('markDiscussionDirty()');
    expect(ui).toContain('confirm(tr(\'canvas.confirmPaidOcr\'))');
    expect(ui).toContain('usePaidPdfOcr = false');
    const fn = ui.split('async function analyzeSelectedAsset()')[1]?.split('function captureAnswer()')[0] ?? '';
    expect(fn).not.toContain('addCard(');
    expect(fn).not.toContain('editor.updateShape');
    expect(ui).toContain('function pinFileAnalysis()');
    expect(ui).toContain("addCard('research', tr('canvas.fileAnalysisCardTitle'");
    expect(ui).toContain('MODEL ANALYSIS');
    expect(ui).toContain('EXTRACTED PDF TEXT (provider-reported; untrusted source material)');
  });

  it('keeps every media UI string translated EN/RU/LV', () => {
    const locales = ['en','ru','lv'].map(l => JSON.parse(read(`src/locales/${l}.json`)).toolkit.canvas);
    const keys = [
      'fileUnderstanding','fileUnderstandingHint','imageModel','pdfModel',
      'enableScannedOcr','ocrCostWarning','analyzingFile','askSelectedFile',
      'analyzedFile','selectFileForAi','defaultFileQuestion','fileAnalysisQuestion',
      'fileAnalysisFailed','pdfTextReady','fileReasoningReady','confirmPaidOcr',
      'pinFileAnalysis','modelInterpretationLabel','parsedEvidenceLabel','fileAnalysisCardTitle'
    ];
    for (const key of keys) {
      for (const locale of locales) expect(locale[key], key).toBeTypeOf('string');
    }
  });
});
