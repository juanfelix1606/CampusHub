import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ConflictError, UnauthorizedError } from "../../shared/errors";
import { isUniqueConstraintError } from "./auth.repository";
import type { LoginInput, RegisterInput } from "./auth.schemas";
import type { AuthConfig, AuthRepository, AuthSession, AuthUser } from "./auth.types";

const BCRYPT_ROUNDS = 12;

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: AuthConfig,
  ) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    let user: AuthUser;
    try {
      user = await this.repository.createStudent({
        name: input.name,
        email: input.email,
        passwordHash,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError("An account with this email already exists.");
      }
      throw error;
    }

    return this.createSession(user);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.repository.findUserByEmail(input.email);
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? "");
    if (!user || !matches) {
      throw new UnauthorizedError("Email or password is incorrect.");
    }

    const { passwordHash: _passwordHash, ...authUser } = user;
    return this.createSession(authUser);
  }

  async refresh(rawToken: string | undefined): Promise<AuthSession> {
    if (!rawToken) throw new UnauthorizedError("Refresh token is missing or invalid.");

    const oldTokenHash = hashRefreshToken(rawToken);
    const currentToken = await this.repository.findRefreshToken(oldTokenHash);
    const now = new Date();
    if (
      !currentToken ||
      currentToken.revokedAt !== null ||
      currentToken.expiresAt.getTime() <= now.getTime()
    ) {
      throw new UnauthorizedError("Refresh token is missing or invalid.");
    }

    const refreshToken = randomBytes(32).toString("base64url");
    const rotated = await this.repository.rotateRefreshToken({
      id: currentToken.id,
      oldTokenHash,
      newTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + this.config.refreshTokenExpiresInMs),
      now,
    });

    if (!rotated) throw new UnauthorizedError("Refresh token is missing or invalid.");

    return {
      user: currentToken.user,
      accessToken: this.createAccessToken(currentToken.user),
      refreshToken,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashRefreshToken(rawToken);
    const token = await this.repository.findRefreshToken(tokenHash);
    if (!token || token.revokedAt !== null) return;
    await this.repository.revokeRefreshToken({ id: token.id, tokenHash, now: new Date() });
  }

  async getUser(id: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(id);
    if (!user) throw new UnauthorizedError("Authentication required.");
    return user;
  }

  private async createSession(user: AuthUser): Promise<AuthSession> {
    const refreshToken = randomBytes(32).toString("base64url");
    await this.repository.createRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + this.config.refreshTokenExpiresInMs),
    });

    return { user, accessToken: this.createAccessToken(user), refreshToken };
  }

  private createAccessToken(user: AuthUser): string {
    return jwt.sign({ role: user.role }, this.config.accessTokenSecret, {
      algorithm: "HS256",
      subject: user.id,
      expiresIn: this.config.accessTokenExpiresInSeconds,
    });
  }
}
