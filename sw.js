const CACHE = 'asmow-open-v9';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/css/base.css',
  './assets/css/layout.css',
  './assets/css/components.css',
  './assets/css/home.css',
  './assets/css/procedures.css',
  './assets/css/social-levels.css',
  './assets/css/detail.css',
  './assets/css/notes.css',
  './assets/css/ai.css',
  './assets/css/harmonogram.css',
  './assets/css/current-info.css',
  './assets/css/sync.css',
  './assets/css/utilities.css',
  './assets/js/data-schedule.js',
  './assets/js/data-procedures.js',
  './assets/js/data-social-levels.js',
  './assets/js/data-quick-actions.js',
  './assets/js/data-chat-pills.js',
  './assets/js/data-laws.js',
  './assets/js/data-answer-bank.js',
  './assets/data/legal-status.json',
  './assets/vendor/mammoth.browser.min.js',
  './assets/vendor/xlsx.full.min.js',
  './assets/vendor/qrcode.min.js',
  './assets/vendor/jsQR.js',
  './assets/vendor/pdf.min.mjs',
  './assets/vendor/pdf.worker.min.mjs',
  './assets/vendor/postal-mime/address-parser.js',
  './assets/vendor/postal-mime/base64-decoder.js',
  './assets/vendor/postal-mime/base64-encoder.js',
  './assets/vendor/postal-mime/decode-strings.js',
  './assets/vendor/postal-mime/html-entities.js',
  './assets/vendor/postal-mime/mime-node.js',
  './assets/vendor/postal-mime/package.json',
  './assets/vendor/postal-mime/pass-through-decoder.js',
  './assets/vendor/postal-mime/postal-mime.js',
  './assets/vendor/postal-mime/qp-decoder.js',
  './assets/vendor/postal-mime/text-format.js',
  './assets/js/open-db.js',
  './assets/js/state.js',
  './assets/js/utils.js',
  './assets/js/files.js',
  './assets/js/schedule-parser.js',
  './assets/js/document-import.js',
  './assets/js/accordion.js',
  './assets/js/navigation.js',
  './assets/js/clock.js',
  './assets/js/day-schedule.js',
  './assets/js/main-actions.js',
  './assets/js/procedures.js',
  './assets/js/social-levels.js',
  './assets/js/law.js',
  './assets/js/notes.js',
  './assets/js/current-info.js',
  './assets/js/help.js',
  './assets/js/answer-bank-loader.js',
  './assets/js/answer-bank.js',
  './assets/js/local-assistant.js',
  './assets/js/ai-config.js',
  './assets/js/ai-chat.js',
  './assets/js/ai-voice.js',
  './assets/js/tab-ai.js',
  './assets/js/harmonogram.js',
  './assets/js/weekly-plan.js',
  './assets/js/knowledge-storage.js',
  './assets/js/knowledge-list.js',
  './assets/js/knowledge-form.js',
  './assets/js/knowledge-context.js',
  './assets/js/device-sync.js',
  './assets/js/backup.js',
  './assets/js/pwa.js',
  './assets/js/app.js',
  './knowledge/central-knowledge.json',
  './knowledge/01_wyciag_mow_ustawa_resocjalizacja_2026.md',
  './knowledge/02_wyciag_mow_rozporzadzenie_placowki_2023.md',
  './knowledge/03_wyciag_mow_prawo_oswiatowe_organizacja.md',
  './knowledge/04_wyciag_mow_praca_wychowawcy_awans_czas_pracy.md',
  './knowledge/05_wyciag_mow_bezpieczenstwo_dokumentacja_pomoc.md',
  './knowledge/06_odpowiedzi_wzorcowe_mow.md',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.endsWith('/assets/data/legal-status.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return response;
      }).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response && response.ok && url.origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
      }
      return response;
    }).catch(() => cached))
  );
});
