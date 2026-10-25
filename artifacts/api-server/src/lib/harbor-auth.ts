import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { auditLogTable, db, userRolesTable, type UserRole } from "@workspace/db";

export async function currentUserId(
  req: Request,
  res: Response,
): Promise<string | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return userId;
}

export async function roleForUser(userId: string): Promise<UserRole> {
  const existing = await db
    .select({ role: userRolesTable.role })
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId))
    .orderBy(asc(userRolesTable.createdAt));
  if (existing.length === 0) {
    await db
      .insert(userRolesTable)
      .values({ userId, role: "customer" })
      .onConflictDoNothing();
    return "customer";
  }
  if (existing.some((entry) => entry.role === "admin")) return "admin";
  if (existing.some((entry) => entry.role === "staff")) return "staff";
  return "customer";
}

export async function requireRole(
  req: Request,
  res: Response,
  allowed: UserRole[],
): Promise<string | null> {
  const userId = await currentUserId(req, res);
  if (!userId) return null;
  const role = await roleForUser(userId);
  if (!allowed.includes(role)) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return userId;
}

export async function audit(
  actorUserId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLogTable).values({ actorUserId, action, details });
}
