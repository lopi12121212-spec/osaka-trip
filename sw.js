importScripts('config.js');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let a = {};
    try {
      if (event.data) a = event.data.json();
    } catch (e) {}
    if (!a.title) {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        const url = self.CFG.API_URL + '?api=alert&ep=' + encodeURIComponent(sub ? sub.endpoint : '');
        a = await (await fetch(url)).json();
      } catch (e) {}
    }
    await self.registration.showNotification(a.title || '다음 장소로 이동할 시간', {
      body: a.body || '눌러서 길찾기 열기',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'leg',
      renotify: true,
      data: { id: a.id || '' }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id = (event.notification.data || {}).id || '';
  const target = self.registration.scope + (id ? '?go=' + encodeURIComponent(id) : '');
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('navigate' in c) { await c.focus(); return c.navigate(target); }
    }
    return self.clients.openWindow(target);
  })());
});
