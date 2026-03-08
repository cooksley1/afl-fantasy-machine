import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser, meta?: { userAgent?: string; ipAddress?: string }): Promise<User>;
  getAllUsers(): Promise<User[]>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser, meta?: { userAgent?: string; ipAddress?: string }): Promise<User> {
    const existing = await this.getUser(userData.id!);
    const now = new Date();

    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        lastLoginAt: now,
        loginCount: 1,
        lastUserAgent: meta?.userAgent || null,
        lastIpAddress: meta?.ipAddress || null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          replitUsername: userData.replitUsername,
          lastLoginAt: now,
          loginCount: existing ? (existing.loginCount || 0) + 1 : 1,
          lastUserAgent: meta?.userAgent || undefined,
          lastIpAddress: meta?.ipAddress || undefined,
          updatedAt: now,
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.createdAt);
  }
}

export const authStorage = new AuthStorage();
