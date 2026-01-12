export interface FieldChange { key:string; from:any; to:any }
export function fieldDiff(a:Record<string,any>, b:Record<string,any>): FieldChange[] {
  const out:FieldChange[] = [];
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort(new Intl.Collator().compare);
  for(const k of keys){ if(JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push({ key:k, from:a[k], to:b[k] }); }
  return out;
}
