import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./features/auth/AuthPage";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import type { UserRole } from "./features/auth/auth.types";

const AnalyticsPage = lazy(() => import("./features/analytics/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })));
const AdminCoursesPage = lazy(() => import("./features/courses/CampusPages").then((module) => ({ default: module.AdminCoursesPage })));
const LecturerClassesPage = lazy(() => import("./features/courses/CampusPages").then((module) => ({ default: module.LecturerClassesPage })));
const StudentClassesPage = lazy(() => import("./features/courses/CampusPages").then((module) => ({ default: module.StudentClassesPage })));
const LecturerAssignmentsPage = lazy(() => import("./features/assignments/AssignmentPages").then((module) => ({ default: module.LecturerAssignmentsPage })));
const StudentAssignmentsPage = lazy(() => import("./features/assignments/AssignmentPages").then((module) => ({ default: module.StudentAssignmentsPage })));
const LecturerAttendancePage = lazy(() => import("./features/attendance/AttendancePages").then((module) => ({ default: module.LecturerAttendancePage })));
const StudentAttendancePage = lazy(() => import("./features/attendance/AttendancePages").then((module) => ({ default: module.StudentAttendancePage })));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<AnalyticsPage />} />
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
        </Suspense>
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

function RolePage({ role }: { role: UserRole }) {
  if (role === "ADMIN") return <AdminCoursesPage />;
  if (role === "LECTURER") return <LecturerClassesPage />;
  if (role === "STUDENT") return <StudentClassesPage />;
  return null;
}

function LoadingPage() {
  return <main className="grid min-h-screen place-items-center text-slate-600">Memuat sesi...</main>;
}

const primaryLinkClass =
  "rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700";
const secondaryLinkClass =
  "rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50";
