import type { Item } from './types';
export function toCSV(items: Item[]): string {
  const headers = ['id','sku','name','category','unit','stock','min','location','colorCode','thicknessMM','updatedAt'];
  const rows = items.map(i => headers.map(h => JSON.stringify((i as any)[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
}
export function downloadCSV(name:string, csv:string){
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
