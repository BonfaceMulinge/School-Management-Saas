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

export type AdminNavItem = { title: string; href: string };

export function AdminMobileNav({ items }: { items: AdminNavItem[] }) {
  return (
    <div className="lg:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Admin navigation">
              <MenuIcon className="size-5" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Platform Admin</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((item) => (
            <DropdownMenuItem
              key={item.href}
              render={
                <Link href={item.href} className="flex items-center gap-1.5">
                  {item.title}
                </Link>
              }
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}