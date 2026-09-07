"use client";

import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

import {
  markNotificationsRead,
  markAllNotificationsRead,
} from "@/server/actions/communication";
import { Button } from "@/components/ui/button";
import { success } from "@/components/ui/use-toast";

export function MarkReadButton({
  slug,
  notificationId,
}: {
  slug: string;
  notificationId: string;
}) {
  const router = useRouter();

  const onClick = async () => {
    const result = await markNotificationsRead(slug, [notificationId]);
    if (!result.ok && result.error) {
      success({ title: "Couldn’t update", description: result.error });
      return;
    }
    router.refresh();
  };

  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      Mark read
    </Button>
  );
}

export function MarkAllReadButton({ slug }: { slug: string }) {
  const router = useRouter();

  const onClick = async () => {
    const result = await markAllNotificationsRead(slug);
    if (!result.ok && result.error) {
      success({ title: "Couldn’t update", description: result.error });
      return;
    }
    router.refresh();
  };

  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <CheckCheck className="size-4" aria-hidden="true" />
      Mark all read
    </Button>
  );
}