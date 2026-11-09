export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "CampusHub API",
    version: "0.4.0",
    description: "API autentikasi, kelas, materi, tugas, penilaian, dan absensi QR CampusHub.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "refreshToken" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
      },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        summary: "Daftar sebagai mahasiswa",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 100 },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 12, maxLength: 128 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Akun dibuat; refresh token dipasang sebagai cookie HttpOnly." } },
      },
    },
    "/auth/login": {
      post: {
        summary: "Login",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } } } },
        },
        responses: { "200": { description: "Access token dan cookie refresh." }, "401": { description: "Credential salah." } },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Rotasi refresh token",
        security: [{ refreshCookie: [] }],
        responses: { "200": { description: "Refresh token lama dicabut dan diganti." }, "401": { description: "Refresh token tidak valid." } },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Logout dan cabut refresh token",
        security: [{ refreshCookie: [] }],
        responses: { "200": { description: "Sesi diakhiri." } },
      },
    },
    "/auth/me": {
      get: {
        summary: "Profil pengguna saat ini",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Profil pengguna dan role." }, "401": { description: "Access token tidak valid." } },
      },
    },
    "/courses": {
      get: {
        summary: "Cari mata kuliah",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "query", name: "q", schema: { type: "string" } },
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: { "200": { description: "Daftar mata kuliah terpaginasikan." } },
      },
      post: {
        summary: "Buat mata kuliah (Admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code", "name", "credits"],
                properties: {
                  code: { type: "string", example: "IF301" },
                  name: { type: "string" },
                  credits: { type: "integer", minimum: 1, maximum: 8 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Mata kuliah dibuat." }, "409": { description: "Kode duplikat." } },
      },
    },
    "/courses/{courseId}": {
      get: {
        summary: "Detail mata kuliah",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "courseId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Mata kuliah." }, "404": { description: "Tidak ditemukan." } },
      },
      patch: {
        summary: "Ubah mata kuliah (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "courseId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Mata kuliah diperbarui." } },
      },
      delete: {
        summary: "Hapus mata kuliah tanpa kelas (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "courseId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "204": { description: "Mata kuliah dihapus." }, "409": { description: "Mata kuliah masih memiliki kelas." } },
      },
    },
    "/classes": {
      get: {
        summary: "Daftar katalog kelas, disaring berdasarkan peran pengguna",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "query", name: "q", schema: { type: "string" } },
          { in: "query", name: "semesterId", schema: { type: "string", format: "uuid" } },
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { in: "query", name: "enrolled", schema: { type: "boolean" }, description: "Mahasiswa: true untuk kelas terdaftar." },
        ],
        responses: { "200": { description: "Kelas beserta kapasitas, dosen, dan semester." } },
      },
      post: {
        summary: "Buat kelas (Admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["courseId", "semesterId", "lecturerId", "name"],
                properties: {
                  courseId: { type: "string", format: "uuid" },
                  semesterId: { type: "string", format: "uuid" },
                  lecturerId: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  capacity: { type: "integer", minimum: 1, maximum: 500, default: 60 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Kelas dibuat." } },
      },
    },
    "/classes/mine": {
      get: {
        summary: "Kelas yang diajar atau diikuti pengguna",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Daftar kelas pengguna." } },
      },
    },
    "/classes/semesters": {
      get: {
        summary: "Daftar semester untuk filter",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Daftar semester." } },
      },
    },
    "/classes/lecturers": {
      get: {
        summary: "Daftar dosen untuk penetapan kelas (Admin)",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Daftar dosen." }, "403": { description: "Khusus Admin." } },
      },
    },
    "/classes/{classId}": {
      get: {
        summary: "Detail kelas (mahasiswa harus terdaftar; dosen harus pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Detail kelas." }, "403": { description: "Tidak memiliki akses." } },
      },
      patch: {
        summary: "Ubah kelas (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Kelas diperbarui." }, "409": { description: "Kapasitas di bawah enrollment saat ini." } },
      },
      delete: {
        summary: "Hapus kelas kosong (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "204": { description: "Kelas dihapus." } },
      },
    },
    "/classes/{classId}/enrollments/me": {
      post: {
        summary: "Enroll mahasiswa ke kelas",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "201": { description: "Enrollment dibuat." }, "409": { description: "Duplikat atau kelas penuh." } },
      },
      delete: {
        summary: "Unenroll mahasiswa dari kelas",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "204": { description: "Enrollment dihapus." } },
      },
    },
    "/classes/{classId}/materials": {
      get: {
        summary: "Daftar materi (mahasiswa harus terdaftar; dosen harus pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Materi terpaginasikan." }, "403": { description: "Tidak memiliki akses." } },
      },
      post: {
        summary: "Upload materi PDF/PNG/JPEG, maksimal 10 MB (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["title", "file"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  file: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Materi dibuat." }, "400": { description: "Jenis file tidak valid." }, "413": { description: "File terlalu besar." } },
      },
    },
    "/materials/{materialId}": {
      patch: {
        summary: "Ubah metadata atau file materi (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "materialId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Materi diperbarui." }, "403": { description: "Dosen bukan pengampu." } },
      },
      delete: {
        summary: "Hapus materi (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "materialId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "204": { description: "Materi dihapus." }, "403": { description: "Dosen bukan pengampu." } },
      },
    },
    "/materials/{materialId}/download": {
      get: {
        summary: "Download materi dengan pemeriksaan enrollment atau kepemilikan kelas",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "materialId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "File materi." }, "403": { description: "Tidak memiliki akses." } },
      },
    },
    "/classes/{classId}/assignments": {
      post: {
        summary: "Buat tugas pada kelas yang diampu dosen",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["title", "deadline"],
                properties: {
                  title: { type: "string", maxLength: 160 },
                  description: { type: "string", maxLength: 5000 },
                  deadline: { type: "string", format: "date-time" },
                  maxScore: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
                  allowLate: { type: "boolean", default: false },
                  file: { type: "string", format: "binary", description: "Lampiran opsional PDF, PNG, atau JPEG; maksimal 10 MB." },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Tugas dibuat." }, "403": { description: "Dosen bukan pengampu kelas." } },
      },
    },
    "/assignments": {
      get: {
        summary: "Daftar tugas kelas yang diajar atau diikuti",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "query", name: "classId", schema: { type: "string", format: "uuid" } },
          { in: "query", name: "status", schema: { type: "string", enum: ["NOT_SUBMITTED", "SUBMITTED", "LATE", "GRADED"] } },
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: { "200": { description: "Daftar tugas terpaginasikan beserta status mahasiswa." } },
      },
    },
    "/assignments/{assignmentId}": {
      get: {
        summary: "Detail tugas (dosen pengampu atau mahasiswa terdaftar)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Tugas." }, "403": { description: "Tidak memiliki akses." } },
      },
      patch: {
        summary: "Ubah tugas atau lampiran (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Tugas diperbarui." }, "409": { description: "Nilai maksimal lebih kecil dari nilai yang sudah diberikan." } },
      },
      delete: {
        summary: "Hapus tugas beserta riwayat submission (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "204": { description: "Tugas dihapus." } },
      },
    },
    "/assignments/{assignmentId}/submissions/me": {
      get: {
        summary: "Lihat submission sendiri beserta riwayat versi dan audit nilai",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Submission pribadi atau null jika belum mengumpulkan." } },
      },
      post: {
        summary: "Kirim atau kumpulkan ulang tugas sebelum deadline",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  textContent: { type: "string", maxLength: 20000 },
                  file: { type: "string", format: "binary", description: "File opsional PDF, PNG, atau JPEG; wajib isi file atau teks." },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Submission dibuat atau versinya diperbarui." }, "409": { description: "Deadline terlewati atau kebijakan menolak submission terlambat." } },
      },
    },
    "/assignments/{assignmentId}/submissions": {
      get: {
        summary: "Daftar submission dan versi untuk tugas yang diajar",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "query", name: "status", schema: { type: "string", enum: ["SUBMITTED", "LATE", "GRADED"] } },
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: { "200": { description: "Submission terpaginasikan." }, "403": { description: "Dosen bukan pengampu." } },
      },
    },
    "/assignments/{assignmentId}/submissions/{submissionId}/grade": {
      patch: {
        summary: "Beri atau ubah nilai dan feedback (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "path", name: "submissionId", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["score"], properties: { score: { type: "number", minimum: 0, maximum: 1000 }, feedback: { type: "string", maxLength: 5000 } } } } },
        },
        responses: { "200": { description: "Nilai disimpan dan audit dibuat." }, "400": { description: "Nilai di luar rentang tugas." } },
      },
    },
    "/assignments/{assignmentId}/attachment": {
      get: {
        summary: "Download lampiran tugas dengan pemeriksaan akses kelas",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "File lampiran." }, "403": { description: "Tidak memiliki akses." } },
      },
    },
    "/assignments/{assignmentId}/submissions/{submissionId}/file": {
      get: {
        summary: "Download file submission (mahasiswa pemilik atau dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "path", name: "submissionId", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "File submission." }, "403": { description: "Tidak memiliki akses." } },
      },
    },
    "/assignments/{assignmentId}/submissions/{submissionId}/versions/{versionId}/file": {
      get: {
        summary: "Download versi historis submission dengan pemeriksaan pemilik atau dosen",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "assignmentId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "path", name: "submissionId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "path", name: "versionId", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "File versi submission." }, "403": { description: "Tidak memiliki akses." } },
      },
    },
    "/classes/{classId}/grades/me": {
      get: {
        summary: "Ringkasan nilai mahasiswa pada kelas terdaftar",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Nilai per tugas dan agregat kelas." }, "403": { description: "Mahasiswa tidak terdaftar." } },
      },
    },
    "/classes/{classId}/attendance/sessions": {
      get: {
        summary: "Daftar sesi absensi kelas yang diampu dosen",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: { "200": { description: "Riwayat sesi beserta rekap status." }, "403": { description: "Dosen bukan pengampu." } },
      },
      post: {
        summary: "Buka sesi absensi (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "durationMinutes"],
                properties: {
                  title: { type: "string", minLength: 2, maxLength: 160 },
                  durationMinutes: { type: "integer", minimum: 1, maximum: 240 },
                  lateAfterMinutes: { type: "integer", minimum: 0, maximum: 240, default: 10 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Sesi dibuka." }, "403": { description: "Dosen bukan pengampu." }, "409": { description: "Sudah ada sesi aktif." } },
      },
    },
    "/attendance/sessions/{sessionId}/qr": {
      get: {
        summary: "Ambil token QR aktif berumur maksimal 30 detik (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "sessionId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Token QR yang terikat ke sesi dan slot rotasi saat ini." }, "403": { description: "Dosen bukan pengampu." }, "409": { description: "Sesi ditutup atau kedaluwarsa." } },
      },
    },
    "/attendance/sessions/{sessionId}/close": {
      post: {
        summary: "Tutup sesi absensi (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "sessionId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Sesi ditutup." }, "403": { description: "Dosen bukan pengampu." }, "409": { description: "Sesi sudah ditutup." } },
      },
    },
    "/attendance/check-in": {
      post: {
        summary: "Check-in satu kali dengan token QR sesi yang masih berlaku (mahasiswa terdaftar)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sessionId", "token"],
                properties: {
                  sessionId: { type: "string", format: "uuid" },
                  token: { type: "string", description: "JWT bertanda tangan server; hanya berlaku pada slot 30 detik saat ini." },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Check-in tercatat dengan waktu server." }, "401": { description: "Token QR tidak valid atau kedaluwarsa." }, "403": { description: "Mahasiswa tidak terdaftar di kelas." }, "409": { description: "Sesi tidak aktif, token untuk sesi lain, atau sudah check-in." }, "429": { description: "Batas percobaan check-in tercapai." } },
      },
    },
    "/attendance/me": {
      get: {
        summary: "Riwayat kehadiran mahasiswa sendiri",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "query", name: "classId", schema: { type: "string", format: "uuid" } },
          { in: "query", name: "sessionId", schema: { type: "string", format: "uuid" } },
          { in: "query", name: "status", schema: { type: "string", enum: ["PRESENT", "LATE", "EXCUSED", "SICK", "ABSENT"] } },
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: { "200": { description: "Riwayat sesi dan status mahasiswa yang sedang login." } },
      },
    },
    "/classes/{classId}/attendance/me": {
      get: {
        summary: "Rekap persentase kehadiran mahasiswa pada kelas terdaftar",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Daftar sesi dan persentase kehadiran." }, "403": { description: "Mahasiswa tidak terdaftar." } },
      },
    },
    "/attendance/sessions/{sessionId}/records": {
      get: {
        summary: "Daftar roster dan status sesi secara paginasi (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "query", name: "status", schema: { type: "string", enum: ["PRESENT", "LATE", "EXCUSED", "SICK", "ABSENT"] } },
          { in: "query", name: "studentId", schema: { type: "string", format: "uuid" } },
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          { in: "query", name: "pageSize", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: { "200": { description: "Roster, audit perubahan status terbaru, dan hitungan seluruh roster." }, "403": { description: "Dosen bukan pengampu." } },
      },
    },
    "/attendance/sessions/{sessionId}/records/{studentId}": {
      patch: {
        summary: "Ubah status kehadiran manual dengan audit (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "sessionId", required: true, schema: { type: "string", format: "uuid" } },
          { in: "path", name: "studentId", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { type: "string", enum: ["PRESENT", "LATE", "EXCUSED", "SICK", "ABSENT"] },
                  reason: { type: "string", maxLength: 500 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Status diperbarui dan audit dicatat." }, "403": { description: "Dosen bukan pengampu." }, "404": { description: "Mahasiswa tidak terdaftar." } },
      },
    },
    "/attendance/sessions/{sessionId}/export.csv": {
      get: {
        summary: "Ekspor roster satu sesi ke CSV yang aman dari formula injection (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "sessionId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "CSV dengan UTF-8 BOM dan escaping formula." }, "403": { description: "Dosen bukan pengampu." } },
      },
    },
    "/classes/{classId}/attendance/export.csv": {
      get: {
        summary: "Ekspor seluruh sesi dan roster kelas ke CSV (dosen pengampu)",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "classId", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "CSV dengan UTF-8 BOM dan escaping formula." }, "403": { description: "Dosen bukan pengampu." } },
      },
    },
  },
};
