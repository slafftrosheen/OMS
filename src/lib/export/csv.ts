export function toCSV<T extends Record<string, unknown>>(rows: T[], headerOrder?: string[]) {
  if (!rows.length) {
    return (headerOrder || []).join(',');
  }

  const headers = headerOrder && headerOrder.length > 0 ? headerOrder : Object.keys(rows[0]);
  const quote = (value: unknown) => {
    if (value == null) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = rows.map((row) => headers.map((header) => quote(row[header])).join(','));
  return [headers.join(','), ...lines].join('\n');
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
