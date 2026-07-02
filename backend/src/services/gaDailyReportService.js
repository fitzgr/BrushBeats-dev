const cron = require("node-cron");
const nodemailer = require("nodemailer");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const DEFAULT_CRON = "0 4 * * *";
const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_PAGE_LIMIT = 10;

function parseBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function safeNumber(rawValue, precision = 0) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return precision > 0 ? Number((0).toFixed(precision)) : 0;
  }

  return precision > 0 ? Number(parsed.toFixed(precision)) : Math.round(parsed);
}

function formatNumber(value, options = {}) {
  return new Intl.NumberFormat("en-US", options).format(value);
}

function buildGoogleCredentials() {
  const keyFile = process.env.GA4_SERVICE_ACCOUNT_KEY_FILE;
  const jsonValue = process.env.GA4_SERVICE_ACCOUNT_JSON;

  if (keyFile) {
    return { keyFilename: keyFile };
  }

  if (jsonValue) {
    try {
      return { credentials: JSON.parse(jsonValue) };
    } catch (_error) {
      throw new Error("GA4_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  throw new Error("Provide GA4_SERVICE_ACCOUNT_KEY_FILE or GA4_SERVICE_ACCOUNT_JSON");
}

function createAnalyticsClient() {
  const credentials = buildGoogleCredentials();
  return new BetaAnalyticsDataClient(credentials);
}

function createMailTransport() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpSecure = parseBoolean(process.env.SMTP_SECURE);

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error("Missing SMTP_HOST/SMTP_USER/SMTP_PASS for email delivery");
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
}

async function fetchDailyTotals(analyticsClient, property) {
  const [response] = await analyticsClient.runReport({
    property,
    dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
    metrics: [
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "screenPageViews" },
      { name: "eventCount" },
      { name: "conversions" },
      { name: "averageSessionDuration" }
    ]
  });

  const row = response.rows && response.rows[0];
  const values = (row && row.metricValues) || [];

  return {
    activeUsers: safeNumber(values[0] && values[0].value),
    newUsers: safeNumber(values[1] && values[1].value),
    sessions: safeNumber(values[2] && values[2].value),
    engagedSessions: safeNumber(values[3] && values[3].value),
    pageViews: safeNumber(values[4] && values[4].value),
    eventCount: safeNumber(values[5] && values[5].value),
    conversions: safeNumber(values[6] && values[6].value),
    averageSessionDurationSeconds: safeNumber(values[7] && values[7].value, 2)
  };
}

async function fetchTopPages(analyticsClient, property, limit = DEFAULT_PAGE_LIMIT) {
  const [response] = await analyticsClient.runReport({
    property,
    dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit
  });

  return (response.rows || []).map((row) => {
    const pagePath = row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value;
    const views = row.metricValues && row.metricValues[0] && row.metricValues[0].value;

    return {
      pagePath: pagePath || "(not set)",
      views: safeNumber(views)
    };
  });
}

function buildEmailBody({ timezone, totals, topPages }) {
  const durationMinutes = Number((totals.averageSessionDurationSeconds / 60).toFixed(2));
  const topPageLines = topPages.length
    ? topPages.map((entry, index) => `${index + 1}. ${entry.pagePath} - ${formatNumber(entry.views)} views`).join("\n")
    : "No page view data returned for yesterday.";

  return [
    `BrushBeats Daily GA4 Report (${timezone})`,
    "",
    "Date Range: yesterday -> yesterday",
    "",
    "Summary:",
    `- Active users: ${formatNumber(totals.activeUsers)}`,
    `- New users: ${formatNumber(totals.newUsers)}`,
    `- Sessions: ${formatNumber(totals.sessions)}`,
    `- Engaged sessions: ${formatNumber(totals.engagedSessions)}`,
    `- Page views: ${formatNumber(totals.pageViews)}`,
    `- Event count: ${formatNumber(totals.eventCount)}`,
    `- Conversions: ${formatNumber(totals.conversions)}`,
    `- Avg session duration: ${formatNumber(durationMinutes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} minutes`,
    "",
    `Top pages (${topPages.length}):`,
    topPageLines
  ].join("\n");
}

function buildEmailHtml({ timezone, totals, topPages }) {
  const durationMinutes = Number((totals.averageSessionDurationSeconds / 60).toFixed(2));
  const topPageRows = topPages.length
    ? topPages
      .map((entry, index) => `<tr><td style=\"padding:6px 8px;border:1px solid #ddd;\">${index + 1}</td><td style=\"padding:6px 8px;border:1px solid #ddd;\">${entry.pagePath}</td><td style=\"padding:6px 8px;border:1px solid #ddd;text-align:right;\">${formatNumber(entry.views)}</td></tr>`)
      .join("")
    : `<tr><td colspan=\"3\" style=\"padding:6px 8px;border:1px solid #ddd;\">No page view data returned for yesterday.</td></tr>`;

  return [
    "<div style=\"font-family:Arial,sans-serif;color:#111;line-height:1.45;\">",
    `<h2 style=\"margin-bottom:8px;\">BrushBeats Daily GA4 Report (${timezone})</h2>`,
    "<p style=\"margin-top:0;\"><strong>Date Range:</strong> yesterday to yesterday</p>",
    "<h3 style=\"margin-bottom:8px;\">Summary</h3>",
    "<ul style=\"margin-top:0;\">",
    `<li>Active users: <strong>${formatNumber(totals.activeUsers)}</strong></li>`,
    `<li>New users: <strong>${formatNumber(totals.newUsers)}</strong></li>`,
    `<li>Sessions: <strong>${formatNumber(totals.sessions)}</strong></li>`,
    `<li>Engaged sessions: <strong>${formatNumber(totals.engagedSessions)}</strong></li>`,
    `<li>Page views: <strong>${formatNumber(totals.pageViews)}</strong></li>`,
    `<li>Event count: <strong>${formatNumber(totals.eventCount)}</strong></li>`,
    `<li>Conversions: <strong>${formatNumber(totals.conversions)}</strong></li>`,
    `<li>Avg session duration: <strong>${formatNumber(durationMinutes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} minutes</strong></li>`,
    "</ul>",
    "<h3 style=\"margin-bottom:8px;\">Top Pages</h3>",
    "<table style=\"border-collapse:collapse;border:1px solid #ddd;min-width:420px;\">",
    "<thead><tr><th style=\"padding:6px 8px;border:1px solid #ddd;text-align:left;\">#</th><th style=\"padding:6px 8px;border:1px solid #ddd;text-align:left;\">Page Path</th><th style=\"padding:6px 8px;border:1px solid #ddd;text-align:right;\">Views</th></tr></thead>",
    `<tbody>${topPageRows}</tbody>`,
    "</table>",
    "</div>"
  ].join("");
}

function resolveReportConfig() {
  const enabled = parseBoolean(process.env.DAILY_GA_REPORT_ENABLED);
  const cronExpression = process.env.DAILY_GA_REPORT_CRON || DEFAULT_CRON;
  const timezone = process.env.DAILY_GA_REPORT_TIMEZONE || DEFAULT_TIMEZONE;
  const propertyId = process.env.GA4_PROPERTY_ID;
  const recipientEmail = process.env.DAILY_GA_REPORT_TO_EMAIL;
  const fromEmail = process.env.DAILY_GA_REPORT_FROM_EMAIL || process.env.SMTP_USER;

  return {
    enabled,
    cronExpression,
    timezone,
    propertyId,
    recipientEmail,
    fromEmail
  };
}

function validateReportConfig(config) {
  if (!config.enabled) {
    return { ok: false, reason: "DAILY_GA_REPORT_ENABLED is not true" };
  }

  if (!config.propertyId) {
    return { ok: false, reason: "Missing GA4_PROPERTY_ID" };
  }

  if (!config.recipientEmail) {
    return { ok: false, reason: "Missing DAILY_GA_REPORT_TO_EMAIL" };
  }

  if (!config.fromEmail) {
    return { ok: false, reason: "Missing DAILY_GA_REPORT_FROM_EMAIL or SMTP_USER" };
  }

  if (!cron.validate(config.cronExpression)) {
    return { ok: false, reason: "DAILY_GA_REPORT_CRON is not a valid cron expression" };
  }

  return { ok: true };
}

async function sendDailyGaReport() {
  const config = resolveReportConfig();
  const validation = validateReportConfig(config);

  if (!validation.ok) {
    throw new Error(`Daily GA report configuration invalid: ${validation.reason}`);
  }

  const analyticsClient = createAnalyticsClient();
  const mailTransport = createMailTransport();
  const property = `properties/${config.propertyId}`;

  const [totals, topPages] = await Promise.all([
    fetchDailyTotals(analyticsClient, property),
    fetchTopPages(analyticsClient, property)
  ]);

  const textBody = buildEmailBody({ timezone: config.timezone, totals, topPages });
  const htmlBody = buildEmailHtml({ timezone: config.timezone, totals, topPages });

  const today = new Date();
  const dateToken = today.toISOString().slice(0, 10);

  await mailTransport.sendMail({
    from: config.fromEmail,
    to: config.recipientEmail,
    subject: `BrushBeats GA4 Daily Report - ${dateToken}`,
    text: textBody,
    html: htmlBody
  });

  return {
    totals,
    topPagesCount: topPages.length,
    sentTo: config.recipientEmail,
    timezone: config.timezone,
    cronExpression: config.cronExpression
  };
}

function startDailyGaReportScheduler() {
  const config = resolveReportConfig();
  const validation = validateReportConfig(config);

  if (!validation.ok) {
    console.log(`[ga-report] Scheduler inactive: ${validation.reason}`);
    return null;
  }

  console.log(`[ga-report] Scheduler active: cron="${config.cronExpression}", timezone="${config.timezone}"`);

  return cron.schedule(config.cronExpression, async () => {
    try {
      const result = await sendDailyGaReport();
      console.log(
        `[ga-report] Daily report sent to ${result.sentTo} (topPages=${result.topPagesCount}, activeUsers=${result.totals.activeUsers})`
      );
    } catch (error) {
      console.error("[ga-report] Daily report failed:", error.message);
    }
  }, {
    timezone: config.timezone
  });
}

module.exports = {
  sendDailyGaReport,
  startDailyGaReportScheduler,
  resolveReportConfig,
  validateReportConfig
};
