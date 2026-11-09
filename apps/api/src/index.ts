import dotenv from "dotenv";
import { resolve } from "node:path";
import { createApp } from "./app";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const port = Number(process.env.API_PORT ?? 3000);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const accessTokenSecret = process.env.JWT_ACCESS_SECRET;
const attendanceQrSecret = process.env.ATTENDANCE_QR_SECRET;
const riskAttendancePercent = process.env.DASHBOARD_RISK_ATTENDANCE_PERCENT;
const riskMissedAssignments = process.env.DASHBOARD_RISK_MISSED_ASSIGNMENTS;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT must be a valid TCP port.");
}
if (!accessTokenSecret || accessTokenSecret.length < 32) {
  throw new Error("JWT_ACCESS_SECRET must be set to at least 32 characters.");
}
if (!attendanceQrSecret || attendanceQrSecret.length < 32) {
  throw new Error("ATTENDANCE_QR_SECRET must be set to at least 32 characters.");
}
if (riskAttendancePercent !== undefined && (!Number.isFinite(Number(riskAttendancePercent)) || Number(riskAttendancePercent) < 0 || Number(riskAttendancePercent) > 100)) {
  throw new Error("DASHBOARD_RISK_ATTENDANCE_PERCENT must be between 0 and 100.");
}
if (riskMissedAssignments !== undefined && (!Number.isInteger(Number(riskMissedAssignments)) || Number(riskMissedAssignments) < 1 || Number(riskMissedAssignments) > 100)) {
  throw new Error("DASHBOARD_RISK_MISSED_ASSIGNMENTS must be an integer between 1 and 100.");
}

const app = createApp(
  {
    accessTokenSecret,
    attendanceQrSecret,
    accessTokenExpiresInSeconds: 15 * 60,
    refreshTokenExpiresInMs: 30 * 24 * 60 * 60 * 1000,
    webOrigin,
    cookieSecure: process.env.NODE_ENV === "production",
  },
);

app.listen(port, () => {
  console.info(`CampusHub API listening on http://localhost:${port}`);
});
