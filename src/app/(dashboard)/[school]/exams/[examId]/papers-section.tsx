"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, Trash2, UploadCloud } from "lucide-react";

import { uploadExamPaper, deleteExamPaper } from "@/server/actions/exams";
import { failureOf } from "@/lib/action-result";
import { Button, buttonVariants } from "@/components/ui/button";
import { error, success } from "@/components/ui/use-toast";

export type PaperRowData = {
  subjectId: string;
  subjectName: string;
  fileName: string | null;
  sizeBytes: number | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PaperUpload({
  slug,
  examId,
  subjectId,
  onUploaded,
}: {
  slug: string;
  examId: string;
  subjectId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof uploadExamPaper>> | null, data: FormData) => {
      const result = await uploadExamPaper(slug, examId, subjectId, data);
      if (result.ok) {
        success({ title: "Exam paper uploaded." });
        onUploaded();
        if (inputRef.current) inputRef.current.value = "";
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept="application/pdf,image/png,image/jpeg"
        className="text-xs text-muted-foreground file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/70"
        aria-label={`Upload paper for ${subjectId}`}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
        <UploadCloud className="size-3.5" aria-hidden="true" />
        {isPending ? "Uploading…" : "Upload"}
      </Button>
      {failure?.error ? (
        <span role="alert" className="text-xs text-destructive">
          {failure.error}
        </span>
      ) : null}
    </form>
  );
}

function PaperDelete({
  slug,
  examId,
  subjectId,
  onDeleted,
}: {
  slug: string;
  examId: string;
  subjectId: string;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);

  const run = async () => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 2500);
      return;
    }
    const result = await deleteExamPaper(slug, examId, subjectId);
    if (result.ok) {
      success({ title: "Exam paper removed." });
      onDeleted();
      router.refresh();
    } else if (result.error) {
      error({ title: "Couldn’t remove paper", description: result.error });
    }
    setArmed(false);
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={run}
      className={
        armed ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:text-foreground"
      }
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
      {armed ? "Sure?" : "Remove"}
    </Button>
  );
}

export function PapersSection({
  slug,
  examId,
  canManageBySubject,
  papers,
}: {
  slug: string;
  examId: string;
  canManageBySubject: Record<string, boolean>;
  papers: PaperRowData[];
}) {
  const router = useRouter();

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-card px-5 py-4">
        <h2 className="text-sm font-semibold">Exam papers</h2>
        <p className="text-xs text-muted-foreground">
          {papers.filter((p) => p.fileName).length} of {papers.length} papers uploaded. Uploads are
          only visible to staff — parents and students never see exam papers.
        </p>
      </div>

      {papers.length === 0 ? (
        <div className="bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No subject papers on this exam yet.
        </div>
      ) : (
        <ul className="divide-y divide-border bg-card">
          {papers.map((paper) => {
            const canManage = !!canManageBySubject[paper.subjectId];
            const viewHref = `/${slug}/exams/${examId}/paper?subjectId=${encodeURIComponent(paper.subjectId)}`;
            const downloadHref = `${viewHref}&download=1`;
            return (
              <li key={paper.subjectId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{paper.subjectName}</p>
                  {paper.fileName ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {paper.fileName} · {formatBytes(paper.sizeBytes ?? 0)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No paper uploaded yet.</p>
                  )}
                </div>

                {paper.fileName ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      href={viewHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      View / Print
                    </a>
                    <a className={buttonVariants({ variant: "outline", size: "sm" })} href={downloadHref}>
                      <Download className="size-3.5" aria-hidden="true" />
                      Download
                    </a>
                    {canManage ? (
                      <PaperDelete
                        slug={slug}
                        examId={examId}
                        subjectId={paper.subjectId}
                        onDeleted={() => router.refresh()}
                      />
                    ) : null}
                  </div>
                ) : null}

                {canManage ? (
                  <PaperUpload
                    slug={slug}
                    examId={examId}
                    subjectId={paper.subjectId}
                    onUploaded={() => router.refresh()}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}