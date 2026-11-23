/**
 * Machine time estimate for a reviewed DXF.
 *
 * Pure and honest: time = path length / feed + pierces × pierce time, plus a
 * travel allowance for rapids, lead-ins and acceleration. Every DXF entity
 * starts with one pierce (plunge or tool-down). The result is a planning aid
 * for quotes and scheduling, never a machine cycle time.
 */
export type CutOperation = 'cut' | 'engrave' | 'score' | 'skip';
export type MachineId = 'co2' | 'fibre' | 'router' | 'plotter';
export type FeedOperation = Exclude<CutOperation, 'skip'>;

export interface MachineProfile {
  /** Feed in mm/min per operation. */
  feeds: Record<FeedOperation, number>;
  /** Seconds per pierce, plunge or tool-down. */
  pierceSec: number;
  /** Extra share of motion time for rapids, lead-ins and acceleration (0–2). */
  travelAllowance: number;
}

/** Conservative starting points for typical signage work; every value is editable. */
export const MACHINE_PRESETS: Readonly<Record<MachineId, Readonly<MachineProfile>>> = {
  co2: { feeds: { cut: 900, engrave: 12_000, score: 3_000 }, pierceSec: 0.3, travelAllowance: 0.15 },
  fibre: { feeds: { cut: 2_500, engrave: 8_000, score: 6_000 }, pierceSec: 0.5, travelAllowance: 0.1 },
  router: { feeds: { cut: 1_800, engrave: 2_400, score: 3_000 }, pierceSec: 2, travelAllowance: 0.2 },
  plotter: { feeds: { cut: 24_000, engrave: 24_000, score: 24_000 }, pierceSec: 0.1, travelAllowance: 0.25 },
};
export const MACHINE_IDS = Object.keys(MACHINE_PRESETS) as MachineId[];
export const MAX_FEED = 200_000, MAX_PIERCE_SEC = 60, MAX_TRAVEL = 2, MAX_COPIES = 999;

export interface EstimateLayerInput {
  name: string; entities: number; lengthMm: number | null | undefined;
  productionName?: string;
}
export interface EstimateRow {
  name: string; operation: CutOperation; lengthMm: number | null; pierces: number;
  /** Null when the length is unknown (measurement limit). Zero for skipped layers. */
  seconds: number | null;
}
export interface CutEstimate {
  rows: EstimateRow[];
  copies: number;
  /** Totals for all copies. Null when any counted layer has no length. */
  totalSeconds: number | null;
  motionSeconds: number | null;
  pierceSeconds: number;
  travelSeconds: number | null;
  pierces: number;
  lengthMm: number | null;
}

const STRIP = /[\u0300-\u036f]/g;
const normalise = (name: string) => name.normalize('NFKD').replace(STRIP, '').toUpperCase();
const SKIP = /PRINT|DRUK|ПЕЧАТ|REFERENCE|REF\b|ATSAU|ANNOT|NOTE|PIEZ|ЗАМЕТ|СПРАВ|ПРИМЕЧ/;
const ENGRAVE = /ENGRAV|GRAV|ГРАВ|MARK|MARĶ|ETCH|МАРК/;
const SCORE = /SCORE|BEND|FOLD|CREASE|LOCI|RIEV|ГИБ|БИГ|РИЛ|СГИБ/;

/** Guess the operation from a DXF layer name; the user can override it per layer. */
export function operationForLayer(name: string): CutOperation {
  const upper = normalise(name);
  if (SKIP.test(upper)) return 'skip';
  if (ENGRAVE.test(upper)) return 'engrave';
  if (SCORE.test(upper)) return 'score';
  return 'cut';
}

export function validMachineProfile(profile: unknown): profile is MachineProfile {
  if (!profile || typeof profile !== 'object') return false;
  const { feeds, pierceSec, travelAllowance } = profile as MachineProfile;
  if (!feeds || typeof feeds !== 'object') return false;
  const feedOk = (['cut', 'engrave', 'score'] as const).every(op =>
    typeof feeds[op] === 'number' && Number.isFinite(feeds[op]) && feeds[op] > 0 && feeds[op] <= MAX_FEED);
  return feedOk && typeof pierceSec === 'number' && Number.isFinite(pierceSec) && pierceSec >= 0 && pierceSec <= MAX_PIERCE_SEC &&
    typeof travelAllowance === 'number' && Number.isFinite(travelAllowance) && travelAllowance >= 0 && travelAllowance <= MAX_TRAVEL;
}

