const PROMPT_CATEGORIES = ["start", "progress", "transition", "comfort", "wrapUp", "end"];

function clampToothCount(toothCount) {
  const value = Math.floor(Number(toothCount) || 0);
  return Math.max(0, Math.min(32, value));
}

export function getWaterFlossingAgeProfile(toothCount) {
  const totalTeeth = clampToothCount(toothCount);

  if (totalTeeth === 0) {
    return { group: "infant", ageRangeLabel: "0-5 months", caregiverLed: true };
  }
  if (totalTeeth <= 4) {
    return { group: "infant", ageRangeLabel: "6-10 months", caregiverLed: true };
  }
  if (totalTeeth <= 8) {
    return { group: "infant", ageRangeLabel: "10-14 months", caregiverLed: true };
  }
  if (totalTeeth <= 12) {
    return { group: "toddler", ageRangeLabel: "12-18 months", caregiverLed: true };
  }
  if (totalTeeth <= 16) {
    return { group: "toddler", ageRangeLabel: "16-22 months", caregiverLed: true };
  }
  if (totalTeeth <= 20) {
    return { group: "primary", ageRangeLabel: "20-36 months", caregiverLed: false };
  }
  if (totalTeeth <= 24) {
    return { group: "mixed", ageRangeLabel: "5-7 years", caregiverLed: false };
  }
  if (totalTeeth <= 27) {
    return { group: "mixed", ageRangeLabel: "7-12 years", caregiverLed: false };
  }
  if (totalTeeth === 28) {
    return { group: "adult", ageRangeLabel: "12+ years", caregiverLed: false };
  }

  return { group: "adult", ageRangeLabel: "17-25 years", caregiverLed: false };
}

export const waterFlossingPrompts = {
  infant: {
    caregiverLed: true,
    start: [
      "Caregiver mode. Use the gentlest setting and go slowly.",
      "Start gently. Keep the tip near the gumline and pause if needed."
    ],
    progress: [
      "Nice and slow. Keep it comfortable.",
      "Use short gentle passes. No rushing."
    ],
    transition: [
      "Move to the next small area.",
      "Shift gently to the next section."
    ],
    comfort: [
      "Pause if your child seems uncomfortable.",
      "Lower the pressure if there is any fussing."
    ],
    wrapUp: [
      "Almost done. Keep it gentle.",
      "One last gentle pass."
    ],
    end: [
      "All done. Great care.",
      "Finished. Nice gentle routine."
    ]
  },
  toddler: {
    caregiverLed: true,
    start: [
      "Caregiver mode. Let's make this quick, calm, and gentle.",
      "Start with a soft setting and keep the tip moving."
    ],
    progress: [
      "Great job. Keep it playful and gentle.",
      "Short passes work best. Keep going."
    ],
    transition: [
      "Move to the next little section.",
      "Switch to the next side."
    ],
    comfort: [
      "Pause if they need a break.",
      "Keep the pressure low and comfortable."
    ],
    wrapUp: [
      "Almost done. One more gentle pass.",
      "Nearly finished. Keep it calm."
    ],
    end: [
      "All done. Great job helping.",
      "Finished. Nice teamwork."
    ]
  },
  primary: {
    caregiverLed: false,
    start: [
      "Let's clean around every tooth, nice and gentle.",
      "Start at the back and follow the gumline."
    ],
    progress: [
      "You're doing great. Keep the water moving.",
      "Slow and steady. Follow the gums."
    ],
    transition: [
      "Move to the next section.",
      "Switch to the other side."
    ],
    comfort: [
      "If it feels too strong, turn it down.",
      "Keep your mouth slightly closed to reduce splashing."
    ],
    wrapUp: [
      "Almost done. Finish strong.",
      "One more section to go."
    ],
    end: [
      "All done. Great clean.",
      "Nice work. Your smile got the VIP treatment."
    ]
  },
  mixed: {
    caregiverLed: false,
    start: [
      "Let's clean between the teeth and along the gumline.",
      "Start at the back teeth and move slowly."
    ],
    progress: [
      "Good pace. Keep following the gumline.",
      "Stay steady. Let the water do the work."
    ],
    transition: [
      "Move to the next section.",
      "Switch zones."
    ],
    comfort: [
      "Lower the pressure if your gums feel sensitive.",
      "Lean over the sink and keep going."
    ],
    wrapUp: [
      "Almost done. Keep it even.",
      "Final pass. Nice and steady."
    ],
    end: [
      "Done. That was a solid clean.",
      "Finished. Nice work."
    ]
  },
  adult: {
    caregiverLed: false,
    start: [
      "Start at the back teeth and follow the gumline.",
      "Begin slowly and keep the tip angled toward the gums."
    ],
    progress: [
      "Keep a steady pace along the gumline.",
      "Let the water do the work. No need to rush."
    ],
    transition: [
      "Move to the next section.",
      "Switch to the next zone."
    ],
    comfort: [
      "Reduce pressure if your gums feel sensitive.",
      "Pause briefly if you need to adjust."
    ],
    wrapUp: [
      "Almost done. Finish the last section.",
      "Final pass. Keep it steady."
    ],
    end: [
      "Done. Your gums will thank you.",
      "Finished. Clean, steady, nicely done."
    ]
  }
};

