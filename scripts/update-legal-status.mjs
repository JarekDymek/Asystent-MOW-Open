import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'assets', 'data', 'legal-status.json');
const previous = JSON.parse(await fs.readFile(target, 'utf8'));
const oldByEli = new Map((previous.tracked || []).map(item => [item.eli, item]));
const tracked = [];
const relatedIds = new Map();
const errors = [];
let successes = 0;

for (const configured of previous.tracked || []) {
  try {
    const details = await fetchAct(configured.eli);
    tracked.push(normalizeAct(details, configured.eli));
    successes += 1;
    collectRelatedActs(details.references, relatedIds, configured.eli);
  } catch (error) {
    errors.push(`${configured.eli}: ${error.message}`);
    tracked.push(configured);
  }
}

if (!successes) {
  throw new Error(`Nie udało się sprawdzić żadnego aktu ELI. ${errors.join(' | ')}`);
}

const trackedIds = new Set(tracked.map(item => item.eli));
const candidateIds = [...relatedIds.keys()].filter(eli => !trackedIds.has(eli)).slice(0, 20);
const candidates = [];
for (const eli of candidateIds) {
  try {
    const details = await fetchAct(eli);
    candidates.push({
      ...normalizeAct(details, eli),
      relation: [...relatedIds.get(eli).relations].join(', '),
      relatedTo: [...relatedIds.get(eli).relatedTo]
    });
  } catch (error) {
    errors.push(`${eli}: ${error.message}`);
  }
}

candidates.sort((a, b) => String(b.promulgation || b.changeDate).localeCompare(String(a.promulgation || a.changeDate)));

const output = {
  ok: true,
  checkedAt: new Date().toISOString(),
  source: 'API ELI Sejmu RP - urzędowe metadane aktów prawnych',
  sourceDocumentation: 'https://api.sejm.gov.pl/eli_pl.html',
  partial: errors.length > 0,
  errors,
  tracked,
  candidates: candidates.slice(0, 12)
};

await fs.writeFile(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`ELI: sprawdzono ${successes}/${tracked.length} aktów, kandydaci: ${output.candidates.length}, błędy: ${errors.length}.`);

async function fetchAct(eli) {
  const parts = String(eli).split('/');
  if (parts.length !== 3 || !/^[A-Z]+$/.test(parts[0]) || !/^\d{4}$/.test(parts[1]) || !/^\d+$/.test(parts[2])) {
    throw new Error('niepoprawny identyfikator ELI');
  }
  const url = `https://api.sejm.gov.pl/eli/acts/${parts.map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Asystent-MOW-Open-Legal-Monitor/1.0' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeAct(details, fallbackEli) {
  const eli = details.ELI || fallbackEli;
  return {
    eli,
    displayAddress: details.displayAddress || oldByEli.get(eli)?.displayAddress || eli,
    title: details.title || oldByEli.get(eli)?.title || 'Akt prawny',
    status: details.status || 'sprawdź status w ELI',
    inForce: details.inForce || '',
    changeDate: details.changeDate || '',
    promulgation: details.promulgation || '',
    entryIntoForce: details.entryIntoForce || details.validFrom || '',
    url: `https://eli.gov.pl/eli/${eli}/ogl`
  };
}

function collectRelatedActs(references = {}, destination, sourceEli) {
  for (const [relation, entries] of Object.entries(references || {})) {
    if (!/(akty zmieniające|nowelizacje po tekście jednolitym)/i.test(relation)) continue;
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry?.id) continue;
      if (!destination.has(entry.id)) destination.set(entry.id, { relations: new Set(), relatedTo: new Set() });
      destination.get(entry.id).relations.add(relation);
      destination.get(entry.id).relatedTo.add(sourceEli);
    }
  }
}
