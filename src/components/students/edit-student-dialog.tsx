"use client";

import { useActionState, useState } from "react";

import { updateStudent } from "@/server/actions/students";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import {
  StudentFormFields,
  type StudentFormDefaults,
} from "./student-form-fields";

export type StudentDialogData = StudentFormDefaults & {
  id: string;
  archived: boolean;
};

export function EditStudentDialog({
  student,
  slug,
}: {
  student: StudentDialogData;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateStudent>> | null, data: FormData) => {
      const result = await updateStudent(slug, student.id, data);
      if (result.ok) {
        success({ title: "Student updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const defaults: Partial<StudentFormDefaults> = {
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    gender: student.gender,
    dateOfBirth: student.dateOfBirth,
    studentNo: student.studentNo,
    admissionDate: student.admissionDate,
    status: student.status,
    photoUrl: student.photoUrl,
    address: student.address,
    phone: student.phone,
    emergencyContactName: student.emergencyContactName,
    emergencyContactPhone: student.emergencyContactPhone,
    emergencyContactRelation: student.emergencyContactRelation,
    previousSchool: student.previousSchool,
    house: student.house,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
          <DialogDescription>
            Update profile details for this student.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <StudentFormFields fe={failure?.fieldErrors} defaults={defaults} />
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