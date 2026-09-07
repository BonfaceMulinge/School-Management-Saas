"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, GraduationCap, School, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { success } from "@/components/ui/use-toast";
import { ONBOARDING_STEPS } from "@/lib/settings-types";
import {
  saveOnboardingProfile,
  saveOnboardingAcademics,
  advanceOnboardingStep,
  finishOnboarding,
} from "@/server/actions/onboarding";
import { createClass } from "@/server/actions/classes";
import { createStream } from "@/server/actions/streams";
import { createSubject } from "@/server/actions/subjects";
import {
  SettingsInput,
  SettingsSelect,
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
} from "../settings/settings-inputs";

type SchoolClient = {
  name: string;
  motto: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  currency: string;
  timezone: string;
};

type ClassRow = { id: string; name: string };
type SubjectRow = { id: string; name: string; code: string };

const STEP_META = [
  { title: "School profile", icon: School },
  { title: "Academic year", icon: GraduationCap },
  { title: "Classes & streams", icon: ListChecks },
  { title: "Subjects", icon: ListChecks },
  { title: "Finish & review", icon: Check },
];

export function OnboardingWizard({
  slug,
  step,
  school,
  classes,
  subjects,
}: {
  slug: string;
  step: number;
  school: SchoolClient;
  classes: ClassRow[];
  subjects: SubjectRow[];
}) {
  const router = useRouter();

  const current = Math.min(Math.max(1, step), ONBOARDING_STEPS);

  const [profileState, profileAction, profilePending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof saveOnboardingProfile>> | null, data: FormData) => {
      const result = await saveOnboardingProfile(slug, data);
      if (result.ok) router.refresh();
      return result;
    },
    null
  );

  const [academicsState, academicsAction, academicsPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof saveOnboardingAcademics>> | null, data: FormData) => {
      const result = await saveOnboardingAcademics(slug, data);
      if (result.ok) {
        success({ title: "Academic year saved." });
        router.refresh();
      }
      return result;
    },
    null
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Set up {school.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current === ONBOARDING_STEPS
            ? "Almost there — confirm and start using the system."
            : `Step ${current} of ${ONBOARDING_STEPS}. You can come back any time and resuming picks up where you left off.`}
        </p>
      </header>

      <ol className="grid grid-cols-5 gap-2" aria-label="Onboarding progress">
        {STEP_META.map((meta, index) => {
          const stepNumber = index + 1;
          const done = stepNumber < current;
          const active = stepNumber === current;
          const Icon = meta.icon;
          return (
            <li key={meta.title} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border text-sm font-medium",
                  done && "border-emerald-600 bg-emerald-600 text-white",
                  active && "border-primary bg-primary text-primary-foreground",
                  !done && !active && "border-border text-muted-foreground"
                )}
              >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span
                className={cn(
                  "text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {meta.title}
              </span>
            </li>
          );
        })}
      </ol>

      {current === 1 ? (
        <ProfileStep
          school={school}
          state={profileState}
          pending={profilePending}
          action={profileAction}
        />
      ) : null}

      {current === 2 ? (
        <AcademicsStep
          state={academicsState}
          pending={academicsPending}
          action={academicsAction}
        />
      ) : null}

      {current === 3 ? (
        <ClassesStep slug={slug} classes={classes} />
      ) : null}

      {current === 4 ? (
        <SubjectsStep slug={slug} subjects={subjects} />
      ) : null}

      {current === 5 ? (
        <FinishStep slug={slug} schoolName={school.name} classes={classes} subjects={subjects} />
      ) : null}
    </div>
  );
}

function profileError(state: Awaited<ReturnType<typeof saveOnboardingProfile>> | null) {
  return state && !state.ok && state.fieldErrors ? state.fieldErrors : undefined;
}

