const WARMUP_SECONDS = 5 * 60;
const WALK_SECONDS = 3 * 60;
const INTERVAL_COUNT = 10;

const phases = [
  {
    id: "warmup",
    label: "Warmup",
    title: "Start 5 minute warmup",
    spoken: "Start 5 minute warmup",
    duration: WARMUP_SECONDS,
  },
  ...Array.from({ length: INTERVAL_COUNT }, (_, index) => {
    const isBrisk = index % 2 === 0;
    return {
      id: isBrisk ? "brisk" : "casual",
      label: isBrisk ? "Brisk" : "Casual",
      title: isBrisk ? "Walk Briskly" : "Walk Casually",
      spoken: isBrisk ? "Walk Briskly" : "Walk Casually",
      duration: WALK_SECONDS,
    };
  }),
  {
    id: "cooldown",
    label: "Cooldown",
    title: "Start Cooldown",
    spoken: "Start Cooldown",
    duration: null,
  },
];

const totalScheduledSeconds = WARMUP_SECONDS + WALK_SECONDS * INTERVAL_COUNT;

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
};

let currentPhaseIndex = 0;
let phaseStartedAt = 0;
let phasePausedRemaining = phases[0].duration;
let workoutStartedAt = 0;
let pausedTotal = 0;
let pausedAt = 0;
let timerId = null;
let isRunning = false;
let wakeLock = null;
let audioContext = null;
let audioReady = false;
let lastCountdownSecond = null;

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getVoices() {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);

  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 600);

    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timeoutId);
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

async function unlockAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  audioContext ||= new AudioContext();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  audioReady = true;
}

function playChime() {
  if (!audioContext || !audioReady) return;

  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  gain.connect(audioContext.destination);

  [660, 880].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.12);
    oscillator.connect(gain);
    oscillator.start(now + index * 0.12);
    oscillator.stop(now + index * 0.12 + 0.28);
  });
}

function playCountdownBeep(second) {
  if (!audioContext || !audioReady) return;

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequency = second === 1 ? 1046 : 784;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.18);
}

function vibrateCue() {
  if ("vibrate" in navigator) {
    navigator.vibrate([180, 80, 180]);
  }
}

function cueCountdownBeep(phase, remaining) {
  if (phase.duration === null || remaining > 5 || remaining <= 0) {
    lastCountdownSecond = null;
    return;
  }

  const countdownSecond = Math.ceil(remaining);
  if (countdownSecond === lastCountdownSecond) return;

  lastCountdownSecond = countdownSecond;
  playCountdownBeep(countdownSecond);
}

async function speak(text) {
  await unlockAudio();
  playChime();
  vibrateCue();

  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = await getVoices();
  const preferredVoice = voices.find((voice) => voice.lang === "en-US") || voices.find((voice) => voice.lang.startsWith("en"));
  if (preferredVoice) utterance.voice = preferredVoice;

  utterance.lang = preferredVoice?.lang || "en-US";
  utterance.volume = 1;
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;

  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;

  try {
    await wakeLock.release();
  } finally {
    wakeLock = null;
  }
}

function getPhaseRemaining(now = Date.now()) {
  const phase = phases[currentPhaseIndex];
  if (phase.duration === null) return null;
  return phasePausedRemaining - (now - phaseStartedAt) / 1000;
}

function getWorkoutElapsed(now = Date.now()) {
  if (!workoutStartedAt) return 0;
  const activePausedTime = pausedAt ? now - pausedAt : 0;
  return (now - workoutStartedAt - pausedTotal - activePausedTime) / 1000;
}

function setPhaseClasses(phase) {
  elements.panel.classList.remove("is-warmup", "is-brisk", "is-casual", "is-cooldown");
  elements.panel.classList.add(`is-${phase.id}`);
}

