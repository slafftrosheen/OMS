/**
 * Pure helpers extracted from Profile7stVisual.svelte so they can be tested,
 * reused, and grepped without trawling a 2000-line component.
 *
 * No DOM access, no Svelte runes — every function is a one-shot pure
 * computation.
 */

export interface ColorValue {
    system: string;
    code: string;
    hex: string;
}

export const defaultColor: ColorValue = { system: '', code: '', hex: '' };

// ─── Material category constants used by every section ──────────────────────

// ─── extractShortName ───────────────────────────────────────────────────────

interface MaterialDisplaySource {
    code?: string;
    name_en?: string;
    category?: string;
    metadata?: Record<string, unknown>;
}

const nonempty = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/** Only color catalogs have a meaningful compact identifier. Parts need their model. */
function usesColorCode(category: string): boolean {
    return /ACRYLIC|VINYL|ORACAL|PAINT|RAL|PANTONE/.test(category.toUpperCase());
}

function usefulShortName(value: string): boolean {
    return !!value && !/^(LED|PSU|CABLE|WIRE|ALU|ALUMINI?UM|PVC|FDM|PLA|PETG|ABS|ASA|TPU|RESIN|FILAMENT|PLEX)$/i.test(value);
}

/** One display contract for picker, emitted selection and persisted profile badges. */
export function materialDisplayName(material: MaterialDisplaySource | null | undefined, fallback = ''): string {
    const category = material?.category || '';
    const name = nonempty(material?.name_en);
    const code = nonempty(material?.code);
    const short = nonempty(material?.metadata?.short_name);
    const colorCode = nonempty(material?.metadata?.colorCode);
    if (usesColorCode(category)) {
        if (usefulShortName(short)) return short;
        if (colorCode) return colorCode;
        return getShortName(code || name || fallback, category);
    }
    // Never reduce a specific LED strip, PSU or cable to its family/wattage.
    if (usefulShortName(name)) return name;
    if (usefulShortName(short)) return short;
    const model = nonempty(material?.metadata?.model) || nonempty(material?.metadata?.manufacturer_part_number);
    if (model) return [nonempty(material?.metadata?.brand), model].filter(Boolean).join(' ');
    return code || name || fallback;
}

/** Old generic saved abbreviations are display artifacts, not material identity. */
export function selectionBadgeLabel(value: string, shortName?: string, category = ''): string {
    if (!value) return '';
    if (!usefulShortName(value) && usefulShortName(nonempty(shortName))) return nonempty(shortName);
    if (usesColorCode(category) && usefulShortName(nonempty(shortName))) return nonempty(shortName);
    return getShortName(value, category);
}

export function extractShortName(data: { value?: string; shortName?: string; material?: MaterialDisplaySource | null }, fallbackCategory: string): string {
    if (data.material) {
        const category = data.material.category || fallbackCategory;
        if (usesColorCode(category) && usefulShortName(nonempty(data.shortName))) return nonempty(data.shortName);
        return materialDisplayName({ ...data.material, category }, data.value);
    }
    // Custom values are never abbreviated, including custom acrylic and film.
    return data.shortName || data.value || '';
}

// ─── getTextColor ───────────────────────────────────────────────────────────

/**
 * Pick black or white text for a given hex background using the WCAG 1.4.3
 * relative-luminance heuristic.
 */
export function getTextColor(hex: string): string {
    if (!hex || hex.length < 4) return '#000';
    try {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000' : '#fff';
    } catch {
        return '#000';
    }
}

// ─── getShortName ───────────────────────────────────────────────────────────
// Color catalogs keep their familiar swatch codes. Other families retain the
// complete product name/code so variants can be distinguished during assembly.

export function getShortName(value: string, category?: string): string {
    if (!value) return '';

    // Display the complete part identity. Matching the catalog code first used
    // to collapse every unrecognised LED, PSU and cable to the same label.
    if (category && !usesColorCode(category)) return value;

    // Oracal / Vinyl: full code like 8500_064
    if (
        category?.includes('ORACAL') ||
        category?.includes('VINYL') ||
        value.toLowerCase().includes('oracal')
    ) {
        const fullMatch = value.match(/(\d{4})[-_\s]?(\d{2,3})/);
        if (fullMatch) return `${fullMatch[1]}_${fullMatch[2]}`;
        const oracalMatch = value.match(/ORACAL[_-]?(\d{4})[_-]?(\d{2,3})/i);
        if (oracalMatch) return `${oracalMatch[1]}_${oracalMatch[2]}`;
        const seriesMatch = value.match(/(\d{4})/);
        const colorMatch = value.match(/[-_](\d{2,3})(?:\s|$)/);
        if (seriesMatch && colorMatch) return `${seriesMatch[1]}_${colorMatch[1]}`;
        const anyMatch = value.match(/\b(\d{4})\D+(\d{2,3})\b/);
        if (anyMatch) return `${anyMatch[1]}_${anyMatch[2]}`;
        return value
            .replace(/oracal\s*/i, '')
            .replace(/vinyl\s*/i, '')
            .trim()
            .substring(0, 12)
            .toUpperCase();
    }

    // Acrylic: extract colorCode (3N570, WN071, etc.)
    if (
        category?.includes('ACRYLIC') ||
        value.toLowerCase().includes('acrylic') ||
        value.toLowerCase().includes('plexi')
    ) {
        const codePatterns = [/\b(\d[A-Z]\d{3})\b/i, /\b([A-Z]{2}\d{2,3})\b/i, /\b(\d[A-Z]{2}\d{2})\b/i];
        for (const pattern of codePatterns) {
            const match = value.match(pattern);
            if (match) return match[1].toUpperCase();
        }
        const plexMatch = value.match(/(?:XT|GS|LED)[_-]?([A-Z0-9]{4,6})/i);
        if (plexMatch) return plexMatch[1].toUpperCase();
        if (value.toLowerCase().includes('opal')) return 'OPAL';
        if (value.toLowerCase().includes('clear') || value.includes('0F00')) return 'CLEAR';
        if (/white/i.test(value) && !/opal/i.test(value)) return 'WHITE';
        const parts = value.split(/[-_\s]+/);
        const lastPart = parts[parts.length - 1];
        if (lastPart && /^[A-Z0-9]{4,6}$/i.test(lastPart)) return lastPart.toUpperCase();
        return 'PLEX';
    }

    // RAL paint
    if (category?.includes('RAL') || value.toLowerCase().includes('ral')) {
        const ralMatch = value.match(/\b(\d{4})\b/);
        if (ralMatch) return ralMatch[1];
    }

    // Pantone
    if (category?.includes('PANTONE') || value.toLowerCase().includes('pantone')) {
        const pantoneMatch = value.match(/(\d+\s*[A-Z]*)/i);
        if (pantoneMatch) return pantoneMatch[1].trim();
    }

    // Unknown/custom catalog values retain their identity too.
    return value;
}
