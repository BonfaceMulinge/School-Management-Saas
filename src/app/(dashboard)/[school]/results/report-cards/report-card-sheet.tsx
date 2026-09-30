import type { ReportCardMeta, ReportCardStudent } from "@/lib/report-card-csv";
import type { BandView } from "@/server/services/results";

export type CardSchool = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  motto: string | null;
  logoUrl: string | null;
};

export type CardExam = {
  name: string;
  date: Date;
  type: string;
};

function dt(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * A single printable report card. Every card lives inside `.print-sheet` so the
 * `@media print` rules in globals.css print only the cards, one per page.
 */
export function ReportCardSheet({
  school,
  exam,
  meta,
  card,
  bands,
}: {
  school: CardSchool;
  exam: CardExam;
  meta: ReportCardMeta;
  card: ReportCardStudent;
  bands: BandView[];
}) {
  return (
    <article className="print-sheet mb-6 rounded-lg border border-border bg-card p-6">
      <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-14 object-contain" />
          ) : null}
          <div>
            <h2 className="text-lg font-bold tracking-tight uppercase">{school.name}</h2>
            <p className="text-xs text-muted-foreground">
              {[school.address, school.phone, school.email].filter(Boolean).join(" · ")}
            </p>
            {school.motto ? (
              <p className="text-xs italic text-muted-foreground">“{school.motto}”</p>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">Report Card</p>
          <p className="text-xs text-muted-foreground">{exam.name}</p>
          <p className="text-xs text-muted-foreground">{dt(exam.date)}</p>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Student</dt>
          <dd className="font-medium">{card.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Admission No.</dt>
          <dd className="font-medium">{card.studentNo ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Class / Stream</dt>
          <dd className="font-medium">
            {meta.className}
            {meta.streamName ? ` · ${meta.streamName}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Academic year</dt>
          <dd className="font-medium">{meta.yearName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Term</dt>
          <dd className="font-medium">{meta.termName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Position in class</dt>
          <dd className="font-medium">{card.rank === null ? "—" : `${card.rank}`}</dd>
        </div>
        {card.pathway || card.combination ? (
          <div>
            <dt className="text-muted-foreground">Pathway / Combination</dt>
            <dd className="font-medium">
              {card.pathway ?? "General"}
              {card.combination ? ` · ${card.combination}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <table className="mt-4 min-w-full divide-y divide-border border border-border text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Subject</th>
            <th className="px-2 py-2 text-center font-medium">Mark</th>
            <th className="px-2 py-2 text-center font-medium">Max</th>
            <th className="px-2 py-2 text-center font-medium">%</th>
            <th className="px-2 py-2 text-center font-medium">Grade</th>
            <th className="px-2 py-2 text-center font-medium">Points</th>
            <th className="px-2 py-2 text-left font-medium">Teacher remark</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {card.rows.map((row) => (
            <tr key={row.subjectName}>
              <td className="px-2 py-1.5">{row.subjectName}</td>
              <td className="px-2 py-1.5 text-center">{row.marksObtained ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-muted-foreground">{row.maxMarks}</td>
              <td className="px-2 py-1.5 text-center">
                {row.percentage === null ? "—" : `${row.percentage}%`}
              </td>
              <td className="px-2 py-1.5 text-center font-medium">{row.grade ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-muted-foreground">{row.points ?? "—"}</td>
              <td className="px-2 py-1.5 italic text-muted-foreground">{row.remark ?? "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-muted/30 font-medium">
          <tr>
            <td className="px-2 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-center">{card.max > 0 ? card.obtained : "—"}</td>
            <td className="px-2 py-1.5 text-center">{card.max > 0 ? card.max : "—"}</td>
            <td className="px-2 py-1.5 text-center">
              {card.percentage === null ? "—" : `${card.percentage}%`}
            </td>
            <td className="px-2 py-1.5 text-center">{card.grade ?? "—"}</td>
            <td className="px-2 py-1.5 text-center">{card.points ?? "—"}</td>
            <td className="px-2 py-1.5" />
          </tr>
        </tfoot>
      </table>

      {bands.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium">Grading key</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {bands
              .slice()
              .sort((a, b) => a.minPercent - b.minPercent)
              .map((band) => (
                <li key={band.id}>
                  {band.minPercent}–{band.maxPercent}% ={" "}
                  <span className="font-medium text-foreground">{band.grade}</span>
                  {band.points !== null ? ` (${band.points} pts)` : ""} · {band.remark}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-3 gap-4 text-center text-[11px] text-muted-foreground">
        <div className="border-t border-border pt-1">Class Teacher</div>
        <div className="border-t border-border pt-1">Principal</div>
        <div className="border-t border-border pt-1">Parent / Guardian</div>
      </div>
    </article>
  );
}