function render() {
  const phase = phases[currentPhaseIndex];
  const now = Date.now();
  const elapsed = getWorkoutElapsed(now);
  const remaining = getPhaseRemaining(now);

  setPhaseClasses(phase);
  elements.phaseBadge.textContent = phase.label;
  elements.elapsedTime.textContent = formatTime(elapsed);
  elements.phaseTitle.textContent = phase.title;

  if (phase.duration === null) {
    elements.timeRemaining.textContent = formatTime(elapsed - totalScheduledSeconds);
    elements.phaseCount.textContent = "Cooldown";
    elements.phaseDetail.textContent = "Cool down as long as you like. Stop the timer when you are finished.";
    elements.progressRing.style.background = "conic-gradient(var(--accent) 360deg, rgba(15, 118, 110, 0.16) 0deg)";
    return;
  }

  const completedRatio = Math.min(1, Math.max(0, 1 - remaining / phase.duration));
  const degrees = Math.round(completedRatio * 360);
  const walkNumber = Math.min(INTERVAL_COUNT, Math.max(1, currentPhaseIndex));

  elements.timeRemaining.textContent = formatTime(remaining);
  elements.phaseCount.textContent = currentPhaseIndex === 0 ? "Warmup" : `${walkNumber} of ${INTERVAL_COUNT}`;
  elements.phaseDetail.textContent = currentPhaseIndex === 0
    ? "Ease into your walk before the first brisk interval."
    : "Follow the spoken prompt when the next interval begins.";
  elements.progressRing.style.background = `conic-gradient(var(--accent) ${degrees}deg, rgba(15, 118, 110, 0.16) ${degrees}deg)`;
}

function advancePhase() {
  currentPhaseIndex += 1;
  phaseStartedAt = Date.now();
  phasePausedRemaining = phases[currentPhaseIndex].duration;
  lastCountdownSecond = null;
  speak(phases[currentPhaseIndex].spoken);
  render();
}

function tick() {
  if (!isRunning) return;

  const phase = phases[currentPhaseIndex];
  const remaining = getPhaseRemaining();

  if (phase.duration !== null && remaining <= 0) {
    advancePhase();
  } else {
    cueCountdownBeep(phase, remaining);
    render();
  }
}

async function startWorkout() {
  await unlockAudio();

  currentPhaseIndex = 0;
  workoutStartedAt = Date.now();
  phaseStartedAt = workoutStartedAt;
  phasePausedRemaining = phases[0].duration;
  pausedTotal = 0;
  pausedAt = 0;
  lastCountdownSecond = null;
  isRunning = true;

  elements.startButton.disabled = true;
  elements.pauseButton.disabled = false;
  elements.pauseButton.textContent = "Pause";
  elements.stopButton.disabled = false;

  await requestWakeLock();
  speak(phases[0].spoken);
  render();
  timerId = window.setInterval(tick, 250);
}

async function testVoice() {
  elements.voiceButton.disabled = true;
  await speak("Voice is ready");
  window.setTimeout(() => {
    elements.voiceButton.disabled = false;
  }, 900);
}

function pauseWorkout() {
  if (!isRunning) {
    isRunning = true;
    pausedTotal += Date.now() - pausedAt;
    pausedAt = 0;
    phaseStartedAt = Date.now();
    lastCountdownSecond = null;
    elements.pauseButton.textContent = "Pause";
    requestWakeLock();
    timerId = window.setInterval(tick, 250);
    render();
    return;
  }

  isRunning = false;
  pausedAt = Date.now();
  phasePausedRemaining = getPhaseRemaining(pausedAt);
  window.clearInterval(timerId);
  elements.pauseButton.textContent = "Resume";
  releaseWakeLock();
  render();
}

function stopWorkout() {
  window.clearInterval(timerId);
  window.speechSynthesis?.cancel();
  releaseWakeLock();

  currentPhaseIndex = 0;
  phaseStartedAt = 0;
  phasePausedRemaining = phases[0].duration;
  workoutStartedAt = 0;
  pausedTotal = 0;
  pausedAt = 0;
  timerId = null;
  isRunning = false;
  lastCountdownSecond = null;

  elements.startButton.disabled = false;
  elements.pauseButton.disabled = true;
  elements.pauseButton.textContent = "Pause";
  elements.stopButton.disabled = true;
  elements.phaseBadge.textContent = "Ready";
  elements.elapsedTime.textContent = "00:00";
  elements.phaseTitle.textContent = "Japanese Walking Method";
  elements.phaseDetail.textContent = "Start when you are ready. Keep your phone awake and volume on for spoken guidance.";
  elements.timeRemaining.textContent = formatTime(totalScheduledSeconds);
  elements.phaseCount.textContent = "Warmup + 30 min";
  elements.progressRing.style.background = "conic-gradient(var(--accent) 0deg, rgba(15, 118, 110, 0.16) 0deg)";
  elements.panel.classList.remove("is-warmup", "is-brisk", "is-casual", "is-cooldown");
}

elements.startButton.addEventListener("click", startWorkout);
elements.voiceButton.addEventListener("click", testVoice);
elements.pauseButton.addEventListener("click", pauseWorkout);
elements.stopButton.addEventListener("click", stopWorkout);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isRunning) {
    requestWakeLock();
    tick();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}