export function estimateCutJob(
  layers: readonly EstimateLayerInput[], profile: MachineProfile,
  overrides: Readonly<Record<string, CutOperation>> = {}, copies = 1,
): CutEstimate {
  if (!validMachineProfile(profile)) throw new Error('profile');
  const count = Number.isInteger(copies) && copies >= 1 && copies <= MAX_COPIES ? copies : 1;
  let motion: number | null = 0, pierceSeconds = 0, pierces = 0, length: number | null = 0;
  const rows = layers.map(layer => {
    const operation = overrides[layer.name] ?? operationForLayer(layer.productionName ?? layer.name);
    const entities = Number.isInteger(layer.entities) && layer.entities > 0 ? layer.entities : 0;
    const mm = typeof layer.lengthMm === 'number' && Number.isFinite(layer.lengthMm) && layer.lengthMm >= 0 ? layer.lengthMm : null;
    if (operation === 'skip') return { name: layer.name, operation, lengthMm: mm, pierces: 0, seconds: 0 };
    const pierceTime = entities * profile.pierceSec;
    pierces += entities; pierceSeconds += pierceTime;
    if (mm === null) { motion = null; length = null; return { name: layer.name, operation, lengthMm: null, pierces: entities, seconds: null }; }
    const moving = mm / profile.feeds[operation] * 60;
    if (motion !== null) motion += moving;
    if (length !== null) length += mm;
    return { name: layer.name, operation, lengthMm: mm, pierces: entities, seconds: moving + pierceTime };
  });
  const motionTotal = motion as number | null, lengthTotal = length as number | null;
  const travel = motionTotal === null ? null : motionTotal * profile.travelAllowance;
  const once = motionTotal === null || travel === null ? null : motionTotal + travel + pierceSeconds;
  return {
    rows, copies: count,
    totalSeconds: once === null ? null : once * count,
    motionSeconds: motionTotal === null ? null : motionTotal * count,
    pierceSeconds: pierceSeconds * count,
    travelSeconds: travel === null ? null : travel * count,
    pierces: pierces * count,
    lengthMm: lengthTotal === null ? null : lengthTotal * count,
  };
}

/** "45 s", "14 min 20 s", "2 h 05 min". Units follow the language. */
export function formatMachineTime(seconds: number, lang: 'en' | 'lv' | 'ru' = 'en'): string {
  const u = lang === 'ru' ? { h: 'ч', m: 'мин', s: 'с' } : lang === 'lv' ? { h: 'h', m: 'min', s: 's' } : { h: 'h', m: 'min', s: 's' };
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} ${u.s}`;
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  if (h) return `${h} ${u.h} ${String(m).padStart(2, '0')} ${u.m}`;
  return s ? `${m} ${u.m} ${String(s).padStart(2, '0')} ${u.s}` : `${m} ${u.m}`;
}

const STORE = 'oms.cutEstimate.v1';
export interface StoredEstimateSettings { machine: MachineId; profile: MachineProfile }

export function readEstimateSettings(storage: Pick<Storage, 'getItem'> | null | undefined): StoredEstimateSettings {
  const fallback = { machine: 'co2' as MachineId, profile: structuredCloneProfile(MACHINE_PRESETS.co2) };
  try {
    const raw = storage?.getItem(STORE);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (!MACHINE_IDS.includes(data?.machine) || !validMachineProfile(data?.profile)) return fallback;
    return { machine: data.machine, profile: structuredCloneProfile(data.profile) };
  } catch { return fallback; }
}

export function writeEstimateSettings(storage: Pick<Storage, 'setItem'> | null | undefined, value: StoredEstimateSettings) {
  if (!validMachineProfile(value.profile) || !MACHINE_IDS.includes(value.machine)) return;
  try { storage?.setItem(STORE, JSON.stringify(value)); } catch { /* private mode */ }
}

export function structuredCloneProfile(profile: MachineProfile): MachineProfile {
  return { feeds: { ...profile.feeds }, pierceSec: profile.pierceSec, travelAllowance: profile.travelAllowance };
}
