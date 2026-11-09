import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, downloadFile } from "../../lib/api";

type Role = "ADMIN" | "LECTURER" | "STUDENT";
interface ApiEnvelope<T> { data: T }
interface Page<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
interface ClassSummary { sectionId: string; className: string; enrolled: number; semester?: string }
interface AnnouncementClass { id: string; name: string; course: { code: string; name: string } }
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  section: { name: string; course: { code: string; name: string } } | null;
  author: { name: string };
}
interface DashboardData {
  attendanceByClass?: { sectionId: string; className: string; percentage: number; attended: number; total: number }[];
  upcomingAssignments?: { id: string; title: string; deadline: string; section: { code: string; name: string } }[];
  missingAssignments?: { id: string; title: string; deadline: string; section: { code: string; name: string } }[];
  gradesByClass?: { sectionId: string; className: string; average: number | null; gradedAssignments: number }[];
  gradeTrend?: { assignment: string; courseCode: string; score: number; gradedAt: string }[];
  attendanceBySession?: { sessionId: string; title: string; createdAt: string; className: string; total: number; PRESENT: number; LATE: number; EXCUSED: number; SICK: number; ABSENT: number; percentage: number }[];
  assignmentAnalytics?: { assignmentId: string; title: string; className: string; deadline: string; enrolled: number; submitted: number; submissionRate: number; gradeDistribution: { range: string; count: number }[] }[];
  risks?: { studentId: string; name: string; email: string; className: string; attendancePercent: number; missedAssignments: number }[];
  thresholds?: { attendancePercent: number; missedAssignments: number };
  classes?: ClassSummary[];
  usersByRole?: { role: Role; count: number }[];
  activeClasses?: number;
  recentActivity?: { since: string; announcements: { id: string; title: string; createdAt: string }[]; assignmentsCreated: number; attendanceSessionsOpened: number };
}

const announcementSchema = z.object({
  sectionId: z.string().optional(),
  title: z.string().trim().min(2, "Judul minimal 2 karakter.").max(160),
  body: z.string().trim().min(2, "Isi minimal 2 karakter.").max(5000),
});
type AnnouncementForm = z.infer<typeof announcementSchema>;
const colors = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

