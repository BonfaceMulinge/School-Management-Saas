"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";

import {
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  unpublishAnnouncement,
  archiveAnnouncement,
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

export type AnnouncementFormData = {
  classes: { id: string; name: string; streams: { id: string; name: string }[] }[];
  people: { userId: string; label: string }[];
};

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  status: string;
  classId: string | null;
  streamId: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  className: string | null;
  streamName: string | null;
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

function AnnouncementFields({
  formData,
  announcement,
  includePublishToggle,
}: {
  formData: AnnouncementFormData;
  announcement?: AnnouncementRow;
  includePublishToggle: boolean;
}) {
  const [audience, setAudience] = useState(announcement?.audience ?? "ALL");
  const [classId, setClassId] = useState(announcement?.classId ?? "");
  const [streamId, setStreamId] = useState(announcement?.streamId ?? "");

  const klass = formData.classes.find((c) => c.id === classId);
  const selectedSet = new Set(announcement?.selectedRecipients ?? []);
  const showClass = audience === "CLASS" || audience === "STREAM";
  const showStream = audience === "STREAM";

  return (
    <div className="grid gap-4">
      <Field id="ann-title" label="Title" required>
        <Input
          id="ann-title"
          name="title"
          defaultValue={announcement?.title}
          required
          maxLength={200}
          className={inputClasses}
          placeholder="e.g. Half-term break — school closed"
        />
      </Field>

      <Field id="ann-body" label="Message" required>
        <Textarea
          id="ann-body"
          name="body"
          defaultValue={announcement?.body}
          required
          maxLength={10000}
          rows={5}
          placeholder="What do parents and teachers need to know?"
        />
      </Field>

      <Field id="ann-audience" label="Audience" required>
        <select
          id="ann-audience"
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
          <Field id="ann-class" label="Class" required>
            <select
              id="ann-class"
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
            <Field id="ann-stream" label="Stream" required>
              <select
                id="ann-stream"
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
            <p className="text-sm font-semibold">Recipients</p>
            <p className="text-xs text-muted-foreground">
              Pick the parents, teachers or students who should receive this.
            </p>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-border">
            {formData.people.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                No parent or teacher accounts are linked yet — add parents on the Parents page first.
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ann-expires" label="Visible until" hint="Optional — the post stays visible while blank.">
          <Input
            id="ann-expires"
            name="expiresAt"
            type="date"
            defaultValue={announcement?.expiresAt ? announcement.expiresAt.slice(0, 10) : undefined}
            className={inputClasses}
          />
        </Field>
        {includePublishToggle ? (
          <Field id="ann-publish" label="Publish now">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="publish" value="1" defaultChecked />
              Publish immediately
            </label>
          </Field>
        ) : null}
      </div>
    </div>
  );
}

export function NewAnnouncementDialog({
  slug,
  formData,
}: {
  slug: string;
  formData: AnnouncementFormData;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createAnnouncement>> | null, data: FormData) => {
      const result = await createAnnouncement(slug, data);
      if (result.ok) {
        success({ title: "Announcement created." });
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
            New announcement
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New announcement</DialogTitle>
          <DialogDescription>
            Who should see this? Drafts stay private until you publish.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <AnnouncementFields formData={formData} includePublishToggle />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditAnnouncementDialog({
  slug,
  announcement,
  formData,
}: {
  slug: string;
  announcement: AnnouncementRow;
  formData: AnnouncementFormData;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateAnnouncement>> | null, data: FormData) => {
      const result = await updateAnnouncement(slug, announcement.id, data);
      if (result.ok) {
        success({ title: "Announcement updated." });
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
          <DialogTitle>Edit announcement</DialogTitle>
          <DialogDescription>{announcement.title}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <AnnouncementFields formData={formData} announcement={announcement} includePublishToggle={false} />
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

export function AnnouncementActions({
  slug,
  announcement,
  formData,
  canManage,
}: {
  slug: string;
  announcement: AnnouncementRow;
  formData: AnnouncementFormData;
  canManage: boolean;
}) {
  const router = useRouter();

  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;
  if (announcement.status === "ARCHIVED") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const result = await fn();
    if (result.ok) {
      success({ title: "Announcement updated." });
      router.refresh();
    } else if (result.error) {
      success({ title: "Couldn’t update", description: result.error });
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {announcement.status === "DRAFT" ? (
        <Button
          size="sm"
          onClick={() =>
            run(async () => {
              const r = await publishAnnouncement(slug, announcement.id);
              return { ok: r.ok, error: r.ok ? undefined : r.error };
            })
          }
        >
          <Send className="size-4" aria-hidden="true" />
          Publish
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            run(async () => {
              const r = await unpublishAnnouncement(slug, announcement.id);
              return { ok: r.ok, error: r.ok ? undefined : r.error };
            })
          }
        >
          Unpublish
        </Button>
      )}
      {announcement.status === "DRAFT" ? (
        <EditAnnouncementDialog slug={slug} announcement={announcement} formData={formData} />
      ) : null}
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
        title="Archive this announcement?"
        description="The post becomes hidden everywhere and can no longer be published. This cannot be undone."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          const result = await archiveAnnouncement(slug, announcement.id);
          if (!result.ok && result.error) {
            success({ title: "Couldn’t archive", description: result.error });
          } else {
            router.refresh();
          }
        }}
      />
    </div>
  );
}