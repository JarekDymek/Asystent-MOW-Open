import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const frontendFiles = ['index.html', 'sw.js', ...walk('assets/js'), ...walk('assets/css')];
const frontend = frontendFiles.map(file => `\n/* ${file} */\n${read(file)}`).join('\n');

for (const forbidden of [
  /https?:\/\/[^'"\s]*onrender\.com/i,
  /script\.google\.com\/macros/i,
  /\/api\/(?:chat|current-info|harmonogram|test-profile)/i,
  /CURRENT_INFO_IMAP/i,
  /ADMIN_TOKEN|VIEW_TOKEN|GEMINI_API_KEY|OPENAI_API_KEY/i
]) {
  if (forbidden.test(frontend)) throw new Error(`Wersja Open zawiera zabronione połączenie lub sekret: ${forbidden}`);
}

for (const removed of ['backend', 'Dockerfile', 'render.yaml', 'assets/js/test-access.js']) {
  if (exists(removed)) throw new Error(`Wersja Open nie powinna zawierać: ${removed}`);
}

for (const required of [
  'assets/js/open-db.js',
  'assets/js/document-import.js',
  'assets/js/local-assistant.js',
  'assets/js/device-sync.js',
  'scripts/update-legal-status.mjs',
  '.github/workflows/pages.yml',
  '.github/workflows/update-legal-status.yml',
  'assets/vendor/mammoth.browser.min.js',
  'assets/vendor/xlsx.full.min.js',
  'assets/vendor/pdf.min.mjs',
  'assets/vendor/postal-mime/postal-mime.js',
  'knowledge/central-knowledge.json'
]) {
  if (!exists(required)) throw new Error(`Brak elementu architektury Open: ${required}`);
}

const manifest = JSON.parse(read('manifest.webmanifest'));
if (manifest.name !== 'Asystent MOW Open') throw new Error('Manifest nie ma odrębnej nazwy wersji Open.');
if (manifest.id !== './' || manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('Manifest musi mieć względny identyfikator, start_url i scope dla GitHub Pages.');
}

const db = read('assets/js/open-db.js');
const backup = read('assets/js/backup.js');
const sync = read('assets/js/device-sync.js');
if (!db.includes("const DB_NAME = 'asmow-open-data-v2'") || !db.includes('indexedDB.open(DB_NAME')) {
  throw new Error('Brak odrębnej bazy IndexedDB wersji Open.');
}
if (/migrateLegacyData|mow_chat_history_v2|mow_chat_draft_v2/.test(frontend)) {
  throw new Error('Wersja Open nie może automatycznie przejmować historii ani danych prywatnego Asystenta.');
}
if (!backup.includes('AES-GCM') || !backup.includes('PBKDF2')) throw new Error('Kopia danych nie ma wymaganego szyfrowania.');
if (!sync.includes('iceServers: []')) throw new Error('Synchronizacja powinna działać bez zewnętrznego STUN/TURN.');
if (!sync.includes('crypto.subtle.encrypt')) throw new Error('Synchronizacja urządzeń nie szyfruje przesyłanych danych.');

const legalUpdater = read('scripts/update-legal-status.mjs');
const serviceWorker = read('sw.js');
const spreadsheetLibrary = read('assets/vendor/xlsx.full.min.js');
if (!legalUpdater.includes('https://api.sejm.gov.pl/eli/acts/')) {
  throw new Error('Aktualizator prawa nie korzysta z oficjalnego API ELI.');
}
if (!serviceWorker.includes("url.pathname.endsWith('/assets/data/legal-status.json')")) {
  throw new Error('PWA nie ma odświeżania sieciowego rejestru prawa.');
}
if (!spreadsheetLibrary.includes('0.20.3')) {
  throw new Error('Lokalny parser Excela nie ma bezpieczniejszej wersji SheetJS 0.20.3.');
}

console.log(`OK: architektura Open jest lokalna, bez backendu i sekretów (${frontendFiles.length} plików sprawdzonych).`);

function walk(directory) {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(directory.replace(/\\/g, '/'), entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}
