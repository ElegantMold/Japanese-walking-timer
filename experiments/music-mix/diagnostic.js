const diagnosticAudio = document.querySelector("#audio");
const diagnosticLog = [];
function snapshot(event) {
  const entry = { event, time: Number(diagnosticAudio.currentTime.toFixed(2)), paused: diagnosticAudio.paused,
    ready: diagnosticAudio.readyState, network: diagnosticAudio.networkState, visibility: document.visibilityState,
    session: navigator.audioSession?.state || "unavailable", type: navigator.audioSession?.type || "unavailable",
    error: diagnosticAudio.error?.code || null };
  diagnosticLog.push(entry);
  if (diagnosticLog.length > 120) diagnosticLog.shift();
  document.querySelector("#log").textContent = diagnosticLog.map(value => JSON.stringify(value)).join("\n");
  document.querySelector("#status").textContent = `${event}: ${entry.time}s; ${entry.paused ? "paused" : "playing"}; session ${entry.session}`;
}
for (const event of ["loadstart", "loadedmetadata", "canplay", "play", "playing", "pause", "waiting", "stalled", "suspend", "ended", "error", "seeking", "seeked"]) {
  diagnosticAudio.addEventListener(event, () => snapshot(event));
}
navigator.audioSession?.addEventListener("statechange", () => snapshot("session-change"));
document.addEventListener("visibilitychange", () => snapshot("visibility-change"));
document.querySelector("#start").addEventListener("click", async () => {
  diagnosticAudio.pause();
  diagnosticAudio.currentTime = 0;
  diagnosticLog.length = 0;
  try {
    const mode = document.querySelector("#mode").value;
    if (mode === "ambient" && !("audioSession" in navigator)) throw new Error("Ambient API unavailable");
    if (navigator.audioSession) navigator.audioSession.type = mode;
    if (mode === "ambient" && navigator.audioSession.type !== mode) throw new Error("Ambient request rejected");
    await diagnosticAudio.play();
    snapshot("start-complete");
  } catch (error) {
    document.querySelector("#status").textContent = `Cannot start: ${error.message}`;
  }
});
document.querySelector("#stop").addEventListener("click", () => diagnosticAudio.pause());
setInterval(() => { if (!diagnosticAudio.paused && !diagnosticAudio.ended) snapshot("progress"); }, 1000);
