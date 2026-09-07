"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import {
  createExam,
  updateExam,
  archiveExam,
} from "@/server/actions/exams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const selectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export type ExamFormData = {
  years: { id: string; name: string; isActive: boolean; terms: { id: string; name: string }[] }[];
  classes: { id: string; name: string; streams: { id: string; name: string }[] }[];
  subjects: { id: string; name: string; code: string }[];
};

export type ExamRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  date: string;
  academicYearId: string;
  termId: string;
  classId: string;
  streamId: string | null;
  subjects: { examSubjectId: string; subjectId: string; subjectName: string; maxMarks: number }[];
};

const TYPE_OPTIONS = [
  { value: "CAT", label: "CAT" },
  { value: "MIDTERM", label: "Midterm" },
  { value: "END_TERM", label: "End Term" },
  { value: "ASSIGNMENT", label: "Assignment" },
];

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "ONGOING", label: "Ongoing" },
  { value: "COMPLETED", label: "Completed" },
];

type SubjectRow = { key: string; subjectId: string; maxMarks: string };

function todayInputValue(): string {
  const now = new Date();
  const tp = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${tp(now.getMonth() + 1)}-${tp(now.getDate())}`;
}

function buildInitialRows(exam?: ExamRow): SubjectRow[] {
  if (!exam) return [];
  return exam.subjects.map((s) => ({
    key: `existing-${s.examSubjectId}`,
    subjectId: s.subjectId,
    maxMarks: String(s.maxMarks),
  }));
}

function buildInitialYearId(exam: ExamRow | undefined, formData: ExamFormData): string {
  if (exam) return exam.academicYearId;
  return formData.years.find((y) => y.isActive)?.id ?? formData.years[0]?.id ?? "";
}

function ExamFormFields({
  formData,
  exam,
  mode,
}: {
  formData: ExamFormData;
  exam?: ExamRow;
  mode: "create" | "edit";
}) {
  const counter = useRef(0);
  const [yearId, setYearId] = useState(buildInitialYearId(exam, formData));
  const [classId, setClassId] = useState(exam?.classId ?? "");
  const [streamId, setStreamId] = useState(exam?.streamId ?? "");
  const [name, setName] = useState(exam?.name ?? "");
  const [type, setType] = useState(exam?.type ?? "CAT");
  const [date, setDate] = useState(exam?.date ?? todayInputValue());
  const [status, setStatus] = useState(exam?.status ?? "SCHEDULED");
  const [rows, setRows] = useState<SubjectRow[]>(() => buildInitialRows(exam));

  const year = formData.years.find((y) => y.id === yearId);
  const klass = formData.classes.find((c) => c.id === classId);

  const addRow = () => {
    counter.current += 1;
    setRows((prev) => [...prev, { key: `r${counter.current}`, subjectId: "", maxMarks: "" }]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const patchRow = (key: string, patch: Partial<SubjectRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const availableSubjects = formData.subjects;

  return (
    <div className="grid gap-4">
      <Field id="exam-name" label="Exam name" required>
        <Input id="exam-name" name="name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClasses} placeholder="e.g. End Term 1 Examination" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exam-type" label="Type" required>
          <select
            id="exam-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClasses}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="exam-date" label="Date" required>
          <Input id="exam-date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClasses} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exam-year" label="Academic year" required>
          <select id="exam-year" name="academicYearId" value={yearId} onChange={(e) => setYearId(e.target.value)} className={selectClasses}>
            {formData.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="exam-term" label="Term" required>
          <select id="exam-term" name="termId" defaultValue={exam?.termId ?? ""} className={selectClasses}>
            {year?.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exam-class" label="Class" required>
          <select id="exam-class" name="classId" value={classId} onChange={(e) => { setClassId(e.target.value); setStreamId(""); }} className={selectClasses}>
            <option value="" disabled>
              Select a class
            </option>
            {formData.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="exam-stream" label="Stream" hint="Optional — whole class when empty">
          <select id="exam-stream" name="streamId" value={streamId} onChange={(e) => setStreamId(e.target.value)} className={selectClasses}>
            <option value="">Whole class</option>
            {klass?.streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exam-status" label="Status" required>
          <select id="exam-status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClasses}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Subjects & maximum marks</p>
            <p className="text-xs text-muted-foreground">
              Add every paper included in this exam.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-4" aria-hidden="true" />
            Add subject
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No subjects yet — add at least one paper.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.key} className="flex items-end gap-3 px-4 py-3">
                <Field
                  id={`subject-pick-${row.key}`}
                  label="Subject"
                  className="min-w-0 flex-1"
                >
                  <select
                    id={`subject-pick-${row.key}`}
                    name={`subjectId[${row.key}]`}
                    value={row.subjectId}
                    onChange={(e) => patchRow(row.key, { subjectId: e.target.value })}
                    className={selectClasses}
                  >
                    <option value="" disabled>
                      Select a subject
                    </option>
                    {availableSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`subject-max-${row.key}`} label="Max marks" className="w-32">
                  <Input
                    id={`subject-max-${row.key}`}
                    name={`maxMarks[${row.key}]`}
                    inputMode="decimal"
                    placeholder="100"
                    value={row.maxMarks}
                    onChange={(e) => patchRow(row.key, { maxMarks: e.target.value })}
                    className={inputClasses}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove subject"
                  className="mb-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <span className="sr-only" aria-hidden="true">{mode === "edit" ? "edit" : "create"}</span>
    </div>
  );
}

export function NewExamDialog({
  slug,
  formData,
}: {
  slug: string;
  formData: ExamFormData;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createExam>> | null, data: FormData) => {
      const result = await createExam(slug, data);
      if (result.ok) {
        success({ title: "Exam created." });
        router.push(`/${slug}/exams/${result.data?.id}`);
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New exam
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New exam</DialogTitle>
          <DialogDescription>
            Define an exam for a class/stream within an academic year and term.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <ExamFormFields formData={formData} mode="create" />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create exam"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditExamDialog({
  slug,
  exam,
  formData,
}: {
  slug: string;
  exam: ExamRow;
  formData: ExamFormData;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateExam>> | null, data: FormData) => {
      const result = await updateExam(slug, exam.id, data);
      if (result.ok) {
        success({ title: "Exam updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit exam</DialogTitle>
          <DialogDescription>{exam.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <ExamFormFields formData={formData} exam={exam} mode="edit" />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExamActions({
  slug,
  exam,
  formData,
  canManage,
}: {
  slug: string;
  exam: ExamRow;
  formData: ExamFormData;
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;
  if (exam.status === "ARCHIVED") return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditExamDialog slug={slug} exam={exam} formData={formData} />
      <ConfirmDialog
        trigger={
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Archive
          </Button>
        }
        title="Archive this exam?"
        description="The exam and its marks stay in the system but can no longer be edited."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          const result = await archiveExam(slug, exam.id);
          if (!result.ok && result.error) {
            success({ title: "Couldn’t archive", description: result.error });
          }
        }}
      />
    </div>
  );
}