"use client";

import Link from "next/link";
import { Menu as MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SchoolMobileNav({
  school,
  items,
}: {
  school: string;
  items: { title: string; href: string; disabled: boolean }[];
}) {
  return (
    <div className="lg:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="School navigation">
              <MenuIcon className="size-5" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>School navigation</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((item) => (
            <DropdownMenuItem
              key={item.href}
              disabled={item.disabled}
              render={
                item.disabled ? undefined : (
                  <Link href={item.href ? `/${school}/${item.href}` : `/${school}`}>
                    {item.title}
                  </Link>
                )
              }
            >
              {item.disabled ? `${item.title} (Soon)` : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}