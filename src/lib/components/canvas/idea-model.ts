export const IDEA_KINDS = ['idea', 'research', 'decision', 'task', 'note'] as const;
export type IdeaKind = typeof IDEA_KINDS[number];
export const IDEA_ACCENTS: Record<IdeaKind, string> = {
  idea: '#8775d1', research: '#4c9eb7', decision: '#cf9560',
  task: '#6da77b', note: '#9b93a8'
};
export function ideaDefaults(kind: IdeaKind) {
  return {
    w: 290, h: 222, kind, title: kind === 'idea' ? 'New idea' :
      kind === 'research' ? 'Research question' : kind === 'decision' ?
      'Decision to make' : kind === 'task' ? 'Next action' : 'Notes',
    body: '', state: 'open' as const, accent: IDEA_ACCENTS[kind]
  };
}
