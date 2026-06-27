// Custom service worker additions — merged into the next-pwa generated SW.
// Handles Web Push notifications and notificationclick.

/* eslint-disable no-restricted-globals */

self.addEventListener('push', function (event) {
  if (!event.data) return;
  var data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'Warfare Fitness', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Warfare Fitness', {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: { url: '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (client.url.indexOf(url) !== -1 && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
