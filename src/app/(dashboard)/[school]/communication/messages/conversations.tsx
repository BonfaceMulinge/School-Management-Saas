"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, Send } from "lucide-react";

import {
  startConversation,
  sendMessage,
  markConversationRead,
} from "@/server/actions/communication";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
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

export type ConversationFormData = {
  people: { id: string; label: string }[];
  students: { id: string; label: string }[];
  classes: { id: string; name: string; streams: { id: string; name: string }[] }[];
};

const KIND_OPTIONS = [
  { value: "direct", label: "A person" },
  { value: "student", label: "Parents of a student" },
  { value: "class", label: "Parents of a class or stream" },
];

function ConversationFields({
  formData,
  canSchoolWide,
}: {
  formData: ConversationFormData;
  canSchoolWide: boolean;
}) {
  const [kind, setKind] = useState("direct");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");

  const klass = formData.classes.find((c) => c.id === classId);

  const options = [
    ...KIND_OPTIONS,
    ...(canSchoolWide ? [{ value: "school", label: "Whole school" }] : []),
  ];

  return (
    <div className="grid gap-4">
      <Field id="conv-kind" label="Talk to" required>
        <select
          id="conv-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={selectClasses}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {kind === "direct" ? (
        <Field id="conv-people" label="Person" required>
          <select
            id="conv-people"
            name="userId"
            required
            className={selectClasses}
          >
            <option value="" disabled>
              Select a parent or teacher
            </option>
            {formData.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {kind === "student" ? (
        <Field id="conv-student" label="Student" required>
          <select id="conv-student" name="studentId" required className={selectClasses}>
            <option value="" disabled>
              Select a student
            </option>
            {formData.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {kind === "class" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="conv-class" label="Class" required>
            <select
              id="conv-class"
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
          <Field id="conv-stream" label="Stream" hint="Optional — whole class when empty.">
            <select
              id="conv-stream"
              name="streamId"
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              className={selectClasses}
            >
              <option value="">Whole class</option>
              {klass?.streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {kind === "school" ? (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This conversation reaches every member of the school. Only admins can
          start school-wide conversations.
        </p>
      ) : null}

      <Field id="conv-subject" label="Subject" required>
        <Input
          id="conv-subject"
          name="subject"
          required
          maxLength={160}
          className={inputClasses}
          placeholder="e.g. Requesting a parent-teacher meeting"
        />
      </Field>

      <Field id="conv-message" label="Message" required>
        <Textarea
          id="conv-message"
          name="message"
          required
          maxLength={4000}
          rows={4}
          placeholder="Your first message…"
        />
      </Field>
    </div>
  );
}

export function NewConversationDialog({
  slug,
  formData,
  canSchoolWide,
}: {
  slug: string;
  formData: ConversationFormData;
  canSchoolWide: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (
      _prev: Awaited<ReturnType<typeof startConversation>> | null,
      data: FormData
    ) => {
      const result = await startConversation(slug, data);
      if (result.ok && result.data?.id) {
        success({ title: "Conversation started." });
        router.push(`/${slug}/communication/messages/${result.data.id}`);
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
            <MessageSquarePlus className="size-4" aria-hidden="true" />
            New message
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Message a parent directly, a parent-of-student, a class group, or the
            whole school.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <ConversationFields formData={formData} canSchoolWide={canSchoolWide} />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReplyBox({
  slug,
  conversationId,
}: {
  slug: string;
  conversationId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof sendMessage>> | null, data: FormData) => {
      const result = await sendMessage(slug, conversationId, data);
      if (result.ok) {
        success({ title: "Message sent." });
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <Field id="reply-body" label="Reply">
        <Textarea
          id="reply-body"
          name="message"
          required
          maxLength={4000}
          rows={2}
          placeholder="Write a reply…"
        />
      </Field>
      {failure?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {failure.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Send className="size-4" aria-hidden="true" />
          {isPending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}

/** Marks the conversation read once when the thread page is opened. */
export function ConversationMarkRead({
  slug,
  conversationId,
}: {
  slug: string;
  conversationId: string;
}) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    markConversationRead(slug, conversationId).then(() => {
      router.refresh();
    });
  }, [slug, conversationId, router]);

  return null;
}