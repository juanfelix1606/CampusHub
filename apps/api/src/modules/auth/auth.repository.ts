import { Prisma, PrismaClient, type User, type UserRole } from "@prisma/client";
import type { AuthRepository, AuthUser, StoredRefreshToken } from "./auth.types";

function toAuthUser(user: Pick<User, "id" | "name" | "email" | "role">): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string }) | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? { ...toAuthUser(user), passwordHash: user.passwordHash } : null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toAuthUser(user) : null;
  }

  async createStudent(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    const user = await this.prisma.user.create({
      data: { ...input, role: "STUDENT" satisfies UserRole },
    });
    return toAuthUser(user);
  }

  async createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.refreshToken.create({ data: input });
  }

  async findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!token) return null;

    return {
      id: token.id,
      userId: token.userId,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
      user: toAuthUser(token.user),
    };
  }

  async rotateRefreshToken(input: {
    id: string;
    oldTokenHash: string;
    newTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const { id, oldTokenHash, newTokenHash, expiresAt, now } = input;
      const result = await transaction.refreshToken.updateMany({
        where: { id, tokenHash: oldTokenHash, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (result.count !== 1) return false;

      const oldToken = await transaction.refreshToken.findUniqueOrThrow({ where: { id } });
      await transaction.refreshToken.create({
        data: { userId: oldToken.userId, tokenHash: newTokenHash, expiresAt },
      });
      return true;
    });
  }

  async revokeRefreshToken(input: { id: string; tokenHash: string; now: Date }): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id: input.id, tokenHash: input.tokenHash, revokedAt: null },
      data: { revokedAt: input.now },
    });
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
