import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail, Phone, ShieldCheck, UserCircle2 } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { canViewStudent } from "@/server/services/students";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { fullName } from "@/lib/students";
import { formatDate } from "@/lib/format";
import { EditStudentDialog } from "@/components/students/edit-student-dialog";
import {
  EnrollDialog,
  TransferDialog,
  PromoteDialog,
  EnrollmentStatusPicker,
  type RefClass,
  type RefYear,
} from "@/components/students/enrollment-dialogs";
import {
  AddGuardianDialog,
  NewParentDialog,
  GuardianRowActions,
  type GuardianParentRef,
} from "@/components/students/guardians";
import type { StudentDialogData } from "@/components/students/edit-student-dialog";

export const metadata: Metadata = {
  title: "Student Profile",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  WITHDRAWN: "Withdrawn",
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  GRADUATED: "Graduated",
  TRANSFERRED: "Transferred",
  DROPPED: "Dropped",
};

export default async function StudentProfilePage(
  props: PageProps<"/[school]/students/[studentId]">
) {
  const { school: slug, studentId } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManageStudents, canManageEnrollments, canManageParents] =
    await Promise.all([
      requirePermission(slug, "students:view", { next: `/${slug}/students` }),
      canAccess(slug, "students:manage"),
      canAccess(slug, "enrollments:manage"),
      canAccess(slug, "parents:manage"),
    ]);

  if (!(await canViewStudent(access, studentId))) notFound();

  const [student, classes, years, parents] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId, schoolId: access.schoolId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            platformRole: true,
          },
        },
        guardians: {
          orderBy: { isPrimary: "desc" },
          include: {
            guardian: { select: { id: true, name: true, email: true } },
          },
        },
        enrollments: {
          orderBy: [{ academicYear: { startDate: "desc" } }, { createdAt: "desc" }],
          include: {
            class: { select: { name: true } },
            stream: { select: { name: true } },
            academicYear: { select: { name: true, startDate: true } },
            term: { select: { name: true } },
          },
        },
      },
    }),
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: {
        streams: {
          where: { archived: false },
          select: { id: true, name: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
    db.guardian
      .findMany({
        where: { schoolId: access.schoolId },
        distinct: ["guardianUserId"],
        select: { guardianUserId: true },
      })
      .then((rows) =>
        db.user.findMany({
          where: { id: { in: rows.map((r) => r.guardianUserId) } },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      ),
  ]);

  if (!student) notFound();

  const refClasses: RefClass[] = classes.map((c) => ({
    id: c.id,
    name: c.name,
    streams: c.streams,
  }));
  const refYears: RefYear[] = years.map((y) => ({
    id: y.id,
    name: y.name,
    terms: y.terms,
  }));
  const refParents: GuardianParentRef[] = parents.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
  }));

  const hasActiveEnrollment = student.enrollments.some((e) => e.status === "ACTIVE");

  const editDefaults: StudentDialogData = {
    id: student.id,
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    gender: student.gender ?? "",
    dateOfBirth: student.dateOfBirth
      ? student.dateOfBirth.toISOString().slice(0, 10)
      : "",
    studentNo: student.studentNo,
    admissionDate: student.admissionDate
      ? student.admissionDate.toISOString().slice(0, 10)
      : "",
    status: student.status,
    photoUrl: student.photoUrl,
    address: student.address,
    phone: student.phone,
    emergencyContactName: student.emergencyContactName,
    emergencyContactPhone: student.emergencyContactPhone,
    emergencyContactRelation: student.emergencyContactRelation,
    previousSchool: student.previousSchool,
    house: student.house,
    archived: student.archived,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={fullName(student.firstName, student.middleName, student.lastName)}
        description={`Admission No: ${student.studentNo ?? "—"} · Registered ${formatDate(student.createdAt)}`}
        action={
          canManageStudents ? (
            <div className="flex items-center gap-2">
              <EditStudentDialog student={editDefaults} slug={slug} />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            {student.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.photoUrl}
                alt={fullName(student.firstName, student.middleName, student.lastName)}
                className="size-16 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                {student.firstName[0]}
                {student.lastName[0]}
              </span>
            )}
            <div>
              {student.archived ? (
                <Badge variant="outline">Archived</Badge>
              ) : (
                <Badge variant="default">{STATUS_LABELS[student.status]}</Badge>
              )}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Gender</dt>
              <dd className="font-medium">{student.gender ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Date of birth</dt>
              <dd className="font-medium">
                {student.dateOfBirth ? formatDate(student.dateOfBirth) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Admission date</dt>
              <dd className="font-medium">
                {student.admissionDate ? formatDate(student.admissionDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">House</dt>
              <dd className="font-medium">{student.house ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Address</dt>
              <dd className="font-medium">{student.address ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Phone</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {student.phone ?? "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Previous school</dt>
              <dd className="font-medium">{student.previousSchool ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Account</h2>
          {student.user ? (
            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Linked account</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  <UserCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  {student.user.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="size-3.5" aria-hidden="true" /> Email
                </dt>
                <dd className="font-medium">{student.user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email verified</dt>
                <dd className="font-medium">
                  {student.user.emailVerified ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" /> Role
                </dt>
                <dd className="font-medium">{student.user.platformRole ?? "School-level"}</dd>
              </div>
            </dl>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No platform account is linked to this student yet.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Students without an account cannot sign in individually.
              </p>
            </div>
          )}

          <h2 className="mt-6 text-sm font-semibold">Emergency contact</h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="font-medium">{student.emergencyContactName ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted-foreground">Phone</dt>
              <dd className="font-medium">{student.emergencyContactPhone ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted-foreground">Relationship</dt>
              <dd className="font-medium">{student.emergencyContactRelation ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Guardians</h2>
            {canManageParents ? (
              <div className="flex items-center gap-2">
                <AddGuardianDialog
                  slug={slug}
                  parents={refParents}
                  studentId={student.id}
                />
                <NewParentDialog slug={slug} />
              </div>
            ) : null}
          </div>
          {student.guardians.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No guardians linked. Add a parent account and link them here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border text-sm">
              {student.guardians.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {g.guardian.name ?? g.guardian.email}
                      {g.isPrimary ? (
                        <Badge variant="secondary" className="ml-2">Primary</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {g.relationship} · {g.guardian.email}
                    </p>
                  </div>
                  <GuardianRowActions
                    slug={slug}
                    canManage={canManageParents}
                    guardian={{
                      id: g.id,
                      studentId: student.id,
                      relationship: g.relationship,
                      isPrimary: g.isPrimary,
                      guardian: g.guardian,
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Enrollment history</h2>
          {canManageEnrollments ? (
            <div className="flex items-center gap-2">
              <PromoteDialog
                slug={slug}
                studentId={student.id}
                studentName={fullName(student.firstName, student.middleName, student.lastName)}
                classes={refClasses}
                years={refYears}
              />
              <TransferDialog
                slug={slug}
                studentId={student.id}
                studentName={fullName(student.firstName, student.middleName, student.lastName)}
                classes={refClasses}
                years={refYears}
              />
              <EnrollDialog
                slug={slug}
                studentId={student.id}
                studentName={fullName(student.firstName, student.middleName, student.lastName)}
                hasActiveEnrollment={hasActiveEnrollment}
                classes={refClasses}
                years={refYears}
              />
            </div>
          ) : null}
        </div>

        {student.enrollments.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            This student has not been enrolled yet.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 text-left font-medium">Year</th>
                <th scope="col" className="px-5 py-3 text-left font-medium">Term</th>
                <th scope="col" className="px-5 py-3 text-left font-medium">Class</th>
                <th scope="col" className="px-5 py-3 text-left font-medium">Stream</th>
                <th scope="col" className="px-5 py-3 text-left font-medium">Status</th>
                {canManageEnrollments ? (
                  <th scope="col" className="px-5 py-3 text-right font-medium">Update</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {student.enrollments.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3 font-medium">{e.academicYear.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {e.term ? e.term.name : "—"}
                  </td>
                  <td className="px-5 py-3">{e.class.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {e.stream ? e.stream.name : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={e.status === "ACTIVE" ? "default" : "secondary"}>
                      {ENROLLMENT_STATUS_LABELS[e.status]}
                    </Badge>
                  </td>
                  {canManageEnrollments ? (
                    <td className="px-5 py-3 text-right">
                      <EnrollmentStatusPicker
                        slug={slug}
                        enrollmentId={e.id}
                        current={e.status}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-dashed border-border px-5 py-6">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Future modules
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Results, finance and communication records for this
          student will appear here in later phases.
        </p>
      </section>
    </div>
  );
}