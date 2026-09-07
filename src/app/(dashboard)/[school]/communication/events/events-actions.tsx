"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, Plus } from "lucide-react";

import {
  createEvent,
  updateEvent,
  setEventStatus,
} from "@/server/actions/communication";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export type EventFormData = {
  classes: { id: string; name: string; streams: { id: string; name: string }[] }[];
  people: { userId: string; label: string }[];
};

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  audience: string;
  status: string;
  classId: string | null;
  streamId: string | null;
  createdByName: string | null;
  selectedRecipients: string[];
};

const AUDIENCE_OPTIONS = [
  { value: "ALL", label: "Whole school" },
  { value: "PARENTS", label: "All parents" },
  { value: "TEACHERS", label: "Teachers" },
  { value: "CLASS", label: "Parents of a class" },
  { value: "STREAM", label: "Parents of a stream" },
  { value: "SELECTED", label: "Selected people" },
];

function toLocalInputValue(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  const tp = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${tp(date.getMonth() + 1)}-${tp(date.getDate())}T${tp(date.getHours())}:${tp(date.getMinutes())}`;
}

function EventFields({
  formData,
  event,
}: {
  formData: EventFormData;
  event?: EventRow;
}) {
  const [audience, setAudience] = useState(event?.audience ?? "ALL");
  const [classId, setClassId] = useState(event?.classId ?? "");
  const [streamId, setStreamId] = useState(event?.streamId ?? "");

  const klass = formData.classes.find((c) => c.id === classId);
  const selectedSet = new Set(event?.selectedRecipients ?? []);
  const showClass = audience === "CLASS" || audience === "STREAM";
  const showStream = audience === "STREAM";

  return (
    <div className="grid gap-4">
      <Field id="ev-title" label="Title" required>
        <Input
          id="ev-title"
          name="title"
          defaultValue={event?.title}
          required
          maxLength={200}
          className={inputClasses}
          placeholder="e.g. End-of-term parents meeting"
        />
      </Field>

      <Field id="ev-desc" label="Description">
        <Textarea
          id="ev-desc"
          name="description"
          defaultValue={event?.description ?? undefined}
          maxLength={2000}
          rows={3}
          placeholder="Agenda, what to bring, contact…"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ev-starts" label="Starts" required>
          <Input
            id="ev-starts"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={event ? toLocalInputValue(event.startsAt) : undefined}
            className={inputClasses}
          />
        </Field>
        <Field id="ev-ends" label="Ends">
          <Input
            id="ev-ends"
            name="endsAt"
            type="datetime-local"
            defaultValue={event ? toLocalInputValue(event.endsAt) : undefined}
            className={inputClasses}
          />
        </Field>
      </div>

      <Field id="ev-location" label="Location">
        <Input
          id="ev-location"
          name="location"
          defaultValue={event?.location ?? undefined}
          maxLength={200}
          className={inputClasses}
          placeholder="Hall, field, online…"
        />
      </Field>

      <Field id="ev-audience" label="Audience" required>
        <select
          id="ev-audience"
          name="audience"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className={selectClasses}
        >
          {AUDIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {showClass ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ev-class" label="Class" required>
            <select
              id="ev-class"
              name="classId"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setStreamId("");
              }}
              className={selectClasses}
            >
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
          {showStream ? (
            <Field id="ev-stream" label="Stream" required>
              <select
                id="ev-stream"
                name="streamId"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className={selectClasses}
              >
                <option value="" disabled>
                  Select a stream
                </option>
                {klass?.streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}

      {audience === "SELECTED" ? (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Audience</p>
            <p className="text-xs text-muted-foreground">
              Pick the parents, teachers or students who should see this event.
            </p>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-border">
            {formData.people.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                No parent or teacher accounts are linked yet.
              </p>
            ) : (
              formData.people.map((p) => (
                <label
                  key={p.userId}
                  className="flex items-center gap-2 px-4 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name={`recipient[${p.userId}]`}
                    defaultValue={p.userId}
                    defaultChecked={selectedSet.has(p.userId)}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NewEventDialog({
  slug,
  formData,
}: {
  slug: string;
  formData: EventFormData;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createEvent>> | null, data: FormData) => {
      const result = await createEvent(slug, data);
      if (result.ok) {
        success({ title: "Event created." });
        router.refresh();
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
            New event
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            Scheduled events notify the chosen audience.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <EventFields formData={formData} />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditEventDialog({
  slug,
  event,
  formData,
}: {
  slug: string;
  event: EventRow;
  formData: EventFormData;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateEvent>> | null, data: FormData) => {
      const result = await updateEvent(slug, event.id, data);
      if (result.ok) {
        success({ title: "Event updated." });
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
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>{event.title}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <EventFields formData={formData} event={event} />
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

type EventStatus = "DRAFT" | "SCHEDULED" | "COMPLETED" | "CANCELLED";

export function EventActions({
  slug,
  event,
  formData,
  canManage,
}: {
  slug: string;
  event: EventRow;
  formData: EventFormData;
  canManage: boolean;
}) {
  const router = useRouter();
  const status = event.status as EventStatus;

  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  const transition = async (next: EventStatus) => {
    const result = await setEventStatus(slug, event.id, next);
    if (result.ok) {
      success({ title: "Event updated." });
      router.refresh();
    } else if (result.error) {
      success({ title: "Couldn’t update", description: result.error });
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "DRAFT" || status === "CANCELLED" ? (
        <Button
          size="sm"
          onClick={() => transition("SCHEDULED")}
        >
          <CalendarCheck2 className="size-4" aria-hidden="true" />
          Schedule
        </Button>
      ) : null}
      {status !== "COMPLETED" ? (
        <Button size="sm" variant="outline" onClick={() => transition("COMPLETED")}>
          Mark completed
        </Button>
      ) : null}
      {status === "DRAFT" || status === "SCHEDULED" ? (
        <EditEventDialog slug={slug} event={event} formData={formData} />
      ) : null}
      {status !== "CANCELLED" ? (
        <ConfirmDialog
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Cancel
            </Button>
          }
          title="Cancel this event?"
          description="The event stays recorded but stops appearing to non-admins."
          confirmLabel="Cancel event"
          destructive
          onConfirm={() => transition("CANCELLED")}
        />
      ) : null}
    </div>
  );
}