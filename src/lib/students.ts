export type EnrollmentForDisplay = {
  id: string;
  status: string;
  createdAt: Date;
  academicYear: { name: string; startDate: Date } | null;
  class: { name: string } | null;
  stream: { name: string } | null;
  term: { name: string } | null;
};

export function fullName(
  first: string,
  middle: string | null,
  last: string
): string {
  return middle ? `${first} ${middle} ${last}` : `${first} ${last}`;
}

/**
 * Pick the enrollment shown as the student's current placement: their most
 * recent ACTIVE enrollment, falling back to the most recently created one.
 */
export function currentEnrollment(
  enrollments: EnrollmentForDisplay[]
): EnrollmentForDisplay | null {
  if (enrollments.length === 0) return null;
  const active = enrollments
    .filter((e) => e.status === "ACTIVE")
    .sort(
      (a, b) =>
        new Date(b.academicYear?.startDate ?? b.createdAt).getTime() -
        new Date(a.academicYear?.startDate ?? a.createdAt).getTime()
    );
  if (active.length > 0) return active[0];
  return [...enrollments].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0];
}