export function speakPrompt(text) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
    return false;
  }

  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function getRandomPrompt(category, profile, sessionTracker) {
  const profileKey = typeof profile === "string" ? profile : profile?.group;
  const promptPool = waterFlossingPrompts[profileKey]?.[category] || [];
  if (!promptPool.length) {
    return null;
  }

  const tracker = sessionTracker || { usedByCategory: new Map(), usedGlobal: new Set() };
  if (!tracker.usedByCategory.has(category)) {
    tracker.usedByCategory.set(category, new Set());
  }

  const usedInCategory = tracker.usedByCategory.get(category);
  const available = promptPool.filter((prompt) => !tracker.usedGlobal.has(prompt) && !usedInCategory.has(prompt));
  if (!available.length) {
    return null;
  }

  const picked = available[Math.floor(Math.random() * available.length)];
  tracker.usedGlobal.add(picked);
  usedInCategory.add(picked);
  return picked;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildPromptTimeline(durationSeconds, caregiverLed) {
  const total = Math.max(60, Number(durationSeconds) || 120);
  const wrapAt = Math.max(10, total - 10);
  const timeline = [{ second: 0, category: "start" }];

  let nextProgress = randomBetween(10, 15);
  let nextTransition = randomBetween(20, 30);
  let nextComfort = caregiverLed ? randomBetween(28, 40) : randomBetween(40, 55);

  while (true) {
    const nextSecond = Math.min(nextProgress, nextTransition, nextComfort);
    if (nextSecond >= wrapAt) {
      break;
    }

    if (nextSecond === nextProgress) {
      timeline.push({ second: nextSecond, category: "progress" });
      nextProgress += randomBetween(10, 15);
      continue;
    }

    if (nextSecond === nextTransition) {
      timeline.push({ second: nextSecond, category: "transition" });
      nextTransition += randomBetween(20, 30);
      continue;
    }

    timeline.push({ second: nextSecond, category: "comfort" });
    nextComfort += caregiverLed ? randomBetween(25, 38) : randomBetween(40, 60);
  }

  timeline.push({ second: wrapAt, category: "wrapUp" });
  timeline.push({ second: total, category: "end" });
  return timeline.sort((a, b) => a.second - b.second);
}

export function startWaterFlossingSession({ toothCount, durationSeconds, onPrompt, speak = speakPrompt }) {
  const profile = getWaterFlossingAgeProfile(toothCount);
  const timeline = buildPromptTimeline(durationSeconds, profile.caregiverLed);
  const tracker = { usedByCategory: new Map(), usedGlobal: new Set() };
  const timeoutIds = [];

  for (const event of timeline) {
    const timeoutId = window.setTimeout(() => {
      const prompt = getRandomPrompt(event.category, profile.group, tracker);
      if (!prompt) {
        return;
      }

      onPrompt?.({ ...event, text: prompt, profile });
      speak(prompt);
    }, event.second * 1000);

    timeoutIds.push(timeoutId);
  }

  const stop = () => {
    for (const timeoutId of timeoutIds) {
      window.clearTimeout(timeoutId);
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  return { profile, timeline, stop };
}

export { PROMPT_CATEGORIES };
