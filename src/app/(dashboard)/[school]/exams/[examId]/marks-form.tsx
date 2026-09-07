"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, Save } from "lucide-react";

import { saveMarks, clearMark } from "@/server/actions/exams";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { success } from "@/components/ui/use-toast";

export type MarksRowView = {
  studentId: string;
  name: string;
  studentNo: string | null;
  obtained: { id: string; value: number } | null;
  percentage: number | null;
  band: { grade: string; points: number | null } | null;
  editable: boolean;
};

function ClearMarkButton({
  slug,
  examId,
  examSubjectId,
  markId,
  onCleared,
}: {
  slug: string;
  examId: string;
  examSubjectId: string;
  markId: string;
  onCleared: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const router = useRouter();

  const run = async () => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 2500);
      return;
    }
    const result = await clearMark(slug, examId, examSubjectId, markId);
    if (result.ok) {
      success({ title: "Mark cleared." });
      onCleared();
      router.refresh();
    } else if (result.error) {
      success({ title: "Couldn’t clear mark", description: result.error });
    }
    setArmed(false);
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={run}
      className={
        armed
          ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:text-foreground"
      }
    >
      <Eraser className="size-3.5" aria-hidden="true" />
      {armed ? "Sure?" : "Clear"}
    </Button>
  );
}

export function MarksForm({
  slug,
  examId,
  examSubjectId,
  subjectName,
  maxMarks,
  rows,
}: {
  slug: string;
  examId: string;
  examSubjectId: string;
  subjectName: string;
  maxMarks: number;
  rows: MarksRowView[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof saveMarks>> | null, data: FormData) => {
      const result = await saveMarks(slug, examId, examSubjectId, data);
      if (result.ok) {
        const payload = result.data;
        success({
          title: "Marks saved",
          description:
            payload && payload.saved > 0
              ? `${payload.saved} recorded · ${payload.updated} updated.`
              : `${payload ? payload.updated : 0} marks updated.`,
        });
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <div>
      <form action={formAction} noValidate>
        <div className="border-b border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Enter marks out of {maxMarks} for {subjectName}. Leave a field empty to keep its current value.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-center font-medium">Mark (max {maxMarks})</th>
                <th className="px-4 py-3 text-center font-medium">%</th>
                <th className="px-4 py-3 text-center font-medium">Grade</th>
                <th className="px-4 py-3 text-right font-medium">Current</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.studentId}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.studentNo ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-center">
                      <input
                        type="number"
                        name={`mark[${row.studentId}]`}
                        defaultValue={row.obtained?.value ?? ""}
                        min={0}
                        max={maxMarks}
                        step="0.01"
                        className="h-8 w-24 rounded-md border border-border bg-background px-2 text-center text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                        aria-label={`Mark for ${row.name}`}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.percentage === null ? "—" : `${row.percentage}%`}
                  </td>
                  <td className="px-4 py-2.5 text-center font-medium">
                    {row.band?.grade ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.obtained === null ? (
                      <span className="text-xs text-muted-foreground">Not recorded</span>
                    ) : (
                      <ClearMarkButton
                        slug={slug}
                        examId={examId}
                        examSubjectId={examSubjectId}
                        markId={row.obtained.id}
                        onCleared={() => router.refresh()}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {failure?.error ? (
          <p role="alert" className="px-5 pt-3 text-sm text-destructive">
            {failure.error}
          </p>
        ) : null}

        <div className="flex justify-end border-t border-border px-5 py-4">
          <Button type="submit" disabled={isPending}>
            <Save className="size-4" aria-hidden="true" />
            {isPending ? "Saving…" : "Save marks"}
          </Button>
        </div>
      </form>
    </div>
  );
}