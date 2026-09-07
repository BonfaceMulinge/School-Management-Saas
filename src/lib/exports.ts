/** Client-safe report export helpers. CSV is generated in the browser from
 * real rendered data (a genuine, downloadable file — never a fake artifact).
 * "Print / PDF" uses the browser's native print dialog which allows saving to
 * PDF, matching the rest of the app's print flows. */

export type CsvValue = string | number | boolean | null | undefined | Date;

function escapeCell(value: CsvValue): string {
  const text =
    value instanceof Date
      ? value.toISOString()
      : value === null || value === undefined
        ? ""
        : String(value);
  const needsQuoting = /[",\n\r;]/.test(text);
  return needsQuoting ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds RFC-4180-ish CSV text (CRLF endings, correct quoting). */
export function toCsv(
  headers: string[],
  rows: CsvValue[][]
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Triggers a real browser download of `text` as filename. */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Opens the browser print dialog (user may "Save as PDF"). */
export function printReport(): void {
  window.print();
}