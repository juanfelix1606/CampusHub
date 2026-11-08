# CampusHub

CampusHub adalah proyek portofolio sistem informasi kampus yang menggabungkan LMS sederhana dan absensi berbasis QR. Proyek ini dibangun sebagai monorepo TypeScript dengan React/Vite, Express, PostgreSQL, dan Prisma.

## Status

Fase 1-3: fondasi monorepo, autentikasi/RBAC, pengelolaan mata kuliah dan kelas, enrollment, serta materi.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, Recharts
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL 16, Prisma ORM
- Proteksi dasar API: Helmet, CORS allowlist, rate limiting

## Prasyarat

- Node.js 20.19+ dan npm
- Docker Desktop dengan Docker Compose

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env`, atur `DEMO_PASSWORD` menjadi password lokal sementara (minimal 12 karakter), dan isi `JWT_ACCESS_SECRET` dengan secret acak minimal 32 karakter. Generate secret dengan `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Nilai PostgreSQL di file tersebut harus sama dengan konfigurasi Compose.
2. Jalankan PostgreSQL: `docker compose up -d db`
3. Instal dependency: `npm install`
4. Buat Prisma Client: `npm run db:generate`
5. Terapkan migrasi lokal: `npm run db:migrate`
6. Isi data demo: `npm run db:seed`
7. Jalankan API: `npm run dev`
8. Di terminal lain jalankan frontend: `npm run dev:web`

API health check tersedia di `http://localhost:3000/api/v1/health`; frontend di `http://localhost:5173`.

### Akun seed lokal

Seed membuat akun berikut; seluruh akun memakai nilai `DEMO_PASSWORD` dari `.env`:

- Admin: `admin@campushub.local`
- Dosen: `dosen@campushub.local`
- Mahasiswa: `mahasiswa1@campushub.local`, `mahasiswa2@campushub.local`

Akun dan password tersebut hanya untuk development/demo lokal. Jangan gunakan password produksi atau data pribadi.

## Mata kuliah, kelas, dan materi (Fase 3)

- Admin dapat membuat/mengubah/menghapus mata kuliah serta membuka kelas pada semester tertentu, menetapkan dosen, dan mengatur kapasitas.
- Dosen hanya dapat mengelola materi kelas yang diampu; mahasiswa hanya dapat melihat materi setelah enrollment.
- Katalog kelas mendukung `q`, `semesterId`, `page`, dan `pageSize`; ukuran halaman maksimal 100.
- Enrollment dilindungi unique constraint database dan row lock PostgreSQL saat menghitung kapasitas.
- File materi lokal dibatasi 10 MB dan mendukung PDF, PNG, serta JPEG. Ekstensi, MIME type, dan magic bytes diverifikasi; file disimpan memakai nama acak melalui interface `FileStorage`.
- API docs tersedia di `http://localhost:3000/api/docs`.

### Endpoint utama

| Method | Path | Akses |
|---|---|---|
| `GET/POST` | `/api/v1/courses` | Semua role terautentikasi / Admin |
| `PATCH/DELETE` | `/api/v1/courses/:courseId` | Admin |
| `GET` | `/api/v1/classes`, `/mine`, `/semesters` | Semua role; hasil disaring per role |
| `POST` | `/api/v1/classes` | Admin |
| `PATCH/DELETE` | `/api/v1/classes/:classId` | Admin |
| `POST/DELETE` | `/api/v1/classes/:classId/enrollments/me` | Mahasiswa |
| `GET/POST` | `/api/v1/classes/:classId/materials` | Peserta kelas / Dosen pengampu |
| `PATCH/DELETE` | `/api/v1/materials/:materialId` | Dosen pengampu |
| `GET` | `/api/v1/materials/:materialId/download` | Peserta kelas, Dosen pengampu, Admin |

### Testing

- Unit: `npm run test:unit`
- Integration dengan PostgreSQL terpisah: mulai `docker compose --profile test up -d db-test`, pastikan `TEST_DATABASE_URL` menunjuk ke database bernama `*_test`, lalu `npm run test:integration`. Migrasi test dijalankan otomatis; suite menolak URL database yang tidak berakhiran `_test`.
- `npm test` menjalankan unit test saja. Integration test memodifikasi database khusus yang URL-nya disediakan; jangan arahkan ke database development/production.

## Struktur

```text
apps/
  api/
    prisma/       # Schema, migrasi, seed
    src/          # API
  web/
    src/          # React app
docker-compose.yml
```

## Autentikasi (Fase 2)

- API: `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`; `GET /api/v1/auth/me`.
- Registrasi publik hanya dapat membuat role `STUDENT`; role diambil dari server, bukan dari input client.
- Access JWT berlaku 15 menit. Refresh token acak disimpan sebagai SHA-256 hash dan diputar setiap refresh.
- Refresh token hanya dikirim melalui cookie `HttpOnly`; browser menyimpan access token hanya di memori.
- Password di-hash dengan bcrypt (12 rounds); JWT secret wajib diisi melalui `.env`.
- Auth endpoint dibatasi 20 request per 15 menit. CORS memakai `WEB_ORIGIN`, dan endpoint auth menolak `Origin` yang tidak cocok.
- Respons error memakai `{ "error": { "code": "...", "message": "..." } }`.
- UI: `/login`, `/register`, `/dashboard`, serta area role `/admin`, `/lecturer`, `/student`.

Jalankan `npm run test:unit` untuk unit test Vitest/Supertest; test endpoint unit menggunakan repository in-memory.

## Database & keamanan

Unique constraint mencegah enrollment, pengumpulan tugas, dan absensi duplikat. Credential seed berasal dari environment dan password di-hash menggunakan bcrypt. Database Compose ditujukan untuk development lokal, bukan deployment.

## Rencana fase

1. Fondasi repo, Docker, schema, dan seed
2. Autentikasi dan RBAC
3. Mata kuliah, enrollment, dan materi
4. Tugas dan penilaian
5. Absensi QR
6. Analitik, notifikasi, dan ekspor
7. Testing, CI/CD, deployment, dan polishing
