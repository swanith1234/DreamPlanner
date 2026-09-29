// Service Worker for Push Notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .then(() => self.clients.claim())
            .then(() => console.log('Service Worker Activated'))
    );
});

self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: data.icon || '/pwa-192x192.png',
            badge: '/badge-72x72.png',
            vibrate: [100, 50, 100],
            actions: data.pushActions || data.actions || [],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: '2',
                url: data.data?.url || '/app/home',
                apiUrl: data.data?.apiUrl,
                apiPath: data.data?.apiPath
            }
        };
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    console.log('On notification click: ', event.notification.tag);

    // If an action button was clicked, handle it silently without opening the app window
    if (event.action) {
        const { apiUrl, apiPath } = event.notification.data;
        let deltaValue = 0;
        if (event.action === 'add_25') deltaValue = 25;
        else if (event.action === 'add_50') deltaValue = 50;
        else if (event.action === 'mark_done') deltaValue = 100;

        if (deltaValue > 0) {
            const now = new Date();
            const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            event.waitUntil(
                fetch(`${apiUrl}${apiPath}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // Includes HTTP-only cookies securely
                    body: JSON.stringify({ delta: deltaValue, localDate })
                }).then(response => {
                    console.log(`Task progress updated by +${deltaValue} from push action`);
                    event.notification.close();
                }).catch(error => {
                    console.error('Failed to update task progress from push action', error);
                    event.notification.close();
                })
            );
            return;
        }
    }

    event.notification.close();

    // This looks to see if the current is already open and
    // focuses if it is
    event.waitUntil(
        clients.matchAll({
            type: "window"
        })
            .then(function (clientList) {
                const urlToOpen = event.notification.data.url || '/app/home';

                for (var i = 0; i < clientList.length; i++) {
                    var client = clientList[i];
                    if (client.url === urlToOpen && 'focus' in client)
                        return client.focus();
                }
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});
