const musicMixTest = true;
const WARMUP_SECONDS = 5 * 60;
const WALK_SECONDS = 3 * 60;
const INTERVAL_COUNT = 10;
const HISTORY_KEY = "japanese-walking-mix-test-completions-v1";

const phases = [
  {
    id: "warmup",
    label: "Warmup",
    title: "Start 5 minute warmup",
    duration: WARMUP_SECONDS,
    start: 0,
  },
  ...Array.from({ length: INTERVAL_COUNT }, (_, index) => {
    const isBrisk = index % 2 === 0;
    return {
      id: isBrisk ? "brisk" : "casual",
      label: isBrisk ? "Brisk" : "Casual",
      title: isBrisk ? "Walk Briskly" : "Walk Casually",
      duration: WALK_SECONDS,
      start: WARMUP_SECONDS + index * WALK_SECONDS,
    };
  }),
  {
    id: "cooldown",
    label: "Cooldown",
    title: "Start Cooldown",
    duration: null,
    start: WARMUP_SECONDS + WALK_SECONDS * INTERVAL_COUNT,
  },
];

const totalScheduledSeconds = phases.at(-1).start;

const elements = {
  panel: document.querySelector(".timer-panel"),
  phaseBadge: document.querySelector("#phaseBadge"),
  elapsedTime: document.querySelector("#elapsedTime"),
  progressRing: document.querySelector("#progressRing"),
  timeRemaining: document.querySelector("#timeRemaining"),
  phaseCount: document.querySelector("#phaseCount"),
  phaseTitle: document.querySelector("#phaseTitle"),
  phaseDetail: document.querySelector("#phaseDetail"),
  startButton: document.querySelector("#startButton"),
  voiceButton: document.querySelector("#voiceButton"),
  pauseButton: document.querySelector("#pauseButton"),
  stopButton: document.querySelector("#stopButton"),
  routineAudio: document.querySelector("#routineAudio"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarSummary: document.querySelector("#calendarSummary"),
  previousMonth: document.querySelector("#previousMonth"),
  nextMonth: document.querySelector("#nextMonth"),
};

let workoutStartedAt = 0;
let pausedTotal = 0;
let pausedAt = 0;
let timerId = null;
let workoutActive = false;
let isPaused = false;
let completionRecorded = false;
let guidanceError = false;
let displayedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let completedDates = loadCompletedDates();

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function loadCompletedDates() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveCompletedDates() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...completedDates].sort()));
  } catch {
    // The timer still works if private browsing prevents local storage.
  }
}

function getWorkoutElapsed(now = Date.now()) {
  if (!workoutStartedAt) return 0;
  const effectiveNow = pausedAt || now;
  return Math.max(0, (effectiveNow - workoutStartedAt - pausedTotal) / 1000);
}

function getPhaseIndex(elapsed) {
  for (let index = phases.length - 1; index >= 0; index -= 1) {
    if (elapsed >= phases[index].start) return index;
  }
  return 0;
}

function setPhaseClasses(phase) {
  elements.panel.classList.remove("is-warmup", "is-brisk", "is-casual", "is-cooldown");
  elements.panel.classList.add(`is-${phase.id}`);
}

function recordCompletion() {
  if (completionRecorded) return;
  completionRecorded = true;

  const completedAt = new Date(workoutStartedAt + pausedTotal + totalScheduledSeconds * 1000);
  completedDates.add(localDateKey(completedAt));
  saveCompletedDates();
  renderCalendar();
}

function updateMediaPosition() {
  if (musicMixTest || !("mediaSession" in navigator) || !Number.isFinite(elements.routineAudio.duration)) return;

  try {
    navigator.mediaSession.setPositionState({
      duration: elements.routineAudio.duration,
      playbackRate: elements.routineAudio.playbackRate,
      position: Math.min(elements.routineAudio.currentTime, elements.routineAudio.duration),
    });
  } catch {
    // Position controls are optional and vary between browsers.
  }
}

