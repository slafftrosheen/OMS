import { encodePdfRaster } from './cad-raster';
import type { MaterialTextureDraft, MaterialTextureSettings } from './material-texture';

/** Original procedural illustrations, embedded as ordinary portable image fills. */
export const MATERIAL_TEXTURE_PRESETS = [
  { id: 'oak', labelKey: 'presetOak', tileWidthMm: 120 },
  { id: 'aluminium', labelKey: 'presetAluminium', tileWidthMm: 80 },
  { id: 'concrete', labelKey: 'presetConcrete', tileWidthMm: 120 },
  { id: 'carbon', labelKey: 'presetCarbon', tileWidthMm: 20 },
] as const;
export type MaterialTexturePresetId = typeof MATERIAL_TEXTURE_PRESETS[number]['id'];
const SIZE = 256;
const TAU = Math.PI * 2;
const wrap = (n: number) => n - Math.floor(n);
const mix = (a: number, b: number, t: number) => a + (b-a)*t;
const smooth = (n: number) => n*n*(3-2*n);
const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function random(x: number, y: number, seed: number) {
  let h = Math.imul(x+seed, 374761393) + Math.imul(y+seed, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Periodic lattice noise: every octave meets across both tile boundaries. */
function noise(u: number, v: number, cells: number, seed: number) {
  const x=wrap(u)*cells, y=wrap(v)*cells, ix=Math.floor(x), iy=Math.floor(y);
  const sx=smooth(x-ix), sy=smooth(y-iy);
  return mix(mix(random(ix,iy,seed),random((ix+1)%cells,iy,seed),sx),
    mix(random(ix,(iy+1)%cells,seed),random((ix+1)%cells,(iy+1)%cells,seed),sx),sy);
}

/** Sample one periodic cell; coordinates may be outside 0..1 for seam checks. */
export function sampleMaterialPreset(id: MaterialTexturePresetId, u: number, v: number): [number, number, number] {
  if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error('material-preset');
  u=wrap(u); v=wrap(v);
  if (id === 'oak') {
    const wave=TAU*(v*12 + .28*Math.sin(TAU*u) + .12*Math.sin(TAU*(u*3+v*2)));
    const grain=Math.pow((Math.sin(wave)+1)/2,14);
    const variation=noise(u,v,8,17)*14 + noise(u,v,64,41)*5;
    const light=8*Math.sin(TAU*(v*2+.2*Math.sin(TAU*u))) + variation;
    return [byte(181+light-grain*42),byte(129+light*.8-grain*37),byte(76+light*.55-grain*25)];
  }
  if (id === 'aluminium') {
    const brush=18*(noise(0,v,128,23)-.5) + 5*Math.sin(TAU*v*96);
    const light=20*Math.sin(TAU*u) + brush + 4*(noise(u,v,32,9)-.5);
    return [byte(174+light),byte(181+light),byte(185+light)];
  }
  if (id === 'concrete') {
    const cloud=noise(u,v,4,61)*28 + noise(u,v,16,31)*18;
    const grit=noise(u,v,64,79)*17, pores=Math.max(0,noise(u,v,128,47)-.72)*95;
    return [byte(126+cloud+grit-pores),byte(128+cloud+grit-pores),byte(123+cloud+grit-pores)];
  }
  if (id === 'carbon') {
    const x=u*8, y=v*8, vertical=(Math.floor(x)+Math.floor(y))%2===0;
    const fiber=wrap(vertical?x:y), along=wrap(vertical?y:x);
    const light=31*Math.pow(Math.sin(Math.PI*fiber),.65) + 5*Math.cos(TAU*fiber*8) - 9*Math.pow(Math.abs(along-.5)*2,6);
    return [byte(22+light),byte(25+light),byte(28+light)];
  }
  throw new Error('material-preset');
}

export function createMaterialPresetImage(id: MaterialTexturePresetId) {
  if (!MATERIAL_TEXTURE_PRESETS.some(p => p.id === id)) throw new Error('material-preset');
  const data=new Uint8Array(SIZE*SIZE*3);
  for (let y=0;y<SIZE;y++) for (let x=0;x<SIZE;x++)
    data.set(sampleMaterialPreset(id,(x+.5)/SIZE,(y+.5)/SIZE),(y*SIZE+x)*3);
  return { width:SIZE, height:SIZE, kind:2, data };
}

export async function readMaterialPreset(id: MaterialTexturePresetId, signal: AbortSignal): Promise<{ draft:MaterialTextureDraft } & MaterialTextureSettings> {
  if (signal.aborted) throw new Error('cancelled');
  const preset=MATERIAL_TEXTURE_PRESETS.find(p => p.id === id);
  if (!preset) throw new Error('material-preset');
  const raster=await encodePdfRaster(createMaterialPresetImage(id));
  if (signal.aborted) throw new Error('cancelled');
  return { draft:{raster:{...raster,usage:'material'}}, mode:'tile', tileWidthMm:preset.tileWidthMm,
    offsetXmm:0, offsetYmm:0, scale:100, angle:0, opacity:100 };
}
