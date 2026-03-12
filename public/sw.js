self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push Event received.');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
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
        vibrate: [100, 50, 100],
        data: {
            url: data.url || data.link || '/'
        },
        actions: [
            { action: 'open', title: 'Ver detalle' }
        ],
        tag: 'pf-notification-' + (data.id || Date.now()),
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Notification click received.');
    event.notification.close();

    const urlToOpen = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // Check if there is already a window open with this URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
