// Network-only worker, scoped to this experiment's directory.
// No caches, storage changes, or production-worker registration changes.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
