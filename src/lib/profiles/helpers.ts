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

export function extractShortName(data: any, fallbackCategory: string): string {
    return (
        data.shortName ||
        data.material?.metadata?.short_name ||
        data.material?.metadata?.colorCode ||
        getShortName(data.material?.code || data.value, fallbackCategory)
    );
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
// Category-aware short-name extractor.  Each branch keeps the original
// per-material parsing logic intact so behaviour is unchanged.

export function getShortName(value: string, category?: string): string {
    if (!value) return '';

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

    // ALU: thickness or profile dimensions
    if (category?.includes('ALU') || value.toLowerCase().includes('alu')) {
        const thicknessMatch = value.match(/([\d.,]+)\s*mm/i);
        if (thicknessMatch) return `ALU ${thicknessMatch[1].replace(',', '.')}`;
        const profileMatch = value.match(/(\d+x\d+)/i);
        if (profileMatch) return `ALU ${profileMatch[1]}`;
        const codeMatch = value.match(/ALU[_-]?(?:MILL|BRUSH|ANOD)?[_-]?(\d)[_-]?(\d)/i);
        if (codeMatch) return `ALU ${codeMatch[1]}.${codeMatch[2]}`;
        return 'ALU';
    }

    // PVC / Forex
    if (
        category?.includes('PVC') ||
        value.toLowerCase().includes('pvc') ||
        value.toLowerCase().includes('forex')
    ) {
        const thicknessMatch = value.match(/(\d+)\s*mm/i);
        if (thicknessMatch) return `PVC ${thicknessMatch[1]}`;
        if (value.toLowerCase().includes('forex')) return 'FOREX';
        return 'PVC';
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

    // LED modules: Brand + colour temperature
    if (category?.includes('LED')) {
        const parts: string[] = [];
        const brandMatch = value.match(/\b(BaltLed|Sloan|Samsung|Nichia|Osram|Cree|LemLux|LG|Seoul)\b/i);
        if (brandMatch) parts.push(brandMatch[1]);
        const tempMatch = value.match(/(\d{4})\s*[kK]/);
        if (tempMatch) parts.push(`${tempMatch[1]}K`);
        const colorMatch = value.match(/\b(warm|cold|neutral|daylight|white|rgb)\b/i);
        if (colorMatch && parts.length < 2) parts.push(colorMatch[1].toUpperCase());
        if (parts.length > 0) return parts.join(' ');
        const wattMatch = value.match(/(\d+\.?\d*)\s*[wW]/);
        if (wattMatch) return `${wattMatch[1]}W`;
        return 'LED';
    }

    // PSU: brand + wattage
    if (category?.includes('PSU')) {
        const parts: string[] = [];
        const brandMatch = value.match(
            /\b(MeanWell|Mean\s*Well|Philips|Inventronics|Osram|Tridonic)\b/i
        );
        if (brandMatch) parts.push(brandMatch[1].replace(/\s+/g, ''));
        const wattMatch = value.match(/(\d+)\s*[wW]/);
        if (wattMatch) parts.push(`${wattMatch[1]}W`);
        if (parts.length > 0) return parts.join(' ');
        return 'PSU';
    }

    // Wire / Cable: dimensions + colour
    if (category?.includes('WIRE') || category?.includes('CABLE')) {
        const parts: string[] = [];
        const dimsMatch = value.match(/(\d+x[\d.,]+)/i);
        if (dimsMatch) parts.push(dimsMatch[1]);
        const colorMatch = value.match(/\b(black|white|red|blue|green|grey|gray)\b/i);
        if (colorMatch) parts.push(colorMatch[1].toUpperCase());
        if (parts.length > 0) return parts.join(' ');
        return 'CABLE';
    }

    // Default fallback
    const codePattern = value.match(/\b([A-Z0-9]{3,8})\b/i);
    if (codePattern && !/the|and|for|with|board|sheet|foam/i.test(codePattern[1])) {
        return codePattern[1].toUpperCase();
    }
    const words = value.split(/[\s_-]+/).filter((w) => w.length > 1 && !/the|and|for|with/i.test(w));
    if (words.length > 0) return words[0].substring(0, 8).toUpperCase();
    return value.substring(0, 8).toUpperCase();
}
