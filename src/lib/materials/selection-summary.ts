import { getMaterialSpecificationFacts, type MaterialSpecificationSource } from './catalog-presentation';

export type MaterialSummaryKind = 'led' | 'psu' | 'cable';
export type MaterialSelectionFactKey = 'identity' | 'brand' | 'series' | 'colorTemperature'
  | 'whiteColorTemperature' | 'color' | 'power' | 'powerPerMetre' | 'maxPowerPerMetre'
  | 'diameter' | 'crossSection' | 'voltage' | 'ratedVoltage' | 'length';

export interface MaterialSelectionSource extends MaterialSpecificationSource {
  code?: string;
  name_en?: string;
  name_ru?: string;
  name_lv?: string;
}

export interface MaterialSelectionSummary {
  kind: MaterialSummaryKind;
  identity: string;
  identityLabel: string;
  facts: { key: MaterialSelectionFactKey; value: string; label: string }[];
  text: string;
}

const labels = {
  en: {
    identity: 'Selected material', brand: 'Brand', series: 'Series',
    colorTemperature: 'Color temperature', whiteColorTemperature: 'White channel temperature',
    color: 'Light color', power: 'Power', powerPerMetre: 'Power per metre',
    maxPowerPerMetre: 'Maximum power per metre', diameter: 'Cable diameter',
    crossSection: 'Conductor cross-section', voltage: 'Voltage', ratedVoltage: 'Voltage rating',
    length: 'Sign cable length', maximum: 'max.', white: 'White'
  },
  ru: {
    identity: 'Выбранный материал', brand: 'Бренд', series: 'Серия',
    colorTemperature: 'Цветовая температура', whiteColorTemperature: 'Температура белого канала',
    color: 'Цвет света', power: 'Мощность', powerPerMetre: 'Мощность на метр',
    maxPowerPerMetre: 'Максимальная мощность на метр', diameter: 'Диаметр кабеля',
    crossSection: 'Сечение жилы', voltage: 'Напряжение', ratedVoltage: 'Номинальное напряжение',
    length: 'Длина кабеля вывески', maximum: 'макс.', white: 'Белый'
  },
  lv: {
    identity: 'Izvēlētais materiāls', brand: 'Zīmols', series: 'Sērija',
    colorTemperature: 'Krāsas temperatūra', whiteColorTemperature: 'Baltā kanāla temperatūra',
    color: 'Gaismas krāsa', power: 'Jauda', powerPerMetre: 'Jauda uz metru',
    maxPowerPerMetre: 'Maksimālā jauda uz metru', diameter: 'Kabeļa diametrs',
    crossSection: 'Dzīslas šķērsgriezums', voltage: 'Spriegums', ratedVoltage: 'Nominālais spriegums',
    length: 'Izkārtnes kabeļa garums', maximum: 'maks.', white: 'Balts'
  }
} as const;

const text = (value: unknown, limit = 120): string => {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
};
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function categoryKind(category: unknown): MaterialSummaryKind | undefined {
  if (typeof category !== 'string') return;
  if (/^LED_(STRIP|MODULE|NEON)$/.test(category)) return 'led';
  if (/^PSU(?:_|$)/.test(category)) return 'psu';
  if (/^(WIRE|CABLE)(?:_|$)/.test(category)) return 'cable';
}

/**
 * The selected form control shows only the facts needed while entering an order.
 * The catalog's full identity stays available separately for inspection. This
 * function never decodes ratings from a model, converts area into diameter, or
 * treats a supplier reel/package length as the sign's cable length.
 */
