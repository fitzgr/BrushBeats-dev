import { calculateCaregiverNudges, calculateGoalProgress, calculateProgressionSummary } from "./rewardProgressionService";
import { getAchievementsByUser, getSessionsByUser, getToothHistoryByUser } from "./storeHelpers";

function subtractDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() - days);
  return nextDate;
}

function isWithinRange(isoValue, timeRange) {
  if (!isoValue || timeRange === "all") {
    return true;
  }

  const now = new Date();
  const valueDate = new Date(isoValue);
  const cutoff = timeRange === "7d" ? subtractDays(now, 7) : subtractDays(now, 30);
  return valueDate.getTime() >= cutoff.getTime();
}

function normalizeToothEventLabel(eventType) {
  if (eventType === "tooth-added" || eventType === "tooth-lost" || eventType === "stage-changed") {
    return eventType;
  }

  return "manual-adjustment";
}

export async function loadUserProgressDashboard(userId, filters = { timeRange: "30d", activityType: "all" }, rewardSettings = {}, goalSettings = {}) {
  if (!userId) {
    return null;
  }

  const [allSessions, allToothHistory, allAchievements] = await Promise.all([
    getSessionsByUser(userId),
    getToothHistoryByUser(userId),
    getAchievementsByUser(userId)
  ]);

  const filteredSessions = allSessions.filter((session) => {
    if (!isWithinRange(session.completedAt || session.startedAt, filters.timeRange)) {
      return false;
    }

    if (filters.activityType !== "all" && session.sessionType !== filters.activityType) {
      return false;
    }

    return true;
  });

  const filteredToothHistory = allToothHistory.filter((entry) => isWithinRange(entry.recordedAt, filters.timeRange));
  const completedSessions = filteredSessions.filter((session) => session.completed);
  const weeklySessions = allSessions.filter((session) => isWithinRange(session.completedAt || session.startedAt, "7d") && session.completed);
  const monthlySessions = allSessions.filter((session) => isWithinRange(session.completedAt || session.startedAt, "30d") && session.completed);
  const progression = calculateProgressionSummary(allSessions, allToothHistory, allAchievements, rewardSettings);
  const goals = calculateGoalProgress(allSessions, goalSettings);
  const caregiverNudges = calculateCaregiverNudges(allSessions, progression, goals);

  return {
    filters,
    totals: {
      totalSessions: filteredSessions.length,
      completedSessions: completedSessions.length,
      completionRate: filteredSessions.length > 0 ? Math.round((completedSessions.length / filteredSessions.length) * 100) : 0,
      streakDays: progression.snapshot.streakDays,
      weeklySessions: weeklySessions.length,
      monthlySessions: monthlySessions.length
    },
    progression: {
      points: progression.points,
      currentLevel: progression.currentLevel,
      previousLevelPoints: progression.previousLevelPoints,
      nextLevelPoints: progression.nextLevelPoints,
      pointsToNextLevel: progression.pointsToNextLevel,
      progressPercent: progression.progressPercent,
      pointsBreakdown: progression.pointsBreakdown
    },
    recentSessions: filteredSessions.slice(0, 8),
    recentAchievements: progression.achievements.filter((achievement) => isWithinRange(achievement.awardedAt, filters.timeRange)).slice(0, 6),
    nextAchievement: progression.nextAchievement,
    caregiverSummary: progression.caregiverSummary,
    goals,
    caregiverNudges,
    toothMilestones: filteredToothHistory.slice(0, 6).map((entry) => ({
      ...entry,
      label: normalizeToothEventLabel(entry.eventType)
    }))
  };
}