import { zodResolver } from "@hookform/resolvers/zod";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { z } from "zod";
import { apiRequest, downloadFile } from "../../lib/api";

interface ApiEnvelope<T> {
  data: T;
}

interface PageResult<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface ClassSection {
  id: string;
  name: string;
  course: { code: string; name: string };
  semester: { name: string };
}

type AttendanceStatus = "PRESENT" | "LATE" | "EXCUSED" | "SICK" | "ABSENT";
const statuses: AttendanceStatus[] = ["PRESENT", "LATE", "EXCUSED", "SICK", "ABSENT"];

interface AttendanceSession {
  id: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  lateAfterMinutes: number;
  section: ClassSection;
  counts?: Record<AttendanceStatus, number>;
}

interface AttendanceRecord {
  student: { id: string; name: string; email: string };
  attendance: {
    id: string;
    status: AttendanceStatus;
    checkedInAt: string | null;
    audits: {
      id: string;
      previousStatus: AttendanceStatus | null;
      status: AttendanceStatus;
      reason: string | null;
      changedAt: string;
      changedBy: { name: string };
    }[];
  } | null;
}

interface SessionQr {
  token: string;
  sessionId: string;
  expiresAt: string;
  rotationSeconds: number;
}

const sessionSchema = z.object({
  title: z.string().trim().min(2).max(160),
  durationMinutes: z.coerce.number().int().min(1).max(240),
  lateAfterMinutes: z.coerce.number().int().min(0).max(240),
});
type SessionFormInput = z.input<typeof sessionSchema>;
type SessionFormValues = z.output<typeof sessionSchema>;

const checkInSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(20).max(4096),
});

export function LecturerAttendancePage() {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const classesQuery = useQuery({
    queryKey: ["lecturer-classes"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<ClassSection>>>("/classes/mine?pageSize=100"),
  });
  const classes = useMemo(
    () => classesQuery.data?.data.items ?? [],
    [classesQuery.data?.data.items],
  );
  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classId, classes]);

  const sessionsQuery = useQuery({
    queryKey: ["attendance-sessions", classId],
    queryFn: () =>
      apiRequest<ApiEnvelope<PageResult<AttendanceSession>>>(
        `/classes/${classId}/attendance/sessions?pageSize=100`,
      ),
    enabled: Boolean(classId),
    refetchInterval: 5000,
  });
  const sessions = sessionsQuery.data?.data.items ?? [];
  const activeSession = sessions.find(
    (session) => !session.closedAt && new Date(session.expiresAt).getTime() > now,
  );
  const selectedSession =
    sessions.find((session) => session.id === sessionId) ?? activeSession ?? sessions[0] ?? null;
  useEffect(() => {
    if (selectedSession && selectedSession.id !== sessionId) setSessionId(selectedSession.id);
  }, [selectedSession, sessionId]);

  const form = useForm<SessionFormInput, unknown, SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: { title: "Pertemuan kelas", durationMinutes: 60, lateAfterMinutes: 10 },
  });
  const openSession = useMutation({
    mutationFn: (values: SessionFormValues) =>
      apiRequest<ApiEnvelope<{ session: AttendanceSession }>>(
        `/classes/${classId}/attendance/sessions`,
        { method: "POST", body: JSON.stringify(values) },
      ),
    onSuccess: async (result) => {
      setSessionId(result.data.session.id);
      await queryClient.invalidateQueries({ queryKey: ["attendance-sessions", classId] });
    },
  });
  const closeSession = useMutation({
    mutationFn: (id: string) => apiRequest(`/attendance/sessions/${id}/close`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance-sessions", classId] });
      await queryClient.invalidateQueries({ queryKey: ["attendance-records", sessionId] });
    },
  });

  if (classesQuery.isLoading) return <LoadingState />;
  if (classesQuery.error) return <ErrorState message={classesQuery.error.message} />;

  return (
    <PageShell
      title="Sesi absensi"
      description="Buka sesi, tampilkan QR dinamis, pantau kehadiran, dan koreksi status dengan audit."
    >
      {classes.length === 0 ? (
        <EmptyState message="Belum ada kelas yang diampu." />
      ) : (
        <>
          <Panel title="Pilih kelas">
            <label className="block text-sm font-medium text-slate-700">
              Kelas
              <select
                value={classId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setSessionId("");
                }}
                className={inputClassName}
              >
                {classes.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.course.code} · Kelas {section.name} · {section.semester.name}
                  </option>
                ))}
              </select>
            </label>
          </Panel>

          {!activeSession && (
            <Panel title="Buka sesi baru" className="mt-6">
              {openSession.error && <ErrorBanner message={openSession.error.message} />}
              <form
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                onSubmit={form.handleSubmit((values) => openSession.mutate(values))}
              >
                <Field label="Judul pertemuan" error={form.formState.errors.title?.message}>
                  <input {...form.register("title")} className={inputClassName} />
                </Field>
                <Field
                  label="Durasi (menit)"
                  error={form.formState.errors.durationMinutes?.message}
                >
                  <input
                    type="number"
                    min="1"
                    max="240"
                    {...form.register("durationMinutes")}
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label="Batas hadir tepat waktu (menit)"
                  error={form.formState.errors.lateAfterMinutes?.message}
                >
                  <input
                    type="number"
                    min="0"
                    max="240"
                    {...form.register("lateAfterMinutes")}
                    className={inputClassName}
                  />
                </Field>
                <button disabled={openSession.isPending} className={`${primaryButton} self-end`}>
                  {openSession.isPending ? "Membuka..." : "Buka sesi"}
                </button>
              </form>
            </Panel>
          )}

          <Panel title="Riwayat sesi" className="mt-6">
            {sessionsQuery.isLoading ? (
              <LoadingState />
            ) : sessionsQuery.error ? (
              <ErrorBanner message={sessionsQuery.error.message} />
            ) : sessions.length === 0 ? (
              <EmptyState message="Belum ada sesi absensi." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    className={session.id === selectedSession?.id ? primaryButton : secondaryButton}
                    onClick={() => setSessionId(session.id)}
                  >
                    {session.title} · {formatDate(session.createdAt)}
                    {!session.closedAt && new Date(session.expiresAt).getTime() > now
                      ? " · Aktif"
                      : ""}
                  </button>
                ))}
              </div>
            )}
          </Panel>

          {selectedSession && (
            <AttendanceSessionPanel
              session={selectedSession}
              now={now}
              onClose={() => closeSession.mutate(selectedSession.id)}
              closePending={closeSession.isPending}
              closeError={closeSession.error?.message}
            />
          )}
        </>
      )}
    </PageShell>
  );
}

