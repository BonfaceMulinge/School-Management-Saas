"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { updateChannelConfigAction } from "@/server/actions/integrations";
import { Button } from "@/components/ui/button";
import { success, error } from "@/components/ui/use-toast";

export type ChannelConfigInput = {
  channel: "PAYMENT" | "EMAIL" | "SMS";
  provider: string | null;
  mode: "SANDBOX" | "LIVE";
  enabled: boolean;
  secretConfigured: boolean;
};

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export function ChannelConfigForm({ config }: { config: ChannelConfigInput }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateChannelConfigAction>> | null, data: FormData) => {
      const result = await updateChannelConfigAction(data);
      if (result.ok) {
        success({ title: "Configuration saved." });
        router.refresh();
      } else {
        error({ title: "Configuration not saved", description: result.error });
      }
      return result;
    },
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="channel" value={config.channel} />
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Provider
        <select name="provider" defaultValue={config.provider ?? ""} className={inputClasses}>
          <option value="">None</option>
          <option value="mock">Mock (development)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Mode
        <select name="mode" defaultValue={config.mode} className={inputClasses}>
          <option value="SANDBOX">Sandbox</option>
          <option value="LIVE">Live</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="size-4" />
        Enabled
      </label>
      {state && !state.ok ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}