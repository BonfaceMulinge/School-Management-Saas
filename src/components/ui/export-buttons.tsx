"use client";

import { Printer, FileSpreadsheet, Loader2 } from "lucide-react";
import { useCallback, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  downloadTextFile,
  printReport,
  toCsv,
  type CsvValue,
} from "@/lib/exports";

/** Exports the current report's rendered rows as a genuine CSV download. */
export function CsvExportButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: CsvValue[][];
}) {
  const [pending, startTransition] = useTransition();

  const handleClick = useCallback(() => {
    startTransition(() => {
      downloadTextFile(filename, toCsv(headers, rows));
    });
  }, [filename, headers, rows]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending || rows.length === 0}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileSpreadsheet className="size-4" aria-hidden="true" />
      )}
      Export CSV
    </Button>
  );
}

/** Opens the browser print dialog (also allows "Save as PDF"). */
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={printReport}>
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}