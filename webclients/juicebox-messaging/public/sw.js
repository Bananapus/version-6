/* global self */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Deliberately no fetch or Cache Storage handler: plaintext messages, address
// cards, and authenticated responses must never enter a service-worker cache.
