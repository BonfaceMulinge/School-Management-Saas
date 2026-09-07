import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import type { AuditLog, AuditAction } from "@/generated/prisma/client";

/** Create an audit log entry. */
export async function createAuditLog(data: {
  schoolId?: string | null;
  actorId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue | null;
}): Promise<AuditLog> {
  return db.auditLog.create({
    data: {
      schoolId: data.schoolId,
      actorId: data.actorId,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      metadata: data.metadata ?? Prisma.DbNull,
    },
  });
}

/** List audit logs with optional filters. */
export async function listAuditLogs(opts?: {
  schoolId?: string;
  actorId?: string;
  action?: AuditAction;
  entity?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  take?: number;
}): Promise<{
  logs: Array<{
    id: string;
    schoolId: string | null;
    actorId: string;
    action: AuditAction;
    entity: string;
    entityId: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    actor: { id: string; name: string | null; email: string };
    school: { id: string; name: string; slug: string } | null;
  }>;
  total: number;
}> {
  const page = Math.max(1, opts?.page ?? 1);
  const take = Math.min(100, Math.max(1, opts?.take ?? 50));
  const skip = (page - 1) * take;

  const where: Prisma.AuditLogWhereInput = {};
  if (opts?.schoolId) where.schoolId = opts.schoolId;
  if (opts?.actorId) where.actorId = opts.actorId;
  if (opts?.action) where.action = opts.action;
  if (opts?.entity) where.entity = opts.entity;
  if (opts?.entityId) where.entityId = opts.entityId;
  if (opts?.from || opts?.to) {
    where.createdAt = {};
    if (opts?.from) where.createdAt.gte = opts.from;
    if (opts?.to) where.createdAt.lte = opts.to;
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        school: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/** Get audit log count by action (for dashboard stats). */
export async function getAuditLogCounts(schoolId?: string): Promise<Record<AuditAction, number>> {
  const where: Prisma.AuditLogWhereInput = schoolId ? { schoolId } : {};
  const groups = await db.auditLog.groupBy({
    by: ["action"],
    where,
    _count: { action: true },
  });
  const counts: Record<AuditAction, number> = {} as Record<AuditAction, number>;
  for (const g of groups) {
    counts[g.action] = g._count.action;
  }
  return counts;
}