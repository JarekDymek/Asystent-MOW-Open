/* Local, device-owned database used by Asystent MOW Open. */
(function () {
  const DB_NAME = 'asmow-open-data-v2';
  const DB_VERSION = 1;
  const RECORDS = 'records';
  const FILES = 'files';
  const META = 'meta';
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORDS)) {
          const records = db.createObjectStore(RECORDS, { keyPath: 'id' });
          records.createIndex('type', 'type', { unique: false });
          records.createIndex('hash', 'hash', { unique: false });
          records.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(FILES)) {
          const files = db.createObjectStore(FILES, { keyPath: 'id' });
          files.createIndex('hash', 'hash', { unique: false });
        }
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Nie udało się otworzyć lokalnej bazy danych.'));
      request.onblocked = () => reject(new Error('Baza jest otwarta w innej karcie. Zamknij pozostałe karty aplikacji.'));
    });
    return dbPromise;
  }

  async function run(storeNames, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const stores = Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]));
      let result;
      try {
        result = action(stores, tx);
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Błąd zapisu lokalnej bazy danych.'));
      tx.onabort = () => reject(tx.error || new Error('Zapis lokalnej bazy został przerwany.'));
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function makeId(prefix = 'record') {
    return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  }

  function normalizeRecord(record = {}) {
    const now = new Date().toISOString();
    return {
      id: String(record.id || makeId(record.type || 'record')),
      type: String(record.type || 'document'),
      hash: String(record.hash || ''),
      createdAt: String(record.createdAt || now),
      updatedAt: String(record.updatedAt || now),
      version: Math.max(1, Number(record.version || 1)),
      deleted: Boolean(record.deleted),
      payload: record.payload && typeof record.payload === 'object' ? record.payload : {}
    };
  }

  async function putRecord(record) {
    const normalized = normalizeRecord(record);
    await run([RECORDS], 'readwrite', stores => stores[RECORDS].put(normalized));
    return normalized;
  }

  async function addRecord(type, payload, options = {}) {
    return putRecord({
      ...options,
      id: options.id || makeId(type),
      type,
      payload
    });
  }

  async function getRecord(id) {
    const db = await open();
    return requestValue(db.transaction(RECORDS, 'readonly').objectStore(RECORDS).get(String(id)));
  }

  async function getRecords(type = '', options = {}) {
    const db = await open();
    const store = db.transaction(RECORDS, 'readonly').objectStore(RECORDS);
    const values = type
      ? await requestValue(store.index('type').getAll(String(type)))
      : await requestValue(store.getAll());
    return values
      .filter(record => options.includeDeleted || !record.deleted)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function removeRecord(id) {
    const current = await getRecord(id);
    if (!current) return false;
    await putRecord({
      ...current,
      deleted: true,
      version: Number(current.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      payload: { deletedReason: 'user' }
    });
    return true;
  }

  async function sha256(input) {
    const buffer = input instanceof ArrayBuffer
      ? input
      : ArrayBuffer.isView(input)
        ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : input instanceof Blob
          ? await input.arrayBuffer()
          : new TextEncoder().encode(String(input)).buffer;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function putFile(file, options = {}) {
    const blob = file instanceof Blob ? file : new Blob([file]);
    const hash = options.hash || await sha256(blob);
    const db = await open();
    const existing = await requestValue(db.transaction(FILES, 'readonly').objectStore(FILES).index('hash').get(hash));
    if (existing) return fileMeta(existing);
    const value = {
      id: options.id || `file-${hash.slice(0, 24)}`,
      hash,
      name: String(options.name || file?.name || 'dokument'),
      mimeType: String(options.mimeType || file?.type || 'application/octet-stream'),
      size: blob.size,
      createdAt: String(options.createdAt || new Date().toISOString()),
      blob
    };
    await run([FILES], 'readwrite', stores => stores[FILES].put(value));
    return fileMeta(value);
  }

  function fileMeta(value) {
    if (!value) return null;
    const { blob, ...meta } = value;
    return meta;
  }

  async function getFile(id) {
    const db = await open();
    return requestValue(db.transaction(FILES, 'readonly').objectStore(FILES).get(String(id)));
  }

  async function getFiles() {
    const db = await open();
    return requestValue(db.transaction(FILES, 'readonly').objectStore(FILES).getAll());
  }

  async function setMeta(key, value) {
    await run([META], 'readwrite', stores => stores[META].put({ key: String(key), value, updatedAt: new Date().toISOString() }));
  }

  async function getMeta(key, fallback = null) {
    const db = await open();
    const item = await requestValue(db.transaction(META, 'readonly').objectStore(META).get(String(key)));
    return item ? item.value : fallback;
  }

  async function exportSnapshot() {
    const [records, files] = await Promise.all([getRecords('', { includeDeleted: true }), getFiles()]);
    const encodedFiles = [];
    for (const file of files) {
      encodedFiles.push({
        ...fileMeta(file),
        dataBase64: arrayBufferToBase64(await file.blob.arrayBuffer())
      });
    }
    return {
      format: 'asmow-open-snapshot',
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
      files: encodedFiles
    };
  }

  async function mergeSnapshot(snapshot = {}) {
    if (snapshot.format !== 'asmow-open-snapshot' || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.files)) {
      throw new Error('Plik nie zawiera prawidłowej bazy Asystenta MOW Open.');
    }
    const summary = { added: 0, updated: 0, unchanged: 0, files: 0, conflicts: [] };
    const localRecords = await getRecords('', { includeDeleted: true });
    const localById = new Map(localRecords.map(record => [record.id, record]));
    const localByHash = new Map(localRecords.filter(record => record.hash).map(record => [record.hash, record]));

    for (const incomingRaw of snapshot.records) {
      const incoming = normalizeRecord(incomingRaw);
      const sameId = localById.get(incoming.id);
      const sameHash = incoming.hash ? localByHash.get(incoming.hash) : null;
      if (!sameId && sameHash && !incoming.deleted) {
        summary.unchanged += 1;
        continue;
      }
      if (!sameId) {
        await putRecord(incoming);
        summary.added += 1;
        continue;
      }
      const comparison = compareRecordFreshness(incoming, sameId);
      if (comparison > 0) {
        await putRecord(incoming);
        summary.updated += 1;
      } else if (comparison === 0 && incoming.hash && sameId.hash && incoming.hash !== sameId.hash) {
        summary.conflicts.push({ id: incoming.id, local: sameId, incoming });
      } else {
        summary.unchanged += 1;
      }
    }

    const currentFiles = await getFiles();
    const fileHashes = new Set(currentFiles.map(file => file.hash));
    for (const encoded of snapshot.files) {
      if (!encoded?.dataBase64 || fileHashes.has(encoded.hash)) continue;
      const bytes = base64ToUint8Array(encoded.dataBase64);
      const actualHash = await sha256(bytes);
      if (encoded.hash && actualHash !== encoded.hash) throw new Error(`Plik ${encoded.name || ''} ma nieprawidłową sumę kontrolną.`);
      await putFile(new Blob([bytes], { type: encoded.mimeType || 'application/octet-stream' }), encoded);
      fileHashes.add(actualHash);
      summary.files += 1;
    }
    return summary;
  }

  function compareRecordFreshness(a, b) {
    const versionDifference = Number(a.version || 1) - Number(b.version || 1);
    if (versionDifference) return versionDifference;
    return String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''));
  }

  async function search(query, options = {}) {
    const terms = normalizeSearch(query).split(' ').filter(term => term.length > 2);
    if (!terms.length) return [];
    const records = await getRecords(options.type || '');
    return records.map(record => {
      const text = recordSearchText(record);
      const normalized = normalizeSearch(text);
      const hits = terms.filter(term => normalized.includes(term));
      const title = normalizeSearch(record.payload?.title || record.payload?.name || '');
      const titleHits = terms.filter(term => title.includes(term)).length;
      return { record, score: hits.length + (titleHits * 2), text };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || String(b.record.updatedAt).localeCompare(String(a.record.updatedAt)))
      .slice(0, options.limit || 12);
  }

  function recordSearchText(record) {
    const payload = record?.payload || {};
    return [
      payload.title, payload.topic, payload.source, payload.body, payload.text,
      payload.content, payload.name, payload.sourceFilename,
      ...(Array.isArray(payload.tags) ? payload.tags : [])
    ].filter(Boolean).join('\n');
  }

  function normalizeSearch(value = '') {
    return String(value).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async function clearAll() {
    await run([RECORDS, FILES, META], 'readwrite', stores => {
      stores[RECORDS].clear();
      stores[FILES].clear();
      stores[META].clear();
    });
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    for (let index = 0; index < bytes.length; index += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
    }
    return btoa(chunks.join(''));
  }

  function base64ToUint8Array(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  window.OpenData = {
    open,
    putRecord,
    addRecord,
    getRecord,
    getRecords,
    removeRecord,
    putFile,
    getFile,
    getFiles,
    setMeta,
    getMeta,
    exportSnapshot,
    mergeSnapshot,
    search,
    sha256,
    clearAll,
    arrayBufferToBase64,
    base64ToUint8Array
  };
})();
