"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type PrintReceiptButtonProps = {
  schoolName: string;
  currency: string;
  receiptNo: string;
  date: string;
  studentName: string;
  studentNo: string | null;
  amount: number;
  method: string;
  otherMethod: string | null;
  referenceNo: string | null;
  yearName: string;
  termName: string;
  classStream: string;
  recordedBy: string;
};

export function PrintReceiptButton({
  schoolName,
  currency,
  receiptNo,
  date,
  studentName,
  studentNo,
  amount,
  method,
  otherMethod,
  referenceNo,
  yearName,
  termName,
  classStream,
  recordedBy,
}: PrintReceiptButtonProps) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = () => {
    setPrinting(true);
    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt ${receiptNo}</title>
        <style>
          @media print {
            @page { margin: 0; size: auto; }
            .no-print { display: none !important; }
          }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20mm; color: #111; }
          .receipt { max-width: 400px; margin: 0 auto; border: 1px solid #ccc; padding: 24px; }
          .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 16px; }
          .school-name { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
          .receipt-title { font-size: 18px; font-weight: 600; color: #666; margin: 0; }
          .divider { border-top: 1px solid #ddd; margin: 16px 0; }
          .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
          .row.label-value { font-weight: 500; }
          .row .label { color: #666; }
          .row .value { font-weight: 500; text-align: right; }
          .amount-row { font-size: 20px; font-weight: 700; margin: 16px 0; padding-top: 16px; border-top: 1px solid #ddd; }
          .footer { margin-top: 24px; font-size: 12px; color: #999; text-align: center; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div class="school-name">${schoolName}</div>
            <p class="receipt-title">Official Receipt</p>
          </div>
          <div class="row"><span class="label">Receipt No:</span><span class="value">${receiptNo}</span></div>
          <div class="row"><span class="label">Date:</span><span class="value">${date}</span></div>
          <div class="divider" />
          <div class="row"><span class="label">Student:</span><span class="value">${studentName}</span></div>
          <div class="row"><span class="label">Admission No:</span><span class="value">${studentNo ?? "—"}</span></div>
          <div class="row"><span class="label">Year / Term:</span><span class="value">${yearName} · ${termName}</span></div>
          <div class="row"><span class="label">Class / Stream:</span><span class="value">${classStream}</span></div>
          <div class="divider" />
          <div class="row"><span class="label">Payment Method:</span><span class="value">${method}${otherMethod ? ` (${otherMethod})` : ""}</span></div>
          <div class="row"><span class="label">Reference:</span><span class="value">${referenceNo ?? "—"}</span></div>
          <div class="row"><span class="label">Recorded By:</span><span class="value">${recordedBy}</span></div>
          <div class="divider" />
          <div class="amount-row row">
            <span class="label">Amount Paid</span>
            <span class="value">${new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)}</span>
          </div>
          <div class="footer">
            <p>This is a computer-generated receipt. No signature required.</p>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
        </script>
      </body>
      </html>
    `;
    const w = window.open("", "_blank", "width=600,height=800");
    if (w) {
      w.document.write(receiptHtml);
      w.document.close();
    }
    setTimeout(() => setPrinting(false), 500);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handlePrint}
      disabled={printing}
      className="gap-1"
    >
      {printing ? (
        <>
          <svg className="mr-1 h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
          Printing…
        </>
      ) : (
        <>
          <Printer className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Print
        </>
      )}
    </Button>
  );
}