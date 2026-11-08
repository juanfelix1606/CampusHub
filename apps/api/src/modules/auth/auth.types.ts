import type { UserRole } from "@prisma/client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: AuthUser;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string }) | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createStudent(input: { name: string; email: string; passwordHash: string }): Promise<AuthUser>;
  createRefreshToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null>;
  rotateRefreshToken(input: {
    id: string;
    oldTokenHash: string;
    newTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<boolean>;
  revokeRefreshToken(input: { id: string; tokenHash: string; now: Date }): Promise<void>;
}

export interface AuthConfig {
  accessTokenSecret: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInMs: number;
  webOrigin: string;
  cookieSecure: boolean;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}
