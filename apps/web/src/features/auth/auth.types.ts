export type UserRole = "ADMIN" | "LECTURER" | "STUDENT";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  data: {
    user: AuthUser;
    accessToken: string;
  };
}
