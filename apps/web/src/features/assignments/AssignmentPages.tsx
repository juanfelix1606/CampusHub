import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

interface Course {
  code: string;
  name: string;
}

interface ClassSection {
  id: string;
  name: string;
  course: Course;
  semester: { name: string };
}

interface Submission {
  id: string;
  textContent: string | null;
  fileName: string | null;
  submittedAt: string;
  isLate: boolean;
  version: number;
  score: string | number | null;
  feedback: string | null;
  gradedAt: string | null;
  student?: { id: string; name: string; email: string };
  versions?: SubmissionVersion[];
  gradeHistory?: {
    id: string;
    score: string | number;
    previousScore: string | number | null;
    gradedAt: string;
    grader: { name: string };
  }[];
}

interface SubmissionVersion {
  id: string;
  version: number;
  textContent: string | null;
  fileName: string | null;
  submittedAt: string;
  isLate: boolean;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  maxScore: number;
  allowLate: boolean;
  attachmentFileName: string | null;
  studentStatus?: "NOT_SUBMITTED" | "SUBMITTED" | "LATE" | "GRADED";
  submissions?: Submission[];
  section: ClassSection;
  _count?: { submissions: number };
}

const assignmentFormSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().max(5000),
  deadline: z.string().min(1, "Tentukan deadline."),
  maxScore: z.coerce.number().int().min(1).max(1000),
  allowLate: z.boolean(),
  removeAttachment: z.boolean().optional(),
  file: z.custom<File>((value) => value === undefined || value instanceof File).optional(),
}).refine((value) => Number.isFinite(Date.parse(value.deadline)), {
  path: ["deadline"],
  message: "Deadline tidak valid.",
});
type AssignmentFormInput = z.input<typeof assignmentFormSchema>;
type AssignmentFormValues = z.output<typeof assignmentFormSchema>;

const submissionFormSchema = z.object({
  textContent: z.string().max(20_000),
  file: z.custom<File>((value) => value === undefined || value instanceof File).optional(),
}).refine((value) => Boolean(value.textContent.trim()) || Boolean(value.file), {
  path: ["textContent"],
  message: "Isi jawaban teks atau lampirkan file.",
}).refine((value) => !value.file || value.file.size <= 10 * 1024 * 1024, {
  path: ["file"],
  message: "Ukuran file maksimal 10 MB.",
}).refine((value) => !value.file || ["application/pdf", "image/png", "image/jpeg"].includes(value.file.type), {
  path: ["file"],
  message: "Pilih file PDF, PNG, atau JPEG.",
});
type SubmissionFormInput = z.input<typeof submissionFormSchema>;
type SubmissionFormValues = z.output<typeof submissionFormSchema>;

const gradeFormSchema = z.object({
  score: z.coerce.number().finite().min(0),
  feedback: z.string().max(5000),
});
type GradeFormInput = z.input<typeof gradeFormSchema>;
type GradeFormValues = z.output<typeof gradeFormSchema>;