export function AnalyticsPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [notificationPage, setNotificationPage] = useState(1);
  const dashboard = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: () => apiRequest<ApiEnvelope<DashboardData>>("/dashboard"),
  });
  const adminClasses = useQuery({
    queryKey: ["announcement-classes"],
    queryFn: () => apiRequest<ApiEnvelope<Page<AnnouncementClass>>>("/classes?pageSize=100"),
    enabled: user?.role === "ADMIN",
  });
  const notifications = useQuery({
    queryKey: ["notifications", notificationPage],
    queryFn: () => apiRequest<ApiEnvelope<Page<Notification> & { unreadCount: number }>>(
      `/notifications?page=${notificationPage}&pageSize=8`,
    ),
    refetchInterval: 30_000,
  });
  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: () => apiRequest<ApiEnvelope<Page<Announcement>>>("/announcements?page=1&pageSize=8"),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => apiRequest("/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const noticeForm = useForm<AnnouncementForm>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { sectionId: "", title: "", body: "" },
  });
  const publishAnnouncement = useMutation({
    mutationFn: (values: AnnouncementForm) => apiRequest("/announcements", {
      method: "POST",
      body: JSON.stringify({
        ...values,
        ...(values.sectionId ? {} : { sectionId: undefined }),
      }),
    }),
    onSuccess: async () => {
      noticeForm.reset({ sectionId: "", title: "", body: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["announcements"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  if (!user) return <StateCard title="Sesi tidak tersedia" detail="Silakan masuk kembali." />;
  const data = dashboard.data?.data;
  const noticeData = notifications.data?.data;
  const announcementData = announcements.data?.data;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">CampusHub</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Dashboard {roleName[user.role]}</h1>
          <p className="mt-1 text-slate-600">Halo, {user.name}. Berikut ringkasan aktivitas kampusmu.</p>
        </div>
        <button onClick={() => void logout()} className={secondaryButton}>Keluar</button>
      </header>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Navigasi utama">
        {user.role === "ADMIN" && <Link className={secondaryButton} to="/admin">Kelola mata kuliah</Link>}
        {user.role === "LECTURER" && <>
          <Link className={secondaryButton} to="/lecturer">Kelas saya</Link>
          <Link className={secondaryButton} to="/lecturer/assignments">Tugas & penilaian</Link>
          <Link className={secondaryButton} to="/lecturer/attendance">Absensi QR</Link>
        </>}
        {user.role === "STUDENT" && <>
          <Link className={secondaryButton} to="/student">Katalog kelas</Link>
          <Link className={secondaryButton} to="/student/assignments">Tugas saya</Link>
          <Link className={secondaryButton} to="/student/attendance">Absensi saya</Link>
        </>}
      </nav>

      {dashboard.isLoading ? <DashboardSkeleton /> : dashboard.isError ? (
        <StateCard title="Dashboard tidak dapat dimuat" detail={dashboard.error.message}
          action={<button className={secondaryButton} onClick={() => void dashboard.refetch()}>Coba lagi</button>} />
      ) : (
        <DashboardCharts role={user.role} data={data ?? {}} />
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <article className={panelClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
                  </svg>
                  {!!noticeData?.unreadCount && <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] leading-none text-white">{noticeData.unreadCount > 99 ? "99+" : noticeData.unreadCount}</span>}
                </span>
                Notifikasi
              </h2>
              <p className="text-sm text-slate-500">{noticeData?.unreadCount ?? 0} belum dibaca</p>
            </div>
            <button disabled={!noticeData?.unreadCount || markAllRead.isPending}
              onClick={() => markAllRead.mutate()} className={secondaryButton}>
              Tandai semua dibaca
            </button>
          </div>
          {notifications.isLoading ? <p className={muted}>Memuat notifikasi...</p> :
            notifications.isError ? <p className="mt-4 text-sm text-rose-700">Notifikasi gagal dimuat: {notifications.error.message}</p> :
              noticeData?.items.length ? (
                <ul className="mt-4 divide-y divide-slate-100">
                  {noticeData.items.map((notice) => (
                    <li key={notice.id} className={`py-3 ${notice.readAt ? "" : "border-l-2 border-indigo-500 pl-3"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {notice.href ? <Link to={notice.href} className="font-semibold text-slate-900 hover:text-indigo-700">{notice.title}</Link> :
                            <p className="font-semibold text-slate-900">{notice.title}</p>}
                          <p className="mt-1 text-sm text-slate-600">{notice.body}</p>
                          <time className="mt-1 block text-xs text-slate-400" dateTime={notice.createdAt}>{formatDate(notice.createdAt)}</time>
                        </div>
                        {!notice.readAt && <button className="text-xs font-semibold text-indigo-700 hover:underline"
                          disabled={markRead.isPending} onClick={() => markRead.mutate(notice.id)}>Tandai dibaca</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className={muted}>Belum ada notifikasi.</p>}
          {(markRead.isError || markAllRead.isError) && (
            <p role="alert" className={errorText}>Status notifikasi gagal diperbarui: {(markRead.error ?? markAllRead.error)?.message}</p>
          )}
          {noticeData && noticeData.pagination.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <button className={textButton} disabled={notificationPage <= 1}
                onClick={() => setNotificationPage((page) => page - 1)}>Lebih baru</button>
              <span className="text-xs text-slate-500">{notificationPage} / {noticeData.pagination.totalPages}</span>
              <button className={textButton} disabled={notificationPage >= noticeData.pagination.totalPages}
                onClick={() => setNotificationPage((page) => page + 1)}>Lebih lama</button>
            </div>
          )}
        </article>

        <article className={panelClass}>
          <h2 className={sectionTitle}>Pengumuman</h2>
          {announcements.isLoading ? <p className={muted}>Memuat pengumuman...</p> :
            announcements.isError ? <p className="mt-4 text-sm text-rose-700">Pengumuman gagal dimuat: {announcements.error.message}</p> :
              announcementData?.items.length ? (
                <ul className="mt-3 divide-y divide-slate-100">
                  {announcementData.items.map((announcement) => (
                    <li key={announcement.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-slate-900">{announcement.title}</h3>
                        <time className="shrink-0 text-xs text-slate-400" dateTime={announcement.createdAt}>{formatDate(announcement.createdAt)}</time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{announcement.body}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {announcement.section ? `${announcement.section.course.code} · ${announcement.section.name}` : "Pengumuman global"}
                        {" · "}{announcement.author.name}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <p className={muted}>Belum ada pengumuman.</p>}

          {(user.role === "ADMIN" || user.role === "LECTURER") && (
            <form className="mt-5 space-y-3 border-t border-slate-100 pt-4"
              onSubmit={noticeForm.handleSubmit((values) => {
                if (user.role === "LECTURER" && !values.sectionId) {
                  noticeForm.setError("sectionId", { message: "Pilih kelas." });
                  return;
                }
                publishAnnouncement.mutate(values);
              })}>
              <h3 className="font-semibold text-slate-900">Buat pengumuman</h3>
              {(user.role === "LECTURER" || user.role === "ADMIN") && (
                <label className="block text-sm font-medium text-slate-700">
                  {user.role === "ADMIN" ? "Kelas tujuan (opsional; kosong berarti global)" : "Kelas"}
                  <select className={inputClass} {...noticeForm.register("sectionId")}>
                    <option value="">{user.role === "ADMIN" ? "Pengumuman global" : "Pilih kelas"}</option>
                    {user.role === "LECTURER"
                      ? (data?.classes ?? []).map((section) => <option key={section.sectionId} value={section.sectionId}>{section.className}</option>)
                      : (adminClasses.data?.data.items ?? []).map((section) => <option key={section.id} value={section.id}>{section.course.code} · {section.name}</option>)}
                  </select>
                  {noticeForm.formState.errors.sectionId && <span className={errorText}>{noticeForm.formState.errors.sectionId.message}</span>}
                  {user.role === "ADMIN" && adminClasses.isError && <span className={errorText}>Daftar kelas gagal dimuat: {adminClasses.error.message}</span>}
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Judul
                <input className={inputClass} {...noticeForm.register("title")} />
                {noticeForm.formState.errors.title && <span className={errorText}>{noticeForm.formState.errors.title.message}</span>}
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Isi
                <textarea rows={3} className={inputClass} {...noticeForm.register("body")} />
                {noticeForm.formState.errors.body && <span className={errorText}>{noticeForm.formState.errors.body.message}</span>}
              </label>
              {publishAnnouncement.isError && <p role="alert" className={errorText}>{publishAnnouncement.error.message}</p>}
              <button className={primaryButton} disabled={publishAnnouncement.isPending}>
                {publishAnnouncement.isPending ? "Menerbitkan..." : "Terbitkan"}
              </button>
            </form>
          )}
        </article>
      </section>
    </main>
  );
}

function DashboardCharts({ role, data }: { role: Role; data: DashboardData }) {
  const [exportError, setExportError] = useState("");
  if (role === "STUDENT") {
    const attendance = data.attendanceByClass ?? [];
    const trend = data.gradeTrend ?? [];
    return <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Kelas diikuti" value={attendance.length} />
        <Metric label="Tugas mendekati tenggat" value={data.upcomingAssignments?.length ?? 0} />
        <Metric label="Tugas terlewat" value={data.missingAssignments?.length ?? 0} />
        <Metric label="Nilai tercatat" value={trend.length} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Kehadiran per kelas" empty={!attendance.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendance}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="className" hide /><YAxis domain={[0, 100]} /><Tooltip /><Bar dataKey="percentage" name="Kehadiran %" fill="#4f46e5" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Tren nilai" empty={!trend.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="assignment" hide /><YAxis domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="score" name="Nilai %" stroke="#0ea5e9" strokeWidth={3} dot /></LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ListCard title="Segera jatuh tempo" emptyText="Tidak ada tugas dengan tenggat dalam 7 hari.">
          {(data.upcomingAssignments ?? []).map((item) => <li key={item.id} className="border-b border-slate-100 py-3 last:border-0"><p className="font-medium">{item.title}</p><p className={muted}>{item.section.code} · Tenggat {formatDate(item.deadline)}</p></li>)}
        </ListCard>
        <ListCard title="Belum dikumpulkan (lewat tenggat)" emptyText="Tidak ada tugas terlewat.">
          {(data.missingAssignments ?? []).map((item) => <li key={item.id} className="border-b border-slate-100 py-3 last:border-0"><p className="font-medium">{item.title}</p><p className={muted}>{item.section.code} · Tenggat {formatDate(item.deadline)}</p></li>)}
        </ListCard>
      </div>
      <ListCard title="Rata-rata nilai per kelas" emptyText="Nilai belum tersedia.">
        {(data.gradesByClass ?? []).map((item) => <li key={item.sectionId} className="flex justify-between gap-4 border-b border-slate-100 py-3 last:border-0"><span>{item.className}</span><strong>{item.average === null ? "Belum dinilai" : `${item.average}%`}</strong></li>)}
      </ListCard>
    </>;
  }

  if (role === "LECTURER") {
    const attendance = data.attendanceBySession ?? [];
    const assignments = data.assignmentAnalytics ?? [];
    return <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Kelas diampu" value={data.classes?.length ?? 0} />
        <Metric label="Sesi direkap" value={attendance.length} />
        <Metric label="Tugas" value={assignments.length} />
        <Metric label="Mahasiswa berisiko" value={data.risks?.length ?? 0} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Tingkat kehadiran per pertemuan" empty={!attendance.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendance}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="title" hide /><YAxis domain={[0, 100]} /><Tooltip /><Bar dataKey="percentage" name="Hadir %" fill="#10b981" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Distribusi nilai per tugas" empty={!assignments.some((item) => item.gradeDistribution.some((bucket) => bucket.count > 0))}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={assignments.flatMap((item) => item.gradeDistribution.map((bucket) => ({ ...bucket, task: item.title })))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="range" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Jumlah nilai" fill="#6366f1" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <section className={`${panelClass} mt-6`}>
        <h2 className={sectionTitle}>Tingkat pengumpulan tugas</h2>
        {assignments.length ? <ul className="mt-3 divide-y divide-slate-100">{assignments.map((item) => <li key={item.assignmentId} className="py-3"><div className="flex flex-wrap justify-between gap-2"><strong>{item.title}</strong><span>{item.submitted}/{item.enrolled} terkumpul ({item.submissionRate}%)</span></div><p className={muted}>{item.className}</p></li>)}</ul> : <p className={muted}>Belum ada tugas.</p>}
      </section>
      <section className={`${panelClass} mt-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className={sectionTitle}>Mahasiswa yang perlu perhatian</h2><p className={muted}>Ambang: kehadiran di bawah {data.thresholds?.attendancePercent ?? 75}% atau {data.thresholds?.missedAssignments ?? 2}+ tugas terlewat.</p></div>
        </div>
        {data.risks?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Mahasiswa</th><th>Kelas</th><th>Kehadiran</th><th>Tugas terlewat</th></tr></thead><tbody>{data.risks.map((risk) => <tr key={`${risk.studentId}-${risk.className}`} className="border-t border-slate-100"><td className="py-3"><p className="font-medium">{risk.name}</p><p className="text-xs text-slate-500">{risk.email}</p></td><td>{risk.className}</td><td>{risk.attendancePercent}%</td><td>{risk.missedAssignments}</td></tr>)}</tbody></table></div> : <p className={muted}>Belum ada mahasiswa pada ambang risiko.</p>}
      </section>
      <section className={`${panelClass} mt-6`}>
        <h2 className={sectionTitle}>Ekspor rekap nilai</h2>
        {exportError && <p role="alert" className={errorText}>{exportError}</p>}
        <div className="mt-3 divide-y divide-slate-100">{(data.classes ?? []).map((item) => <div key={item.sectionId} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>{item.className}</span><button className={secondaryButton} onClick={() => {
          setExportError("");
          void downloadFile(`/classes/${item.sectionId}/grades/export.csv`, "grades.csv").catch((error: unknown) => {
            setExportError(error instanceof Error ? error.message : "Ekspor gagal.");
          });
        }}>Unduh CSV</button></div>)}</div>
        {!data.classes?.length && <p className={muted}>Belum ada kelas.</p>}
      </section>
    </>;
  }

  const users = data.usersByRole ?? [];
  return <>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Pengguna terdaftar" value={users.reduce((sum, item) => sum + item.count, 0)} />
      <Metric label="Kelas semester aktif" value={data.activeClasses ?? 0} />
      <Metric label="Tugas dibuat (7 hari)" value={data.recentActivity?.assignmentsCreated ?? 0} />
      <Metric label="Sesi absensi dibuka (7 hari)" value={data.recentActivity?.attendanceSessionsOpened ?? 0} />
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <ChartCard title="Pengguna berdasarkan role" empty={!users.length}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={users} dataKey="count" nameKey="role" cx="50%" cy="50%" outerRadius={100} label>{users.map((item, index) => <Cell key={item.role} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart>
        </ResponsiveContainer>
      </ChartCard>
      <ListCard title="Pengumuman terbaru (7 hari)" emptyText="Belum ada aktivitas pengumuman.">
        {(data.recentActivity?.announcements ?? []).map((item) => <li key={item.id} className="border-b border-slate-100 py-3 last:border-0"><p className="font-medium">{item.title}</p><p className={muted}>{formatDate(item.createdAt)}</p></li>)}
      </ListCard>
    </div>
  </>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className={panelClass}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p></article>;
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return <section className={panelClass}><h2 className={sectionTitle}>{title}</h2><div className="mt-4 h-64">{empty ? <p className="grid h-full place-items-center text-sm text-slate-500">Belum ada data untuk ditampilkan.</p> : children}</div></section>;
}

function ListCard({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  return <section className={`${panelClass} mt-6`}><h2 className={sectionTitle}>{title}</h2>{items.length ? <ul className="mt-3">{children}</ul> : <p className={muted}>{emptyText}</p>}</section>;
}

function DashboardSkeleton() {
  return <div aria-label="Memuat analitik" className="mt-6 grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl bg-slate-200" />)}
    {[0, 1].map((item) => <div key={item} className="h-80 rounded-2xl bg-slate-200 lg:col-span-2" />)}
  </div>;
}

function StateCard({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className={`${panelClass} mt-8`}><h2 className={sectionTitle}>{title}</h2><p className="mt-2 text-sm text-slate-600">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const roleName: Record<Role, string> = { ADMIN: "Admin", LECTURER: "Dosen", STUDENT: "Mahasiswa" };
const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const sectionTitle = "text-lg font-semibold text-slate-900";
const muted = "mt-1 text-sm text-slate-500";
const errorText = "mt-1 block text-xs text-rose-700";
const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const primaryButton = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const textButton = "text-sm font-semibold text-indigo-700 hover:underline disabled:text-slate-400 disabled:no-underline";
