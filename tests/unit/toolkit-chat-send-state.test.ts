import { describe, expect, it } from 'vitest';
import { confirmToolkitMessages, restoreToolkitDraft } from '../../src/lib/chat/toolkit-send-state';

describe('Toolkit chat send reconciliation', () => {
  it('restores a failed prompt to the current session input and draft', () => {
    const drafts = new Map<string, string>();
    expect(restoreToolkitDraft(drafts, 'a', 'Check this drawing', 'a', '')).toBe('Check this drawing');
    expect(drafts.get('a')).toBe('Check this drawing');
  });

  it('restores a background session without changing the active session input', () => {
    const drafts = new Map([['a', ''], ['b', 'New question']]);
    expect(restoreToolkitDraft(drafts, 'a', 'Failed original question', 'b', 'New question')).toBe('New question');
    expect(drafts.get('a')).toBe('Failed original question');
    expect(drafts.get('b')).toBe('New question');
  });

  it('never overwrites newer active or background drafts', () => {
    const drafts = new Map([['a', 'Newer draft']]);
    expect(restoreToolkitDraft(drafts, 'a', 'Old failed send', 'b', 'Current B input')).toBe('Current B input');
    expect(drafts.get('a')).toBe('Newer draft');
    expect(restoreToolkitDraft(drafts, 'a', 'Old failed send', 'a', 'Newer active input')).toBe('Newer active input');
    expect(drafts.get('a')).toBe('Newer draft');
  });

  it('uses confirmed database IDs while retaining the surrounding conversation', () => {
    const history = [{ id: 'older', content: 'Previous answer' }, { id: 'tmp-1', content: 'New question' }];
    const result = confirmToolkitMessages(history, 'tmp-1', 'saved-user', { id: 'saved-assistant', content: 'New answer' });
    expect(result).toEqual([
      { id: 'older', content: 'Previous answer' },
      { id: 'saved-user', content: 'New question' },
      { id: 'saved-assistant', content: 'New answer' }
    ]);
    expect(history[1].id).toBe('tmp-1');
  });

  it('deduplicates a POST acknowledgement that overlaps already loaded history', () => {
    const result = confirmToolkitMessages([
      { id: 'saved-user', content: 'Question' }, { id: 'saved-assistant', content: 'Answer' },
      { id: 'tmp-1', content: 'Question' }
    ], 'tmp-1', 'saved-user', { id: 'saved-assistant', content: 'Answer' });
    expect(result.map(message => message.id)).toEqual(['saved-user', 'saved-assistant']);
  });
});