export function getMaterialSelectionSummary(
  source: MaterialSelectionSource | null | undefined,
  options: { kind?: MaterialSummaryKind; value?: string; length?: string; locale?: string } = {}
): MaterialSelectionSummary | null {
  const kind = options.kind || categoryKind(source?.category);
  if (!kind) return null;
  const language = options.locale === 'ru' || options.locale === 'lv' ? options.locale : 'en';
  const copy = labels[language];
  const metadata = source?.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
    ? source.metadata : {};
  const name = text((language === 'ru' ? source?.name_ru : language === 'lv' ? source?.name_lv : '')
    || source?.name_en || options.value, 300);
  const model = text(metadata.model, 120) || text(source?.code, 120);
  const identity = name && model && !name.toLocaleLowerCase().includes(model.toLocaleLowerCase())
    ? `${name} · ${model}` : name || model;
  const facts: MaterialSelectionSummary['facts'] = [];
  const add = (key: MaterialSelectionFactKey, value: string) => {
    if (value) facts.push({ key, value, label: copy[key] });
  };
  const specifications = getMaterialSpecificationFacts(source);
  const fact = (key: string) => specifications.find(entry => entry.key === key)?.value || '';

  if (kind === 'led') {
    const brand = text(metadata.brand, 64);
    add('brand', brand);
    if (!brand && source) {
      add('identity', text(metadata.short_name, 96) || model || text(name, 96));
    }
    const color = text(metadata.color, 64);
    const temperature = fact('colorTemperature');
    const whiteTemperature = fact('whiteColorTemperature');
    if (whiteTemperature) {
      add('whiteColorTemperature', `${copy.white} ${whiteTemperature}`);
    } else if (/\d.*K\b/i.test(temperature)) {
      // An RGB + white product's K value describes its white channel.
      add(/\bRGB/i.test(color) ? 'whiteColorTemperature' : 'colorTemperature',
        /\bRGB/i.test(color) ? `${copy.white} ${temperature}` : temperature);
    } else if (/^RGB(?:W|WW|CCT)?(?:\b|\s|\/)/i.test(color)) {
      add('color', color);
    }
    // One power fact, with its original scope and maximum qualifier preserved.
    if (fact('maxPowerPerMetre')) add('maxPowerPerMetre', `${copy.maximum} ${fact('maxPowerPerMetre')}`);
    else if (fact('powerPerMetre')) add('powerPerMetre', fact('powerPerMetre'));
    else add('power', fact('power'));
  } else if (kind === 'psu') {
    add('brand', text(metadata.brand, 64));
    add('power', fact('power'));
    // A missing series remains the recorded model; its numerals are never watts.
    const series = text(metadata.series, 64);
    if (series) add('series', series);
    else add('identity', model);
  } else {
    const range = metadata.outer_diameter_range_mm;
    const diameterRange = Array.isArray(range) && range.length === 2 && range.every(positive) && range[0] <= range[1]
      ? range[0] === range[1] ? `${range[0]} mm` : `${range[0]}–${range[1]} mm` : '';
    const diameter = positive(metadata.outer_diameter_mm) ? `${metadata.outer_diameter_mm} mm`
      : diameterRange || fact('diameter');
    // Legacy free-text diameter can contain a cross-section entered by a user.
    // Only a diameter expressed in mm receives the diameter symbol.
    if (/^\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*mm$/i.test(diameter)) add('diameter', `Ø ${diameter}`);
    else if (fact('crossSection')) {
      const cores = positive(metadata.cores) && Number.isInteger(metadata.cores) ? `${metadata.cores} × ` : '';
      add('crossSection', `${cores}${fact('crossSection')}`);
    }
    const ratedVoltage = text(metadata.rated_voltage, 64)
      || (positive(metadata.rated_voltage_v) ? `${metadata.rated_voltage_v} V` : '');
    if (ratedVoltage) add('ratedVoltage', ratedVoltage);
    else add('voltage', fact('voltage'));
    add('length', text(options.length, 64));
  }

  // An unresolved/custom selection must remain recognizable. An empty catalog
  // record is not permission to replace it with a generic LED/PSU/cable label.
  if (!facts.length && identity) add('identity', identity);
  // A cable length by itself must not hide an otherwise unresolved cable model.
  if (kind === 'cable' && facts.every(entry => entry.key === 'length') && identity) {
    facts.unshift({ key: 'identity', value: identity, label: copy.identity });
  }
  return { kind, identity, identityLabel: copy.identity, facts, text: facts.map(entry => entry.value).join(' · ') };
}
