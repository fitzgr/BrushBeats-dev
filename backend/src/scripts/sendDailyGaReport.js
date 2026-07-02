const path = require("path");
const dotenv = require("dotenv");
const { sendDailyGaReport } = require("../services/gaDailyReportService");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

async function run() {
  try {
    const result = await sendDailyGaReport();
    console.log(
      `[ga-report] Success: sent to ${result.sentTo} (activeUsers=${result.totals.activeUsers}, topPages=${result.topPagesCount})`
    );
    process.exit(0);
  } catch (error) {
    console.error("[ga-report] Failed to send report:", error.message);
    process.exit(1);
  }
}

run();
