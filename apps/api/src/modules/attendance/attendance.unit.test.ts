import { AttendanceStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { attendanceCsv, attendanceCsvCell, attendanceStatusAt } from "./attendance.rules";
import { issueQrToken, QR_ROTATION_SECONDS, verifyQrToken } from "./attendance-token";

const secret = "attendance-unit-test-secret-that-has-at-least-32-characters";

describe("rotating attendance QR tokens", () => {
  const sessionId = "72e5673f-bb7a-4a52-bb4d-6a76fc984f1d";
  const otherSessionId = "db42a4f3-56f4-4f40-8e53-8ce85f53cd0f";

  it("binds a signed token to one session and current server time slot", () => {
    const now = new Date(90_000);
    const qr = issueQrToken(sessionId, secret, now);
    expect(verifyQrToken(qr.token, secret, now)).toMatchObject({
      sessionId,
      slot: Math.floor(now.getTime() / (QR_ROTATION_SECONDS * 1000)),
    });
    expect(verifyQrToken(qr.token, secret, now).sessionId).not.toBe(otherSessionId);
  });

  it("rejects expired tokens, future rotation slots, and tokens signed with another key", () => {
    const now = new Date(90_000);
    const qr = issueQrToken(sessionId, secret, now);
    expect(() => verifyQrToken(qr.token, secret, new Date(120_000))).toThrow("expired");
    expect(() => verifyQrToken(qr.token, `${secret}-other`, now)).toThrow("invalid or expired");
    const nextSlotToken = issueQrToken(sessionId, secret, new Date(120_000));
    expect(() => verifyQrToken(nextSlotToken.token, secret, new Date(119_999))).toThrow();
  });
});

describe("attendance status and CSV export rules", () => {
  it("uses the server check-in time and late threshold boundary", () => {
    const startedAt = new Date("2026-11-09T10:00:00.000Z");
    expect(attendanceStatusAt(startedAt, 10, new Date("2026-11-09T10:10:00.000Z"))).toBe(
      AttendanceStatus.PRESENT,
    );
    expect(attendanceStatusAt(startedAt, 10, new Date("2026-11-09T10:10:00.001Z"))).toBe(
      AttendanceStatus.LATE,
    );
  });

  it.each(["=1+1", "+SUM(A1:A2)", "-1+2", "@SUM(A1)", "\t=1+1"])(
    "neutralizes formula-like CSV value %j",
    (value) => {
      expect(attendanceCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("quotes CSV fields, escapes quotes, includes a UTF-8 BOM, and keeps CRLF rows", () => {
    const csv = attendanceCsv(
      [{ studentName: 'Ada "A"', status: "PRESENT" }],
      ["studentName", "status"],
    );
    expect(csv).toBe('\uFEFF"studentName","status"\r\n"Ada ""A""","PRESENT"\r\n');
  });
});
