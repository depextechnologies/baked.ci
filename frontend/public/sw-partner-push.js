/* BAKĒD Partner Service Worker — Web Push dispatcher.
 *
 * Responsibilities (minimal by design):
 *   1. Receive `push` events from the browser push service.
 *   2. Show the native notification using the payload we signed with VAPID.
 *   3. On `notificationclick`, focus any open partner tab or open a new one.
 *
 * We deliberately do NOT precache, do NOT intercept fetch, and do NOT run
 * background sync — the partner app lives inside the same React bundle
 * served by the main origin, and we don't want this service worker to
 * compete with the hot-reload dev experience. Narrow scope → zero bugs.
 */
/* eslint-disable no-restricted-globals */

self.addEventListener("install",  (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  // Firefox can fire pushes with no payload (keep-alive). Fallback to a
  // generic string so we still raise the badge/notif if that happens.
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }

  const title = data.title || "FOODbakēd";
  const body  = data.body  || "Nouvelle activité sur votre restaurant.";
  const tag   = data.tag   || "food-partner";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon:   "/baked-logo-square.png",
    badge:  "/baked-logo-square.png",
    data:   { url: data.url || "/partner/food", entity_id: data.entity_id || null, type: data.type || null },
    requireInteraction: true,          // keeps the notification visible until acted on
    vibrate: [120, 60, 120],
    silent:  false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/partner/food";

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Reuse an open partner tab if one exists; otherwise open a new one.
    for (const c of all) {
      if (c.url.includes("/partner/food")) {
        try { await c.focus(); await c.navigate(target); return; } catch (_) { /* fallthrough */ }
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
