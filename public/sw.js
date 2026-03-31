// Service Worker v2 - ProFinanzas Push Notifications
// CRITICAL: install + activate handlers ensure immediate control

self.addEventListener('install', function(event) {
    console.info('[Service Worker] Installing v2...');
    // Skip waiting to activate immediately (don't wait for old SW)
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.info('[Service Worker] Activated v2 - Taking control of all clients');
    // Claim all open tabs immediately so push events work right away
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
    console.info('[Service Worker] Push Event received.');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
            console.log('[Service Worker] Push Payload:', JSON.stringify(data));
        } catch (e) {
            console.error('[Service Worker] Error parsing push data:', e);
            data = {
                title: 'Nueva Notificación',
                body: event.data.text()
            };
        }
    }

    const title = data.title || data.titulo || 'Sistema PF';
    const options = {
        body: data.body || data.mensaje || 'Tienes una nueva actualización.',
        icon: '/favicon.ico', 
        badge: '/favicon.ico',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || data.link || '/'
        },
        actions: [
            { action: 'open', title: 'Ver detalle' }
        ],
        tag: 'pf-notification-' + Date.now(),
        renotify: true,
        requireInteraction: true,
        silent: false
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => console.info('[Service Worker] Notification displayed successfully.'))
            .catch(err => console.error('[Service Worker] CRITICAL: Error showing notification:', err))
    );
});

self.addEventListener('notificationclick', function(event) {
    console.info('[Service Worker] Notification click received.');
    event.notification.close();

    const urlToOpen = event.notification.data.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});
