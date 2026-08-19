/* Encrypted backup and merge. The passphrase never leaves the device. */
const OPEN_BACKUP_VERSION = '2';

async function exportLocalBackup(share = false) {
  const password = getBackupPassword();
  if (password.length < 8) return setBackupStatus('Ustaw hasło kopii o długości co najmniej 8 znaków.');
  setBackupStatus('Tworzę i szyfruję kopię danych...');
  try {
    const snapshot = await OpenData.exportSnapshot();
    const envelope = await encryptOpenPayload(snapshot, password);
    const filename = `Asystent-MOW-Open-${new Date().toISOString().slice(0, 10)}.asmow`;
    const file = new File([JSON.stringify(envelope)], filename, { type: 'application/vnd.asmow.open+json' });
    if (share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'Kopia Asystenta MOW Open', files: [file] });
      setBackupStatus('Przekazano zaszyfrowaną kopię do wybranej aplikacji lub urządzenia.');
    } else {
      downloadBlob(file, filename);
      setBackupStatus('Pobrano zaszyfrowaną kopię. Hasło będzie potrzebne przy przywracaniu.');
    }
  } catch (error) {
    setBackupStatus(`Nie udało się utworzyć kopii: ${error.message}`);
  }
}

async function importLocalBackup(input) {
  const file = input.files?.[0];
  if (!file) return;
  const password = getBackupPassword();
  if (!password) {
    input.value = '';
    return setBackupStatus('Wpisz hasło użyte przy tworzeniu kopii.');
  }
  setBackupStatus('Odszyfrowuję i sprawdzam kopię...');
  try {
    const envelope = JSON.parse(await file.text());
    const snapshot = await decryptOpenPayload(envelope, password);
    const summary = await OpenData.mergeSnapshot(snapshot);
    setBackupStatus(`Scalono kopię: nowe ${summary.added}, zaktualizowane ${summary.updated}, pliki ${summary.files}, bez zmian ${summary.unchanged}${summary.conflicts.length ? `, konflikty ${summary.conflicts.length}` : ''}. Odświeżam widoki...`);
    await refreshOpenDataViews();
  } catch (error) {
    setBackupStatus(`Nie udało się przywrócić kopii. Sprawdź hasło i plik. Szczegóły: ${error.message}`);
  } finally {
    input.value = '';
  }
}

async function clearLocalDeviceData() {
  if (!confirm('Usunąć wiadomości, pliki, harmonogramy, notatki i lokalną bazę wiedzy z tego urządzenia?')) return;
  if (!confirm('Bez zaszyfrowanej kopii tej operacji nie można cofnąć. Kontynuować?')) return;
  await OpenData.clearAll();
  ['asmow_open_educator', CHAT_DRAFT_KEY, 'mow_day_schedule_collapsed_v1', LEGAL_STATUS_STORE_KEY].forEach(key => localStorage.removeItem(key));
  setBackupStatus('Dane lokalne usunięto. Odświeżam aplikację...');
  setTimeout(() => window.location.reload(), 500);
}

function getBackupPassword() {
  return document.getElementById('backup-password')?.value || '';
}

async function encryptOpenPayload(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveOpenKey(password, salt, ['encrypt']);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = await compressOpenBytes(plain);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed.bytes);
  return {
    format: 'asmow-open-encrypted',
    version: OPEN_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: 250000,
    compressed: compressed.compressed,
    salt: OpenData.arrayBufferToBase64(salt),
    iv: OpenData.arrayBufferToBase64(iv),
    data: OpenData.arrayBufferToBase64(encrypted)
  };
}

async function decryptOpenPayload(envelope, password) {
  if (envelope?.format !== 'asmow-open-encrypted' || !envelope.salt || !envelope.iv || !envelope.data) {
    throw new Error('To nie jest zaszyfrowana kopia Asystenta MOW Open.');
  }
  const salt = OpenData.base64ToUint8Array(envelope.salt);
  const iv = OpenData.base64ToUint8Array(envelope.iv);
  const data = OpenData.base64ToUint8Array(envelope.data);
  const key = await deriveOpenKey(password, salt, ['decrypt'], Number(envelope.iterations || 250000));
  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    throw new Error('Nieprawidłowe hasło albo uszkodzony plik.');
  }
  const bytes = await decompressOpenBytes(new Uint8Array(decrypted), Boolean(envelope.compressed));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function deriveOpenKey(password, salt, usages, iterations = 250000) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

async function compressOpenBytes(bytes) {
  if (!('CompressionStream' in window)) return { bytes, compressed: false };
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), compressed: true };
}

async function decompressOpenBytes(bytes, compressed) {
  if (!compressed) return bytes;
  if (!('DecompressionStream' in window)) throw new Error('Ta przeglądarka nie obsługuje rozpakowania kopii. Użyj aktualnego Chrome, Edge lub Safari.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function refreshOpenDataViews() {
  await loadCurrentInfo();
  await loadInternatScheduleIndexFromDb();
  await loadKnowledgeBase();
  renderKnowledgeList();
  await loadChatHistory();
}

function setBackupStatus(text) {
  const element = document.getElementById('backup-status');
  if (element) element.textContent = text;
}

window.OpenBackupCrypto = { encryptOpenPayload, decryptOpenPayload };
