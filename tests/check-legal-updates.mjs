import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const status = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/legal-status.json'), 'utf8'));
const laws = fs.readFileSync(path.join(root, 'assets/js/data-laws.js'), 'utf8');

if (!/^\d{4}-\d{2}-\d{2}/.test(status.checkedAt || '')) throw new Error('Brak daty kontroli prawa.');
if (!Array.isArray(status.tracked) || status.tracked.length < 5) throw new Error('Rejestr aktualności prawa jest niekompletny.');

for (const act of status.tracked) {
  if (!act.title || !act.url || !act.status) throw new Error('Niepełny wpis rejestru prawa.');
  const url = new URL(act.url);
  if (url.hostname !== 'eli.gov.pl') throw new Error(`Nieurzędowe źródło aktu: ${act.url}`);
}

for (const required of [
  'https://eli.gov.pl/eli/DU/2026/163/ogl',
  'https://eli.gov.pl/eli/DU/2023/651/ogl'
]) {
  if (!laws.includes(required) && !status.tracked.some(act => act.url === required)) {
    throw new Error(`Brak podstawowego źródła ELI: ${required}`);
  }
}

console.log(`OK: ${status.tracked.length} monitorowanych aktów ma urzędowe źródła ELI.`);
