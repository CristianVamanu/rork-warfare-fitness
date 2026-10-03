/**
 * CSV export, with the formula-injection guard in one place.
 *
 * Lived inside the admin page while it had one caller. It has more than one
 * now, and the escaping below is the sort of thing that must not exist in two
 * copies that can drift: a spreadsheet treats a cell beginning with =, +, -
 * or @ as a formula even when it is quoted, so an exported lead whose name
 * starts with one of those runs as code the moment somebody opens the file.
 */
export function csvEscape(value: string | number): string {
  let s = String(value);
  // Prefixing with an apostrophe forces text interpretation. This is what
  // Google and OWASP both recommend.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
