import { expect, test } from "@playwright/test";

test("lecturer creates an assignment and a student submits it", async ({ browser, baseURL }) => {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD must match the seeded E2E accounts.");
  const appUrl = baseURL ?? "http://127.0.0.1:5173";

  const lecturerContext = await browser.newContext();
  const lecturerPage = await lecturerContext.newPage();
  const title = `E2E submission ${crypto.randomUUID()}`;

  try {
    await lecturerPage.goto(`${appUrl}/login`);
    await lecturerPage.getByLabel("Email").fill("dosen@campushub.local");
    await lecturerPage.getByLabel("Password").fill(password);
    await lecturerPage.getByRole("button", { name: "Masuk" }).click();
    await expect(lecturerPage).toHaveURL(/\/dashboard$/);

    await lecturerPage.goto(`${appUrl}/lecturer/assignments`);
    await lecturerPage.getByLabel("Judul").fill(title);
    await lecturerPage.getByLabel("Deskripsi").fill("Alur E2E pembuatan tugas dan pengumpulan.");
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const localDeadline = new Date(deadline.getTime() - deadline.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    await lecturerPage.getByLabel("Deadline").fill(localDeadline);
    await lecturerPage.getByLabel("Nilai maksimal").fill("100");
    await lecturerPage.getByRole("button", { name: "Buat tugas" }).click();
    await expect(lecturerPage.getByText(title, { exact: true })).toBeVisible();

    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    try {
      await studentPage.goto(`${appUrl}/login`);
      await studentPage.getByLabel("Email").fill("mahasiswa1@campushub.local");
      await studentPage.getByLabel("Password").fill(password);
      await studentPage.getByRole("button", { name: "Masuk" }).click();
      await expect(studentPage).toHaveURL(/\/dashboard$/);

      await studentPage.goto(`${appUrl}/student/assignments`);
      const assignmentCard = studentPage
        .locator("section.rounded-2xl")
        .filter({ has: studentPage.getByRole("heading", { name: title, exact: true }) });
      await expect(assignmentCard).toBeVisible();
      await assignmentCard
        .getByLabel("Jawaban teks")
        .fill("Hasil pengujian alur pengumpulan tugas.");
      await assignmentCard.getByRole("button", { name: "Kirim tugas" }).click();
      await expect(assignmentCard.getByText("Status: Sudah dikumpulkan")).toBeVisible();
    } finally {
      await studentContext.close();
    }

    const assignmentRow = lecturerPage.locator("li").filter({ hasText: title });
    await assignmentRow.getByRole("button", { name: "Hapus" }).click();
    await expect(assignmentRow).toHaveCount(0);
  } finally {
    await lecturerContext.close();
  }
});
