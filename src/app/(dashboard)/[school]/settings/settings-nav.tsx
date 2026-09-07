"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { title: "General", href: "" },
  { title: "Branding", href: "branding" },
  { title: "Academic", href: "academic" },
  { title: "Contact", href: "contact" },
  { title: "Communication", href: "communication" },
  { title: "Finance", href: "finance" },
  { title: "Plan & subscription", href: "subscription" },
] as const;

export function SettingsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}/settings`;

  function isActive(href: string) {
    if (href === "") return pathname === base || pathname === `${base}/`;
    return pathname.startsWith(`${base}/${href}`);
  }

  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
    >
      {SECTIONS.map((section) => (
        <Link
          key={section.title}
          href={section.href === "" ? base : `${base}/${section.href}`}
          className={[
            "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
            isActive(section.href)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          ].join(" ")}
        >
          {section.title}
        </Link>
      ))}
    </nav>
  );
}