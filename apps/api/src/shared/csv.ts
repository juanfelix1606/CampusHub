export function attendanceCsvCell(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function attendanceCsv(
  rows: Array<Record<string, string | number | Date | null | undefined>>,
  headers: string[],
): string {
  const lines = [
    headers.map(attendanceCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => attendanceCsvCell(row[header])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
