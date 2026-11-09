import dotenv from "dotenv";
import { resolve } from "node:path";
import { createApp } from "./app";
import { loadRuntimeConfig } from "./runtime-config";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const { port, auth } = loadRuntimeConfig();
const riskAttendancePercent = process.env.DASHBOARD_RISK_ATTENDANCE_PERCENT;
const riskMissedAssignments = process.env.DASHBOARD_RISK_MISSED_ASSIGNMENTS;

if (
  riskAttendancePercent !== undefined &&
  (!Number.isFinite(Number(riskAttendancePercent)) ||
    Number(riskAttendancePercent) < 0 ||
    Number(riskAttendancePercent) > 100)
) {
  throw new Error("DASHBOARD_RISK_ATTENDANCE_PERCENT must be between 0 and 100.");
}
if (
  riskMissedAssignments !== undefined &&
  (!Number.isInteger(Number(riskMissedAssignments)) ||
    Number(riskMissedAssignments) < 1 ||
    Number(riskMissedAssignments) > 100)
) {
  throw new Error("DASHBOARD_RISK_MISSED_ASSIGNMENTS must be an integer between 1 and 100.");
}

const app = createApp(auth);

app.listen(port, () => {
  console.info(`CampusHub API listening on http://localhost:${port}`);
});
