import type { Material } from './types';
export function toCSV(materials: Material[]): string {
  const headers = ['id','sku','name_en','category','unit','stock','min_stock','location','color_code','thickness_mm','updated_at'];
  const rows = materials.map(m => headers.map(h => JSON.stringify((m as any)[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
}
export function downloadCSV(name:string, csv:string){
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
