export interface ContextSummaryRow { key: string; value: string | number }
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 180) : '';

/** A human summary of explicitly shared fields. Unknown keys and raw objects
 * never become UI labels or an accidental dump of credentials/file contents. */
export function summarizeScreenContext(value: unknown): {
  rows: ContextSummaryRow[]; unsaved: boolean; loading: boolean; unavailable: boolean;
} {
  const data = record(value), order = record(data.order), material = record(data.material);
  const current = record(data.current), filters = record(data.filters), editor = record(data.editor);
  const fields = record(editor.fields), selectedMaterial = record(editor.selectedMaterial);
  const rows: ContextSummaryRow[] = [];
  const add = (key: string, ...values: unknown[]) => {
    const selected = values.map(text).find(Boolean);
    if (selected) rows.push({ key, value: selected });
  };
  add('reference', order.reference, data.reference, data.poNumber);
  add('client', data.clientName, current.clientName, order.client);
  add('selection', fields.nameEn, fields.code, selectedMaterial.name, data.selectedMaterial, material.name, material.name_en, material.code);
  add('project', data.projectTitle);
  add('section', data.section);
  add('status', data.status, order.status);
  add('date', data.selectedDate);
  add('search', data.search, filters.search, filters.query);
  for (const [field, key] of [
    ['visibleOrders', 'orders'], ['recentOrders', 'orders'], ['visibleMaterials', 'materials'], ['profiles', 'profiles'],
    ['cards', 'cards'], ['visibleAlerts', 'alerts']
  ]) {
    if (rows.some(row => row.key === key)) continue;
    const group = record(data[field]);
    if (Array.isArray(data[field])) rows.push({ key, value: data[field].length });
    else if (Array.isArray(group.rows)) rows.push({ key, value: typeof group.totalVisible === 'number'
      && group.totalVisible > group.rows.length ? `${group.rows.length} / ${group.totalVisible}` : group.rows.length });
  }
  const profileIndex = record(data.nativeProfileDraft).profileIndex;
  if (typeof profileIndex === 'number' && Number.isInteger(profileIndex) && profileIndex >= 0) rows.push({ key: 'editingProfile', value: profileIndex + 1 });
  const count = data.selectedCanvasCount ?? data.selectedCount;
  if (typeof count === 'number' && Number.isFinite(count) && count > 0) rows.push({ key: 'selected', value: count });
  const fileCount = data.fileCount;
  if (typeof fileCount === 'number' && Number.isFinite(fileCount) && fileCount >= 0) rows.push({ key: 'files', value: fileCount });
  return {
    rows: rows.slice(0, 10),
    unsaved: data.unsaved === true || data.hasUnsavedChanges === true || data.profileEditorUnsaved === true || editor.unsavedChanges === true,
    loading: data.loading === true,
    unavailable: data.unavailable === true || Object.values(record(data.unavailable)).some(value => value === true)
      || data.catalogUnavailable === true || data.contextUnavailable === true
  };
}
