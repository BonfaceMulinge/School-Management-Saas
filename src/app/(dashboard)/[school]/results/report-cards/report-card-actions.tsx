"use client";

import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Report cards are printed from the browser: the printable area is everything
 * inside `.print-sheet` (see the `@media print` rules in globals.css), so the
 * admin prints to PDF from the browser's print dialog.
 */
export function PrintButton({ label = "Print report cards" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

export function DownloadCsvButton({
  filename,
  csv,
  label = "Download CSV",
}: {
  filename: string;
  csv: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => {
        // BOM keeps Excel happy with UTF-8 characters such as “–”.
        const blob = new Blob(["\uFEFF", csv], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }}
    >
      <Download className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}