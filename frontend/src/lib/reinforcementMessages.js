const AGE_GROUPS = ["infant", "toddler", "primary", "mixed", "adult"];
const MESSAGE_POOL_SIZE = 50;

// Brush-technique tips sourced from ADA guidelines, AAP recommendations, and
// published dental-hygiene literature. Shown mid-session to reinforce technique.

const BRUSH_TECHNIQUE_TIPS = {
  manual: {
    infant: [
      "Use a rice-grain of fluoride toothpaste and guide their hand gently.",
      "Angle the bristles 45° toward the gumline and use tiny circular motions.",
      "Focus on one tooth at a time — their small surfaces reward patience.",
      "Clean all four sides: outer, inner, and chewing surface for each tooth.",
      "Very gentle pressure protects tender gums while still cleaning well.",
      "Lift the lip to reach the front gumline where plaque hides early."
    ],
    toddler: [
      "A pea-sized amount of fluoride paste is right now — and spit, not swallow.",
      "Angle bristles toward the gum and sweep gently away from the gumline.",
      "Small circular strokes on back molars remove food lodged in grooves.",
      "Don't forget the tongue — a gentle forward sweep removes bacteria.",
      "Hold the brush like a pencil so you naturally apply lighter pressure.",
      "Two minutes divided across four quadrants is 30 seconds each — stay even."
    ],
    primary: [
      "45-degree angle to the gumline — let the bristles reach slightly under.",
      "Gentle back-and-forth strokes the width of one tooth at a time.",
      "Inner surfaces of front teeth: tilt the brush vertically, use short strokes.",
      "Chewing surfaces need a firm scrubbing motion to clear groove plaque.",
      "Soft bristles are always best — harder is not cleaner, just more abrasive.",
      "Rinse the brush after each quadrant to avoid redepositing loosened plaque."
    ],
    mixed: [
      "Erupting adult molars have deep grooves — slow circular strokes matter here.",
      "New permanent teeth sit deeper in the jaw, so tilt the brush slightly more.",
      "Brush from gum to tooth tip, not tooth to gum, to sweep plaque out.",
      "Two minutes twice a day keeps enamel strong on those new permanent teeth.",
      "Use a soft-bristle brush and replace it every three months.",
      "Check your inner lower front teeth — a common spot kids unknowingly miss."
    ],
    adult: [
      "Modified Bass technique: angle bristles 45° into sulcus and vibrate gently.",
      "Short horizontal strokes — long strokes miss the gumline pocket entirely.",
      "Internal surfaces of lower front teeth are the most commonly missed spot.",
      "Soft bristles reaching about 1 mm under the gumline is the sweet spot.",
      "Bite surfaces need extra attention — use a brisk back-and-forth scrub.",
      "Three minutes is better than two for full arch coverage with a manual brush.",
      "Replace your brush head every 3 months or after illness.",
      "Tongue and cheek surfaces hold bacteria — a final sweep keeps breath fresh."
    ]
  },
  electric: {
    infant: [
      "Let the oscillating head do the work — just guide it slowly tooth by tooth.",
      "Hold the head at the gumline and pause one to two seconds per tooth.",
      "Lift the head off each tooth before moving to the next — don't drag it across.",
      "A child-sized oscillating head protects growing enamel.",
      "Electric brushes remove 21% more plaque than manual for young brushers.",
      "Use a rice-grain of fluoride paste — the motor doesn't need more.",
      "Keep a light hold so the vibration transfers fully into the tooth surface."
    ],
    toddler: [
      "Pause for a full beat on each tooth surface — the head cleans while you wait.",
      "Guide, don't scrub: the oscillation does the stroke; you do the steering.",
      "Angle the head 45° to the gumline and then move slowly to the next tooth.",
      "Lift the brush off each tooth before advancing — sliding across skips the contact zone.",
      "Electric brushes need less pressure — pressing hard risks gum irritation.",
      "After molars, tilt the head to reach the back chewing surface fully.",
      "Clean the inner surfaces with the same tooth-by-tooth slow glide."
    ],
    primary: [
      "No scrubbing needed — place the head and let the motor run for two seconds.",
      "A built-in two-minute timer is a strong habit anchor at this age.",
      "Lift off each tooth cleanly before moving on — don't sweep or drag across.",
      "Press the trigger surface to gauge pressure — barely any is ideal.",
      "Electric heads reach the gumline more consistently than short manual strokes.",
      "Move the head from gum to tooth tip in a slow guide rather than a stroke.",
      "Rinse the brush head after each use to prevent bacteria build-up."
    ],
    mixed: [
      "Oscillating heads reach between teeth and into grooves of new molars well.",
      "Slow the glide over erupting molars — rough surfaces trap bristles briefly.",
      "Lift the head between teeth rather than pushing it across — lifting cleans the contact point.",
      "Four quadrants at 30 seconds each aligns with most built-in timers.",
      "Light grip and a slow drift get better contact than pressing.",
      "New permanent enamel is porous at first — consistent technique hardens it.",
      "Switch heads every three months or sooner if bristles splay early."
    ],
    adult: [
      "Oscillating-rotating heads outperform sonic in plaque removal per clinical trials.",
      "Guide at 45° to gumline, pause two seconds per tooth, then advance.",
      "Lift off each tooth before moving to the next — dragging spreads plaque instead of removing it.",
      "No scrubbing motion — the head oscillates, your hand just glides slowly.",
      "Pressure sensors on most rechargeable heads prevent gum recession.",
      "Round heads work inner lower front teeth better than manual can.",
      "Clean each surface — facial, lingual, and occlusal — as three separate passes.",
      "Replace brush heads every three months to maintain bristle integrity.",
      "Two minutes minimum with an electric brush — 30 seconds per quadrant."
    ]
  }
};

