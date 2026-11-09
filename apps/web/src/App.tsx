import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./features/auth/AuthPage";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import type { UserRole } from "./features/auth/auth.types";
import { AdminCoursesPage, LecturerClassesPage, StudentClassesPage } from "./features/courses/CampusPages";
import { LecturerAssignmentsPage, StudentAssignmentsPage } from "./features/assignments/AssignmentPages";
import { LecturerAttendancePage, StudentAttendancePage } from "./features/attendance/AttendancePages";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
            <Route path="/admin" element={<RolePage role="ADMIN" />} />
          </Route>
          <Route element={<ProtectedRoute roles={["LECTURER"]} />}>
            <Route path="/lecturer" element={<RolePage role="LECTURER" />} />
            <Route path="/lecturer/assignments" element={<LecturerAssignmentsPage />} />
            <Route path="/lecturer/attendance" element={<LecturerAttendancePage />} />
          </Route>
          <Route element={<ProtectedRoute roles={["STUDENT"]} />}>
            <Route path="/student" element={<RolePage role="STUDENT" />} />
            <Route path="/student/assignments" element={<StudentAssignmentsPage />} />
            <Route path="/student/attendance" element={<StudentAttendancePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function HomePage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingPage />;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">CampusHub</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        Satu ruang untuk belajar dan bertumbuh.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
        Platform pembelajaran kampus dengan kelas, tugas, dan absensi yang terhubung.
      </p>
      <div className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-slate-700">
        <span className="rounded-full bg-indigo-50 px-4 py-2">Manajemen kelas</span>
        <span className="rounded-full bg-indigo-50 px-4 py-2">Tugas & penilaian</span>
        <span className="rounded-full bg-indigo-50 px-4 py-2">Absensi QR</span>
      </div>
      <div className="mt-10 flex gap-3">
        {user ? (
          <Link className={primaryLinkClass} to="/dashboard">Buka dashboard</Link>
        ) : (
          <>
            <Link className={primaryLinkClass} to="/login">Masuk</Link>
            <Link className={secondaryLinkClass} to="/register">Daftar mahasiswa</Link>
          </>
        )}
      </div>
    </main>
  );
}

function DashboardPage() {
  const { user, logout } = useAuth();
  if (!user) return <LoadingPage />;
  const rolePath: Record<UserRole, string> = {
    ADMIN: "/admin",
    LECTURER: "/lecturer",
    STUDENT: "/student",
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">CampusHub</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Dashboard</h1>
        </div>
        <button
          onClick={() => void logout()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          Keluar
        </button>
      </header>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Masuk sebagai</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{user.name}</h2>
        <p className="text-slate-600">{user.email}</p>
        <p className="mt-4 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
          {user.role}
        </p>
        <div className="mt-6">
          <div className="flex flex-wrap gap-3">
            <Link className={secondaryLinkClass} to={rolePath[user.role]}>
              Buka area {roleLabel[user.role]}
            </Link>
            {user.role === "LECTURER" && (
              <>
                <Link className={secondaryLinkClass} to="/lecturer/assignments">Tugas & penilaian</Link>
                <Link className={secondaryLinkClass} to="/lecturer/attendance">Absensi QR</Link>
              </>
            )}
            {user.role === "STUDENT" && (
              <>
                <Link className={secondaryLinkClass} to="/student/assignments">Tugas saya</Link>
                <Link className={secondaryLinkClass} to="/student/attendance">Absensi saya</Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function RolePage({ role }: { role: UserRole }) {
  if (role === "ADMIN") return <AdminCoursesPage />;
  if (role === "LECTURER") return <LecturerClassesPage />;
  if (role === "STUDENT") return <StudentClassesPage />;
  return null;
}

function LoadingPage() {
  return <main className="grid min-h-screen place-items-center text-slate-600">Memuat sesi...</main>;
}

const roleLabel: Record<UserRole, string> = {
  ADMIN: "Admin",
  LECTURER: "Dosen",
  STUDENT: "Mahasiswa",
};

const primaryLinkClass =
  "rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700";
const secondaryLinkClass =
  "rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50";
