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
  id: string;
  code: string;
  name: string;
  credits: number;
}

interface Semester {
  id: string;
  name: string;
}

interface Lecturer {
  id: string;
  name: string;
  email: string;
}

interface ClassSection {
  id: string;
  name: string;
  capacity: number;
  course: Course;
  semester: Semester;
  lecturer: Lecturer;
  _count: { enrollments: number };
}

interface Material {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  contentType: string;
  createdAt: string;
}

interface QuerySnapshot<T> {
  data?: T;
  error: Error | null;
  isLoading: boolean;
}

const courseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Gunakan huruf, angka, atau tanda hubung."),
  name: z.string().trim().min(3).max(120),
  credits: z.coerce.number().int().min(1).max(8),
});
type CourseValues = z.infer<typeof courseSchema>;

const sectionSchema = z.object({
  courseId: z.string().uuid("Pilih mata kuliah."),
  semesterId: z.string().uuid("Pilih semester."),
  lecturerId: z.string().uuid("Pilih dosen."),
  name: z.string().trim().min(1).max(40),
  capacity: z.coerce.number().int().min(1).max(500),
});
type SectionValues = z.infer<typeof sectionSchema>;

const materialSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().max(2000),
  file: z
    .custom<File>((file) => file instanceof File, "Pilih file materi.")
    .refine((file) => file.size <= 10 * 1024 * 1024, "Ukuran file maksimal 10 MB.")
    .refine((file) => {
      const expected: Record<string, string> = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
      };
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      return expected[extension] === file.type;
    }, "Pilih PDF, PNG, atau JPEG dengan tipe file yang sesuai."),
});
type MaterialValues = z.infer<typeof materialSchema>;

const materialEditSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().max(2000),
});
type MaterialEditValues = z.infer<typeof materialEditSchema>;

