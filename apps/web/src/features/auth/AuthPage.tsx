import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "./AuthContext";

const loginSchema = z.object({
  email: z.string().trim().email("Masukkan email yang valid."),
  password: z.string().min(1, "Password wajib diisi."),
});
const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(100),
  email: z.string().trim().email("Masukkan email yang valid."),
  password: z.string().min(12, "Password minimal 12 karakter.").max(128),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, isLoading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [requestError, setRequestError] = useState<string | null>(null);
  const isRegister = mode === "register";
  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const isSubmitting = isRegister ? registerForm.formState.isSubmitting : loginForm.formState.isSubmitting;

  if (isLoading) {
    return <main className="grid min-h-screen place-items-center text-slate-600">Memuat sesi...</main>;
  }
  if (user) return <Navigate to="/dashboard" replace />;

  const submitLogin = loginForm.handleSubmit(async (values) => {
    setRequestError(null);
    try {
      await login(values.email, values.password);
      navigate(location.state?.from?.pathname ?? "/dashboard", { replace: true });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Login gagal.");
    }
  });

  const submitRegister = registerForm.handleSubmit(async (values) => {
    setRequestError(null);
    try {
      await register(values.name, values.email, values.password);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Registrasi gagal.");
    }
  });

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link to="/" className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">
          CampusHub
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">
          {isRegister ? "Buat akun mahasiswa" : "Selamat datang kembali"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {isRegister ? "Daftar untuk mulai menggunakan CampusHub." : "Masuk untuk melanjutkan ke kelasmu."}
        </p>

        {requestError && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {requestError}
          </p>
        )}

        {isRegister ? (
          <form className="mt-6 space-y-4" onSubmit={submitRegister} noValidate>
            <FormField label="Nama" error={registerForm.formState.errors.name?.message}>
              <input autoComplete="name" {...registerForm.register("name")} className={inputClassName} />
            </FormField>
            <FormField label="Email" error={registerForm.formState.errors.email?.message}>
              <input type="email" autoComplete="email" {...registerForm.register("email")} className={inputClassName} />
            </FormField>
            <FormField label="Password" error={registerForm.formState.errors.password?.message}>
              <input type="password" autoComplete="new-password" {...registerForm.register("password")} className={inputClassName} />
            </FormField>
            <SubmitButton busy={isSubmitting}>Daftar</SubmitButton>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submitLogin} noValidate>
            <FormField label="Email" error={loginForm.formState.errors.email?.message}>
              <input type="email" autoComplete="email" {...loginForm.register("email")} className={inputClassName} />
            </FormField>
            <FormField label="Password" error={loginForm.formState.errors.password?.message}>
              <input type="password" autoComplete="current-password" {...loginForm.register("password")} className={inputClassName} />
            </FormField>
            <SubmitButton busy={isSubmitting}>Masuk</SubmitButton>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          {isRegister ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
          <Link className="font-semibold text-indigo-600 hover:text-indigo-700" to={isRegister ? "/login" : "/register"}>
            {isRegister ? "Masuk" : "Daftar"}
          </Link>
        </p>
      </section>
    </main>
  );
}

const inputClassName =
  "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Memproses..." : children}
    </button>
  );
}
