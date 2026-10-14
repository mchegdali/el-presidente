// Service worker d'El Presidente : notifications « à vous de jouer ».
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  const url = data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Inutile de notifier si la table est déjà affichée au premier plan.
      const visible = clients.some((c) => c.visibilityState === 'visible' && new URL(c.url).pathname === url);
      if (visible) return undefined;
      return self.registration.showNotification(data.title || 'El Presidente', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: url,
        renotify: true,
        data: { url },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (new URL(c.url).pathname === url && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
