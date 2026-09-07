"use client";

import { useActionState, useState } from "react";

import { deleteAssignment, updateAssignment } from "@/server/actions/assignments";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";
import type {
  ClassOption,
  StreamOption,
  SubjectOption,
  TeacherOption,
} from "./new-assignment-dialog";
import { teacherItems, classItems, subjectItems, streamItems } from "./new-assignment-dialog";

type Assignment = {
  id: string;
  teacherId: string;
  classId: string;
  streamId: string | null;
  subjectId: string;
  teacher: { id: string; name: string | null; email: string };
  class: { id: string; name: string };
  stream: { id: string; name: string } | null;
  subject: { id: string; name: string; code: string };
};

function streamItemsWithWholeClass(streams: StreamOption[]) {
  return { "": "Whole class", ...streamItems(streams) };
}

function EditAssignmentForm({
  assignment,
  slug,
  teachers,
  classes,
  subjects,
  streams,
}: {
  assignment: Assignment;
  slug: string;
  teachers: TeacherOption[];
  classes: ClassOption[];
  subjects: SubjectOption[];
  streams: StreamOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateAssignment>> | null, data: FormData) => {
      const result = await updateAssignment(slug, assignment.id, data);
      if (result.ok) {
        success({ title: "Assignment updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
          <DialogDescription>
            {assignment.teacher.name ?? assignment.teacher.email} · {assignment.class.name}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="assignment-teacher-edit" label="Teacher" required error={fe?.teacherId?.[0]}>
            <Select name="teacherId" defaultValue={assignment.teacherId} items={teacherItems(teachers)}>
              <SelectTrigger className="w-full" aria-label="Teacher">
                <SelectValue />
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
            <Field id="assignment-class-edit" label="Class" required error={fe?.classId?.[0]}>
              <Select name="classId" defaultValue={assignment.classId} items={classItems(classes)}>
                <SelectTrigger className="w-full" aria-label="Class">
                  <SelectValue />
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
            <Field id="assignment-stream-edit" label="Stream" error={fe?.streamId?.[0]} hint="Optional">
              <Select
                name="streamId"
                defaultValue={assignment.streamId ?? ""}
                items={streamItemsWithWholeClass(streams)}
              >
                <SelectTrigger className="w-full" aria-label="Stream">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Whole class</SelectItem>
                  {streams.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.class.name} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field id="assignment-subject-edit" label="Subject" required error={fe?.subjectId?.[0]}>
            <Select name="subjectId" defaultValue={assignment.subjectId} items={subjectItems(subjects)}>
              <SelectTrigger className="w-full" aria-label="Subject">
                <SelectValue />
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
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssignmentRowActions({
  assignment,
  slug,
  teachers,
  classes,
  subjects,
  streams,
  canManage,
}: {
  assignment: Assignment;
  slug: string;
  teachers: TeacherOption[];
  classes: ClassOption[];
  subjects: SubjectOption[];
  streams: StreamOption[];
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditAssignmentForm
        assignment={assignment}
        slug={slug}
        teachers={teachers}
        classes={classes}
        subjects={subjects}
        streams={streams}
      />
      <ConfirmDialog
        trigger={
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Remove
          </Button>
        }
        title="Remove this assignment?"
        description="The teacher will no longer be assigned to teach this subject for the class."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          const result = await deleteAssignment(slug, assignment.id);
          if (!result.ok && result.error) success({ title: "Couldn’t remove", description: result.error });
        }}
      />
    </div>
  );
}