function renderTimer() {
  if (!workoutActive) return;

  const elapsed = getWorkoutElapsed();
  const phaseIndex = getPhaseIndex(elapsed);
  const phase = phases[phaseIndex];
  const remaining = phase.duration === null ? null : phase.duration - (elapsed - phase.start);

  if (elapsed >= totalScheduledSeconds) recordCompletion();

  setPhaseClasses(phase);
  elements.phaseBadge.textContent = isPaused ? "Paused" : phase.label;
  elements.elapsedTime.textContent = formatTime(elapsed);
  elements.phaseTitle.textContent = phase.title;

  if (phase.duration === null) {
    elements.timeRemaining.textContent = formatTime(elapsed - totalScheduledSeconds);
    elements.phaseCount.textContent = "Routine complete";
    elements.phaseDetail.textContent = "Today is marked complete. Cool down as long as you like, then tap Stop.";
    elements.progressRing.style.background = "conic-gradient(var(--accent) 360deg, rgba(15, 118, 110, 0.16) 0deg)";
  } else {
    const completedRatio = Math.min(1, Math.max(0, 1 - remaining / phase.duration));
    const degrees = Math.round(completedRatio * 360);
    const walkNumber = Math.min(INTERVAL_COUNT, Math.max(1, phaseIndex));

    elements.timeRemaining.textContent = formatTime(remaining);
    elements.phaseCount.textContent = phaseIndex === 0 ? "Warmup" : `${walkNumber} of ${INTERVAL_COUNT}`;
    elements.phaseDetail.textContent = guidanceError
      ? "Guidance is blocked. Check your volume, then tap Resume to try again."
      : isPaused
        ? "Your routine and background guidance are paused."
      : phaseIndex === 0
        ? "You can lock your screen; guidance will continue playing."
        : "Listen for the countdown and the next walking direction.";
    elements.progressRing.style.background = `conic-gradient(var(--accent) ${degrees}deg, rgba(15, 118, 110, 0.16) ${degrees}deg)`;
  }

  updateMediaPosition();
}

function startTicker() {
  window.clearInterval(timerId);
  timerId = window.setInterval(renderTimer, 250);
}

async function startWorkout() {
  workoutStartedAt = Date.now();
  pausedTotal = 0;
  pausedAt = 0;
  workoutActive = true;
  isPaused = false;
  completionRecorded = false;
  guidanceError = false;

  elements.routineAudio.currentTime = 0;
  elements.startButton.disabled = true;
  elements.voiceButton.disabled = true;
  elements.pauseButton.disabled = false;
  elements.pauseButton.textContent = "Pause";
  elements.stopButton.disabled = false;

  try {
    await elements.routineAudio.play();
  } catch {
    guidanceError = true;
    isPaused = true;
    pausedAt = Date.now();
    elements.pauseButton.textContent = "Resume";
  }

  renderTimer();
  if (!isPaused) startTicker();
}

async function resumeWorkout() {
  if (!workoutActive || !isPaused) return;

  pausedTotal += Date.now() - pausedAt;
  pausedAt = 0;
  isPaused = false;
  elements.pauseButton.textContent = "Pause";

  try {
    await elements.routineAudio.play();
    guidanceError = false;
  } catch {
    guidanceError = true;
    isPaused = true;
    pausedAt = Date.now();
    elements.pauseButton.textContent = "Resume";
  }

  renderTimer();
  if (!isPaused) startTicker();
}

function pauseWorkout() {
  if (!workoutActive || isPaused) {
    resumeWorkout();
    return;
  }

  isPaused = true;
  pausedAt = Date.now();
  elements.routineAudio.pause();
  elements.pauseButton.textContent = "Resume";
  window.clearInterval(timerId);
  renderTimer();
}

function resetTimerDisplay() {
  elements.phaseBadge.textContent = "Ready";
  elements.elapsedTime.textContent = "00:00";
  elements.phaseTitle.textContent = "Japanese Walking Method";
  elements.phaseDetail.textContent = "Start when you are ready. Volume on; locking your screen is okay.";
  elements.timeRemaining.textContent = formatTime(totalScheduledSeconds);
  elements.phaseCount.textContent = "Warmup + 30 min";
  elements.progressRing.style.background = "conic-gradient(var(--accent) 0deg, rgba(15, 118, 110, 0.16) 0deg)";
  elements.panel.classList.remove("is-warmup", "is-brisk", "is-casual", "is-cooldown");
}

function stopWorkout() {
  window.clearInterval(timerId);
  elements.routineAudio.pause();
  elements.routineAudio.currentTime = 0;

  workoutStartedAt = 0;
  pausedTotal = 0;
  pausedAt = 0;
  timerId = null;
  workoutActive = false;
  isPaused = false;
  completionRecorded = false;
  guidanceError = false;

  elements.startButton.disabled = false;
  elements.voiceButton.disabled = false;
  elements.pauseButton.disabled = true;
  elements.pauseButton.textContent = "Pause";
  elements.stopButton.disabled = true;
  resetTimerDisplay();
}

