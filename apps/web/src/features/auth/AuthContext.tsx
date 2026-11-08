import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, refreshAccessToken, setAccessToken } from "../../lib/api";
import type { AuthResponse, AuthUser } from "./auth.types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const token = await refreshAccessToken();
      if (!token) return;
      const response = await apiRequest<{ data: { user: AuthUser } }>("/auth/me", {}, false);
      setUser(response.data.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession().catch(() => {
      setAccessToken(null);
      setUser(null);
    });
    const expireSession = () => setUser(null);
    window.addEventListener("campushub:session-expired", expireSession);
    return () => window.removeEventListener("campushub:session-expired", expireSession);
  }, [loadSession]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<AuthResponse>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false,
    );
    setAccessToken(response.data.accessToken);
    setUser(response.data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const response = await apiRequest<AuthResponse>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ name, email, password }) },
      false,
    );
    setAccessToken(response.data.accessToken);
    setUser(response.data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ data: { message: string } }>("/auth/logout", { method: "POST" }, false);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
