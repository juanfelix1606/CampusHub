export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "CampusHub API",
    version: "0.3.0",
    description: "API autentikasi, katalog mata kuliah, kelas, enrollment, dan materi CampusHub.",
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
  },
};