function AttendanceSessionPanel({
  session,
  now,
  onClose,
  closePending,
  closeError,
}: {
  session: AttendanceSession;
  now: number;
  onClose(): void;
  closePending: boolean;
  closeError?: string;
}) {
  const queryClient = useQueryClient();
  const isOpen = !session.closedAt && new Date(session.expiresAt).getTime() > now;
  const qrQuery = useQuery({
    queryKey: ["attendance-qr", session.id],
    queryFn: () => apiRequest<ApiEnvelope<SessionQr>>(`/attendance/sessions/${session.id}/qr`),
    enabled: isOpen,
    refetchInterval: isOpen ? 2000 : false,
    refetchIntervalInBackground: true,
  });
  const recordsQuery = useQuery({
    queryKey: ["attendance-records", session.id],
    queryFn: () =>
      apiRequest<
        ApiEnvelope<
          PageResult<AttendanceRecord> & {
            counts: Record<AttendanceStatus, number>;
          }
        >
      >(`/attendance/sessions/${session.id}/records?page=1&pageSize=100`),
    refetchInterval: 3000,
  });
  const csvExport = useMutation({
    mutationFn: () =>
      downloadFile(`/attendance/sessions/${session.id}/export.csv`, `${session.title}.csv`),
  });
  const classExport = useMutation({
    mutationFn: () =>
      downloadFile(
        `/classes/${session.section.id}/attendance/export.csv`,
        `${session.section.course.code}-attendance.csv`,
      ),
  });

  return (
    <Panel
      title={`${session.title} · ${session.section.course.code} kelas ${session.section.name}`}
      className="mt-6"
    >
      {(closeError || qrQuery.error) && (
        <ErrorBanner message={closeError ?? qrQuery.error!.message} />
      )}
      <p className="mb-4 text-sm text-slate-600">
        Mulai {formatDate(session.createdAt)} · Hadir tepat waktu sampai {session.lateAfterMinutes}{" "}
        menit · Berakhir {formatDate(session.expiresAt)}
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_1fr]">
        <div className="flex flex-col items-center rounded-xl bg-slate-50 p-5 text-center">
          {isOpen ? (
            <>
              {qrQuery.isLoading ? (
                <LoadingState />
              ) : qrQuery.data ? (
                <>
                  <QRCodeSVG
                    value={JSON.stringify({
                      sessionId: session.id,
                      token: qrQuery.data.data.token,
                    })}
                    size={240}
                    level="M"
                    includeMargin
                  />
                  <p className="mt-3 text-sm font-semibold text-slate-800">
                    QR diperbarui setiap {qrQuery.data.data.rotationSeconds} detik
                  </p>
                  <p className="text-sm text-slate-600">
                    Token berlaku {countdown(qrQuery.data.data.expiresAt, now)}
                  </p>
                </>
              ) : null}
              <button className={`${dangerButton} mt-4`} disabled={closePending} onClick={onClose}>
                {closePending ? "Menutup..." : "Tutup sesi"}
              </button>
            </>
          ) : (
            <p className="py-12 font-semibold text-slate-600">
              {session.closedAt ? "Sesi sudah ditutup." : "Sesi kedaluwarsa."}
            </p>
          )}
        </div>

        <div>
          {recordsQuery.isLoading ? (
            <LoadingState />
          ) : recordsQuery.error ? (
            <ErrorBanner message={recordsQuery.error.message} />
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {statuses.map((status) => (
                  <div key={status} className="rounded-lg bg-slate-50 p-3 text-center">
                    <strong className="block text-xl text-slate-900">
                      {recordsQuery.data?.data.counts[status] ?? 0}
                    </strong>
                    <span className="text-xs text-slate-500">{statusLabel(status)}</span>
                  </div>
                ))}
              </div>
              {(recordsQuery.data?.data.items.length ?? 0) === 0 ? (
                <EmptyState message="Belum ada mahasiswa pada daftar kehadiran." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2">Mahasiswa</th>
                        <th>Status</th>
                        <th>Waktu</th>
                        <th>Ubah status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recordsQuery.data!.data.items.map((record) => (
                        <AttendanceRow
                          key={record.student.id}
                          sessionId={session.id}
                          record={record}
                          onChanged={() =>
                            void queryClient.invalidateQueries({
                              queryKey: ["attendance-records", session.id],
                            })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {csvExport.error && <ErrorBanner message={csvExport.error.message} />}
              {classExport.error && <ErrorBanner message={classExport.error.message} />}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={secondaryButton}
                  disabled={csvExport.isPending}
                  onClick={() => csvExport.mutate()}
                >
                  {csvExport.isPending ? "Mengekspor..." : "Ekspor sesi CSV"}
                </button>
                <button
                  className={secondaryButton}
                  disabled={classExport.isPending}
                  onClick={() => classExport.mutate()}
                >
                  {classExport.isPending ? "Mengekspor..." : "Ekspor semua sesi kelas"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function AttendanceRow({
  sessionId,
  record,
  onChanged,
}: {
  sessionId: string;
  record: AttendanceRecord;
  onChanged(): void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(record.attendance?.status ?? "ABSENT");
  const [reason, setReason] = useState("");
  useEffect(() => {
    setStatus(record.attendance?.status ?? "ABSENT");
  }, [record.attendance?.status]);
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/attendance/sessions/${sessionId}/records/${record.student.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      }),
    onSuccess: () => {
      setReason("");
      onChanged();
    },
  });
  const currentStatus = record.attendance?.status ?? "ABSENT";
  return (
    <tr>
      <td className="py-3">
        <strong className="block text-slate-800">{record.student.name}</strong>
        <span className="text-xs text-slate-500">{record.student.email}</span>
        {record.attendance?.audits?.[0] && (
          <span
            className="block text-xs text-indigo-600"
            title={record.attendance.audits[0].reason ?? undefined}
          >
            Diubah oleh {record.attendance.audits[0].changedBy.name} ·{" "}
            {formatDate(record.attendance.audits[0].changedAt)}
          </span>
        )}
      </td>
      <td>
        <span className={statusBadge}>{statusLabel(currentStatus)}</span>
      </td>
      <td className="text-slate-600">
        {record.attendance?.checkedInAt ? formatDate(record.attendance.checkedInAt) : "—"}
      </td>
      <td>
        <div className="flex items-center gap-2">
          <select
            aria-label={`Status ${record.student.name}`}
            value={status}
            onChange={(event) => setStatus(event.target.value as AttendanceStatus)}
            className={smallInputClass}
          >
            {statuses.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
          <input
            aria-label={`Alasan ${record.student.name}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Alasan opsional"
            className={smallInputClass}
          />
          <button
            className={smallButton}
            disabled={mutation.isPending || status === currentStatus}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "..." : "Simpan"}
          </button>
        </div>
        {mutation.error && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {mutation.error.message}
          </p>
        )}
      </td>
    </tr>
  );
}

export function StudentAttendancePage() {
  const queryClient = useQueryClient();
  const lastSubmittedToken = useRef<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scannerError, setScannerError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const sessionsQuery = useQuery({
    queryKey: ["attendance-history", statusFilter],
    queryFn: () =>
      apiRequest<
        ApiEnvelope<
          PageResult<
            AttendanceSession & {
              myAttendance: { status: AttendanceStatus; checkedInAt: string | null } | null;
            }
          >
        >
      >(`/attendance/me?page=1&pageSize=100${statusFilter ? `&status=${statusFilter}` : ""}`),
    refetchInterval: 10_000,
  });
  const classesQuery = useQuery({
    queryKey: ["student-classes"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<ClassSection>>>("/classes/mine?pageSize=100"),
  });
  const checkIn = useMutation({
    mutationFn: (payload: z.infer<typeof checkInSchema>) =>
      apiRequest<ApiEnvelope<{ attendance: { status: AttendanceStatus } }>>(
        "/attendance/check-in",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: async (result) => {
      setFeedback(`Absensi berhasil: ${statusLabel(result.data.attendance.status)}.`);
      setScannerError("");
      setManualCode("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attendance-history"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-summary"] }),
      ]);
    },
    onError: (error) => {
      setFeedback("");
      setScannerError(error.message);
    },
  });

  const submitCode = (rawCode: string) => {
    try {
      const payload: unknown = JSON.parse(rawCode);
      const parsed = checkInSchema.parse(payload);
      if (!checkIn.isPending && parsed.token !== lastSubmittedToken.current) {
        lastSubmittedToken.current = parsed.token;
        checkIn.mutate(parsed);
      }
    } catch (error) {
      setFeedback("");
      setScannerError(
        error instanceof z.ZodError
          ? "Kode QR tidak valid. Pastikan sessionId dan token tersedia."
          : "Masukkan kode QR JSON yang diberikan dosen.",
      );
    }
  };

  const classes = classesQuery.data?.data.items ?? [];
  const sessions = sessionsQuery.data?.data.items ?? [];
  if (classesQuery.isLoading || sessionsQuery.isLoading) return <LoadingState />;
  if (classesQuery.error) return <ErrorState message={classesQuery.error.message} />;
  if (sessionsQuery.error) return <ErrorState message={sessionsQuery.error.message} />;

  return (
    <PageShell
      title="Absensi saya"
      description="Pindai QR dari dosen atau masukkan kode secara manual untuk mencatat kehadiran."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <Panel title="Pindai QR absensi">
          {feedback && (
            <p
              role="status"
              className="mb-3 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800"
            >
              {feedback}
            </p>
          )}
          {scannerError && <ErrorBanner message={scannerError} />}
          {checkIn.isPending && (
            <p className="mb-3 text-sm text-indigo-700">Memeriksa kode dengan waktu server...</p>
          )}
          <QrScanner onCode={(value) => submitCode(value)} onError={setScannerError} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Masukkan kode manual
            </summary>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Tempel isi kode QR (JSON dengan sessionId dan token)
              <textarea
                rows={4}
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder='{"sessionId":"...","token":"..."}'
                className={inputClassName}
              />
            </label>
            <button
              className={`${primaryButton} mt-3`}
              disabled={checkIn.isPending || !manualCode.trim()}
              onClick={() => submitCode(manualCode)}
            >
              {checkIn.isPending ? "Memeriksa..." : "Kirim absensi"}
            </button>
          </details>
          <p className="mt-4 text-xs text-slate-500">
            Pastikan kamera diizinkan. Akses kamera biasanya memerlukan HTTPS atau localhost; input
            manual tetap tersedia.
          </p>
        </Panel>

        <div className="space-y-4">
          {classes.length === 0 ? (
            <Panel title="Rekap kehadiran">
              <EmptyState message="Kamu belum terdaftar pada kelas apa pun." />
            </Panel>
          ) : (
            classes.map((section) => <StudentClassAttendance key={section.id} section={section} />)
          )}
        </div>
      </div>

      <Panel title="Riwayat kehadiran" className="mt-6">
        <label className="mb-4 block max-w-xs text-sm font-medium text-slate-700">
          Filter status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClassName}
          >
            <option value="">Semua</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        {sessions.length === 0 ? (
          <EmptyState message="Belum ada riwayat sesi pada filter ini." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <strong className="text-slate-800">{session.title}</strong>
                  <p className="text-sm text-slate-500">
                    {session.section.course.code} · {session.section.semester.name} ·{" "}
                    {formatDate(session.createdAt)}
                  </p>
                </div>
                <span className={statusBadge}>
                  {statusLabel(session.myAttendance?.status ?? "ABSENT")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}

function QrScanner({
  onCode,
  onError,
}: {
  onCode(value: string): void;
  onError(message: string): void;
}) {
  const callbacks = useRef({ onCode, onError });
  callbacks.current = { onCode, onError };
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "attendance-camera-reader",
      { fps: 8, qrbox: { width: 220, height: 220 }, rememberLastUsedCamera: true },
      false,
    );
    scanner.render(
      (decodedText) => callbacks.current.onCode(decodedText),
      () => undefined,
    );
    return () => {
      void scanner.clear().catch((error: unknown) => {
        callbacks.current.onError(
          error instanceof Error ? error.message : "Could not stop the camera scanner.",
        );
      });
    };
  }, []);
  return (
    <div id="attendance-camera-reader" className="mx-auto max-w-sm overflow-hidden rounded-xl" />
  );
}

function StudentClassAttendance({ section }: { section: ClassSection }) {
  const query = useQuery({
    queryKey: ["attendance-summary", section.id],
    queryFn: () =>
      apiRequest<
        ApiEnvelope<{
          summary: {
            totalSessions: number;
            PRESENT: number;
            LATE: number;
            EXCUSED: number;
            SICK: number;
            ABSENT: number;
            percentage: number;
          };
        }>
      >(`/classes/${section.id}/attendance/me`),
    refetchInterval: 15_000,
  });
  if (query.isLoading)
    return (
      <Panel title={`${section.course.code} · Kehadiran`}>
        <LoadingState />
      </Panel>
    );
  if (query.error)
    return (
      <Panel title={`${section.course.code} · Kehadiran`}>
        <ErrorBanner message={query.error.message} />
      </Panel>
    );
  const summary = query.data?.data.summary;
  return (
    <Panel title={`${section.course.code} · Rekap kehadiran`}>
      {!summary || summary.totalSessions === 0 ? (
        <p className="text-sm text-slate-500">Belum ada sesi yang berakhir.</p>
      ) : (
        <>
          <p className="text-3xl font-bold text-indigo-700">{summary.percentage}%</p>
          <p className="text-sm text-slate-600">
            Hadir + terlambat dari {summary.totalSessions} sesi
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
            {statuses.map((status) => (
              <span key={status}>
                {statusLabel(status)}: {summary[status]}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/dashboard" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
        ← Dashboard
      </Link>
      <header className="my-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          CampusHub
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">{description}</p>
      </header>
      {children}
    </main>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      <h2 className="mb-5 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function LoadingState() {
  return <div className="py-6 text-center text-sm text-slate-500">Memuat data...</div>;
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">{message}</p>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <ErrorBanner message={message} />
    </main>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="my-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function countdown(value: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
  return `${seconds} detik`;
}

function statusLabel(status: AttendanceStatus) {
  return {
    PRESENT: "Hadir",
    LATE: "Terlambat",
    EXCUSED: "Izin",
    SICK: "Sakit",
    ABSENT: "Alfa",
  }[status];
}

const inputClassName =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const smallInputClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700";
const primaryButton =
  "rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";
const smallButton =
  "rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const dangerButton =
  "rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50";
const statusBadge =
  "inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700";
