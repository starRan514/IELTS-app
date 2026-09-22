// 简易离线缓存：安装时缓存应用外壳，其余请求 stale-while-revalidate
const CACHE = 'ielts-app-v3';
const SHELL = [
  './', './index.html', './css/style.css',
  './js/app.js', './js/data.js', './js/store.js', './js/tts.js', './js/ai.js', './js/supabase.js',
  './js/modules/home.js', './js/modules/reading.js', './js/modules/listening.js',
  './js/modules/writing.js', './js/modules/speaking.js', './js/modules/vocab.js',
  './js/modules/settings.js', './js/modules/importer.js', './js/modules/auth.js',
  './vendor/mammoth.browser.min.js',
  './vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs',
  './assets/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // 网络优先：保证开发期即时更新；离线时回退缓存
  e.respondWith(
    fetch(request).then(res => {
      if (res && res.status === 200 && new URL(request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    }).catch(() => caches.match(request).then(hit =>
      hit || caches.match('./index.html')))
  );
});
