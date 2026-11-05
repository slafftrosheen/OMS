// Run with: node --test tests/regression/production-polish.test.cjs
// Load the actual pure TypeScript modules; no application/database mocks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename
  }).outputText, filename);
};
const { previousShift, shiftDraftStatus, canReuseShift, savedShiftDraft } = require('../../src/lib/workforce/entry-guidance.ts');
const { entryGuidanceCopy } = require('../../src/lib/workforce/entry-guidance-copy.ts');
const { profileNoteGroups } = require('../../src/lib/order/profile-attention.ts');
const { profileAttentionCopy } = require('../../src/lib/order/profile-attention-copy.ts');
const { parseWorkClockInterval } = require('../../src/lib/workforce/clock-times.ts');
const row = (workDate, extra = {}) => ({ userId: 'alice', workDate, startTime: '08:00', finishTime: '17:00', note: 'private note', actualMinutes: 540, ...extra });
const draft = (extra = {}) => ({ ready: true, future: false, fullAbsence: false, startTime: '', finishTime: '', actualMinutes: null, noteLength: 0, dirty: false, busy: false, ...extra });
const reuse = (extra = {}) => ({ ready: true, busy: false, dirty: false, hasEntry: false, future: false, fullAbsence: false, hasSuggestion: true, ...extra });

