import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeToolkitSkill, normalizeCanvasActions, boardInsights, TOOLKIT_SKILLS } from '../../src/lib/components/canvas/toolkit-skills';
import { normalizeProposals } from '../../src/lib/components/canvas/toolkit-context';
import { toolkitUploadReadiness, toolkitUploadLimitBytes, signatureMatches } from '../../src/lib/server/toolkit/assets';

const read = (path: string) => readFileSync(path, 'utf8');
const canvas = read('src/routes/toolkit/canvas/+page.svelte');
const api = read('src/routes/api/toolkit/brainstorm/+server.ts');

describe('OMS-R07 upload repair', () => {
  it('explains the adapter-node 512K default and accepts 32M for 25 MiB files', () => {
    expect(toolkitUploadLimitBytes(undefined)).toBe(512 * 1024);
    expect(toolkitUploadReadiness(undefined).ready).toBe(false);
    expect(toolkitUploadReadiness('BODY_LIMIT=25M').ready).toBe(false);
    expect(toolkitUploadReadiness('32M').ready).toBe(true);
    expect(toolkitUploadReadiness('26M').ready).toBe(true);
    expect(toolkitUploadReadiness('25M').ready).toBe(false);
    expect(toolkitUploadLimitBytes('garbage')).toBe(0);
  });
  it('rejects wrong file magic instead of trusting extensions', () => {
    expect(signatureMatches('application/pdf', new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(signatureMatches('application/pdf', new TextEncoder().encode('wrong'))).toBe(false);
  });
  it('checks capacity before transferring file content', () => {
    const upload = read('src/routes/api/toolkit/assets/[board]/+server.ts');
    const importer = read('src/lib/components/canvas/toolkit-media-import.ts');
    expect(upload).toContain('export const GET');
    expect(upload).toContain("from('toolkit_assets')");
    expect(upload).toContain(".list('', { limit: 1 })");
    expect(upload).toContain('toolkitUploadReadiness(process.env.BODY_SIZE_LIMIT)');
    expect(upload).toContain('Upload not configured: set BODY_SIZE_LIMIT=32M');
    expect(importer).toContain('capacity.ready !== true');
    expect(importer).toContain("body.append('file', file)");
    expect(importer).not.toContain('new File([original]');
    expect(read('.env.example')).toContain('BODY_SIZE_LIMIT=32M');
    expect(read('nginx.conf')).toContain('client_max_body_size 32m');
  });
});

describe('OMS-R07 Canvas skills and safe tool actions', () => {
  const ids = new Set(['shape:a','shape:b']);
  it('has eight discoverable explicit skills, and unknown skill fails to explore', () => {
    expect(TOOLKIT_SKILLS).toHaveLength(8);
    expect(normalizeToolkitSkill('research')).toBe('research');
    expect(normalizeToolkitSkill('__delete_database')).toBe('explore');
  });
  it('computes useful graph diagnostics without using a model', () => {
    const cards = [
      {id:'shape:a',kind:'idea' as const,title:'Prototype',body:'User test',state:'open'},
      {id:'shape:b',kind:'task' as const,title:'Cost estimate',body:'',state:'open'},
      {id:'shape:c',kind:'research' as const,title:'Suppliers',body:'Get quotes',state:'open'}
    ];
    const result = boardInsights(cards,[{from:'shape:a',to:'shape:b'}]);
    expect(result.totalCards).toBe(3);
    expect(result.unfinishedTasks).toBe(1);
    expect(result.disconnected.map(c=>c.id)).toEqual(['shape:c']);
    expect(result.cardsMissingDetails).toEqual(['Cost estimate']);
    expect(result.hasDecision).toBe(false);
  });
  it('strictly validates link/revision/layout proposals and rejects unknown targets', () => {
    const actions = normalizeCanvasActions([
      {kind:'connect',from:'shape:a',to:'shape:b',reason:'workflow'},
      {kind:'connect',from:'shape:a',to:'shape:intruder'},
      {kind:'revise',target:'shape:b',title:'Estimate costs',body:'Estimate quantities'},
      {kind:'revise',target:'shape:deleted',body:'overwrite'},
      {kind:'layout',layout:'columns',reason:'group by kind'},
      {kind:'delete',target:'shape:a'}
    ],ids);
    expect(actions.map(a=>a.kind)).toEqual(['connect','revise','layout']);
    expect(normalizeCanvasActions([{kind:'layout',layout:'delete_all'}],ids)).toEqual([]);
  });
  it('separates private tool drafts from ordinary idea proposals', () => {
    const mixed = [
      {kind:'idea',title:'Prototype',body:'small first version'},
      {kind:'connect',from:'shape:a',to:'shape:b',reason:'dependency'}
    ];
    expect(normalizeProposals(mixed)).toHaveLength(1);
    expect(normalizeCanvasActions(mixed)).toHaveLength(1);
    const route = read('src/routes/api/toolkit/conversations/[id]/+server.ts');
    expect(route).toContain('normalizeCanvasActions(body.proposals)');
    expect(route).toContain('normalizeProposals(body.proposals)');
    expect(route).toContain('user_id: user.id');
  });
  it('executes web research ONLY through selected research skill', () => {
    expect(api).toContain("if (skill === 'research' && webMode === 'searxng')");
    expect(api).toContain('webSearch({ query:');
    expect(api).toContain('boardInsights(cards, links)');
    expect(api).toContain('parseToolkitModelResponse(completion.text');
    expect(api).toContain('new Set(cards.map(c => c.id))');
    expect(api).toContain('requireToolkitManager(locals.user)');
    expect(api).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
  it('does not let model replies mutate an opened shared project', () => {
    const responseStage = canvas.split('async function brainstorm')[1]?.split('function captureAnswer')[0];
    expect(responseStage).not.toContain('applyToolkitAction(');
    expect(canvas).toContain('function approveAction(action: CanvasAction)');
    expect(canvas).toContain('onclick={() => approveAction(action)}');
    const actions = read('src/lib/components/canvas/toolkit-action-executor.ts');
    expect(actions).toContain("shape?.type === 'idea-card'");
    expect(actions).toContain('editor.createBindings([');
    expect(actions).toContain('getBindingsFromShape');
    expect(actions).toContain('editor.updateShapes(newPositions)');
    expect(actions).not.toContain('fetch(');
  });
  it('stops deprecated snapshot churn and flushes latest document on save', () => {
    const app = read('src/lib/components/canvas/CanvasApp.tsx');
    expect(app).toContain("import { Tldraw, getSnapshot");
    expect(app).not.toContain('editor.store.getSnapshot()');
    expect(canvas).not.toContain('editor.store.getSnapshot()');
    expect(app).toContain('setTimeout(capture, 250)');
    expect(app).toContain('onDocumentChange?.()');
    expect(app).toContain('if (!callbacksRef.current.onSave) return;');
    expect(canvas).toContain('lastSnapshot = { document: editor.store.getStoreSnapshot() }');
    expect(canvas).toContain('onDocumentChange={onDocumentChange}');
    expect(canvas).not.toContain('onSave={onCanvasChange}');
    expect(canvas).toContain('saveInFlight = (async () => {');
    expect(canvas.match(/captureCurrentDocument\(\);/g)).toHaveLength(2);
  });
  it('keeps private chat data off shared canvases and warns on insecure clipboard', () => {
    expect(canvas).toContain('const payload = { version: 1, snapshot: lastSnapshot }');
    expect(canvas).toContain('actionProposals.slice(0, 12)');
    expect(canvas).toContain('!window.isSecureContext');
    expect(canvas).toContain("$t('toolkit.canvas.clipboard')");
    expect(canvas).toContain('function auditBoard()');
    expect(canvas).toContain("tr('canvas.auditDone')");
  });
});
