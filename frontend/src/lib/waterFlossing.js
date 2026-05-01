const WATER_FLOSSING_SETTINGS_KEY = "brushBeats.waterFlossing.settings.v1";

const PROMPT_CATEGORIES = ["start", "progress", "transition", "technique", "comfort", "wrapUp", "end"];

const VOICE_STYLE_PRESETS = {
  calm: { key: "calm", label: "Calm coach", rate: 1.0, pitch: 1.0, volume: 1.0 },
  fun: { key: "fun", label: "Fun and playful", rate: 1.1, pitch: 1.15, volume: 1.0 },
  minimal: { key: "minimal", label: "Minimal cues", rate: 1.0, pitch: 1.0, volume: 1.0 },
  encouraging: { key: "encouraging", label: "Encouraging", rate: 1.05, pitch: 1.05, volume: 1.0 },
  caregiver: { key: "caregiver", label: "Caregiver mode", rate: 0.95, pitch: 1.0, volume: 1.0 }
};

const PROMPT_FREQUENCY_PRESETS = {
  low: {
    key: "low",
    label: "Low",
    progressRange: [20, 30],
    transitionRange: [30, 40],
    techniqueRange: [38, 50],
    comfortRange: [42, 58],
    minSpacingSeconds: 6
  },
  normal: {
    key: "normal",
    label: "Normal",
    progressRange: [10, 15],
    transitionRange: [25, 30],
    techniqueRange: [22, 35],
    comfortRange: [32, 48],
    minSpacingSeconds: 5
  },
  high: {
    key: "high",
    label: "High",
    progressRange: [6, 10],
    transitionRange: [18, 22],
    techniqueRange: [16, 24],
    comfortRange: [24, 36],
    minSpacingSeconds: 4
  }
};

const WATER_PRESSURE_OPTIONS = ["gentle", "normal", "strong"];
const USER_FOCUS_OPTIONS = ["general", "braces", "sensitive", "implants", "learning"];
const GUIDANCE_DETAIL_OPTIONS = ["basic", "standard", "detailed"];
const MUSIC_DUCKING_OPTIONS = ["none", "light", "strong"];

const DURATION_OPTIONS = [60, 90, 120, 150, 180];

const DEFAULT_WATER_FLOSSING_SETTINGS = {
  durationSeconds: 120,
  voiceURI: "",
  voiceName: "",
  voiceStyle: "calm",
  promptFrequency: "normal",
  waterPressureComfort: "normal",
  userFocus: "general",
  guidanceDetail: "standard",
  musicDucking: "light",
  ttsMusicBalance: 60
};