test('previous shift uses the newest earlier date, regardless of input order', () => {
  assert.deepEqual(previousShift([row('2026-10-27'), row('2026-10-29'), row('2026-10-28')], '2026-10-30', 'alice'), {
    sourceDate: '2026-10-29', startTime: '08:00', finishTime: '17:00'
  });
});
test('previous shift excludes other users and needs an explicit account', () => {
  assert.equal(previousShift([row('2026-10-29')], '2026-10-30', 'bob'), null);
  assert.equal(previousShift([row('2026-10-29')], '2026-10-30', ''), null);
});
test('same-day and later entries cannot be suggestions', () => {
  assert.equal(previousShift([row('2026-10-30'), row('2026-10-31')], '2026-10-30', 'alice'), null);
});
test('historical duration-only records never get invented clock times', () => {
  assert.equal(previousShift([row('2026-10-29', { startTime: null, finishTime: null })], '2026-10-30', 'alice'), null);
});
test('malformed source dates, backward intervals and malformed clocks are skipped', () => {
  assert.equal(previousShift([row('2026-10-00'), row('2026-10-29', { startTime: '17:00', finishTime: '08:00' }), row('2026-10-28', { startTime: '8:00' })], '2026-10-30', 'alice'), null);
});
test('an invalid target date cannot produce a suggestion', () => {
  assert.equal(previousShift([row('2026-10-29')], '2026-10-99', 'alice'), null);
});
test('a repeated Riga boundary on the target date is not suggested', () => {
  assert.equal(previousShift([row('2026-10-24', { startTime: '03:30', finishTime: '05:00' })], '2026-10-25', 'alice'), null);
});
test('a missing Riga boundary on the target date is not suggested', () => {
  assert.equal(previousShift([row('2026-03-28', { startTime: '03:30', finishTime: '05:00' })], '2026-03-29', 'alice'), null);
});
test('a corrupt ambiguous source interval is not reused on a normal date', () => {
  assert.equal(previousShift([row('2026-10-25', { startTime: '03:30', finishTime: '05:00' })], '2026-10-26', 'alice'), null);
});
test('a skipped newer candidate falls back to the newest valid candidate', () => {
  assert.equal(previousShift([row('2026-10-24', { startTime: '03:30' }), row('2026-10-23')], '2026-10-25', 'alice').sourceDate, '2026-10-23');
});
test('suggestions expose only clock times and source date, not notes or credits', () => {
  assert.deepEqual(Object.keys(previousShift([row('2026-10-29', { creditedMinutes: 1080 })], '2026-10-30', 'alice')).sort(), ['finishTime', 'sourceDate', 'startTime']);
});
test('finding a suggestion does not sort or mutate the original entry list', () => {
  const entries = Object.freeze([Object.freeze(row('2026-10-29')), Object.freeze(row('2026-10-27'))]);
  previousShift(entries, '2026-10-30', 'alice');
  assert.equal(entries[0].workDate, '2026-10-29');
});
test('reused clock boundaries recalculate elapsed time on the target date', () => {
  const s = previousShift([row('2026-10-24', { startTime: '02:00', finishTime: '05:00', actualMinutes: 180 })], '2026-10-25', 'alice');
  assert.equal(parseWorkClockInterval('2026-10-25', s.startTime, s.finishTime).actualMinutes, 240);
});
test('previous shift does not invent a suggestion for empty history', () => {
  assert.equal(previousShift([], '2026-10-30', 'alice'), null);
});
for (const key of ['busy', 'dirty', 'hasEntry', 'future', 'fullAbsence']) {
  test(`reuse is blocked by ${key}`, () => assert.equal(canReuseShift(reuse({ [key]: true })), false));
}
test('reuse requires ready data and a real suggestion', () => {
  assert.equal(canReuseShift(reuse({ ready: false })), false);
  assert.equal(canReuseShift(reuse({ hasSuggestion: false })), false);
  assert.equal(canReuseShift(reuse()), true);
});
test('discard restores exact saved times and note without mutation', () => {
  const saved = Object.freeze(row('2026-10-29'));
  assert.deepEqual(savedShiftDraft(saved), { startTime: '08:00', finishTime: '17:00', note: 'private note' });
});
test('discard of a new or legacy row does not infer missing times', () => {
  assert.deepEqual(savedShiftDraft(), { startTime: '', finishTime: '', note: '' });
  assert.deepEqual(savedShiftDraft(row('2026-10-29', { startTime: null, finishTime: null })), { startTime: '', finishTime: '', note: 'private note' });
});
test('empty and partial drafts explain which clock boundary is needed next', () => {
  assert.equal(shiftDraftStatus(draft()), 'startRequired');
  assert.equal(shiftDraftStatus(draft({ startTime: '08:00', dirty: true })), 'finishRequired');
  assert.equal(shiftDraftStatus(draft({ finishTime: '17:00' })), 'startRequired');
});
test('future, absence and loading states precede incomplete clock hints', () => {
  assert.equal(shiftDraftStatus(draft({ ready: false })), 'unavailable');
  assert.equal(shiftDraftStatus(draft({ future: true })), 'future');
  assert.equal(shiftDraftStatus(draft({ fullAbsence: true })), 'absence');
  assert.equal(shiftDraftStatus(draft({ busy: true })), 'busy');
});
test('complete invalid, overlong-note, changed and saved drafts have distinct guidance', () => {
  const complete = { startTime: '08:00', finishTime: '17:00', actualMinutes: 540, dirty: true };
  assert.equal(shiftDraftStatus(draft({ ...complete, actualMinutes: null })), 'invalid');
  assert.equal(shiftDraftStatus(draft({ ...complete, noteLength: 501 })), 'noteTooLong');
  assert.equal(shiftDraftStatus(draft(complete)), 'ready');
  assert.equal(shiftDraftStatus(draft({ ...complete, dirty: false })), 'unchanged');
});
test('a zero, negative or non-finite duration is not treated as a valid draft', () => {
  for (const actualMinutes of [0, -1, NaN, Infinity, 1441, 2.5]) {
    assert.equal(shiftDraftStatus(draft({ startTime: '08:00', finishTime: '17:00', actualMinutes, dirty: true })), 'invalid');
  }
});
test('empty and malformed profile input produces no note warnings', () => {
  for (const value of [null, undefined, 'legacy', [], 4, {}, { configuration: [] }]) assert.deepEqual(profileNoteGroups(value), []);
});
test('general and station notes produce one group each in production order', () => {
  assert.deepEqual(profileNoteGroups({ notes: ' Pack carefully ', configuration: { ASSEMBLING: { notes: 'Seal' }, CNC_FREZER: { notes: 'Drill' }, FRONT: { notes: 'Print' } } }), ['profile', 'CNC_FREZER', 'FRONT', 'ASSEMBLING']);
});
test('whitespace and non-text notes do not create warnings', () => {
  assert.deepEqual(profileNoteGroups({ notes: ' \n ', configuration: { CNC_FREZER: { notes: {} }, FRONT: { notes: '  ' }, BENDER: { notes: 1 } } }), []);
});
test('active custom film/paint/assembly instructions appear even without general notes', () => {
  assert.deepEqual(profileNoteGroups({ configuration: { FRONT: { back: true, backCustom: 'Double white layer' }, PAINTING: { frame: true, frameCustom: 'Matt' }, ASSEMBLING: { led: true, ledCustom: 'Seal joints' } } }), ['FRONT', 'PAINTING', 'ASSEMBLING']);
});
test('disabled material annotations never create ghost note warnings', () => {
  assert.deepEqual(profileNoteGroups({ configuration: { FRONT: { face: false, faceCustom: 'old text' }, PAINTING: { sides: false, sidesCustom: 'old' }, ASSEMBLING: { frame: false, frameCustom: 'old' } } }), []);
});
test('station free notes remain visible even with no active material checkbox', () => {
  assert.deepEqual(profileNoteGroups({ configuration: { FRONT: { face: false, notes: 'Confirm artwork' } } }), ['FRONT']);
});
test('a group is not duplicated by several instructions in the same section', () => {
  assert.deepEqual(profileNoteGroups({ configuration: { PAINTING: { notes: 'Note', face: true, faceCustom: 'A', back: true, backCustom: 'B' } } }), ['PAINTING']);
});
test('PRINT flags and material codes alone are not notes', () => {
  assert.deepEqual(profileNoteGroups({ configuration: { FRONT: { face: true, facePrint: true, faceFilm: 'ORA 8500/005' }, CNC_FREZER: { face: 'FDM Fiberlogy ASA' } } }), []);
});
test('note index ignores unknown sections and never mutates profile data', () => {
  const profile = Object.freeze({ configuration: Object.freeze({ CNC_FREZER: Object.freeze({ notes: 'Cut' }), UNKNOWN: { notes: 'Ignore' } }) });
  assert.deepEqual(profileNoteGroups(profile), ['CNC_FREZER']);
});
test('locale variants work and unknown locales fall back to English', () => {
  assert.equal(entryGuidanceCopy('lv-LV').reuse, entryGuidanceCopy('lv').reuse);
  assert.equal(entryGuidanceCopy('RU_ru').reuse, entryGuidanceCopy('ru').reuse);
  assert.equal(profileAttentionCopy(null).readOnly, profileAttentionCopy('en').readOnly);
  assert.equal(profileAttentionCopy('de').readOnly, profileAttentionCopy('en').readOnly);
});
test('all three languages contain the same nonempty guidance and note labels', () => {
  for (const getCopy of [entryGuidanceCopy, profileAttentionCopy]) {
    const en = getCopy('en');
    for (const lang of ['en', 'lv', 'ru']) {
      const copy = getCopy(lang);
      assert.deepEqual(Object.keys(copy).sort(), Object.keys(en).sort());
      for (const [key, value] of Object.entries(copy)) {
        if (typeof value === 'object') {
          assert.deepEqual(Object.keys(value).sort(), Object.keys(en[key]).sort());
          for (const text of Object.values(value)) assert.equal(typeof text === 'string' && text.trim().length > 0, true);
        } else assert.equal(typeof value === 'string' && value.trim().length > 0, true);
      }
    }
  }
});
test('entry component wires guarded reuse/discard without an implicit save', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/workforce/EntryForm.svelte'), 'utf8');
  assert.match(source, /onclick=\{reusePreviousShift\}/);
  assert.match(source, /onclick=\{discardChanges\}/);
  for (const name of ['reusePreviousShift', 'discardChanges']) {
    const body = source.split(`function ${name}()`)[1]?.split('\n  }')[0] ?? '';
    assert.ok(body.includes('cabinet.busy') || body.includes('reuseAllowed'));
    assert.doesNotMatch(body, /saveEntry/);
  }
  assert.match(source, /aria-describedby="work-entry-action-hint"/);
});
test('shared sheet note navigation focuses locally without route fragments', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/order/OrderProfileSheet.svelte'), 'utf8');
  assert.match(source, /profileNoteGroups/);
  assert.match(source, /class="attention-index"/);
  assert.match(source, /focusSheetTarget/);
  assert.match(source, /tabindex="-1"/);
  assert.match(source, /copy\.readOnly/);
  assert.doesNotMatch(source, /(?:^|[\s,])a:focus-visible/);
  assert.doesNotMatch(source, /href=\{`#\$\{formId\}-profile-note/);
});