async function testVoice() {
  elements.voiceButton.disabled = true;
  elements.routineAudio.currentTime = 0;

  try {
    await elements.routineAudio.play();
    window.setTimeout(() => {
      elements.routineAudio.pause();
      elements.routineAudio.currentTime = 0;
    }, 2600);
  } catch {
    elements.phaseDetail.textContent = "Guidance audio is blocked. Check that your phone is not muted, then try again.";
  }

  window.setTimeout(() => {
    elements.voiceButton.disabled = false;
  }, 2800);
}

function calculateStreak() {
  if (!completedDates.size) return 0;

  const latest = [...completedDates].sort().at(-1);
  const cursor = dateFromKey(latest);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysSinceLatest = Math.round((today - cursor) / 86400000);
  if (daysSinceLatest > 1) return 0;

  let streak = 0;
  while (completedDates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date());

  elements.calendarTitle.textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(displayedMonth);
  elements.calendarGrid.replaceChildren();

  for (const dayName of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    const heading = document.createElement("span");
    heading.className = "calendar-weekday";
    heading.textContent = dayName;
    elements.calendarGrid.append(heading);
  }

  for (let index = 0; index < firstWeekday; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day is-empty";
    elements.calendarGrid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = localDateKey(date);
    const cell = document.createElement("time");
    cell.className = "calendar-day";
    cell.dateTime = key;
    cell.textContent = String(day);

    if (key === todayKey) cell.classList.add("is-today");
    if (completedDates.has(key)) {
      cell.classList.add("is-complete");
      cell.setAttribute("aria-label", `${date.toLocaleDateString()} — routine completed`);
    }
    elements.calendarGrid.append(cell);
  }

  const total = completedDates.size;
  const streak = calculateStreak();
  elements.calendarSummary.textContent = `${total} completed ${total === 1 ? "day" : "days"} · ${streak} day streak`;
}

function changeMonth(offset) {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + offset, 1);
  renderCalendar();
}

elements.startButton.addEventListener("click", startWorkout);
elements.voiceButton.addEventListener("click", testVoice);
elements.pauseButton.addEventListener("click", pauseWorkout);
elements.stopButton.addEventListener("click", stopWorkout);
elements.previousMonth.addEventListener("click", () => changeMonth(-1));
elements.nextMonth.addEventListener("click", () => changeMonth(1));

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && workoutActive) renderTimer();
});

elements.routineAudio.addEventListener("ended", renderTimer);
elements.routineAudio.addEventListener("pause", () => {
  if (!workoutActive || isPaused || elements.routineAudio.ended) return;
  isPaused = true;
  pausedAt = Date.now();
  elements.pauseButton.textContent = "Resume";
  window.clearInterval(timerId);
  renderTimer();
});
elements.routineAudio.addEventListener("play", () => {
  if (workoutActive && isPaused) resumeWorkout();
});

if (!musicMixTest && "mediaSession" in navigator && "MediaMetadata" in window) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: "Japanese Walking Routine",
    artist: "35 minute guided walk",
  });
  for (const [action, handler] of [
    ["play", resumeWorkout],
    ["pause", pauseWorkout],
    ["stop", stopWorkout],
  ]) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Some browsers expose Media Session with only a subset of actions.
    }
  }
}

// A child-scope, network-only worker isolates this test from the regular app's
// cache-first fetch handler. It does not change that app's worker or caches.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./test-service-worker.js", { scope: "./" }).catch(() => {
    document.querySelector("#mixStatus").textContent = "Test worker unavailable. Reload online before testing; production remains unchanged.";
  });
}
function configureMusicMixTest() {
  const status = document.querySelector("#mixStatus");
  try {
    if (!("audioSession" in navigator)) throw new Error("Audio Session API unavailable");
    navigator.audioSession.type = "ambient";
    if (navigator.audioSession.type !== "ambient") throw new Error("Ambient mixing was not accepted");
    status.textContent = "Ambient mixing requested. Lock-screen playback and Amazon Music coexistence still need an iPhone test.";
    navigator.audioSession.addEventListener("statechange", () => {
      status.textContent = `Mixing requested; audio session: ${navigator.audioSession.state}. After a call, check the routine and tap Resume if paused.`;
    });
    return true;
  } catch {
    status.textContent = "This browser cannot enable this mixing experiment. Use the unchanged installed walking app.";
    elements.startButton.disabled = true;
    elements.voiceButton.disabled = true;
    return false;
  }
}
configureMusicMixTest();

renderCalendar();