const GROUP_LIBRARY = {
  infant: {
    openers: ["Tiny smile, giant progress", "Little brusher, big focus", "Bright little grin", "You handled that perfectly", "Strong little routine"],
    middles: ["your teeth are growing cleaner every day", "that gentle rhythm is building healthy habits", "your sparkle is getting brighter", "great job staying with the brush map", "you just leveled up your clean"],
    closers: ["keep shining", "star-level clean", "sparkle mode on", "you are a clean champion", "your smile glows"]
  },
  toddler: {
    openers: ["Steady toddler smile", "Great brushing energy", "Awesome routine today", "Clean-team momentum", "You brushed with confidence"],
    middles: ["you kept every section moving", "your timing was super consistent", "your smile routine is growing stronger", "you showed fantastic brushing control", "your clean rhythm looked great"],
    closers: ["sparkle and shine", "you are glowing", "keep that bright smile", "star-clean finish", "you crushed it"]
  },
  primary: {
    openers: ["Primary teeth powerhouse", "Great consistency", "Solid brushing session", "Strong focus all session", "Precision brushing unlocked"],
    middles: ["your smile gets stronger with each pass", "you protected every corner of your mouth", "your clean rhythm was locked in", "you built excellent daily momentum", "you stayed on beat and on target"],
    closers: ["bright smile victory", "sparkling finish", "gold-star clean", "clean and confident", "shine bright"]
  },
  mixed: {
    openers: ["Mixed-smile mastery", "Excellent control", "Confident brushing run", "Strong brushing discipline", "Powerful clean session"],
    middles: ["you balanced every section with precision", "your timing and technique were excellent", "you gave each surface real attention", "you kept the habit strong", "your tempo made every pass count"],
    closers: ["your smile is shining", "super clean finish", "bright-star result", "daily win unlocked", "you nailed the routine"]
  },
  adult: {
    openers: ["Adult smile, pro routine", "Elite consistency", "That was a focused clean", "Disciplined brushing complete", "Strong oral-care execution"],
    middles: ["you gave your full smile a thorough pass", "your pace and coverage were excellent", "you protected your smile with precision", "you stayed steady from start to finish", "you turned routine into results"],
    closers: ["clean and radiant", "star-bright finish", "habit locked in", "your smile shines", "excellent work today"]
  }
};

function stableNumber(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function toPhase(agePhase) {
  return AGE_GROUPS.includes(agePhase) ? agePhase : "adult";
}

export function getAgeMessageGroupCount() {
  return AGE_GROUPS.length;
}

export function getBrushTechniqueTips(brushType, phase) {
  const safeType = brushType === "electric" ? "electric" : "manual";
  const safePhase = AGE_GROUPS.includes(phase) ? phase : "adult";
  return BRUSH_TECHNIQUE_TIPS[safeType][safePhase] || BRUSH_TECHNIQUE_TIPS.manual.adult;
}

export function buildReinforcementPool(phase, teethCount = 32, brushType = "manual") {
  const groupKey = toPhase(phase);
  const group = GROUP_LIBRARY[groupKey];
  const safeType = brushType === "electric" ? "electric" : "manual";
  const seedBase = stableNumber(`${groupKey}:${safeType}:${Math.max(0, Math.floor(Number(teethCount) || 0))}`);
  const combinations = [];

  for (let i = 0; i < group.openers.length; i += 1) {
    for (let j = 0; j < group.middles.length; j += 1) {
      for (let k = 0; k < group.closers.length; k += 1) {
        const message = `${group.openers[i]} - ${group.middles[j]}, ${group.closers[k]}.`;
        const orderSeed = stableNumber(`${seedBase}:${i}:${j}:${k}`);
        combinations.push({ message, orderSeed });
      }
    }
  }

  combinations.sort((left, right) => left.orderSeed - right.orderSeed);

  return combinations.slice(0, MESSAGE_POOL_SIZE).map((item) => item.message);
}

export function pickReinforcementMessage(pool, lastMessage = "") {
  const safePool = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (safePool.length === 0) {
    return "Great brushing session. Keep your smile shining.";
  }

  if (safePool.length === 1) {
    return safePool[0];
  }

  const candidates = safePool.filter((entry) => entry !== lastMessage);
  const source = candidates.length > 0 ? candidates : safePool;
  const index = Math.floor(Math.random() * source.length);
  return source[index];
}
