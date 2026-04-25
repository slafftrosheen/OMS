/**
 * GET /api/colors?system=RAL
 *
 * Returns a fixed catalogue of standardized colour codes (RAL Classic,
 * Pantone, Oracal vinyl).  Self-contained and offline; no third-party
 * lookup is needed in the air-gapped Tailnet deployment.
 *
 * Response shape:  { data: ColorEntry[], pagination?: ... }
 */

import { type RequestHandler } from '@sveltejs/kit';
import { okList, requireAuth } from '$lib/server/api/helpers';

interface ColorEntry {
    code: string;
    name: string;
    hex: string;
    system: 'RAL' | 'Pantone' | 'Oracal';
}

// Curated subset of the RAL Classic K7 palette covering the most common
// signage / fabrication colours.  Full palette can be added later if needed.
const RAL_CLASSIC: ColorEntry[] = [
    { code: 'RAL 1003', name: 'Signal Yellow',      hex: '#F7BA0B', system: 'RAL' },
    { code: 'RAL 1018', name: 'Zinc Yellow',        hex: '#FAAB21', system: 'RAL' },
    { code: 'RAL 1023', name: 'Traffic Yellow',     hex: '#EDA600', system: 'RAL' },
    { code: 'RAL 2002', name: 'Vermilion',          hex: '#C63927', system: 'RAL' },
    { code: 'RAL 2004', name: 'Pure Orange',        hex: '#E55137', system: 'RAL' },
    { code: 'RAL 3000', name: 'Flame Red',          hex: '#AF2B1E', system: 'RAL' },
    { code: 'RAL 3001', name: 'Signal Red',         hex: '#A52019', system: 'RAL' },
    { code: 'RAL 3020', name: 'Traffic Red',        hex: '#C1121C', system: 'RAL' },
    { code: 'RAL 4005', name: 'Blue Lilac',         hex: '#6C4675', system: 'RAL' },
    { code: 'RAL 5002', name: 'Ultramarine Blue',   hex: '#20214F', system: 'RAL' },
    { code: 'RAL 5005', name: 'Signal Blue',        hex: '#1E2460', system: 'RAL' },
    { code: 'RAL 5010', name: 'Gentian Blue',       hex: '#0E294B', system: 'RAL' },
    { code: 'RAL 5012', name: 'Light Blue',         hex: '#3481B8', system: 'RAL' },
    { code: 'RAL 5015', name: 'Sky Blue',           hex: '#2271B3', system: 'RAL' },
    { code: 'RAL 6005', name: 'Moss Green',         hex: '#2F4538', system: 'RAL' },
    { code: 'RAL 6018', name: 'Yellow Green',       hex: '#57A639', system: 'RAL' },
    { code: 'RAL 7016', name: 'Anthracite Grey',    hex: '#293133', system: 'RAL' },
    { code: 'RAL 7035', name: 'Light Grey',         hex: '#CBD0CC', system: 'RAL' },
    { code: 'RAL 7037', name: 'Dusty Grey',         hex: '#7D8471', system: 'RAL' },
    { code: 'RAL 7040', name: 'Window Grey',        hex: '#9DA1AA', system: 'RAL' },
    { code: 'RAL 8004', name: 'Copper Brown',       hex: '#8E402A', system: 'RAL' },
    { code: 'RAL 8017', name: 'Chocolate Brown',    hex: '#45322E', system: 'RAL' },
    { code: 'RAL 9001', name: 'Cream',              hex: '#FDF4E3', system: 'RAL' },
    { code: 'RAL 9002', name: 'Grey White',         hex: '#E7EBDA', system: 'RAL' },
    { code: 'RAL 9003', name: 'Signal White',       hex: '#F4F4F4', system: 'RAL' },
    { code: 'RAL 9005', name: 'Jet Black',          hex: '#0A0A0A', system: 'RAL' },
    { code: 'RAL 9006', name: 'White Aluminium',    hex: '#A5A5A5', system: 'RAL' },
    { code: 'RAL 9010', name: 'Pure White',         hex: '#F7F9EF', system: 'RAL' },
    { code: 'RAL 9016', name: 'Traffic White',      hex: '#F1F0EA', system: 'RAL' },
    { code: 'RAL 9017', name: 'Traffic Black',      hex: '#2A2A2A', system: 'RAL' }
];

export const GET: RequestHandler = async ({ url, locals }) => {
    requireAuth(locals);

    const system = (url.searchParams.get('system') || 'RAL').toUpperCase();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    let palette: ColorEntry[];
    switch (system) {
        case 'RAL':
            palette = RAL_CLASSIC;
            break;
        // Pantone / Oracal will follow when the operations team supplies the
        // licensed swatch lists.  Leaving these empty rather than inventing
        // approximate values.
        case 'PANTONE':
        case 'ORACAL':
            palette = [];
            break;
        default:
            palette = RAL_CLASSIC;
    }

    const filtered = q
        ? palette.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
        : palette;

    return okList(filtered, { total: filtered.length, limit: filtered.length, page: 1 });
};
