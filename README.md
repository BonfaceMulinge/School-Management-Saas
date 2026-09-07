# School Management System

A production-ready, multi-school SaaS platform for managing students, parents,
teachers, attendance, academic results, school fees/finance, communication,
reports, and school administration.

> **Status: Phase 1 — Foundation.** The application shell, tooling, and
> multi-tenancy data model are in place. Business modules arrive in later phases.

## Tech stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com)
- **Database:** PostgreSQL
- **ORM:** Prisma ORM 7 (driver adapters via `@prisma/adapter-pg`)
- **Package manager:** npm

## Project structure

```
├── prisma/
│   ├── schema.prisma          # Data model (multi-tenancy foundation)
│   └── migrations/            # Generated migrations (prisma migrate dev)
├── prisma.config.ts           # Prisma CLI configuration (connection URL, etc.)
├── src/
│   ├── app/
│   │   ├── (marketing)/       # Public landing pages (route group)
│   │   ├── (dashboard)/       # Authenticated app
│   │   │   └── [school]/      # School-scoped routes (multi-tenancy)
│   │   ├── api/               # Route handlers
│   │   ├── layout.tsx         # Root layout (fonts, metadata)
│   │   └── globals.css        # Tailwind + design tokens
│   ├── components/
│   │   ├── layout/            # App shell (sidebar, header, shell)
│   │   ├── ui/                # shadcn/ui components
│   │   ├── forms/             # Future form components
│   │   └── data-tables/       # Future data grid components
│   ├── lib/
│   │   ├── constants.ts       # App-wide constants
│   │   └── utils.ts           # `cn` helper
│   ├── modules/               # Future business modules
│   │   ├── students/
│   │   ├── teachers/
│   │   ├── attendance/
│   │   ├── academics/
│   │   ├── finance/
│   │   ├── communication/
│   │   ├── reports/
│   │   └── schools/
│   └── server/
│       ├── db.ts              # Prisma client singleton (driver adapter)
│       └── services/          # Future business logic/services
└── src/generated/prisma/      # Generated Prisma Client (gitignored)
```

## Getting started

### Prerequisites

- Node.js 20+ (tested with 24)
- PostgreSQL 14+ running locally (or a remote connection string)

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate`, which generates the Prisma Client into
`src/generated/prisma`.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> `.env` files are gitignored. Never commit secrets.

### 3. Create the database and apply the schema

```bash
# Apply the Prisma schema to your database
npm run db:push
```

or, to create and track migrations from the start:

```bash
npm run db:migrate
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The landing page links into
the school dashboard shell at `/sunrise-academy` (a placeholder school slug).

## Useful scripts

| Script              | Description                                   |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the Next.js dev server                  |
| `npm run build`     | Production build                              |
| `npm run start`     | Serve the production build                    |
| `npm run lint`      | Run ESLint                                    |
| `npm run db:push`   | Push the Prisma schema to the database        |
| `npm run db:migrate`| Create and apply a migration                  |
| `npm run db:deploy` | Apply pending migrations (production)         |
| `npm run db:generate`| Regenerate the Prisma Client                 |
| `npm run db:studio` | Open Prisma Studio                            |
| `npm run db:validate`| Validate the Prisma schema                   |

## Database model (Phase 1)

The Phase 1 schema establishes the multi-tenancy foundation:

- **`School`** — the tenant. Every future record belongs to a school.
- **`User`** — a platform user, linked to one or more schools.
- **`Membership`** — join table binding a user to a school with a `Role`
  (`SUPER_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, `STUDENT`, `PARENT`, `SUPPORT`).

Business entities (students, teachers, attendance, results, fees, messaging,
reports) will be added as school-scoped models in later phases.

## HTML Meta viewport / notes

- Route groups keep `(marketing)` and `(dashboard)` shells isolated so the
  authenticated shell can grow without touching public pages.
- The dynamic `[school]` segment leaves room for domain- or slug-based
  multi-tenant routing.

## License

Proprietary. © 2026. All rights reserved.