function ProfileStep({
  school,
  state,
  pending,
  action,
}: {
  school: SchoolClient;
  state: Awaited<ReturnType<typeof saveOnboardingProfile>> | null;
  pending: boolean;
  action: (formData: FormData) => void;
}) {
  const fe = profileError(state);
  return (
    <form action={action} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">School profile</CardTitle>
          <CardDescription>
            Name, contacts and how the school is presented. Only the name,
            currency and timezone are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsInput id="ob-name" name="name" label="School name" required defaultValue={school.name} error={fe?.name?.[0]} className="sm:col-span-2" />
          <SettingsInput id="ob-motto" name="motto" label="Motto" defaultValue={school.motto ?? ""} error={fe?.motto?.[0]} className="sm:col-span-2" placeholder="e.g. Knowledge is Power" />
          <SettingsInput id="ob-email" name="email" label="Email" type="email" inputMode="email" defaultValue={school.email ?? ""} error={fe?.email?.[0]} />
          <SettingsInput id="ob-phone" name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={school.phone ?? ""} error={fe?.phone?.[0]} />
          <SettingsInput id="ob-address" name="address" label="Address" defaultValue={school.address ?? ""} error={fe?.address?.[0]} className="sm:col-span-2" />
          <SettingsInput id="ob-website" name="website" label="Website" type="url" inputMode="url" defaultValue={school.website ?? ""} error={fe?.website?.[0]} />
          <SettingsInput id="ob-logoUrl" name="logoUrl" label="Logo URL" type="url" inputMode="url" defaultValue={school.logoUrl ?? ""} error={fe?.logoUrl?.[0]} />
          <SettingsInput id="ob-primaryColor" name="primaryColor" label="Primary colour" defaultValue={school.primaryColor ?? "#2563eb"} error={fe?.primaryColor?.[0]} hint="#rrggbb" pattern="^#[0-9a-fA-F]{6}$" />
          <SettingsSelect id="ob-currency" name="currency" label="Currency" value={school.currency} error={fe?.currency?.[0]} options={CURRENCY_OPTIONS} />
          <SettingsSelect id="ob-timezone" name="timezone" label="Timezone" value={school.timezone} error={fe?.timezone?.[0]} options={TIMEZONE_OPTIONS} />
        </CardContent>
      </Card>

      {state && !state.ok && !state.fieldErrors ? (
        <p role="alert" className="mt-4 text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save and continue"}
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>
    </form>
  );
}

function AcademicsStep({
  state,
  pending,
  action,
}: {
  state: Awaited<ReturnType<typeof saveOnboardingAcademics>> | null;
  pending: boolean;
  action: (formData: FormData) => void;
}) {
  const [includeTerm, setIncludeTerm] = useState(true);
  const fe =
    state && !state.ok && state.fieldErrors ? state.fieldErrors : undefined;

  return (
    <form action={action} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Initial academic year</CardTitle>
          <CardDescription>
            The first academic year, set as the active year. Adding a first term
            is optional.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsInput id="ob-yearName" name="yearName" label="Year name" required defaultValue={new Date().getFullYear() + " / " + (new Date().getFullYear() + 1)} error={fe?.yearName?.[0]} className="sm:col-span-2" placeholder="e.g. 2026 / 2027" />
          <SettingsInput id="ob-yearStart" name="yearStart" label="Year start" type="date" required error={fe?.yearStart?.[0]} />
          <SettingsInput id="ob-yearEnd" name="yearEnd" label="Year end" type="date" required error={fe?.yearEnd?.[0]} />
        </CardContent>
      </Card>

      {includeTerm ? (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">First term (optional)</CardTitle>
              <CardDescription>
                A term within the year above, set as the active term.
              </CardDescription>
            </div>
            <input type="hidden" name="includeTerm" value={includeTerm ? "on" : ""} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIncludeTerm(false)}
            >
              Skip term
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <SettingsInput id="ob-termName" name="termName" label="Term name" defaultValue="Term 1" error={fe?.termName?.[0]} className="sm:col-span-3" />
            <SettingsInput id="ob-termStart" name="termStart" label="Term start" type="date" error={fe?.termStart?.[0]} />
            <SettingsInput id="ob-termEnd" name="termEnd" label="Term end" type="date" error={fe?.termEnd?.[0]} className="sm:col-span-2" />
          </CardContent>
        </Card>
      ) : null}

      {includeTerm ? null : (
        <p className="mt-6 text-sm text-muted-foreground">
          No initial term will be created. You can skip the term and still save
          the academic year.
        </p>
      )}

      {state && !state.ok && !state.fieldErrors ? (
        <p role="alert" className="mt-4 text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setIncludeTerm(!includeTerm)} disabled={pending}>
          {includeTerm ? "Remove the term" : "Add a term"}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save and continue"}
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>
    </form>
  );
}

function ClassesStep({ slug, classes }: { slug: string; classes: ClassRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [streamName, setStreamName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const classForm = new FormData();
      classForm.set("name", name);
      const classResult = await createClass(slug, classForm);
      if (!classResult.ok) {
        setError(classResult.error ?? "Could not create the class.");
        return;
      }
      const classId = classResult.data?.id;
      if (!classId) {
        setError("Class created, but its ID could not be read.");
        return;
      }
      if (streamName.trim()) {
        const streamForm = new FormData();
        streamForm.set("classId", classId);
        streamForm.set("name", streamName.trim());
        const stream = await createStream(slug, streamForm);
        if (!stream.ok) {
          setError(stream.error ?? "Class created, but the stream could not be added.");
          return;
        }
      }
      success({ title: streamName.trim() ? "Class and stream added." : "Class added." });
      router.refresh();
      setName("");
      setStreamName("");
    } finally {
      setAdding(false);
    }
  }

  async function onContinue() {
    const form = new FormData();
    form.set("to", "4");
    const result = await advanceOnboardingStep(slug, form);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.error ?? "Could not continue.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classes &amp; streams</CardTitle>
          <CardDescription>
            Add the classes you teach, optionally splitting each into streams.
            This is not yet final — more can be added later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ob-className">Class name</Label>
              <Input id="ob-className" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 9" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ob-streamName">Stream (optional)</Label>
              <Input id="ob-streamName" value={streamName} onChange={(e) => setStreamName(e.target.value)} placeholder="e.g. West" />
            </div>
          </div>

          {classes.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Added so far</p>
              <ul className="flex flex-wrap gap-2">
                {classes.map((c) => (
                  <li key={c.id} className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm">{c.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No classes yet. Add your first class above.
            </p>
          )}

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" type="submit" disabled={adding}>
              {adding ? "Adding…" : "Add class"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onContinue}>
          Continue to subjects
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>
    </form>
  );
}

function SubjectsStep({ slug, subjects }: { slug: string; subjects: SubjectRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [department, setDepartment] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("code", code);
      form.set("department", department);
      const created = await createSubject(slug, form);
      if (!created.ok) {
        setError(created.error ?? "Could not add the subject.");
        return;
      }
      success({ title: "Subject added." });
      router.refresh();
      setName("");
      setCode("");
      setDepartment("");
    } finally {
      setAdding(false);
    }
  }

  async function onContinue() {
    const form = new FormData();
    form.set("to", "5");
    const result = await advanceOnboardingStep(slug, form);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.error ?? "Could not continue.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subjects</CardTitle>
          <CardDescription>
            Subjects offered by this school. More can be added later from the
            Subjects page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ob-subjectName">Subject name</Label>
              <Input id="ob-subjectName" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ob-subjectCode">Code</Label>
              <Input id="ob-subjectCode" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. MATH" />
            </div>
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="ob-subjectDept">Department (optional)</Label>
              <Input id="ob-subjectDept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sciences" />
            </div>
          </div>

          {subjects.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Added so far</p>
              <ul className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <li key={s.id} className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm">
                    {s.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">{s.code}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No subjects yet. Add your first subject above.
            </p>
          )}

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" type="submit" disabled={adding}>
              {adding ? "Adding…" : "Add subject"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onContinue}>
          Continue to review
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>
    </form>
  );
}

function FinishStep({
  slug,
  schoolName,
  classes,
  subjects,
}: {
  slug: string;
  schoolName: string;
  classes: ClassRow[];
  subjects: SubjectRow[];
}) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFinish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFinishing(true);
    setError(null);
    try {
      const result = await finishOnboarding(slug, new FormData());
      if (result.ok) {
        success({ title: `${schoolName} is ready.` });
        router.refresh();
      } else {
        setError(result.error ?? "Could not finish setup.");
      }
    } finally {
      setFinishing(false);
    }
  }

  return (
    <form onSubmit={onFinish}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review &amp; finish</CardTitle>
          <CardDescription>
            Here is what&apos;s in place so far. You can review or change any of
            it later from the Settings area.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border p-4">
            <p className="text-sm font-semibold">School</p>
            <p className="mt-1 text-sm text-muted-foreground">{schoolName}</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <p className="text-sm font-semibold">Classes ({classes.length})</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {classes.length > 0 ? classes.map((c) => c.name).join(", ") : "None yet"}
            </p>
          </div>
          <div className="rounded-md border border-border p-4">
            <p className="text-sm font-semibold">Subjects ({subjects.length})</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {subjects.length > 0 ? subjects.map((s) => `${s.name} (${s.code})`).join(", ") : "None yet"}
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={finishing}>
          {finishing ? "Finishing…" : "Finish setup"}
          <Check className="ml-1 size-4" />
        </Button>
      </div>
    </form>
  );
}