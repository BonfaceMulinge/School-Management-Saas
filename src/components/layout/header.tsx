import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";

import type { SessionUser } from "@/server/auth";
import { logout } from "@/server/actions/auth";
import { SchoolMobileNav } from "@/components/layout/school-mobile-nav";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header({
  school,
  user,
  roleLabel,
  showSettings,
  mobileNavItems,
}: {
  school: string;
  user: SessionUser;
  roleLabel?: string;
  showSettings: boolean;
  mobileNavItems: { title: string; href: string; disabled: boolean }[];
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-2">
        <SchoolMobileNav school={school} items={mobileNavItems} />
        <div>
          <p className="text-sm text-muted-foreground">
            {school.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <h1 className="text-base font-semibold tracking-tight">Overview</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Account menu">
                <Avatar className="size-8">
                  <AvatarFallback>
                    <UserRound className="size-4" aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {user.name ?? user.email}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
            {roleLabel ? (
              <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {roleLabel}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {showSettings ? (
            <DropdownMenuItem
              render={
                <Link href={`/${school}/settings`}>
                  <Settings className="size-4" aria-hidden="true" />
                  Settings
                </Link>
              }
            />
          ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}