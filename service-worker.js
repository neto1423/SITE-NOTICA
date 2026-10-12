const CACHE_NAME = 'giro360-shell-v27';
const APP_BASE = new URL('./', self.registration.scope);
const APP_SHELL = [
  new URL('index.html', APP_BASE).href,
  new URL('fontes.html', APP_BASE).href,
  new URL('styles.css?v=20261012-26', APP_BASE).href,
  new URL('app.js?v=20261012-26', APP_BASE).href,
  new URL('manifest.webmanifest', APP_BASE).href,
  new URL('icon.svg', APP_BASE).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.includes('/api/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          const cacheKey = new Request(event.request.url, { method: 'GET' });
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return caches.match(new URL('index.html', APP_BASE).href);
      }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || 'Uma nova notícia foi encontrada.' };
  }

  const options = {
    body: payload.body || 'Uma nova notícia foi encontrada.',
    icon: new URL('icon.svg', APP_BASE).href,
    badge: new URL('icon.svg', APP_BASE).href,
    data: { url: payload.url || APP_BASE.href },
    renotify: false,
    tag: payload.url || 'giro360-news',
  };

  if (payload.image && /^https?:\/\//i.test(payload.image)) {
    options.image = payload.image;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'GIRO 360', options),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let destination = new URL('index.html', APP_BASE);
  try {
    const requested = new URL(
      event.notification.data?.url || APP_BASE.href,
      APP_BASE,
    );
    if (requested.origin === self.location.origin) destination = requested;
  } catch {
    destination = new URL('index.html', APP_BASE);
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (clients) => {
        const appClient = clients.find((client) => client.url.startsWith(self.location.origin));
        if (appClient) {
          appClient.navigate(destination.href);
          return appClient.focus();
        }
        return self.clients.openWindow(destination.href);
      },
    ),
  );
});
