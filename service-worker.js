// --- Service Worker for Offline First PWA ---

const CACHE_NAME = 'pwa-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest'
  // Ikon akan di-cache secara dinamis saat diakses
];

// Event 'install': Menyimpan aset inti aplikasi (app shell) ke dalam cache.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache dibuka dan app shell disimpan');
        return cache.addAll(urlsToCache);
      })
  );
});

// Event 'activate': Membersihkan cache lama agar aplikasi selalu menggunakan versi terbaru.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Membersihkan cache lama', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Event 'fetch': Menerapkan strategi Network-first, falling back to cache.
self.addEventListener('fetch', event => {
  // Hanya proses request GET.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    // 1. Coba ambil dari jaringan terlebih dahulu.
    fetch(event.request)
      .then(response => {
        // Cek jika response valid.
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Penting: gandakan response. Response adalah stream dan hanya bisa
        // dikonsumsi sekali. Kita perlu satu untuk browser, satu untuk cache.
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // 2. Jika jaringan gagal, coba ambil dari cache.
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Optional: Jika tidak ada di cache, bisa tampilkan halaman offline kustom.
          });
      })
  );
});
