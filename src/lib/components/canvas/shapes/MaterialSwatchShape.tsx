import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from '@tldraw/tldraw';

export const MATERIAL_PRESETS = [
  'brushed-metal', 'matte', 'frosted-acrylic', 'wood-grain', 'concrete', 'patina', 'mesh', 'photo'
] as const;
export type MaterialPreset = typeof MATERIAL_PRESETS[number];
export type MaterialSwatchShape = TLBaseShape<'material-swatch', {
  w: number; h: number; title: string; preset: MaterialPreset; tint: string;
  opacity: number; textureUrl?: string;
}>;

const patterns: Record<Exclude<MaterialPreset, 'photo'>, string> = {
  'brushed-metal': 'repeating-linear-gradient(90deg,#ffffff20 0 1px,#00000012 2px 3px,transparent 4px 7px),linear-gradient(115deg,#929ba0,#e0e4e4 45%,#899197)',
  matte: 'linear-gradient(120deg,#353d43,#111820 55%,#3c4548)',
  'frosted-acrylic': 'repeating-linear-gradient(28deg,#ffffff50 0 2px,#d9e5e970 4px 6px),linear-gradient(125deg,#e8f4f7,#bbcbd5)',
  'wood-grain': 'repeating-linear-gradient(6deg,#583f2633 0 2px,#bf9b6933 4px 11px),linear-gradient(115deg,#8d5933,#d0a171,#77503b)',
  concrete: 'repeating-linear-gradient(117deg,#9a9a9412 0 3px,#33333312 4px 8px),linear-gradient(130deg,#aeb0a9,#757873)',
  patina: 'radial-gradient(circle at 23% 38%,#467870 2%,transparent 31%),radial-gradient(circle at 85% 12%,#827455 8%,transparent 35%),linear-gradient(140deg,#4a5656,#9f805c,#567d76)',
  mesh: 'repeating-linear-gradient(0deg,#0f15172a 0 1px,transparent 1px 8px),repeating-linear-gradient(90deg,#0f15172a 0 1px,transparent 1px 8px),linear-gradient(120deg,#b7bbbe,#767c81)'
};
export function swatchDefaults() {
  return { w: 290, h: 212, title: 'Material study', preset: 'brushed-metal' as MaterialPreset,
    tint: '#ffffff', opacity: 100 };
}
export class MaterialSwatchShapeUtil extends BaseBoxShapeUtil<MaterialSwatchShape> {
  static override type = 'material-swatch' as const;
  override getDefaultProps() { return swatchDefaults(); }
  override component(shape: MaterialSwatchShape) {
    const p = shape.props;
    const edit = (props: Partial<MaterialSwatchShape['props']>) =>
      this.editor.updateShape<MaterialSwatchShape>({ id: shape.id, type: 'material-swatch', props });
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    const isPhoto = p.preset === 'photo' &&
      typeof p.textureUrl === 'string' && p.textureUrl.startsWith('/api/toolkit/assets/');
    const background = isPhoto ? `url("${p.textureUrl}")` :
      (patterns[p.preset as Exclude<MaterialPreset,'photo'>] ?? patterns.matte);
    return <HTMLContainer id={shape.id} style={{ width: p.w, height: p.h,
      borderRadius: 13, overflow: 'hidden', background: 'var(--bg-0)', color: 'var(--text)',
      border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      boxShadow: '0 7px 22px #0002', pointerEvents: 'all' }}>
      <header title="Drag this header to move" style={{ display: 'flex', alignItems: 'center',
        padding: '7px 10px', gap: 6, background: 'var(--bg-1)', minHeight: 30, cursor: 'grab' }}>
        <input aria-label="Material name" maxLength={80} value={p.title}
          onChange={e => edit({ title: e.target.value })} onPointerDown={stop} onKeyDown={stop}
          style={{ minWidth: 0, flex: 1, background: 'transparent', color: 'inherit',
            border: 0, fontWeight: 750, fontSize: 12 }} />
        <select aria-label="Material texture" value={p.preset} onPointerDown={stop} onKeyDown={stop}
          onChange={e => edit({ preset: e.target.value as MaterialPreset })}
          style={{ maxWidth: 122, fontSize: 10 }}>
          {MATERIAL_PRESETS.map(item => <option key={item} value={item}>{item.replaceAll('-', ' ')}</option>)}
        </select>
      </header>
      <div role="img" aria-label={`Illustrative preview of ${p.preset}`}
        style={{ flex: 1, minHeight: 0, backgroundImage: background,
          backgroundSize: isPhoto ? 'cover' : 'auto', backgroundPosition: 'center',
          opacity: Math.min(1, Math.max(.1, (p.opacity ?? 100) / 100)), position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: p.tint || '#fff', opacity: .24 }} />
      </div>
      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--bg-1)', padding: '5px 10px', gap: 8, fontSize: 10 }}>
        <span>Visual reference · not a certified finish</span>
        <input type="color" aria-label="Surface tint" title="Change surface tint"
          value={/^#[0-9a-fA-F]{6}$/.test(p.tint || '') ? p.tint : '#ffffff'}
          onPointerDown={stop} onKeyDown={stop}
          onChange={e => edit({ tint: e.target.value })}
          style={{ width: 27, height: 24, border: 0, background: 'transparent' }} />
        <input title="Texture opacity" aria-label="Texture opacity" type="range" min="10" max="100"
          value={p.opacity ?? 100} onPointerDown={stop} onKeyDown={stop}
          onChange={e => edit({ opacity: Number(e.target.value) })} style={{ width: 65 }} />
      </footer>
    </HTMLContainer>;
  }
  override indicator(shape: MaterialSwatchShape) { return <rect width={shape.props.w} height={shape.props.h} rx={13} />; }
}
