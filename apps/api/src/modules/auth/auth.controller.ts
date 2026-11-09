import type { Request, Response } from "express";
import { UnauthorizedError } from "../../shared/errors";
import { AuthService } from "./auth.service";
import { loginSchema, registerSchema } from "./auth.schemas";
import type { AuthConfig, AuthSession } from "./auth.types";

export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly config: AuthConfig,
  ) {}

  register = async (request: Request, response: Response): Promise<void> => {
    const input = registerSchema.parse(request.body);
    const session = await this.service.register(input);
    this.sendSession(response, session);
    response.status(201).json({ data: { user: session.user, accessToken: session.accessToken } });
  };

  login = async (request: Request, response: Response): Promise<void> => {
    const input = loginSchema.parse(request.body);
    const session = await this.service.login(input);
    this.sendSession(response, session);
    response.status(200).json({ data: { user: session.user, accessToken: session.accessToken } });
  };

  refresh = async (request: Request, response: Response): Promise<void> => {
    const session = await this.service.refresh(request.cookies?.refreshToken);
    this.sendSession(response, session);
    response.status(200).json({ data: { user: session.user, accessToken: session.accessToken } });
  };

  logout = async (request: Request, response: Response): Promise<void> => {
    await this.service.logout(request.cookies?.refreshToken);
    response.clearCookie("refreshToken", this.cookieOptions());
    response.status(200).json({ data: { message: "Logged out." } });
  };

  me = async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) throw new UnauthorizedError();
    const user = await this.service.getUser(request.authUser.id);
    response.status(200).json({ data: { user } });
  };

  private sendSession(response: Response, session: AuthSession): void {
    response.cookie("refreshToken", session.refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.config.refreshTokenExpiresInMs,
    });
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "lax",
      path: "/api/v1/auth",
    };
  }
}
