const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const bpmRoute = require("./routes/bpm");
const songsRoute = require("./routes/songs");
const youtubeRoute = require("./routes/youtube");
const adminLocalesRoute = require("./routes/adminLocales");
const geoRoute = require("./routes/geo");
const healthRoute = require("./routes/health");
const householdsRoute = require("./routes/households");
const { applySecurityHeaders, basicRateLimit } = require("./middleware/security");
const { startDailyGaReportScheduler } = require("./services/gaDailyReportService");

const app = express();
const port = Number(process.env.PORT || 4000);

app.set("trust proxy", true);
app.disable("x-powered-by");

const allowedOriginSet = new Set(
  String(process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:5174,https://fitzgr.github.io")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOriginSet.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS policy"));
  }
}));
app.use(express.json({ limit: "200kb" }));
app.use(applySecurityHeaders);
app.use(basicRateLimit);

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "BrushBeats API",
    frontend: "http://localhost:5173/BrushBeats/",
    health: "/api/health",
    databaseHealth: "/api/health/db"
  });
});

app.use("/api/health", healthRoute);

app.use("/api/bpm", bpmRoute);
app.use("/api/songs", songsRoute);
app.use("/api/youtube", youtubeRoute);
app.use("/api/admin/locales", adminLocalesRoute);
app.use("/api/geo", geoRoute);
app.use("/api/households", householdsRoute);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "Something went wrong",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
});

if (require.main === module) {
  startDailyGaReportScheduler();

  app.listen(port, () => {
    console.log(`BrushBeats API listening on http://localhost:${port}`);
  });
}

module.exports = app;