export function LecturerAssignmentsPage() {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const classesQuery = useQuery({
    queryKey: ["lecturer-classes"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<ClassSection>>>("/classes/mine?pageSize=100"),
  });
  const classes = classesQuery.data?.data.items ?? [];
  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classId, classes]);

  const assignmentsQuery = useQuery({
    queryKey: ["assignments", "lecturer", classId],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<Assignment>>>(`/assignments?classId=${classId}&pageSize=100`),
    enabled: Boolean(classId),
  });
  const createForm = useForm<AssignmentFormInput, unknown, AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      title: "",
      description: "",
      deadline: localDateTimeValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      maxScore: 100,
      allowLate: false,
      removeAttachment: false,
    },
  });
  const createAssignment = useMutation({
    mutationFn: (values: AssignmentFormValues) => {
      const body = new FormData();
      body.append("title", values.title);
      body.append("description", values.description);
      body.append("deadline", new Date(values.deadline).toISOString());
      body.append("maxScore", String(values.maxScore));
      body.append("allowLate", String(values.allowLate));
      if (values.removeAttachment) body.append("removeAttachment", "true");
      if (values.file) body.append("file", values.file);
      return editingAssignment
        ? apiRequest(`/assignments/${editingAssignment.id}`, { method: "PATCH", body })
        : apiRequest(`/classes/${classId}/assignments`, { method: "POST", body });
    },
    onSuccess: async () => {
      setEditingAssignment(null);
      createForm.reset({
        title: "",
        description: "",
        deadline: localDateTimeValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
        maxScore: 100,
        allowLate: false,
        removeAttachment: false,
      });
      await queryClient.invalidateQueries({ queryKey: ["assignments", "lecturer", classId] });
    },
  });
  const deleteAssignment = useMutation({
    mutationFn: (assignmentId: string) => apiRequest(`/assignments/${assignmentId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setSelectedAssignmentId("");
      setEditingAssignment(null);
      await queryClient.invalidateQueries({ queryKey: ["assignments", "lecturer", classId] });
    },
  });

  const assignments = assignmentsQuery.data?.data.items ?? [];
  const selectedAssignment = assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const submissionsQuery = useQuery({
    queryKey: ["assignment-submissions", selectedAssignmentId, submissionStatus],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<Submission>>>(
      `/assignments/${selectedAssignmentId}/submissions?pageSize=100${submissionStatus ? `&status=${submissionStatus}` : ""}`,
    ),
    enabled: Boolean(selectedAssignmentId),
  });

  if (classesQuery.isLoading) return <LoadingState />;
  if (classesQuery.error) return <ErrorState message={classesQuery.error.message} />;

  return (
    <PageShell
      title="Tugas & penilaian"
      description="Buat tugas untuk kelas yang diampu, tinjau submission, lalu beri nilai dan feedback."
    >
      {classes.length === 0 ? <EmptyState message="Belum ada kelas yang diampu." /> : (
        <>
          <Panel title="Pilih kelas">
            <label className="block text-sm font-medium text-slate-700">
              Kelas
              <select value={classId} onChange={(event) => {
                setClassId(event.target.value);
                setSelectedAssignmentId("");
                setEditingAssignment(null);
              }} className={inputClassName}>
                {classes.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.course.code} · Kelas {section.name} · {section.semester.name}
                  </option>
                ))}
              </select>
            </label>
          </Panel>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Panel title={editingAssignment ? "Ubah tugas" : "Buat tugas"}>
              {createAssignment.error && <ErrorBanner message={createAssignment.error.message} />}
              {deleteAssignment.error && <ErrorBanner message={deleteAssignment.error.message} />}
              <form className="space-y-3" onSubmit={createForm.handleSubmit((values) => createAssignment.mutate(values))}>
                <Field label="Judul" error={createForm.formState.errors.title?.message}>
                  <input {...createForm.register("title")} className={inputClassName} />
                </Field>
                <Field label="Deskripsi" error={createForm.formState.errors.description?.message}>
                  <textarea rows={3} {...createForm.register("description")} className={inputClassName} />
                </Field>
                <Field label="Deadline" error={createForm.formState.errors.deadline?.message}>
                  <input type="datetime-local" {...createForm.register("deadline")} className={inputClassName} />
                </Field>
                <Field label="Nilai maksimal" error={createForm.formState.errors.maxScore?.message}>
                  <input type="number" min="1" max="1000" {...createForm.register("maxScore")} className={inputClassName} />
                </Field>
                <Field label="Lampiran opsional (PDF/PNG/JPEG, maks. 10 MB)" error={createForm.formState.errors.file?.message}>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                    className="mt-1 block w-full text-sm text-slate-600"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      createForm.setValue("file", file, { shouldValidate: true });
                      if (file) {
                        createForm.setValue("removeAttachment", false);
                      }
                    }} />
                </Field>
                {editingAssignment?.attachmentFileName && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" {...createForm.register("removeAttachment")} />
                    Hapus lampiran {editingAssignment.attachmentFileName}
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" {...createForm.register("allowLate")} />
                  Terima submission terlambat dengan penanda
                </label>
                <button disabled={createAssignment.isPending} className={primaryButton}>
                  {createAssignment.isPending ? "Menyimpan..." : editingAssignment ? "Simpan perubahan" : "Buat tugas"}
                </button>
                {editingAssignment && (
                  <button type="button" className={smallButton} onClick={() => {
                    setEditingAssignment(null);
                    createForm.reset({
                      title: "",
                      description: "",
                      deadline: localDateTimeValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
                      maxScore: 100,
                      allowLate: false,
                      removeAttachment: false,
                    });
                  }}>Batal ubah</button>
                )}
              </form>
            </Panel>

            <Panel title="Daftar tugas">
              {assignmentsQuery.isLoading ? <LoadingState /> : assignmentsQuery.error ? (
                <ErrorBanner message={assignmentsQuery.error.message} />
              ) : assignments.length === 0 ? <EmptyState message="Belum ada tugas pada kelas ini." /> : (
                <ul className="divide-y divide-slate-100">
                  {assignments.map((assignment) => (
                    <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <strong className="text-slate-900">{assignment.title}</strong>
                        <p className="text-sm text-slate-600">
                          Deadline {formatDate(assignment.deadline)} · Maks. {assignment.maxScore} · {assignment._count?.submissions ?? 0} submission
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                      <button className={smallButton} onClick={() => setSelectedAssignmentId(assignment.id)}>
                        Lihat & nilai
                      </button>
                      <button className={smallButton} onClick={() => {
                        setEditingAssignment(assignment);
                        createForm.reset({
                          title: assignment.title,
                          description: assignment.description ?? "",
                          deadline: localDateTimeValue(new Date(assignment.deadline)),
                          maxScore: assignment.maxScore,
                          allowLate: assignment.allowLate,
                          removeAttachment: false,
                        });
                      }}>Ubah</button>
                      <button className={smallButton} disabled={deleteAssignment.isPending}
                        onClick={() => deleteAssignment.mutate(assignment.id)}>Hapus</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {selectedAssignment && (
            <Panel title={`Submission: ${selectedAssignment.title}`} className="mt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">Batas nilai: {selectedAssignment.maxScore}</p>
                <select aria-label="Filter status submission" value={submissionStatus}
                  onChange={(event) => setSubmissionStatus(event.target.value)} className={inputClassName}>
                  <option value="">Semua status</option>
                  <option value="SUBMITTED">Sudah dikumpulkan</option>
                  <option value="LATE">Terlambat</option>
                  <option value="GRADED">Sudah dinilai</option>
                </select>
              </div>
              {submissionsQuery.isLoading ? <LoadingState /> : submissionsQuery.error ? (
                <ErrorBanner message={submissionsQuery.error.message} />
              ) : (submissionsQuery.data?.data.items.length ?? 0) === 0 ? (
                <EmptyState message="Belum ada submission untuk filter ini." />
              ) : (
                <div className="space-y-4">
                  {submissionsQuery.data!.data.items.map((submission) => (
                    <GradeSubmission
                      key={submission.id}
                      assignment={selectedAssignment}
                      submission={submission}
                      onGraded={() => {
                        void queryClient.invalidateQueries({ queryKey: ["assignment-submissions", selectedAssignment.id] });
                        void queryClient.invalidateQueries({ queryKey: ["assignments", "lecturer", classId] });
                      }}
                    />
                  ))}
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </PageShell>
  );
}

function GradeSubmission({
  assignment,
  submission,
  onGraded,
}: {
  assignment: Assignment;
  submission: Submission;
  onGraded(): void;
}) {
  const form = useForm<GradeFormInput, unknown, GradeFormValues>({
    resolver: zodResolver(gradeFormSchema),
    defaultValues: {
      score: submission.score === null ? 0 : Number(submission.score),
      feedback: submission.feedback ?? "",
    },
  });
  const { reset } = form;
  useEffect(() => {
    reset({
      score: submission.score === null ? 0 : Number(submission.score),
      feedback: submission.feedback ?? "",
    });
  }, [reset, submission.feedback, submission.score]);
  const grade = useMutation({
    mutationFn: (values: GradeFormValues) => apiRequest(
      `/assignments/${assignment.id}/submissions/${submission.id}/grade`,
      { method: "PATCH", body: JSON.stringify(values) },
    ),
    onSuccess: onGraded,
  });
  const download = useMutation({
    mutationFn: () => downloadFile(
      `/assignments/${assignment.id}/submissions/${submission.id}/file`,
      submission.fileName ?? "submission",
    ),
  });
  const downloadVersion = useMutation({
    mutationFn: (version: SubmissionVersion) => downloadFile(
      `/assignments/${assignment.id}/submissions/${submission.id}/versions/${version.id}/file`,
      version.fileName ?? "submission-version",
    ),
  });
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong>{submission.student?.name}</strong>
          <p className="text-sm text-slate-500">{submission.student?.email} · {formatDate(submission.submittedAt)}</p>
          <p className="mt-1 text-xs font-semibold text-amber-700">{submission.isLate ? "Terlambat" : "Tepat waktu"} · versi {submission.version}</p>
        </div>
        {submission.fileName && (
          <button className={smallButton} disabled={download.isPending} onClick={() => download.mutate()}>
            {download.isPending ? "Mengunduh..." : `Unduh ${submission.fileName}`}
          </button>
        )}
      </div>
      {submission.textContent && <p className="my-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{submission.textContent}</p>}
      {submission.versions && (
        <details className="my-3 text-sm text-slate-600">
          <summary className="cursor-pointer">Riwayat {submission.versions.length} versi</summary>
          <ul className="mt-2 space-y-1">
            {submission.versions.map((version) => (
              <li key={version.version}>
                v{version.version} · {formatDate(version.submittedAt)} {version.isLate ? "· Terlambat" : ""}
                {version.fileName && (
                  <button className={`${smallButton} ml-2`} onClick={() => downloadVersion.mutate(version)}>
                    Unduh {version.fileName}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {grade.error && <ErrorBanner message={grade.error.message} />}
      {download.error && <ErrorBanner message={download.error.message} />}
      {downloadVersion.error && <ErrorBanner message={downloadVersion.error.message} />}
      <form className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr_auto]"
        onSubmit={form.handleSubmit((values) => grade.mutate(values))}>
        <Field label={`Nilai / ${assignment.maxScore}`} error={form.formState.errors.score?.message}>
          <input type="number" min="0" max={assignment.maxScore} step="0.01"
            {...form.register("score")} className={inputClassName} />
        </Field>
        <Field label="Feedback" error={form.formState.errors.feedback?.message}>
          <input {...form.register("feedback")} className={inputClassName} />
        </Field>
        <button disabled={grade.isPending} className={`${primaryButton} self-end`}>
          {grade.isPending ? "Menyimpan..." : submission.score === null ? "Beri nilai" : "Ubah nilai"}
        </button>
      </form>
    </article>
  );
}

export function StudentAssignmentsPage() {
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const classesQuery = useQuery({
    queryKey: ["student-classes"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<ClassSection>>>("/classes/mine?pageSize=100"),
  });
  const classes = classesQuery.data?.data.items ?? [];
  const assignmentsQuery = useQuery({
    queryKey: ["assignments", "student", classId, status],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<Assignment>>>(
      `/assignments?pageSize=100${classId ? `&classId=${classId}` : ""}${status ? `&status=${status}` : ""}`,
    ),
  });
  if (classesQuery.isLoading) return <LoadingState />;
  if (classesQuery.error) return <ErrorState message={classesQuery.error.message} />;
  const assignments = assignmentsQuery.data?.data.items ?? [];

  return (
    <PageShell
      title="Tugas saya"
      description="Kirim jawaban, pantau deadline, dan lihat feedback serta nilai."
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Kelas
          <select value={classId} onChange={(event) => setClassId(event.target.value)} className={inputClassName}>
            <option value="">Semua kelas</option>
            {classes.map((section) => <option key={section.id} value={section.id}>{section.course.code} · {section.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClassName}>
            <option value="">Semua status</option>
            <option value="NOT_SUBMITTED">Belum dikumpulkan</option>
            <option value="SUBMITTED">Sudah dikumpulkan</option>
            <option value="LATE">Terlambat</option>
            <option value="GRADED">Sudah dinilai</option>
          </select>
        </label>
      </div>
      {assignmentsQuery.isLoading ? <LoadingState /> : assignmentsQuery.error ? (
        <ErrorState message={assignmentsQuery.error.message} />
      ) : assignments.length === 0 ? <EmptyState message="Tidak ada tugas untuk filter ini." /> : (
        <div className="space-y-5">
          {assignments.map((assignment) => (
            <StudentAssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {classes.map((section) => <GradeSummary key={section.id} section={section} />)}
      </div>
    </PageShell>
  );
}

function StudentAssignmentCard({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const submission = assignment.submissions?.[0];
  const historyQuery = useQuery({
    queryKey: ["my-submission", assignment.id],
    queryFn: () => apiRequest<ApiEnvelope<{ submission: Submission | null }>>(
      `/assignments/${assignment.id}/submissions/me`,
    ),
    enabled: showHistory,
  });
  const form = useForm<SubmissionFormInput, unknown, SubmissionFormValues>({
    resolver: zodResolver(submissionFormSchema),
    defaultValues: { textContent: "", file: undefined },
  });
  const submit = useMutation({
    mutationFn: (values: SubmissionFormValues) => {
      const body = new FormData();
      body.append("textContent", values.textContent);
      if (values.file) body.append("file", values.file);
      return apiRequest(`/assignments/${assignment.id}/submissions/me`, { method: "POST", body });
    },
    onSuccess: async () => {
      form.reset({ textContent: "", file: undefined });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assignments", "student"] }),
        queryClient.invalidateQueries({ queryKey: ["my-submission", assignment.id] }),
      ]);
    },
  });
  const attachment = useMutation({
    mutationFn: () => downloadFile(
      `/assignments/${assignment.id}/attachment`,
      assignment.attachmentFileName ?? "assignment",
    ),
  });
  const submissionDownload = useMutation({
    mutationFn: (fileName: string) => downloadFile(
      `/assignments/${assignment.id}/submissions/${submission?.id}/file`,
      fileName,
    ),
  });
  const submissionVersionDownload = useMutation({
    mutationFn: (version: SubmissionVersion) => downloadFile(
      `/assignments/${assignment.id}/submissions/${submission?.id}/versions/${version.id}/file`,
      version.fileName ?? "submission-version",
    ),
  });
  const remaining = new Date(assignment.deadline).getTime() - Date.now();
  const canResubmit = remaining > 0 || (!submission && assignment.allowLate);

  return (
    <Panel title={assignment.title}>
      <p className="text-sm text-slate-600">
        {assignment.section.course.code} · Kelas {assignment.section.name} · Maks. {assignment.maxScore}
      </p>
      {assignment.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{assignment.description}</p>}
      <p className={`mt-3 text-sm font-semibold ${remaining < 0 ? "text-red-700" : "text-indigo-700"}`}>
        Deadline: {formatDate(assignment.deadline)} · <Countdown deadline={assignment.deadline} />
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-700">Status: {statusLabel(assignment.studentStatus)}</p>
      {submission && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <p>Versi {submission.version} dikirim {formatDate(submission.submittedAt)}{submission.isLate ? " · Terlambat" : ""}</p>
          {submission.score !== null && <p className="mt-1 font-semibold">Nilai {submission.score}/{assignment.maxScore}</p>}
          {submission.feedback && <p className="mt-1 text-slate-600">Feedback: {submission.feedback}</p>}
          {submission.fileName && (
            <button className={`${smallButton} mt-2`} onClick={() => submissionDownload.mutate(submission.fileName!)}>
              Unduh submission
            </button>
          )}
        </div>
      )}
      {assignment.attachmentFileName && (
        <button className={`${smallButton} mt-3`} disabled={attachment.isPending} onClick={() => attachment.mutate()}>
          {attachment.isPending ? "Mengunduh..." : `Unduh lampiran ${assignment.attachmentFileName}`}
        </button>
      )}
      <button className={`${smallButton} mt-3`} onClick={() => setShowHistory((visible) => !visible)}>
        {showHistory ? "Sembunyikan riwayat" : "Lihat riwayat & audit nilai"}
      </button>
      {showHistory && (
        <div className="mt-3">
          {historyQuery.isLoading ? <p className="text-sm text-slate-500">Memuat riwayat...</p> : historyQuery.error ? (
            <ErrorBanner message={historyQuery.error.message} />
          ) : historyQuery.data?.data.submission ? (
            <div className="space-y-2 text-sm text-slate-600">
              {historyQuery.data.data.submission.versions?.map((version) => (
                <p key={version.version}>
                  Versi {version.version} · {formatDate(version.submittedAt)}{version.isLate ? " · Terlambat" : ""}
                  {version.fileName && (
                    <button className={`${smallButton} ml-2`} onClick={() => submissionVersionDownload.mutate(version)}>
                      Unduh {version.fileName}
                    </button>
                  )}
                </p>
              ))}
              {historyQuery.data.data.submission.gradeHistory?.map((audit: {
                id: string; score: string | number; previousScore: string | number | null; gradedAt: string; grader: { name: string };
              }) => (
                <p key={audit.id}>Nilai {audit.previousScore ?? "belum dinilai"} → {audit.score} oleh {audit.grader.name} · {formatDate(audit.gradedAt)}</p>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Belum ada submission.</p>}
        </div>
      )}
      {submit.error && <ErrorBanner message={submit.error.message} />}
      {attachment.error && <ErrorBanner message={attachment.error.message} />}
      {submissionDownload.error && <ErrorBanner message={submissionDownload.error.message} />}
      {submissionVersionDownload.error && <ErrorBanner message={submissionVersionDownload.error.message} />}
      {canResubmit && (
        <form className="mt-4 space-y-3 border-t border-slate-100 pt-4"
          onSubmit={form.handleSubmit((values) => submit.mutate(values))}>
          <Field label={submission ? "Kirim versi baru (teks)" : "Jawaban teks"}
            error={form.formState.errors.textContent?.message}>
            <textarea rows={4} {...form.register("textContent")} className={inputClassName} />
          </Field>
          <Field label="File opsional (PDF/PNG/JPEG, maks. 10 MB)" error={form.formState.errors.file?.message}>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="mt-1 block w-full text-sm text-slate-600"
              onChange={(event) => form.setValue("file", event.target.files?.[0], { shouldValidate: true })} />
          </Field>
          <button disabled={submit.isPending} className={primaryButton}>
            {submit.isPending ? "Mengirim..." : submission ? "Kirim versi baru" : "Kirim tugas"}
          </button>
        </form>
      )}
    </Panel>
  );
}

function GradeSummary({ section }: { section: ClassSection }) {
  const query = useQuery({
    queryKey: ["grade-summary", section.id],
    queryFn: () => apiRequest<ApiEnvelope<{
      summary: { totalAssignments: number; gradedAssignments: number; earnedScore: number; possibleScore: number; averagePercentage: number | null };
    }>>(`/classes/${section.id}/grades/me`),
  });
  if (query.isLoading) return <Panel title={`${section.course.code} · Nilai`}><LoadingState /></Panel>;
  if (query.error) return <Panel title={`${section.course.code} · Nilai`}><ErrorBanner message={query.error.message} /></Panel>;
  const summary = query.data?.data.summary;
  return (
    <Panel title={`${section.course.code} · Ringkasan nilai`}>
      {!summary || summary.totalAssignments === 0 ? <p className="text-sm text-slate-500">Belum ada tugas.</p> : (
        <p className="text-sm text-slate-700">
          {summary.gradedAssignments}/{summary.totalAssignments} tugas dinilai · {summary.earnedScore}/{summary.possibleScore} poin · Rata-rata {summary.averagePercentage ?? "—"}%
        </p>
      )}
    </Panel>
  );
}

function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = new Date(deadline).getTime() - now;
  if (remaining <= 0) return <>deadline terlewati</>;
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return <>{days} hari {hours} jam {minutes} menit {seconds} detik lagi</>;
}

function PageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <Link to="/dashboard" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">← Dashboard</Link>
      <header className="my-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">CampusHub</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">{description}</p>
      </header>
      {children}
    </main>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
    <h2 className="mb-5 text-lg font-semibold text-slate-900">{title}</h2>{children}
  </section>;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700">{label}{children}
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
  </label>;
}

function LoadingState() {
  return <div className="py-6 text-center text-sm text-slate-500">Memuat data...</div>;
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">{message}</p>;
}

function ErrorState({ message }: { message: string }) {
  return <main className="mx-auto max-w-5xl px-6 py-12"><ErrorBanner message={message} /></main>;
}

function ErrorBanner({ message }: { message: string }) {
  return <p role="alert" className="my-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function localDateTimeValue(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function statusLabel(status: Assignment["studentStatus"]): string {
  if (status === "GRADED") return "Sudah dinilai";
  if (status === "LATE") return "Terlambat";
  if (status === "SUBMITTED") return "Sudah dikumpulkan";
  return "Belum dikumpulkan";
}

const inputClassName = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const primaryButton = "rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const smallButton = "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
