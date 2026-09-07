"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

import { createAssignment } from "@/server/actions/assignments";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export type TeacherOption = {
  userId: string;
  user: { id: string; name: string | null; email: string };
};
export type ClassOption = { id: string; name: string };
export type SubjectOption = { id: string; name: string; code: string };
export type StreamOption = {
  id: string;
  name: string;
  class: { id: string; name: string };
};

export function teacherItems(teachers: TeacherOption[]) {
  return Object.fromEntries(
    teachers.map((t) => [t.userId, t.user.name ?? t.user.email])
  );
}
export function classItems(classes: ClassOption[]) {
  return Object.fromEntries(classes.map((c) => [c.id, c.name]));
}
export function subjectItems(subjects: SubjectOption[]) {
  return Object.fromEntries(subjects.map((s) => [s.id, `${s.name} (${s.code})`]));
}
export function streamItems(streams: StreamOption[]) {
  return Object.fromEntries(streams.map((s) => [s.id, `${s.class.name} · ${s.name}`]));
}

export function NewAssignmentDialog({
  slug,
  teachers,
  classes,
  subjects,
  streams,
}: {
  slug: string;
  teachers: TeacherOption[];
  classes: ClassOption[];
  subjects: SubjectOption[];
  streams: StreamOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createAssignment>> | null, data: FormData) => {
      const result = await createAssignment(slug, data);
      if (result.ok) success({ title: "Assignment created." });
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New assignment
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
          <DialogDescription>Assign a teacher to a subject for a class (and optionally a stream).</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="assignment-teacher" label="Teacher" required error={fe?.teacherId?.[0]}>
            <Select name="teacherId" defaultValue={teachers[0]?.userId} items={teacherItems(teachers)}>
              <SelectTrigger className="w-full" aria-label="Teacher">
                <SelectValue placeholder="Select teacher" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.userId} value={t.userId}>
                    {t.user.name ?? t.user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="assignment-class" label="Class" required error={fe?.classId?.[0]}>
              <Select name="classId" defaultValue={classes[0]?.id} items={classItems(classes)}>
                <SelectTrigger className="w-full" aria-label="Class">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="assignment-stream" label="Stream" error={fe?.streamId?.[0]} hint="Optional">
              <Select name="streamId" items={streamItems(streams)}>
                <SelectTrigger className="w-full" aria-label="Stream">
                  <SelectValue placeholder="Whole class" />
                </SelectTrigger>
                <SelectContent>
                  {streams.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.class.name} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field id="assignment-subject" label="Subject" required error={fe?.subjectId?.[0]}>
            <Select name="subjectId" defaultValue={subjects[0]?.id} items={subjectItems(subjects)}>
              <SelectTrigger className="w-full" aria-label="Subject">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {failure?.error && !failure.fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">{failure.error}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}