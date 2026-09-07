import "server-only";

import Link from "next/link";
import {
  BarChart3,
  GraduationCap,
  Megaphone,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentSession } from "@/server/auth";
import { db } from "@/server/db";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

const pillars = [
  {
    title: "Students & Teachers",
    description: "Centralized profiles, classes and assignments for the entire school community.",
    icon: Users,
  },
  {
    title: "Academics & Results",
    description: "Exams, marks entry, grading and a complete academic record.",
    icon: GraduationCap,
  },
  {
    title: "Finance",
    description: "School fees, invoicing and the money your school depends on, in one place.",
    icon: Wallet,
  },
  {
    title: "Communication & Reports",
    description: "Keep parents informed and turn school data into meaningful reports.",
    icon: Megaphone,
  },
];

export default async function MarketingPage() {
  const session = await getCurrentSession();
  let ctaHref = "/login";
  let ctaText = "Sign in";
  let secondaryText = "Sign in";
  let secondaryHref = "/login";

  if (session) {
    if (session.user.platformRole) {
      ctaHref = "/admin";
      ctaText = "Platform Admin";
    } else {
      const membership = await db.membership.findFirst({
        where: { userId: session.userId },
        select: { school: { select: { slug: true } } },
      });
      if (membership?.school?.slug) {
        ctaHref = `/${membership.school.slug}`;
        ctaText = "Open Dashboard";
      }
    }
    secondaryText = ctaText;
    secondaryHref = ctaHref;
  }

  return (
    <div className="flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button render={<Link href={secondaryHref} />} variant="outline" size="sm">
            {secondaryText}
          </Button>
          <Button render={<Link href={ctaHref} />} variant="outline" size="sm">
            {ctaText}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16">
        <section className="flex flex-col items-center gap-6 text-center">
          <Badge variant="outline">Multi-school platform</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Run your school on one platform.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">{APP_DESCRIPTION}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href={ctaHref} />} size="lg">
              {ctaText}
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar) => (
            <Card key={pillar.title}>
              <CardHeader>
                <pillar.icon className="size-5 text-primary" aria-hidden="true" />
                <CardTitle className="text-base">{pillar.title}</CardTitle>
                <CardDescription>{pillar.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Complete School Management
            </h2>
            <p className="mt-1 max-w-lg text-muted-foreground">
              Next.js, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL and Prisma are
              configured with a scalable multi-tenancy foundation. Modules for students,
              teachers, exams, results, finance, communication and reports are live.
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-4" aria-hidden="true" />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}