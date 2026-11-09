# CampusHub

[![CI](https://github.com/juanfelix1606/CampusHub/actions/workflows/ci.yml/badge.svg)](https://github.com/juanfelix1606/CampusHub/actions/workflows/ci.yml)

CampusHub adalah proyek portofolio sistem informasi kampus yang menggabungkan LMS sederhana dan absensi berbasis QR. Proyek ini dibangun sebagai monorepo TypeScript dengan React/Vite, Express, PostgreSQL, dan Prisma.

## Status

Fase 1-6: fondasi monorepo, autentikasi/RBAC, pengelolaan kelas, enrollment dan materi, tugas, submission berversi, penilaian, absensi QR dinamis, dashboard analitik, pengumuman, notifikasi, dan ekspor CSV.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, Recharts, qrcode.react, html5-qrcode
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL 16, Prisma ORM
- Proteksi dasar API: Helmet, CORS allowlist, rate limiting

## Prasyarat

- Node.js 20.19+ dan npm
- Docker Desktop dengan Docker Compose

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env`, atur `DEMO_PASSWORD` menjadi password lokal sementara (minimal 12 karakter), dan isi `JWT_ACCESS_SECRET` serta `ATTENDANCE_QR_SECRET` dengan secret acak minimal 32 karakter. Generate secret dengan `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Nilai PostgreSQL di file tersebut harus sama dengan konfigurasi Compose.
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

| Method         | Path                                      | Akses                                |
| -------------- | ----------------------------------------- | ------------------------------------ |
| `GET/POST`     | `/api/v1/courses`                         | Semua role terautentikasi / Admin    |
| `PATCH/DELETE` | `/api/v1/courses/:courseId`               | Admin                                |
| `GET`          | `/api/v1/classes`, `/mine`, `/semesters`  | Semua role; hasil disaring per role  |
| `POST`         | `/api/v1/classes`                         | Admin                                |
| `PATCH/DELETE` | `/api/v1/classes/:classId`                | Admin                                |
| `POST/DELETE`  | `/api/v1/classes/:classId/enrollments/me` | Mahasiswa                            |
| `GET/POST`     | `/api/v1/classes/:classId/materials`      | Peserta kelas / Dosen pengampu       |
| `PATCH/DELETE` | `/api/v1/materials/:materialId`           | Dosen pengampu                       |
| `GET`          | `/api/v1/materials/:materialId/download`  | Peserta kelas, Dosen pengampu, Admin |

### Testing

- Unit: `npm run test:unit`
- Integration dengan PostgreSQL terpisah: mulai `docker compose --profile test up -d db-test`, pastikan `TEST_DATABASE_URL` menunjuk ke database bernama `*_test`, lalu `npm run test:integration`. Migrasi test dijalankan otomatis; suite menolak URL database yang tidak berakhiran `_test`.
- Quality gates: `npm run lint` dan `npm run format:check`.
- End-to-end: terapkan migrasi dan seed database test dengan `DEMO_PASSWORD` yang sama untuk akun demo, lalu jalankan `npm run test:e2e`. Playwright menguji dosen membuat tugas, mahasiswa mengumpulkan, dosen memberi nilai, serta mahasiswa melihat nilai, feedback, dan notifikasi. Browser Chromium perlu tersedia (`npx playwright install chromium`). Tes akan menolak server yang sudah menggunakan port API/web agar tidak salah memakai database lain.
- `npm test` menjalankan unit test saja. Integration test memodifikasi database khusus yang URL-nya disediakan; jangan arahkan ke database development/production. Suite mencakup repository Prisma dan constraint PostgreSQL.
- Pull request dan push ke `main` menjalankan GitHub Actions: install, lint, format check, build, unit test, integration test dengan service PostgreSQL, lalu E2E di database yang sama setelah seed akun demo khusus CI.

## Tugas, submission, dan penilaian (Fase 4)

- Dosen pengampu dapat membuat, mengubah, dan menghapus tugas dengan deadline, nilai maksimal, kebijakan late submission, serta lampiran opsional.
- Mahasiswa terdaftar mengirim jawaban teks dan/atau file PDF, PNG, atau JPEG. File dibatasi 10 MB dan menggunakan validasi konten serta storage abstraction materi.
- Submission ulang hanya diizinkan sebelum deadline; setiap versi disimpan. Kebijakan terlambat dapat menolak submission atau menerima dengan penanda `isLate`.
- Dosen memberi atau mengubah nilai dan feedback; perubahan disimpan sebagai audit beserta pengguna dan waktu. Mahasiswa hanya melihat submission, feedback, dan nilai miliknya.
- Database menegakkan satu submission aktif per mahasiswa/tugas dan batas nilai maksimum melalui unique constraint, check constraint, serta trigger PostgreSQL.
- Endpoint utama: `GET /api/v1/assignments`, `POST /api/v1/classes/:classId/assignments`, `POST /api/v1/assignments/:assignmentId/submissions/me`, `GET /api/v1/assignments/:assignmentId/submissions`, dan `PATCH /api/v1/assignments/:assignmentId/submissions/:submissionId/grade`.
- UI tugas dosen berada di `/lecturer/assignments`; mahasiswa mengakses `/student/assignments`.

## Storage privat

`STORAGE_DRIVER` kosong atau `local` menyimpan file di direktori `MATERIAL_STORAGE_DIR`; cocok untuk pengembangan, tetapi disk hosting gratis biasanya tidak persisten. Production menolak storage lokal kecuali `ALLOW_LOCAL_STORAGE=true` diatur secara eksplisit setelah memahami risikonya. Untuk production pilih `STORAGE_DRIVER=s3` dan isi `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, serta `S3_FORCE_PATH_STYLE` (`true` atau `false`). Endpoint S3 wajib HTTPS di production. Simpan kredensial hanya di environment backend, jangan di frontend atau Git.

Bucket harus dibuat **privat** di provider; aplikasi tidak mengubah pengaturan bucket atau membuat URL publik. File diunggah dengan nama acak, validasi ukuran/MIME/magic bytes tetap berlaku, dan unduhan di-stream melalui API setelah pemeriksaan hak akses. Penyiapan privasi bucket dan kebijakan akses adalah tanggung jawab administrator provider. Akses kunci S3 Supabase melewati RLS, jadi kunci hanya boleh berada di server dan otorisasi API tetap wajib.

- **Cloudflare R2:** buat bucket privat dan kredensial S3 di Cloudflare; gunakan endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, dan nama bucket. R2 mengharuskan aktivasi subscription/checkout; periksa syarat pembayaran dan batas gratis di dashboard.
- **Supabase Storage:** buat bucket privat, gunakan endpoint `https://<project-ref>.storage.supabase.co/storage/v1/s3`, region proyek, dan `S3_FORCE_PATH_STYLE=true`; kunci S3 didapat dari pengaturan storage proyek.
- **MinIO lokal:** jika MinIO sudah tersedia secara lokal, buat bucket privat di console dan isi variabel S3 dengan endpoint `http://127.0.0.1:9000`, region `us-east-1`, nama bucket, kredensial MinIO lokal, serta `S3_FORCE_PATH_STYLE=true`. Jangan gunakan kredensial ini di production. Image MinIO Community yang semula dipakai CI tidak lagi dapat di-pull dari registry publik; proyek tidak menyertakan image alternatif yang belum diverifikasi.

Test storage lokal berjalan pada direktori sementara; unit test S3 memakai server HTTP mock untuk memeriksa request SDK dan propagasi error. CI juga menjalankan integration test materi dan submission dua kali, dengan storage lokal dan server S3 mock, termasuk otorisasi unduhan. Mock memeriksa bentuk header autentikasi dan operasi object, tetapi tidak memverifikasi signature kriptografis atau menggantikan uji provider sungguhan. Untuk menjalankan integration test S3 secara lokal, buat bucket MinIO terpisah khusus test, konfigurasi variabel S3, dan jalankan `npm run test:integration` dengan `STORAGE_DRIVER=s3`. Jangan gunakan bucket production untuk test.

## Absensi QR dinamis (Fase 5)

- Dosen pengampu membuka sesi dengan durasi dan ambang keterlambatan. Hanya ada satu sesi aktif per kelas; sesi otomatis tidak bisa dipakai setelah ditutup atau kedaluwarsa.
- QR berisi JWT HS256 yang ditandatangani dengan `ATTENDANCE_QR_SECRET`, menyertakan ID sesi, tujuan, dan slot waktu 30 detik. Server memvalidasi tanda tangan dan slot memakai waktu server, lalu memeriksa bahwa mahasiswa terdaftar pada kelas tersebut.
- Waktu check-in ditentukan server. Transaksi mengunci sesi dan unique constraint `(sessionId, studentId)` menolak check-in ganda termasuk request yang datang bersamaan.
- Dosen dapat memantau roster dengan polling, mengubah status hadir/terlambat/izin/sakit/alfa, melihat jejak audit, menutup sesi, serta mengekspor CSV per sesi atau kelas.
- CSV mengutip dan meng-escape kolom serta menetralkan nilai yang berpotensi menjadi formula spreadsheet.
- Mahasiswa dapat menggunakan kamera atau memasukkan payload QR secara manual, melihat riwayat sesi, dan rekap persentase kehadiran per kelas.
- UI dosen: `/lecturer/attendance`; UI mahasiswa: `/student/attendance`. Kamera browser umumnya memerlukan HTTPS atau `localhost`; uji manual dengan kamera perangkat nyata masih diperlukan.

### Alur check-in

```mermaid
sequenceDiagram
    participant D as Dosen
    participant W as Web CampusHub
    participant A as API
    participant S as Mahasiswa
    D->>W: Buka sesi absensi
    W->>A: POST /classes/:classId/attendance/sessions
    A-->>W: Sesi dan waktu kedaluwarsa
    W->>A: GET /attendance/sessions/:sessionId/qr (polling)
    A-->>W: JWT HMAC untuk slot 30 detik saat ini
    W-->>S: QR dinamis
    S->>A: POST /attendance/check-in dengan sessionId + token
    A->>A: Verifikasi tanda tangan, slot, sesi, enrollment, dan unique constraint
    A-->>S: Status dan waktu check-in dari server
    W->>A: GET /attendance/sessions/:sessionId/records (polling)
    A-->>W: Roster dan hitungan status
```

### Endpoint absensi utama

| Method  | Path                                                        | Akses                                      |
| ------- | ----------------------------------------------------------- | ------------------------------------------ |
| `POST`  | `/api/v1/classes/:classId/attendance/sessions`              | Dosen pengampu                             |
| `GET`   | `/api/v1/classes/:classId/attendance/sessions`              | Dosen pengampu; paginasi                   |
| `GET`   | `/api/v1/attendance/sessions/:sessionId/qr`                 | Dosen pengampu                             |
| `POST`  | `/api/v1/attendance/sessions/:sessionId/close`              | Dosen pengampu                             |
| `GET`   | `/api/v1/attendance/sessions/:sessionId/records`            | Dosen pengampu; paginasi/filter status     |
| `PATCH` | `/api/v1/attendance/sessions/:sessionId/records/:studentId` | Dosen pengampu; audit perubahan            |
| `POST`  | `/api/v1/attendance/check-in`                               | Mahasiswa terdaftar; rate-limited          |
| `GET`   | `/api/v1/attendance/me`                                     | Riwayat mahasiswa sendiri; paginasi/filter |
| `GET`   | `/api/v1/classes/:classId/attendance/me`                    | Mahasiswa terdaftar                        |
| `GET`   | `/api/v1/attendance/sessions/:sessionId/export.csv`         | Dosen pengampu                             |
| `GET`   | `/api/v1/classes/:classId/attendance/export.csv`            | Dosen pengampu                             |

`ATTENDANCE_QR_SECRET` adalah secret terpisah dari access-token secret dan wajib tersedia pada API. Endpoint check-in dibatasi 60 request per menit per alamat IP. Scan kamera nyata perlu diverifikasi di perangkat melalui HTTPS/localhost; unit dan integration test memverifikasi token, otorisasi, konkurensi, expiry, audit, serta CSV.

## Dashboard, pengumuman, notifikasi, dan ekspor (Fase 6)

- Dashboard `/dashboard` menyajikan data sesuai role. Endpoint `GET /api/v1/dashboard` menghitung metrik di API: mahasiswa mendapat rekap kehadiran/tugas/nilai, dosen mendapat kehadiran per sesi, distribusi nilai, rasio pengumpulan dan mahasiswa berisiko, sedangkan admin mendapat jumlah pengguna per role, kelas aktif dan aktivitas terbaru.
- Query analitik memakai include bertingkat yang dibatasi pada enrollment/kelas dosen, bukan query per baris (N+1). Ringkasan jumlah pengguna admin dihitung dengan satu query agregasi SQL; indeks relasi/urutan notifikasi dan jadwal tugas mendukung filter utama. Dashboard dosen dapat mengatur ambang risiko dengan `DASHBOARD_RISK_ATTENDANCE_PERCENT` (default 75) dan `DASHBOARD_RISK_MISSED_ASSIGNMENTS` (default 2).
- Admin dan dosen pengampu dapat menerbitkan pengumuman. Mahasiswa hanya melihat pengumuman global dan kelas yang diikutinya; pengumuman kelas hanya mengirim notifikasi ke enrollment kelas tersebut.
- Notifikasi dibuat dari event domain terpisah untuk tugas baru, nilai baru, sesi absensi dibuka, dan pengumuman. Daftar milik pengguna mendukung pagination, count belum dibaca, tandai dibaca, dan polling UI berkala.
- Dosen pengampu dan admin dapat mengekspor rekap nilai kelas; hasil ekspor memakai helper CSV bersama dengan absensi untuk mengutip sel dan menetralkan formula spreadsheet.
- Halaman menggunakan `React.lazy`/`Suspense` agar bundle layar dan library QR/chart dipisah. UI menyediakan loading, empty, dan error state; halaman analitik juga menampilkan grafik Recharts.
- Seed membuat pengumuman global/kelas dan notifikasi contoh untuk kedua akun mahasiswa. Bukti smoke test browser tersimpan di `docs/screenshots/`: dashboard tiap role, daftar notifikasi, dan sesi absensi QR.

| Method  | Path                                         | Akses                                                |
| ------- | -------------------------------------------- | ---------------------------------------------------- |
| `GET`   | `/api/v1/dashboard`                          | Pengguna terautentikasi; data disesuaikan role       |
| `GET`   | `/api/v1/announcements`                      | Pengguna terautentikasi; audiens dibatasi backend    |
| `POST`  | `/api/v1/announcements`                      | Admin (global/kelas), dosen pengampu (kelas sendiri) |
| `GET`   | `/api/v1/notifications`                      | Pemilik notifikasi; paginasi dan unread count        |
| `PATCH` | `/api/v1/notifications/:notificationId/read` | Pemilik notifikasi                                   |
| `POST`  | `/api/v1/notifications/read-all`             | Pengguna saat ini                                    |
| `GET`   | `/api/v1/classes/:classId/grades/export.csv` | Admin atau dosen pengampu                            |

## Known issues

- `npm audit --omit=dev` pada dependency Prisma 6 melaporkan tiga temuan high yang terkait Prisma/config dan `deepmerge-ts` (GHSA-ggr8-5vv4-36mx). Advisori `deepmerge-ts` menyebut risiko stack exhaustion pada graph objek rekursif; paket ini merupakan dependency tidak langsung Prisma. Perbaikan yang disarankan audit memerlukan migrasi major Prisma 7; upgrade ditunda agar perubahan major tidak dilakukan tanpa uji kompatibilitas. Tinjau ulang advisory dan kompatibilitas sebelum deploy publik.
- Audit penuh pada tooling fase ini juga melaporkan tujuh temuan moderate dari `minimatch` (GHSA-g3hv-75wg-m249), dependency development melalui TypeScript ESLint. Tidak ada perbaikan non-breaking yang ditawarkan npm; `npm audit fix --dry-run` mengusulkan perubahan versi yang dianggap breaking. Tooling tersebut tidak dipakai saat runtime aplikasi. Tinjau ulang audit sebelum rilis dan evaluasi versi aman setelah ada jalur upgrade yang kompatibel.

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
- Refresh token hanya dikirim melalui cookie `HttpOnly`; browser menyimpan access token hanya di memori. Cookie production memakai `Secure` dan `SameSite=Lax`; konfigurasi ini mengasumsikan frontend mem-proxy `/api` sehingga browser mengakses satu origin.
- Password di-hash dengan bcrypt (12 rounds); JWT secret wajib diisi melalui `.env`.
- API gagal saat startup bila secret kosong/lemah (minimal 32 karakter dengan 12 karakter unik), secret access dan QR sama, atau `WEB_ORIGIN` bukan origin valid/HTTPS di production. CORS memakai allowlist origin, Helmet mengatur header keamanan, dan rate limit berlaku global serta lebih ketat untuk autentikasi. Di production, Express mempercayai satu reverse-proxy hop agar rate limit memakai alamat client yang diteruskan platform.
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
