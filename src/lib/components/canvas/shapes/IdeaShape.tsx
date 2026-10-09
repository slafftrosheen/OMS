import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';

import { ideaDefaults, IDEA_ACCENTS, type IdeaKind } from '../idea-model';

export type IdeaShape = TLBaseShape<'idea-card', {
  w: number; h: number; kind: IdeaKind; title: string; body: string;
  state: 'open' | 'in-progress' | 'done'; accent: string;
}>;
const accents = IDEA_ACCENTS;
const labels: Record<IdeaKind, string> = {
  idea: 'IDEA', research: 'RESEARCH', decision: 'DECISION',
  task: 'TASK', note: 'NOTE'
};

export class IdeaShapeUtil extends BaseBoxShapeUtil<IdeaShape> {
  static override type = 'idea-card' as const;
  override getDefaultProps() { return ideaDefaults('idea'); }
  override component(shape: IdeaShape) {
    const p = shape.props;
    const update = (patch: Partial<IdeaShape['props']>) =>
      this.editor.updateShape<IdeaShape>({ id: shape.id, type: 'idea-card', props: patch });
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
      <HTMLContainer id={shape.id} style={{
        width: p.w, height: p.h, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRadius: 16, border: '1px solid var(--border, #d4d4dc)',
        background: 'var(--bg-0, #fff)', color: 'var(--text, #252536)',
        boxShadow: '0 12px 30px rgba(0,0,0,.08)', pointerEvents: 'all'
      }}>
        <div style={{ height: 5, background: p.accent || accents[p.kind] }} />
        <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 800,
            color: p.accent || accents[p.kind] }}>{labels[p.kind] || 'IDEA'}</span>
          <span style={{ flex: 1 }} />
          {p.kind === 'task' || p.kind === 'decision' ? (
            <select aria-label="Progress" value={p.state} onPointerDown={stop}
              onChange={e => update({ state: e.target.value as IdeaShape['props']['state'] })}
              style={{ fontSize: 11, color: 'inherit', border: '1px solid var(--border)', borderRadius: 7,
                background: 'var(--bg-1)', padding: 5 }}>
              <option value="open">Open</option>
              <option value="in-progress">In progress</option>
              <option value="done">Done</option>
            </select>
          ) : null}
        </div>
        <input aria-label={`${labels[p.kind]} title`} value={p.title} maxLength={120}
          onPointerDown={stop} onChange={e => update({ title: e.target.value })}
          style={{ margin: '9px 12px 5px', border: 0, borderBottom: '1px solid var(--border)',
            outlineOffset: 3, background: 'transparent', color: 'inherit', fontWeight: 750,
            fontSize: 16, padding: '5px 2px', minWidth: 0 }} />
        <textarea aria-label={`${labels[p.kind]} details`} value={p.body} maxLength={5000}
          placeholder={p.kind === 'decision' ? 'Options, tradeoffs and why…' :
            p.kind === 'task' ? 'Owner, outcome, next step…' :
            p.kind === 'research' ? 'What do we need to learn?' : 'Add your thinking…'}
          onPointerDown={stop} onChange={e => update({ body: e.target.value })}
          style={{ flex: 1, resize: 'none', border: 0, borderRadius: 8,
            margin: '0 12px 12px', padding: '6px 4px', font: '13px/1.5 inherit',
            fontFamily: 'inherit', background: 'transparent', color: 'inherit', minHeight: 0 }} />
      </HTMLContainer>
    );
  }
  override indicator(shape: IdeaShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={16} />;
  }
}