export function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<Course>>>("/courses?pageSize=100"),
  });
  const sectionsQuery = useQuery({
    queryKey: ["admin-classes"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<ClassSection>>>("/classes?pageSize=100"),
  });
  const semestersQuery = useQuery({
    queryKey: ["semesters"],
    queryFn: () => apiRequest<ApiEnvelope<{ semesters: Semester[] }>>("/classes/semesters"),
  });
  const lecturersQuery = useQuery({
    queryKey: ["lecturers"],
    queryFn: () => apiRequest<ApiEnvelope<{ lecturers: Lecturer[] }>>("/classes/lecturers"),
  });
  const courseForm = useForm<z.input<typeof courseSchema>, unknown, CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: { code: "", name: "", credits: 3 },
  });
  const sectionForm = useForm<z.input<typeof sectionSchema>, unknown, SectionValues>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { courseId: "", semesterId: "", lecturerId: "", name: "A", capacity: 60 },
  });

  useEffect(() => {
    if (!editingCourse) courseForm.reset({ code: "", name: "", credits: 3 });
    else
      courseForm.reset({
        code: editingCourse.code,
        name: editingCourse.name,
        credits: editingCourse.credits,
      });
  }, [courseForm, editingCourse]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["courses"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] }),
    ]);
  };
  const courseMutation = useMutation({
    mutationFn: (values: CourseValues) =>
      editingCourse
        ? apiRequest(`/courses/${editingCourse.id}`, {
            method: "PATCH",
            body: JSON.stringify(values),
          })
        : apiRequest("/courses", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await invalidate();
      setEditingCourse(null);
      courseForm.reset({ code: "", name: "", credits: 3 });
    },
  });
  const deleteCourse = useMutation({
    mutationFn: (id: string) => apiRequest(`/courses/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const createSection = useMutation({
    mutationFn: (values: SectionValues) =>
      apiRequest("/classes", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      sectionForm.reset({ courseId: "", semesterId: "", lecturerId: "", name: "A", capacity: 60 });
      await invalidate();
    },
  });
  const deleteSection = useMutation({
    mutationFn: (id: string) => apiRequest(`/classes/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const updateCapacity = useMutation({
    mutationFn: ({ id, capacity }: { id: string; capacity: number }) =>
      apiRequest(`/classes/${id}`, { method: "PATCH", body: JSON.stringify({ capacity }) }),
    onSuccess: invalidate,
  });

  const loadError =
    coursesQuery.error ?? sectionsQuery.error ?? semestersQuery.error ?? lecturersQuery.error;
  const mutationError =
    courseMutation.error ??
    deleteCourse.error ??
    createSection.error ??
    deleteSection.error ??
    updateCapacity.error;
  if (
    [coursesQuery, sectionsQuery, semestersQuery, lecturersQuery].some((query) => query.isLoading)
  ) {
    return <LoadingState />;
  }
  if (loadError) return <ErrorState message={loadError.message} />;
  const courses = coursesQuery.data?.data.items ?? [];
  const sections = sectionsQuery.data?.data.items ?? [];
  const semesters = semestersQuery.data?.data.semesters ?? [];
  const lecturers = lecturersQuery.data?.data.lecturers ?? [];

  return (
    <PageShell
      title="Manajemen mata kuliah & kelas"
      description="Kelola katalog, semester, dosen pengampu, dan kapasitas kelas."
    >
      {mutationError && <ErrorBanner message={mutationError.message} />}
      <section className="grid gap-8 lg:grid-cols-2">
        <Panel title={editingCourse ? "Ubah mata kuliah" : "Tambah mata kuliah"}>
          <form
            className="space-y-3"
            onSubmit={courseForm.handleSubmit((values) => courseMutation.mutate(values))}
          >
            <Field label="Kode" error={courseForm.formState.errors.code?.message}>
              <input {...courseForm.register("code")} className={inputClassName} />
            </Field>
            <Field label="Nama" error={courseForm.formState.errors.name?.message}>
              <input {...courseForm.register("name")} className={inputClassName} />
            </Field>
            <Field label="SKS" error={courseForm.formState.errors.credits?.message}>
              <input
                type="number"
                min="1"
                max="8"
                {...courseForm.register("credits")}
                className={inputClassName}
              />
            </Field>
            <div className="flex gap-2">
              <button disabled={courseMutation.isPending} className={primaryButton}>
                {courseMutation.isPending
                  ? "Menyimpan..."
                  : editingCourse
                    ? "Simpan perubahan"
                    : "Tambah mata kuliah"}
              </button>
              {editingCourse && (
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className={secondaryButton}
                >
                  Batal
                </button>
              )}
            </div>
          </form>
          <div className="mt-6 space-y-3">
            {courses.length === 0 ? (
              <EmptyState message="Belum ada mata kuliah." />
            ) : (
              courses.map((course) => (
                <div
                  key={course.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"
                >
                  <div>
                    <strong>{course.code}</strong>
                    <p className="text-sm text-slate-600">
                      {course.name} · {course.credits} SKS
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className={smallButton} onClick={() => setEditingCourse(course)}>
                      Ubah
                    </button>
                    <button
                      className={dangerButton}
                      disabled={deleteCourse.isPending}
                      onClick={() => deleteCourse.mutate(course.id)}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Buka kelas">
          <form
            className="space-y-3"
            onSubmit={sectionForm.handleSubmit((values) => createSection.mutate(values))}
          >
            <Field label="Mata kuliah" error={sectionForm.formState.errors.courseId?.message}>
              <select {...sectionForm.register("courseId")} className={inputClassName}>
                <option value="">Pilih mata kuliah</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} — {course.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Semester" error={sectionForm.formState.errors.semesterId?.message}>
              <select {...sectionForm.register("semesterId")} className={inputClassName}>
                <option value="">Pilih semester</option>
                {semesters.map((semester) => (
                  <option key={semester.id} value={semester.id}>
                    {semester.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dosen pengampu" error={sectionForm.formState.errors.lecturerId?.message}>
              <select {...sectionForm.register("lecturerId")} className={inputClassName}>
                <option value="">Pilih dosen</option>
                {lecturers.map((lecturer) => (
                  <option key={lecturer.id} value={lecturer.id}>
                    {lecturer.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama kelas" error={sectionForm.formState.errors.name?.message}>
                <input {...sectionForm.register("name")} className={inputClassName} />
              </Field>
              <Field label="Kapasitas" error={sectionForm.formState.errors.capacity?.message}>
                <input
                  type="number"
                  min="1"
                  max="500"
                  {...sectionForm.register("capacity")}
                  className={inputClassName}
                />
              </Field>
            </div>
            <button
              disabled={
                createSection.isPending || !courses.length || !semesters.length || !lecturers.length
              }
              className={primaryButton}
            >
              {createSection.isPending ? "Membuat..." : "Buat kelas"}
            </button>
          </form>
        </Panel>
      </section>

      <Panel title="Kelas aktif" className="mt-8">
        {sections.length === 0 ? (
          <EmptyState message="Belum ada kelas." />
        ) : (
          <div className="divide-y divide-slate-100">
            {sections.map((section) => (
              <div
                key={section.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div>
                  <strong>
                    {section.course.code} · Kelas {section.name}
                  </strong>
                  <p className="text-sm text-slate-600">
                    {section.semester.name} · {section.lecturer.name} · {section._count.enrollments}
                    /{section.capacity} mahasiswa
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Kapasitas kelas ${section.course.code} ${section.name}`}
                    type="number"
                    min={Math.max(1, section._count.enrollments)}
                    defaultValue={section.capacity}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1.5"
                    onBlur={(event) => {
                      const capacity = Number(event.currentTarget.value);
                      if (capacity !== section.capacity && capacity >= section._count.enrollments) {
                        updateCapacity.mutate({ id: section.id, capacity });
                      }
                    }}
                  />
                  <button
                    className={dangerButton}
                    disabled={deleteSection.isPending}
                    onClick={() => deleteSection.mutate(section.id)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

export function LecturerClassesPage() {
  const queryClient = useQueryClient();
  const classesQuery = useQuery({
    queryKey: ["lecturer-classes"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<ClassSection>>>("/classes/mine?pageSize=100"),
  });
  if (classesQuery.isLoading) return <LoadingState />;
  if (classesQuery.error) return <ErrorState message={classesQuery.error.message} />;
  const classes = classesQuery.data?.data.items ?? [];

  return (
    <PageShell
      title="Kelas yang kuampu"
      description="Bagikan materi pembelajaran hanya kepada mahasiswa terdaftar."
    >
      {classes.length === 0 ? (
        <EmptyState message="Belum ada kelas yang diampu." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {classes.map((classSection) => (
            <LecturerClassCard
              key={classSection.id}
              section={classSection}
              onChanged={() =>
                queryClient.invalidateQueries({ queryKey: ["materials", classSection.id] })
              }
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function LecturerClassCard({ section, onChanged }: { section: ClassSection; onChanged(): void }) {
  const materialsQuery = useQuery({
    queryKey: ["materials", section.id],
    queryFn: () =>
      apiRequest<ApiEnvelope<PageResult<Material>>>(`/classes/${section.id}/materials`),
  });
  const form = useForm<MaterialValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: { title: "", description: "" },
  });
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const editForm = useForm<MaterialEditValues>({ resolver: zodResolver(materialEditSchema) });
  useEffect(() => {
    if (editingMaterial) {
      editForm.reset({
        title: editingMaterial.title,
        description: editingMaterial.description ?? "",
      });
    }
  }, [editingMaterial, editForm]);
  const upload = useMutation({
    mutationFn: (values: MaterialValues) => {
      const body = new FormData();
      body.append("title", values.title);
      body.append("description", values.description);
      body.append("file", values.file);
      return apiRequest(`/classes/${section.id}/materials`, { method: "POST", body });
    },
    onSuccess: () => {
      form.reset({ title: "", description: "" });
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: (materialId: string) =>
      apiRequest(`/materials/${materialId}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const updateMaterial = useMutation({
    mutationFn: (values: MaterialEditValues) =>
      apiRequest(`/materials/${editingMaterial?.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      setEditingMaterial(null);
      onChanged();
    },
  });

  return (
    <Panel title={`${section.course.code} · Kelas ${section.name}`}>
      <p className="mb-4 text-sm text-slate-600">
        {section.semester.name} · {section._count.enrollments}/{section.capacity} mahasiswa
      </p>
      {upload.error && <ErrorBanner message={upload.error.message} />}
      {updateMaterial.error && <ErrorBanner message={updateMaterial.error.message} />}
      {editingMaterial && (
        <form
          className="mb-5 space-y-3 rounded-lg bg-slate-50 p-4"
          onSubmit={editForm.handleSubmit((values) => updateMaterial.mutate(values))}
        >
          <p className="text-sm font-semibold text-slate-800">
            Ubah materi: {editingMaterial.fileName}
          </p>
          <Field label="Judul" error={editForm.formState.errors.title?.message}>
            <input {...editForm.register("title")} className={inputClassName} />
          </Field>
          <Field label="Deskripsi" error={editForm.formState.errors.description?.message}>
            <textarea {...editForm.register("description")} rows={2} className={inputClassName} />
          </Field>
          <div className="flex gap-2">
            <button disabled={updateMaterial.isPending} className={primaryButton}>
              {updateMaterial.isPending ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setEditingMaterial(null)}
            >
              Batal
            </button>
          </div>
        </form>
      )}
      <form className="space-y-3" onSubmit={form.handleSubmit((values) => upload.mutate(values))}>
        <Field label="Judul materi" error={form.formState.errors.title?.message}>
          <input {...form.register("title")} className={inputClassName} />
        </Field>
        <Field label="Deskripsi" error={form.formState.errors.description?.message}>
          <textarea {...form.register("description")} rows={2} className={inputClassName} />
        </Field>
        <Field label="File PDF/PNG/JPEG (maks. 10 MB)" error={form.formState.errors.file?.message}>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="mt-1 block w-full text-sm text-slate-600"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) form.setValue("file", file, { shouldValidate: true });
            }}
          />
        </Field>
        <button disabled={upload.isPending} className={primaryButton}>
          {upload.isPending ? "Mengunggah..." : "Unggah materi"}
        </button>
      </form>
      <MaterialList
        query={materialsQuery}
        onDelete={(material) => remove.mutate(material.id)}
        onEdit={setEditingMaterial}
        deleting={remove.isPending}
        canDelete
        canEdit
      />
      {remove.error && <ErrorBanner message={remove.error.message} />}
    </Panel>
  );
}

export function StudentClassesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const semestersQuery = useQuery({
    queryKey: ["semesters"],
    queryFn: () => apiRequest<ApiEnvelope<{ semesters: Semester[] }>>("/classes/semesters"),
  });
  const catalogQuery = useQuery({
    queryKey: ["class-catalog", search, semesterId],
    queryFn: () =>
      apiRequest<ApiEnvelope<PageResult<ClassSection>>>(
        `/classes?pageSize=100${search ? `&q=${encodeURIComponent(search)}` : ""}${semesterId ? `&semesterId=${semesterId}` : ""}`,
      ),
  });
  const mineQuery = useQuery({
    queryKey: ["student-classes"],
    queryFn: () => apiRequest<ApiEnvelope<PageResult<ClassSection>>>("/classes/mine?pageSize=100"),
  });
  const enrollment = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "enroll" | "unenroll" }) =>
      apiRequest(`/classes/${id}/enrollments/me`, {
        method: action === "enroll" ? "POST" : "DELETE",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student-classes"] }),
        queryClient.invalidateQueries({ queryKey: ["class-catalog"] }),
      ]);
    },
  });

  if ([semestersQuery, catalogQuery, mineQuery].some((query) => query.isLoading))
    return <LoadingState />;
  const queryError = semestersQuery.error ?? catalogQuery.error ?? mineQuery.error;
  if (queryError) return <ErrorState message={queryError.message} />;
  const semesters = semestersQuery.data?.data.semesters ?? [];
  const catalog = catalogQuery.data?.data.items ?? [];
  const enrolled = mineQuery.data?.data.items ?? [];

  return (
    <PageShell
      title="Kelas saya"
      description="Cari kelas semester ini, lalu kelola kelas yang sudah diikuti."
    >
      {enrollment.error && <ErrorBanner message={enrollment.error.message} />}
      <Panel title="Kelas yang diikuti">
        {enrolled.length === 0 ? (
          <EmptyState message="Kamu belum terdaftar di kelas mana pun." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {enrolled.map((section) => (
              <div key={section.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {section.course.code} · Kelas {section.name}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {section.course.name} · {section.semester.name}
                    </p>
                  </div>
                  <button
                    className={smallButton}
                    disabled={enrollment.isPending}
                    onClick={() => enrollment.mutate({ id: section.id, action: "unenroll" })}
                  >
                    Keluar kelas
                  </button>
                </div>
                <EnrolledMaterials section={section} />
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Katalog kelas" className="mt-8">
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau kode mata kuliah"
            className={inputClassName}
          />
          <select
            value={semesterId}
            onChange={(event) => setSemesterId(event.target.value)}
            className={inputClassName}
          >
            <option value="">Semua semester</option>
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.name}
              </option>
            ))}
          </select>
        </div>
        {catalog.length === 0 ? (
          <EmptyState message="Tidak ada kelas tersedia untuk filter ini." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {catalog.map((section) => (
              <div key={section.id} className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900">
                  {section.course.code} · Kelas {section.name}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {section.course.name} · {section.course.credits} SKS
                </p>
                <p className="text-sm text-slate-600">
                  {section.semester.name} · {section.lecturer.name}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {section._count.enrollments}/{section.capacity} mahasiswa
                </p>
                <button
                  className={`${primaryButton} mt-3`}
                  disabled={enrollment.isPending || section._count.enrollments >= section.capacity}
                  onClick={() => enrollment.mutate({ id: section.id, action: "enroll" })}
                >
                  {section._count.enrollments >= section.capacity ? "Kelas penuh" : "Enroll"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

function EnrolledMaterials({ section }: { section: ClassSection }) {
  const query = useQuery({
    queryKey: ["materials", section.id],
    queryFn: () =>
      apiRequest<ApiEnvelope<PageResult<Material>>>(`/classes/${section.id}/materials`),
  });
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h4 className="text-sm font-semibold text-slate-700">Materi</h4>
      <MaterialList query={query} />
    </div>
  );
}

function MaterialList({
  query,
  onDelete,
  onEdit,
  deleting,
  canDelete = false,
  canEdit = false,
}: {
  query: QuerySnapshot<ApiEnvelope<PageResult<Material>>>;
  onDelete?(material: Material): void;
  onEdit?(material: Material): void;
  deleting?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
}) {
  const download = useMutation({
    mutationFn: (material: Material) =>
      downloadFile(`/materials/${material.id}/download`, material.fileName),
  });
  if (query.isLoading) return <p className="mt-4 text-sm text-slate-500">Memuat materi...</p>;
  if (query.error)
    return (
      <p role="alert" className="mt-4 text-sm text-red-700">
        {query.error.message}
      </p>
    );
  const materials = query.data?.data.items ?? [];
  if (!materials.length) return <p className="mt-4 text-sm text-slate-500">Belum ada materi.</p>;
  return (
    <>
      {download.error && <ErrorBanner message={download.error.message} />}
      <ul className="mt-4 space-y-2">
        {materials.map((material) => (
          <li
            key={material.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2"
          >
            <div>
              <p className="text-sm font-medium text-slate-800">{material.title}</p>
              <p className="text-xs text-slate-500">{material.fileName}</p>
            </div>
            <div className="flex gap-2">
              <button
                className={smallButton}
                disabled={download.isPending}
                onClick={() => download.mutate(material)}
              >
                {download.isPending ? "Mengunduh..." : "Unduh"}
              </button>
              {canEdit && onEdit && (
                <button className={smallButton} onClick={() => onEdit(material)}>
                  Ubah
                </button>
              )}
              {canDelete && onDelete && (
                <button
                  className={dangerButton}
                  disabled={deleting}
                  onClick={() => onDelete(material)}
                >
                  Hapus
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
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
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
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
    <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
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
  return <main className="grid min-h-64 place-items-center text-slate-600">Memuat data...</main>;
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
    <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

const inputClassName =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const primaryButton =
  "rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";
const smallButton =
  "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50";
const dangerButton =
  "rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50";
