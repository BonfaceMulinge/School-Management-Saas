"use client";

import { useActionState, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { enrollStudent } from "@/server/actions/enrollments";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import {
  EnrollmentFields,
  type RefClass,
  type RefCombination,
  type RefPathway,
  type RefYear,
} from "@/components/students/enrollment-dialogs";

export type AdmRefStudent = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  studentNo: string | null;
};

function singleLine(fn = "", mn: string | null = "", ln = ""): string {
  return `${fn} ${mn} ${ln}`.replace(/\s+/g, " ").trim();
}

export function AdmissionsDialog({
  slug,
  students,
  classes,
  years,
  pathways,
  combinations,
  activeYearId,
}: {
  slug: string;
  students: AdmRefStudent[];
  classes: RefClass[];
  years: RefYear[];
  pathways: RefPathway[];
  combinations: RefCombination[];
  activeYearId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [q, setQ] = useState("");

  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof enrollStudent>> | null, data: FormData) => {
      const result = await enrollStudent(slug, data);
      if (result.ok) {
        success({ title: "Student admitted." });
        setOpen(false);
        setStudentId("");
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((s) =>
      singleLine(s.firstName, s.middleName, s.lastName).toLowerCase().includes(needle)
    );
  }, [q, students]);

  const selected = students.find((s) => s.id === studentId);

  return (
    <div>
      <Button onClick={() => setOpen(true)}>Admit student</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Admit a student</DialogTitle>
            <DialogDescription>
              Enroll a student into the current academic year, term, CBC level,
              stream, and Senior School pathway/combination where applicable.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="grid gap-4">
            <Field id="adm-student" label="1. Choose the student" error={failure?.fieldErrors?.studentId?.[0]}>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search students not yet enrolled this year…"
                  className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                />
              </div>
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border">
                {matches.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    No eligible students found.
                  </li>
                ) : (
                  matches.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setStudentId(s.id)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                          studentId === s.id ? "bg-muted/60" : ""
                        }`}
                      >
                        <span className="font-medium">
                          {singleLine(s.firstName, s.middleName, s.lastName)}
                        </span>
                        <span className="text-xs text-muted-foreground">{s.studentNo ?? "—"}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </Field>

            {selected ? (
              <input type="hidden" name="studentId" value={selected.id} />
            ) : null}

            <Field id="adm-placement" label="2. Placement details">
              <EnrollmentFields
                classes={classes}
                years={years}
                pathways={pathways}
                combinations={combinations}
                defaultYearId={activeYearId ?? undefined}
                fe={failure?.fieldErrors}
              />
            </Field>

            {failure?.error && !failure.fieldErrors ? (
              <p role="alert" className="text-sm text-destructive">
                {failure.error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || !studentId}>
                {isPending ? "Admitting…" : "Confirm admission"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}