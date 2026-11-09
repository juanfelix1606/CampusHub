# Kontribusi

Terima kasih atas minat berkontribusi pada CampusHub.

1. Untuk perubahan besar atau bug, buka issue lebih dahulu dan jelaskan konteksnya. Jangan sertakan kredensial atau data pribadi.
2. Buat branch dari `main`, ikuti struktur dan gaya yang ada, dan gunakan Conventional Commits (misalnya `fix: prevent duplicate enrollment`).
3. Siapkan lingkungan lokal mengikuti [README](README.md). Gunakan database `*_test` terpisah untuk integration test; test memodifikasi database tersebut.
4. Jalankan `npm run lint`, `npm run format:check`, `npm run build`, dan test yang relevan (`npm run test:unit`, `npm run test:integration`, dan/atau `npm run test:e2e`). Jelaskan jika ada test yang tidak dapat dijalankan.
5. Buka pull request dengan ringkasan, cara pengujian, dan screenshot untuk perubahan UI. Jangan commit `.env`, file upload, credential, atau data sensitif.

Dengan mengirim kontribusi, Anda menyetujui distribusinya sesuai [MIT License](LICENSE).
