// Service worker do Vyllorri Beauty: mostra as notificações do salão mesmo com o app fechado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Vyllorri Beauty', {
    body: data.body || '',
    icon: '/brand/vyllorri-v-192.png',
    badge: '/brand/vyllorri-v-64.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if (w.url.startsWith(self.location.origin)) return w.navigate(url).then((c) => c && c.focus());
    return self.clients.openWindow(url);
  })());
});
