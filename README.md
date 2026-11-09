# CampusHub

[![CI](https://github.com/juanfelix1606/CampusHub/actions/workflows/ci.yml/badge.svg)](https://github.com/juanfelix1606/CampusHub/actions/workflows/ci.yml)

CampusHub adalah proyek portofolio sistem informasi kampus yang menggabungkan LMS sederhana dan absensi QR. Admin mengelola struktur akademik, dosen mengelola kelas serta penilaian, dan mahasiswa mengakses materi, mengumpulkan tugas, serta mencatat kehadiran. Aplikasi menggunakan React dan Express dalam monorepo TypeScript, PostgreSQL/Prisma, penyimpanan file privat, dashboard analitik, dan pengujian otomatis.

## Live demo

**Belum tersedia** — URL akan ditambahkan setelah deployment dan verifikasi production selesai. Backend hosting gratis dapat mengalami *cold start*: request pertama setelah periode tidak aktif bisa lebih lambat.

### Akun demo

Akun berikut dibuat oleh seed; ketersediaan pada demo online belum diverifikasi.

| Role | Email |
| --- | --- |
| Admin | `admin@campushub.local` |
| Dosen | `dosen@campushub.local` |
| Mahasiswa | `mahasiswa1@campushub.local` |
| Mahasiswa | `mahasiswa2@campushub.local` |

**Password demo online:** belum ditentukan. Jangan gunakan ulang password pribadi. Untuk lokal, seluruh akun seed menggunakan `DEMO_PASSWORD` dari environment; password tidak disimpan di repositori. Lihat [panduan deployment](docs/DEPLOYMENT.md) untuk batasan akun admin demo dan cara seed/reset database khusus demo.

## Tampilan

Screenshot diambil dari data demo lokal, bukan production. Teks “smoke test” pada beberapa gambar merupakan data pengujian.

| Admin | Dosen |
| --- | --- |
| ![Dashboard admin](docs/screenshots/dashboard-admin.png) | ![Dashboard dosen](docs/screenshots/dashboard-lecturer.png) |

| Mahasiswa | Absensi QR |
| --- | --- |
| ![Dashboard mahasiswa](docs/screenshots/dashboard-student.png) | ![Sesi absensi QR](docs/screenshots/attendance-session-notifications.png) |

[Lihat notifikasi mahasiswa](docs/screenshots/notifications.png).

## Fitur per role

- **Admin:** kelola mata kuliah dan kelas/semester, lihat dashboard agregat, buat pengumuman, serta ekspor rekap nilai.
- **Dosen:** kelola materi kelas, tugas, penilaian dan feedback; buka sesi QR, pantau/ubah kehadiran dengan audit, ekspor rekap dan buat pengumuman kelas.
- **Mahasiswa:** daftar kelas, unduh materi, kumpulkan tugas, lihat nilai/feedback dan notifikasi, serta check-in QR melalui kamera atau input manual.
- **Bersama:** autentikasi dan proteksi per role, dashboard responsif, pengumuman, notifikasi in-app, serta loading/empty/error state.

## Arsitektur

```mermaid
flowchart LR
    Browser["Browser: React / Vite"] -->|"HTTPS; /api relatif"| Proxy["Vercel rewrite (rencana)"]
    Proxy -->|"HTTPS; header origin"| API["Express: routes / controllers / services / repositories"]
    API -->|"Prisma"| DB[("PostgreSQL / Neon")]
    API -->|"FileStorage"| Storage["Disk lokal atau S3-compatible privat"]
    CLI["Prisma migrate deploy"] -->|"koneksi direct"| DB
```

Diagram menggambarkan target deployment; Neon, provider S3, rewrite dan topologi IP masih perlu diverifikasi di environment nyata. Secara lokal, Vite meneruskan `/api` ke API development.

### ERD ringkas

Relasi berikut adalah subset model utama; schema lengkap dan audit tersedia di [schema Prisma](apps/api/prisma/schema.prisma).

```mermaid
erDiagram
    USER ||--o{ REFRESH_TOKEN : owns
    USER ||--o{ CLASS_SECTION : teaches
    COURSE ||--o{ CLASS_SECTION : has
    SEMESTER ||--o{ CLASS_SECTION : contains
    USER ||--o{ ENROLLMENT : enrolls
    CLASS_SECTION ||--o{ ENROLLMENT : has
    CLASS_SECTION ||--o{ MATERIAL : contains
    CLASS_SECTION ||--o{ ASSIGNMENT : contains
    ASSIGNMENT ||--o{ SUBMISSION : receives
    USER ||--o{ SUBMISSION : submits
    SUBMISSION ||--o{ SUBMISSION_VERSION : versions
    SUBMISSION ||--o{ GRADE_AUDIT : records
    CLASS_SECTION ||--o{ ATTENDANCE_SESSION : holds
    ATTENDANCE_SESSION ||--o{ ATTENDANCE : records
    USER ||--o{ ATTENDANCE : attends
    ATTENDANCE ||--o{ ATTENDANCE_AUDIT : changes
    USER ||--o{ ANNOUNCEMENT : authors
    CLASS_SECTION o|--o{ ANNOUNCEMENT : scopes
    USER ||--o{ NOTIFICATION : receives
```

## Tech stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, Recharts |
| Backend | Node.js, Express, TypeScript, Zod, JWT, bcrypt, Helmet, rate limiting |
| Data dan file | PostgreSQL, Prisma ORM, filesystem lokal atau AWS SDK v3 untuk S3-compatible |
| Testing dan operasi | Vitest, Supertest, Playwright, Docker Compose, GitHub Actions |
| Target deployment | Vercel, Render, Neon, storage S3-compatible — belum diverifikasi di production |

## Struktur

```text
apps/
  api/
    prisma/          Schema, migrasi dan seed
    scripts/         Skrip integration, storage dan demo
    src/modules/     Routes, controllers, services dan repositories per domain
    src/shared/      Utilitas dan komponen bersama
  web/src/           React, fitur dan API client
docs/                Panduan deployment, catatan CV dan screenshot
e2e/                 Pengujian Playwright
.github/workflows/   GitHub Actions
docker-compose.yml   PostgreSQL lokal dan test
```

## Instalasi lokal

Prasyarat: Node.js 20.19+ dan npm, serta Docker Compose untuk PostgreSQL lokal. Gunakan terminal PowerShell pada root proyek:

1. Salin konfigurasi jika belum ada: `Copy-Item .env.example .env`. Jangan commit `.env`.
2. Atur `DATABASE_URL` dan `TEST_DATABASE_URL` sesuai Compose; database test harus terpisah dan namanya berakhiran `_test`. Isi `DEMO_PASSWORD` dengan password lokal sementara minimal 12 karakter.
3. Isi `JWT_ACCESS_SECRET` dan `ATTENDANCE_QR_SECRET` dengan **dua** nilai acak yang berbeda, masing-masing minimal 32 karakter dengan 12 karakter unik. Generator: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Jangan membagikan outputnya.
4. Jalankan:

   ```powershell
   docker compose up -d db
   npm ci
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

5. Di terminal lain jalankan `npm run dev:web`, lalu buka `http://localhost:5173`. Health API: `http://localhost:3000/api/v1/health`. Dokumentasi Swagger tersedia lokal di `http://localhost:3000/api/docs`; dinonaktifkan di production.

Storage default adalah lokal. File PDF, PNG, dan JPEG dibatasi 10 MB serta divalidasi ekstensi, MIME, dan magic bytes. Storage S3 menggunakan bucket privat; unduhan melewati pemeriksaan akses backend. Konfigurasi provider, smoke test, migrasi Neon, dan reset demo dijelaskan di [panduan deployment](docs/DEPLOYMENT.md).

### Pengujian

```powershell
npm run lint
npm run format:check
npm run build
npm run test:unit
docker compose --profile test up -d db-test
npm run test:integration
```

Integration test menerapkan migrasi dan memodifikasi database yang ditunjuk `TEST_DATABASE_URL`; jangan gunakan database development atau production. CI menjalankan integration untuk storage lokal dan mock S3. Untuk E2E, migrasikan dan seed **database test** dengan `DATABASE_URL` dan `DIRECT_DATABASE_URL` yang menunjuk database test, serta `DEMO_PASSWORD` yang sama, lalu jalankan `npx playwright install chromium` dan `npm run test:e2e`. Playwright menguji dosen membuat dan menilai tugas, mahasiswa submit, serta melihat nilai, feedback dan notifikasi.

## Keputusan desain dan tantangan teknis

| Tantangan | Solusi dan trade-off |
| --- | --- |
| QR dapat dibagikan ulang | JWT bertanda tangan terikat sesi dan slot waktu server 30 detik; enrollment dan unique constraint mencegah check-in ganda. Rotasi membatasi masa berlaku, bukan membuktikan lokasi mahasiswa. |
| Banyak mahasiswa mendaftar bersamaan | Transaksi mengunci baris kelas (`FOR UPDATE`) sebelum menghitung kapasitas; unique constraint menolak enrollment duplikat. Lock menambah serialisasi pada kelas yang sama. |
| Keamanan sesi | Access token berumur pendek; refresh token acak disimpan sebagai hash, dirotasi saat refresh, dan cookie `HttpOnly` memakai `Secure` di production. |
| Nilai tidak boleh melampaui maksimum tugas | Validasi aplikasi didukung constraint dan trigger PostgreSQL pada submission serta perubahan maksimum tugas. |
| CSV injection | Sel CSV di-escape dan nilai yang berpotensi menjadi formula spreadsheet dinetralkan. |
| Satu origin dan proxy | Browser memakai `/api` relatif dan cookie `SameSite=Lax`; rewrite Vercel menyetel header origin rahasia yang divalidasi backend. `PROXY_HOPS=2` masih hipotesis dan harus diuji di deployment. |
| Penyimpanan file | Interface `FileStorage` memisahkan disk lokal dan S3; key acak serta streaming setelah otorisasi menghindari URL publik permanen. Bucket harus dibuat privat oleh operator. |

## Known issues dan batasan

- Audit terdahulu melaporkan tiga temuan high pada dependency Prisma 6 / `deepmerge-ts` ([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)) dan tujuh moderate pada tooling `minimatch` ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). Ini **snapshot audit sebelumnya**, bukan hasil audit terkini; jalankan `npm audit` dan tinjau perbaikan serta kompatibilitas sebelum rilis publik.
- Server S3 mock CI tidak memverifikasi signature kriptografis dan bukan pengganti smoke test terhadap provider sungguhan. Neon, provider S3, serta scan kamera HP via HTTPS belum diverifikasi di production.
- Rate limit menggunakan memori per instance; bukan pembatas terdistribusi. Jumlah proxy hop dan identitas IP klien harus diuji pada topologi deployment sebenarnya.
- Screenshot menampilkan data demo dan sebagian berlabel smoke test; gambar grafik dosen memiliki label sumbu yang rapat. Penggantian screenshot dengan data demo yang lebih rapi direncanakan.

## Roadmap

1. Verifikasi provider storage, Neon, proxy dan alur end-to-end di deployment nyata; tambahkan URL demo setelah siap.
2. Tinjau advisory dependency dan jalur upgrade yang kompatibel.
3. Perbarui screenshot demo dan pertimbangkan rate limiting terdistribusi bila berjalan pada banyak instance.

## Kontribusi dan lisensi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk cara berkontribusi. Proyek menggunakan [MIT License](LICENSE).