const waterFlossingPrompts = {
  infant: {
    caregiverLed: true,
    start: [
      "Caregiver mode. Use the gentlest setting and go slowly.",
      "Start gently. Keep the tip near the gumline and pause if needed."
    ],
    progress: [
      "Nice and slow. Keep your child comfortable.",
      "Use short, gentle passes. No rushing."
    ],
    transition: [
      "Move to the next small area.",
      "Shift gently to the next section."
    ],
    technique: [
      "Aim near the gumline and keep moving.",
      "Use tiny passes and avoid holding one spot too long."
    ],
    comfort: [
      "Pause if your child seems uncomfortable.",
      "Lower pressure if there is any fussing."
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
      "Caregiver mode. Keep this calm, quick, and gentle.",
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
    technique: [
      "Stay close to the gumline and keep a light angle.",
      "Let water flow between teeth with short sweeps."
    ],
    comfort: [
      "Pause if they need a quick break.",
      "Keep pressure low and comfortable."
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
      "Let us clean around every tooth, nice and gentle.",
      "Start at the back and follow the gumline."
    ],
    progress: [
      "You are doing great. Keep the water moving.",
      "Slow and steady. Follow the gums."
    ],
    transition: [
      "Move to the next section.",
      "Switch to the other side."
    ],
    technique: [
      "Keep the tip near the gums and trace each tooth.",
      "Angle slightly toward the gumline as you move."
    ],
    comfort: [
      "If it feels strong, turn pressure down.",
      "Keep your mouth slightly closed to reduce splashing."
    ],
    wrapUp: [
      "Almost done. Finish strong.",
      "One more section to go."
    ],
    end: [
      "All done. Great clean.",
      "Nice work. You finished strong."
    ]
  },
  mixed: {
    caregiverLed: false,
    start: [
      "Let us clean between teeth and along the gumline.",
      "Start at the back and move slowly."
    ],
    progress: [
      "Good pace. Keep following the gumline.",
      "Stay steady. Let water do the work."
    ],
    transition: [
      "Move to the next section.",
      "Switch zones."
    ],
    technique: [
      "Pause briefly at each gap, then keep moving.",
      "Trace the gumline in smooth passes."
    ],
    comfort: [
      "Lower pressure if gums feel sensitive.",
      "Lean over the sink and keep breathing evenly."
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
      "Start at back teeth and follow the gumline.",
      "Begin slowly and keep the tip angled toward gums."
    ],
    progress: [
      "Keep a steady pace along the gumline.",
      "Let the water do the work. No rush."
    ],
    transition: [
      "Move to the next section.",
      "Switch to the next zone."
    ],
    technique: [
      "Keep the nozzle at gumline height as you sweep.",
      "Use short pauses between each tooth pair."
    ],
    comfort: [
      "Reduce pressure if gums feel sensitive.",
      "Pause briefly if you need to adjust grip."
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

let activeVoiceSession = null;

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clampToothCount(toothCount) {
  const value = Math.floor(Number(toothCount) || 0);
  return Math.max(0, Math.min(32, value));
}

function pickRandomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chooseByWeight(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.value;
    }
  }

  return entries[entries.length - 1]?.value || null;
}

function normalizeSettings(input = {}) {
  const merged = {
    ...DEFAULT_WATER_FLOSSING_SETTINGS,
    ...(input || {})
  };

  if (!DURATION_OPTIONS.includes(Number(merged.durationSeconds))) {
    merged.durationSeconds = DEFAULT_WATER_FLOSSING_SETTINGS.durationSeconds;
  }

  if (!VOICE_STYLE_PRESETS[merged.voiceStyle]) {
    merged.voiceStyle = DEFAULT_WATER_FLOSSING_SETTINGS.voiceStyle;
  }

  if (!PROMPT_FREQUENCY_PRESETS[merged.promptFrequency]) {
    merged.promptFrequency = DEFAULT_WATER_FLOSSING_SETTINGS.promptFrequency;
  }

  if (!WATER_PRESSURE_OPTIONS.includes(merged.waterPressureComfort)) {
    merged.waterPressureComfort = DEFAULT_WATER_FLOSSING_SETTINGS.waterPressureComfort;
  }

  if (!USER_FOCUS_OPTIONS.includes(merged.userFocus)) {
    merged.userFocus = DEFAULT_WATER_FLOSSING_SETTINGS.userFocus;
  }

  if (!GUIDANCE_DETAIL_OPTIONS.includes(merged.guidanceDetail)) {
    merged.guidanceDetail = DEFAULT_WATER_FLOSSING_SETTINGS.guidanceDetail;
  }

  if (!MUSIC_DUCKING_OPTIONS.includes(merged.musicDucking)) {
    merged.musicDucking = DEFAULT_WATER_FLOSSING_SETTINGS.musicDucking;
  }

  const parsedBalance = Number(merged.ttsMusicBalance);
  if (!Number.isFinite(parsedBalance)) {
    merged.ttsMusicBalance = DEFAULT_WATER_FLOSSING_SETTINGS.ttsMusicBalance;
  } else {
    merged.ttsMusicBalance = Math.max(0, Math.min(100, Math.round(parsedBalance)));
  }

  merged.voiceURI = String(merged.voiceURI || "");
  merged.voiceName = String(merged.voiceName || "");

  return merged;
}

export function getWaterFlossingMixVolumes(settings = {}) {
  const normalized = normalizeSettings(settings);
  const balance = Math.max(0, Math.min(100, Number(normalized.ttsMusicBalance || 0)));
  const musicVolume = Math.round(100 - balance);
  const ttsVolume = Number((balance / 100).toFixed(2));

  return {
    musicVolume: Math.max(0, Math.min(100, musicVolume)),
    ttsVolume: Math.max(0, Math.min(1, ttsVolume))
  };
}

function applyPromptModifiers(category, prompt, settings, profile) {
  const tonePrefixByStyle = {
    calm: "",
    fun: "Playful cue: ",
    minimal: "",
    encouraging: "You are doing great. ",
    caregiver: profile.caregiverLed ? "Caregiver cue: " : ""
  };

  let nextPrompt = `${tonePrefixByStyle[settings.voiceStyle] || ""}${prompt}`.trim();

  if (category === "comfort") {
    if (settings.waterPressureComfort === "gentle") {
      nextPrompt = `${nextPrompt} Keep pressure very gentle.`;
    } else if (settings.waterPressureComfort === "strong") {
      nextPrompt = `${nextPrompt} Ease back pressure if anything feels sharp.`;
    }
  }

  if (category === "technique") {
    if (settings.userFocus === "braces") {
      nextPrompt = `${nextPrompt} Spend extra time around brackets and wires.`;
    } else if (settings.userFocus === "sensitive") {
      nextPrompt = `${nextPrompt} Use a softer angle around sensitive spots.`;
    } else if (settings.userFocus === "implants") {
      nextPrompt = `${nextPrompt} Keep passes controlled near restorations.`;
    } else if (settings.userFocus === "learning") {
      nextPrompt = `${nextPrompt} Slow pace helps build a smooth routine.`;
    }
  }

  if (settings.guidanceDetail === "basic" && nextPrompt.length > 90) {
    nextPrompt = nextPrompt.split(".")[0].trim();
  }

  if (settings.guidanceDetail === "detailed" && category === "transition") {
    nextPrompt = `${nextPrompt} Keep your tip near the gumline as you switch.`;
  }

  return nextPrompt;
}

function getPromptSelectionWeights(settings, profile) {
  return [
    { value: "progress", weight: settings.voiceStyle === "minimal" ? 2 : 4 },
    { value: "transition", weight: 3 },
    { value: "technique", weight: settings.guidanceDetail === "detailed" ? 4 : 2 },
    { value: "comfort", weight: profile.caregiverLed || settings.waterPressureComfort === "gentle" ? 4 : 2 }
  ];
}

function getVoiceStylePreset(settings) {
  return VOICE_STYLE_PRESETS[settings.voiceStyle] || VOICE_STYLE_PRESETS.calm;
}

function findSelectedVoice(settings) {
  if (typeof window === "undefined" || !window.speechSynthesis?.getVoices) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) {
    return null;
  }

  if (settings.voiceURI) {
    const byUri = voices.find((voice) => voice.voiceURI === settings.voiceURI);
    if (byUri) {
      return byUri;
    }
  }

  if (settings.voiceName) {
    const byName = voices.find((voice) => voice.name === settings.voiceName);
    if (byName) {
      return byName;
    }
  }

  return voices.find((voice) => voice.default) || voices[0] || null;
}

function canSpeak() {
  return typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
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

export function loadWaterFlossingSettings() {
  if (!canUseLocalStorage()) {
    return { ...DEFAULT_WATER_FLOSSING_SETTINGS };
  }

  const raw = window.localStorage.getItem(WATER_FLOSSING_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_WATER_FLOSSING_SETTINGS };
  }

  return normalizeSettings(safeJsonParse(raw, DEFAULT_WATER_FLOSSING_SETTINGS));
}

export function saveWaterFlossingSettings(settings) {
  const normalized = normalizeSettings(settings);
  if (!canUseLocalStorage()) {
    return normalized;
  }

  window.localStorage.setItem(WATER_FLOSSING_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getWaterFlossingVoiceOptions() {
  if (typeof window === "undefined" || !window.speechSynthesis?.getVoices) {
    return [];
  }

  return (window.speechSynthesis.getVoices() || []).map((voice) => ({
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    default: voice.default
  }));
}

export function speakWaterFlossPrompt(text, settings = {}, callbacks = {}) {
  if (!canSpeak() || !text) {
    return null;
  }

  const normalizedSettings = normalizeSettings(settings);
  const preset = getVoiceStylePreset(normalizedSettings);

  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.rate = preset.rate;
  utterance.pitch = preset.pitch;
  const { ttsVolume } = getWaterFlossingMixVolumes(normalizedSettings);
  utterance.volume = Math.max(0, Math.min(1, Number((preset.volume * ttsVolume).toFixed(2))));

  const selectedVoice = findSelectedVoice(normalizedSettings);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }

  utterance.onend = () => callbacks.onEnd?.();
  utterance.onerror = () => callbacks.onEnd?.();

  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function getRandomPrompt(category, profile, settings, tracker) {
  const profileKey = typeof profile === "string" ? profile : profile?.group;
  const promptPool = waterFlossingPrompts[profileKey]?.[category] || [];
  if (!promptPool.length) {
    return null;
  }

  if (!tracker.usedByCategory.has(category)) {
    tracker.usedByCategory.set(category, new Set());
  }

  const usedInCategory = tracker.usedByCategory.get(category);
  const available = promptPool.filter((prompt) => !tracker.usedGlobal.has(prompt) && !usedInCategory.has(prompt));
  if (!available.length) {
    return null;
  }

  const rawPrompt = available[Math.floor(Math.random() * available.length)];
  const nextPrompt = applyPromptModifiers(category, rawPrompt, settings, profile);
  tracker.usedByCategory.get(category).add(rawPrompt);
  tracker.usedGlobal.add(rawPrompt);
  return nextPrompt;
}

function scheduleAdaptivePromptQueue(durationSeconds, settings, profile) {
  const total = Math.max(60, Number(durationSeconds) || 120);
  const frequency = PROMPT_FREQUENCY_PRESETS[settings.promptFrequency] || PROMPT_FREQUENCY_PRESETS.normal;
  const queue = [{ second: 0, category: "start" }];
  const wrapAt = Math.max(10, total - 10);

  let progressAt = pickRandomInRange(frequency.progressRange[0], frequency.progressRange[1]);
  let transitionAt = pickRandomInRange(frequency.transitionRange[0], frequency.transitionRange[1]);
  let techniqueAt = pickRandomInRange(frequency.techniqueRange[0], frequency.techniqueRange[1]);
  let comfortAt = pickRandomInRange(frequency.comfortRange[0], frequency.comfortRange[1]);

  while (true) {
    const nextAt = Math.min(progressAt, transitionAt, techniqueAt, comfortAt);
    if (nextAt >= wrapAt) {
      break;
    }

    if (nextAt === progressAt) {
      queue.push({ second: nextAt, category: "progress" });
      progressAt += pickRandomInRange(frequency.progressRange[0], frequency.progressRange[1]);
      continue;
    }

    if (nextAt === transitionAt) {
      queue.push({ second: nextAt, category: "transition" });
      transitionAt += pickRandomInRange(frequency.transitionRange[0], frequency.transitionRange[1]);
      continue;
    }

    if (nextAt === techniqueAt) {
      queue.push({ second: nextAt, category: "technique" });
      techniqueAt += pickRandomInRange(frequency.techniqueRange[0], frequency.techniqueRange[1]);
      continue;
    }

    queue.push({ second: nextAt, category: "comfort" });
    const comfortRange = profile.caregiverLed || settings.waterPressureComfort === "gentle"
      ? [Math.max(16, frequency.comfortRange[0] - 8), Math.max(22, frequency.comfortRange[1] - 8)]
      : frequency.comfortRange;
    comfortAt += pickRandomInRange(comfortRange[0], comfortRange[1]);
  }

  queue.push({ second: wrapAt, category: "wrapUp" });
  queue.push({ second: total, category: "end" });

  return queue.sort((a, b) => a.second - b.second);
}

export function startWaterFlossingVoiceSession({ toothCount, durationSeconds, settings = {}, onPrompt }) {
  stopWaterFlossingVoiceSession();

  const normalizedSettings = normalizeSettings(settings);
  const profile = getWaterFlossingAgeProfile(toothCount);
  const queue = scheduleAdaptivePromptQueue(durationSeconds, normalizedSettings, profile);
  const tracker = { usedByCategory: new Map(), usedGlobal: new Set() };
  const frequency = PROMPT_FREQUENCY_PRESETS[normalizedSettings.promptFrequency] || PROMPT_FREQUENCY_PRESETS.normal;

  const state = {
    startedAt: Date.now(),
    queue,
    tracker,
    spokenSeconds: new Set(),
    speaking: false,
    timerId: null,
    stopped: false,
    minSpacingMs: frequency.minSpacingSeconds * 1000,
    nextAllowedSpeakAt: 0
  };

  const tick = () => {
    if (state.stopped) {
      return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    const dueEvents = state.queue.filter((event) => event.second <= elapsedSeconds && !state.spokenSeconds.has(event.second));

    if (!dueEvents.length || state.speaking || Date.now() < state.nextAllowedSpeakAt || window.speechSynthesis?.speaking) {
      return;
    }

    const weightedCategory = chooseByWeight(getPromptSelectionWeights(normalizedSettings, profile));
    const preferred = dueEvents.find((event) => event.category === weightedCategory) || dueEvents[0];

    let promptText = getRandomPrompt(preferred.category, profile.group, normalizedSettings, state.tracker);
    if (!promptText && preferred.category !== "progress") {
      promptText = getRandomPrompt("progress", profile.group, normalizedSettings, state.tracker);
    }

    state.spokenSeconds.add(preferred.second);

    if (!promptText) {
      return;
    }

    state.speaking = true;
    state.nextAllowedSpeakAt = Date.now() + state.minSpacingMs;

    onPrompt?.({
      second: preferred.second,
      category: preferred.category,
      text: promptText,
      profile,
      settings: normalizedSettings
    });

    speakWaterFlossPrompt(promptText, normalizedSettings, {
      onEnd: () => {
        state.speaking = false;
      }
    });
  };

  state.timerId = window.setInterval(tick, 250);

  const stop = () => {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    state.stopped = true;
    state.queue = [];
    state.tracker.usedByCategory.clear();
    state.tracker.usedGlobal.clear();
    if (canSpeak()) {
      window.speechSynthesis.cancel();
    }
  };

  activeVoiceSession = {
    profile,
    settings: normalizedSettings,
    stop
  };

  return {
    profile,
    settings: normalizedSettings,
    stop
  };
}

export function stopWaterFlossingVoiceSession() {
  if (activeVoiceSession?.stop) {
    activeVoiceSession.stop();
  }
  activeVoiceSession = null;
}

export function testWaterFlossingVoice(settings = {}) {
  stopWaterFlossingVoiceSession();
  return speakWaterFlossPrompt("This is your Brush Beats water flossing voice.", settings);
}

export {
  DURATION_OPTIONS,
  GUIDANCE_DETAIL_OPTIONS,
  MUSIC_DUCKING_OPTIONS,
  PROMPT_CATEGORIES,
  PROMPT_FREQUENCY_PRESETS,
  USER_FOCUS_OPTIONS,
  VOICE_STYLE_PRESETS,
  WATER_PRESSURE_OPTIONS,
  WATER_FLOSSING_SETTINGS_KEY,
  DEFAULT_WATER_FLOSSING_SETTINGS,
  waterFlossingPrompts
};
