import type { ReactNode } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  School,
  CreditCard,
  Package,
  Users,
  FileText,
  Settings,
  Plug,
  Banknote,
  LogOut,
} from "lucide-react";

import { requireSuperAdmin } from "@/server/platform-auth";
import { logout } from "@/server/actions/auth";
import { AdminMobileNav } from "./admin-mobile-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await requireSuperAdmin({ next: "/admin" });

  return (
    <div className="flex min-h-svh bg-background">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader user={access.user} />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

const nav = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Schools", href: "/admin/schools", icon: School },
  { title: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard },
  { title: "Payments", href: "/admin/payments", icon: Banknote },
  { title: "Integrations", href: "/admin/integrations", icon: Plug },
  { title: "Plans", href: "/admin/plans", icon: Package },
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Audit Log", href: "/admin/audit", icon: FileText },
];

function AdminSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-card lg:block">
      <div className="flex h-full flex-col gap-4 px-4 py-6">
        <Link href="/admin" className="flex items-center gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Settings className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">Platform Admin</span>
        </Link>

        <hr className="border-border" />

        <nav aria-label="Admin navigation" className="flex max-h-[calc(100vh-200px)] flex-col gap-6 overflow-y-auto">
          <div className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.title}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
}

function AdminHeader({ user }: { user: { id: string; name: string | null; email: string } }) {
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <AdminMobileNav items={nav.map((n) => ({ title: n.title, href: n.href }))} />
        <h1 className="text-lg font-semibold">Platform Administration</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden flex-col items-end text-right sm:flex">
          <span className="text-sm font-medium">{user.name ?? "Super Admin"}</span>
          <span className="text-xs text-muted-foreground">{user.email}</span>
        </div>
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