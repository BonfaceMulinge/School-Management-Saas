import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpenCheck, Mail, Phone, ShieldCheck, UserCircle2 } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { canViewStaff } from "@/server/services/staff";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { fullName } from "@/lib/students";
import { STAFF_ROLE_LABELS } from "@/lib/staff";
import { formatDate } from "@/lib/format";
import { EditStaffDialog, type StaffDialogData } from "@/components/staff/edit-staff-dialog";
import { StaffArchiveAction } from "@/components/staff/archive-action";

export const metadata: Metadata = {
  title: "Staff Profile",
};

export default async function StaffProfilePage(
  props: PageProps<"/[school]/staff/[staffId]">
) {
  const { school: slug, staffId } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "staff:view", { next: `/${slug}/staff` }),
    canAccess(slug, "staff:manage"),
  ]);

  if (!(await canViewStaff(access, staffId))) notFound();

  const staff = await db.staff.findUnique({
    where: { id: staffId, schoolId: access.schoolId },
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
    },
  });

  if (!staff) notFound();

  const membership = staff.user
    ? await db.membership.findUnique({
        where: { schoolId_userId: { schoolId: access.schoolId, userId: staff.user.id } },
        select: { role: true },
      })
    : null;

  const assignmentData =
    staff.user && staff.role === "TEACHER"
      ? await db.teacherAssignment.findMany({
          where: { schoolId: access.schoolId, teacherId: staff.user.id },
          include: {
            class: { select: { id: true, name: true } },
            stream: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true, code: true } },
          },
          orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
        })
      : [];

  const classIds = [...new Set(assignmentData.map((a) => a.classId))];
  const activeEnrollments = classIds.length
    ? await db.enrollment.findMany({
        where: {
          schoolId: access.schoolId,
          classId: { in: classIds },
          status: "ACTIVE",
        },
        select: {
          classId: true,
          streamId: true,
          student: {
            select: { id: true, firstName: true, middleName: true, lastName: true },
          },
        },
        orderBy: { student: { lastName: "asc" } },
      })
    : [];

  const assignments = assignmentData.map((a) => {
    const streamIds = a.streamId ? [a.streamId] : null;
    const students = activeEnrollments.filter(
      (e) =>
        e.classId === a.classId &&
        (streamIds === null ? true : e.streamId !== null && streamIds.includes(e.streamId))
    );
    return { ...a, students };
  });

  const editDefaults: StaffDialogData = {
    id: staff.id,
    firstName: staff.firstName,
    middleName: staff.middleName,
    lastName: staff.lastName,
    staffNo: staff.staffNo,
    role: staff.role,
    phone: staff.phone,
    dateJoined: staff.dateJoined ? staff.dateJoined.toISOString().slice(0, 10) : "",
    department: staff.department,
    position: staff.position,
    status: staff.status,
    archived: staff.archived,
    userId: staff.user?.id ?? null,
    userEmail: staff.user?.email ?? null,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={fullName(staff.firstName, staff.middleName, staff.lastName)}
        description={`Staff No: ${staff.staffNo ?? "—"} · Joined ${staff.dateJoined ? formatDate(staff.dateJoined) : "—"}`}
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <EditStaffDialog staff={editDefaults} slug={slug} />
              {!staff.archived ? <StaffArchiveAction slug={slug} staffId={staff.id} /> : null}
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
              {staff.firstName[0]}
              {staff.lastName[0]}
            </span>
            <div className="flex flex-col items-start gap-2">
              <Badge variant="secondary">{STAFF_ROLE_LABELS[staff.role]}</Badge>
              {staff.archived ? (
                <Badge variant="outline">Archived</Badge>
              ) : staff.status === "ACTIVE" ? (
                <Badge variant="default">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Staff number</dt>
              <dd className="font-medium">{staff.staffNo ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Department</dt>
              <dd className="font-medium">{staff.department ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Position</dt>
              <dd className="font-medium">{staff.position ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Date joined</dt>
              <dd className="font-medium">
                {staff.dateJoined ? formatDate(staff.dateJoined) : "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Record created</dt>
              <dd className="font-medium">{formatDate(staff.createdAt)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Phone</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {staff.phone ?? "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Account</h2>
          {staff.user ? (
            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Linked account</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  <UserCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  {staff.user.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="size-3.5" aria-hidden="true" /> Email
                </dt>
                <dd className="font-medium">{staff.user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email verified</dt>
                <dd className="font-medium">
                  {staff.user.emailVerified ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" /> Portal role
                </dt>
                <dd className="font-medium">
                  {membership?.role ?? staff.user.platformRole ?? "School-level"}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No login account is linked to this staff member yet.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Staff without an account cannot sign in individually.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Employment</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="font-medium">
                {staff.archived
                  ? "Archived"
                  : staff.status === "ACTIVE"
                    ? "Active"
                    : "Inactive"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="font-medium">{STAFF_ROLE_LABELS[staff.role]}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            Payroll, leave and performance records will appear here in later phases.
          </p>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Teacher assignments</h2>
          <a
            href={`/${slug}/assignments`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <BookOpenCheck className="size-3.5" aria-hidden="true" />
            Manage assignments
          </a>
        </div>

        {staff.role !== "TEACHER" ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            This staff member&apos;s employment role is not Teacher.
          </p>
        ) : assignments.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No teaching assignments yet. Assign subjects, classes and streams from the
            Teacher Assignments page.
          </p>
        ) : (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {assignments.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {a.subject.code}
                      </code>{" "}
                      <span className="text-muted-foreground">· {a.subject.name}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.class.name}
                      {a.stream ? ` · ${a.stream.name}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    assigned {formatDate(a.createdAt)}
                  </Badge>
                </div>
                {a.students.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No actively enrolled students in this class/stream.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {a.students.map((s) => (
                      <li key={s.student.id}>
                        <a
                          href={`/${slug}/students/${s.student.id}`}
                          className="inline-block rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {fullName(s.student.firstName, s.student.middleName, s.student.lastName)}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}