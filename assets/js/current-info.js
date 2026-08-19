/* Local archive of director information. No mailbox credentials are used. */
const CURRENT_INFO_START_DATE = '2026-01-01';
let currentInfoDraftFiles = [];

async function loadCurrentInfo() {
  try {
    const records = await OpenData.getRecords('currentInfo');
    currentInfoItems = records
      .map(record => normalizeCurrentInfoItem({ ...record.payload, _recordId: record.id }))
      .filter(item => item.title || item.body);
  } catch {
    currentInfoItems = [];
  }
  renderCurrentInfoList();
  return currentInfoItems;
}

function normalizeCurrentInfoItem(item = {}) {
  return {
    id: String(item.id || item._recordId || `info-${Date.now()}`),
    _recordId: String(item._recordId || item.id || ''),
    date: normalizeInfoDate(item.date),
    title: String(item.title || 'Informacja bez tytułu').trim().slice(0, 180),
    topic: String(item.topic || 'informacja').trim().slice(0, 120),
    source: String(item.source || 'Plik dodany lokalnie').trim().slice(0, 220),
    body: String(item.body || '').trim().slice(0, 100_000),
    originalFileId: String(item.originalFileId || ''),
    attachments: normalizeCurrentInfoAttachments(item.attachments),
    importedAt: String(item.importedAt || item.updatedAt || new Date().toISOString())
  };
}

function normalizeCurrentInfoAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.slice(0, 30).map((attachment, index) => ({
    id: String(attachment.id || attachment.fileId || `attachment-${index}`),
    fileId: String(attachment.fileId || attachment.id || ''),
    name: String(attachment.name || `Załącznik ${index + 1}`).slice(0, 180),
    mimeType: String(attachment.mimeType || attachment.contentType || 'application/octet-stream').slice(0, 140),
    size: Number(attachment.size || 0),
    hash: String(attachment.hash || '')
  })).filter(attachment => attachment.fileId);
}

function normalizeInfoDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? new Date().toISOString().slice(0, 10) : new Date(parsed).toISOString().slice(0, 10);
}

function sortCurrentInfo(items) {
  return [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.importedAt).localeCompare(String(a.importedAt)));
}

function renderCurrentInfoList() {
  const list = document.getElementById('current-info-list');
  if (!list) return;
  const query = normalizeForCurrentInfoSearch(document.getElementById('current-info-search')?.value || '');
  const filtered = sortCurrentInfo(currentInfoItems).filter(item => {
    if (!query) return true;
    const attachmentNames = item.attachments.map(attachment => attachment.name).join(' ');
    return normalizeForCurrentInfoSearch(`${item.date} ${item.title} ${item.topic} ${item.source} ${item.body} ${attachmentNames}`).includes(query);
  });
  list.replaceChildren(...filtered.map(createCurrentInfoRow));
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'current-info-empty';
    empty.textContent = query ? 'Nie znaleziono pasujących informacji.' : 'Archiwum jest puste. Dodaj wiadomość lub plik otrzymany od dyrekcji.';
    list.appendChild(empty);
  }
  updateCurrentInfoCounter(filtered.length, currentInfoItems.length);
}

function createCurrentInfoRow(item) {
  const wrap = document.createElement('article');
  wrap.className = 'current-info-item';
  wrap.dataset.infoId = item.id;
  const toggle = document.createElement('button');
  toggle.className = 'current-info-toggle';
  toggle.type = 'button';
  toggle.innerHTML = `<span class="current-info-date">${escapeHtml(item.date)}</span><span class="current-info-title">${escapeHtml(item.title)}</span><span class="current-info-topic">${escapeHtml(item.topic)}</span><span class="current-info-state">Rozwiń</span>`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'current-info-delete';
  remove.title = 'Usuń wpis';
  remove.setAttribute('aria-label', `Usuń: ${item.title}`);
  remove.textContent = '🗑';
  remove.onclick = event => { event.stopPropagation(); deleteCurrentInfo(item.id); };
  const body = document.createElement('div');
  body.className = 'current-info-body';
  const source = document.createElement('div');
  source.className = 'current-info-source';
  source.textContent = `Źródło: ${item.source}`;
  const content = document.createElement('div');
  content.className = 'current-info-content';
  content.textContent = item.body || '(brak treści tekstowej)';
  body.append(source, content);
  const attachments = createCurrentInfoAttachments(item);
  if (attachments) body.appendChild(attachments);
  toggle.onclick = () => toggleCurrentInfoBody(item.id, toggle, body);
  wrap.append(toggle, remove, body);
  return wrap;
}

function createCurrentInfoAttachments(item) {
  if (!item.attachments.length && !item.originalFileId) return null;
  const wrap = document.createElement('div');
  wrap.className = 'current-info-attachments';
  const values = [...item.attachments];
  if (item.originalFileId && !values.some(entry => entry.fileId === item.originalFileId)) {
    values.unshift({ id: item.originalFileId, fileId: item.originalFileId, name: 'Oryginalna wiadomość lub dokument', mimeType: '', size: 0 });
  }
  values.forEach(attachment => {
    const row = document.createElement('div');
    row.className = 'current-info-attachment';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.className = 'current-info-attachment-name';
    name.textContent = `📎 ${attachment.name}`;
    const meta = document.createElement('span');
    meta.className = 'current-info-attachment-meta';
    meta.textContent = [formatCurrentInfoAttachmentType(attachment), formatCurrentInfoAttachmentSize(attachment.size)].filter(Boolean).join(' · ');
    info.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'current-info-attachment-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn current-info-file-button';
    open.textContent = 'Otwórz';
    open.onclick = () => openCurrentInfoAttachment(item.id, attachment.fileId);
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'btn sec current-info-file-button';
    download.textContent = 'Pobierz';
    download.onclick = () => downloadCurrentInfoAttachment(item.id, attachment.fileId);
    actions.append(open, download);
    row.append(info, actions);
    wrap.appendChild(row);
  });
  return wrap;
}

function toggleCurrentInfoBody(id, toggle, body) {
  const open = body.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  const state = toggle.querySelector('.current-info-state');
  if (state) state.textContent = open ? 'Zwiń' : 'Rozwiń';
}

async function openCurrentInfoAttachment(itemId, fileId) {
  const stored = await OpenData.getFile(fileId);
  if (!stored) {
    setCurrentInfoStatus('Nie znaleziono pliku w lokalnej bazie. Przywróć kopię albo dodaj dokument ponownie.');
    return;
  }
  const signature = `${stored.name} ${stored.mimeType}`.toLowerCase();
  if (/image\//.test(stored.mimeType) || /application\/pdf/.test(stored.mimeType)) {
    const url = URL.createObjectURL(stored.blob);
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    if (!opened) showLocalDocumentPreview(stored.name, 'Przeglądarka zablokowała nową kartę. Użyj przycisku „Pobierz”.');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  try {
    const file = new File([stored.blob], stored.name, { type: stored.mimeType });
    const parsed = await OpenDocumentImport.parseFile(file);
    showLocalDocumentPreview(stored.name, parsed.text || 'Plik nie zawiera tekstu możliwego do wyświetlenia.');
  } catch (error) {
    if (/\.eml|message\/rfc822/.test(signature)) showLocalDocumentPreview(stored.name, 'Wiadomość jest zapisana lokalnie. Pobierz ją, aby otworzyć w programie pocztowym.');
    else setCurrentInfoStatus(`Nie udało się otworzyć pliku: ${error.message}`);
  }
}

async function downloadCurrentInfoAttachment(itemId, fileId) {
  const stored = await OpenData.getFile(fileId);
  if (!stored) return setCurrentInfoStatus('Nie znaleziono pliku w lokalnej bazie.');
  downloadBlob(stored.blob, stored.name);
  setCurrentInfoStatus(`Pobrano: ${stored.name}.`);
}

function showLocalDocumentPreview(title, text) {
  let modal = document.getElementById('local-document-preview');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'local-document-preview';
    modal.className = 'local-document-preview';
    modal.innerHTML = '<div class="local-document-panel"><div class="local-document-head"><strong></strong><button type="button" aria-label="Zamknij">×</button></div><pre></pre></div>';
    modal.querySelector('button').onclick = () => modal.classList.remove('open');
    modal.onclick = event => { if (event.target === modal) modal.classList.remove('open'); };
    document.body.appendChild(modal);
  }
  modal.querySelector('strong').textContent = title;
  modal.querySelector('pre').textContent = text;
  modal.classList.add('open');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'dokument';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatCurrentInfoAttachmentSize(size = 0) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatCurrentInfoAttachmentType(attachment = {}) {
  const text = `${attachment.name || ''} ${attachment.mimeType || ''}`.toLowerCase();
  if (text.includes('.docx') || text.includes('wordprocessingml')) return 'Word';
  if (text.includes('.xlsx') || text.includes('spreadsheet')) return 'Excel';
  if (text.includes('.pdf')) return 'PDF';
  if (text.includes('.eml') || text.includes('message/rfc822')) return 'E-mail';
  if (text.includes('image/')) return 'Obraz';
  return 'Plik';
}

async function deleteCurrentInfo(id) {
  const item = currentInfoItems.find(entry => entry.id === id);
  if (!item || !confirm(`Usunąć wpis „${item.title}”? Usunięcie zostanie uwzględnione przy następnej synchronizacji urządzeń.`)) return;
  await OpenData.removeRecord(item._recordId || item.id);
  await loadCurrentInfo();
  setCurrentInfoStatus('Wpis usunięto lokalnie.');
}

async function saveCurrentInfoFromForm() {
  const date = document.getElementById('current-info-date')?.value || new Date().toISOString().slice(0, 10);
  const title = document.getElementById('current-info-title')?.value.trim() || '';
  const topic = document.getElementById('current-info-topic')?.value.trim() || 'informacja';
  const source = document.getElementById('current-info-source')?.value.trim() || 'Dyrekcja MOW';
  const body = document.getElementById('current-info-body-input')?.value.trim() || '';
  if (!title && !body && !currentInfoDraftFiles.length) return setCurrentInfoStatus('Wpisz tytuł, treść albo dodaj plik.');
  const attachments = [];
  for (const file of currentInfoDraftFiles) attachments.push(await OpenData.putFile(file));
  const identity = await OpenData.sha256(`${date}|${title}|${source}|${body}|${attachments.map(item => item.hash).join('|')}`);
  const payload = normalizeCurrentInfoItem({
    id: `info-${identity.slice(0, 24)}`,
    date,
    title: title || buildCurrentInfoTitle(body) || currentInfoDraftFiles[0]?.name,
    topic,
    source,
    body,
    attachments,
    importedAt: new Date().toISOString()
  });
  await OpenData.putRecord({ id: payload.id, type: 'currentInfo', hash: identity, payload });
  clearCurrentInfoForm();
  await loadCurrentInfo();
  setCurrentInfoStatus('Informację zapisano wyłącznie na tym urządzeniu.');
}

function clearCurrentInfoForm() {
  const date = document.getElementById('current-info-date');
  if (date) date.value = new Date().toISOString().slice(0, 10);
  ['current-info-title', 'current-info-topic', 'current-info-body-input'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  const source = document.getElementById('current-info-source');
  if (source && !source.value) source.value = 'Dyrekcja MOW';
  currentInfoDraftFiles = [];
  renderCurrentInfoDraftFiles();
}

async function importCurrentInfoFile(input) {
  const files = [...(input.files || [])];
  if (!files.length) return;
  setCurrentInfoStatus('Odczytuję wiadomości i dokumenty lokalnie...');
  const summary = await OpenDocumentImport.importFiles(files, { preferredType: files.some(file => /\.eml$/i.test(file.name)) ? '' : 'currentInfo' });
  const parts = [`Dodano ${summary.information} informacji`];
  if (summary.schedules) parts.push(`${summary.schedules} grafików przekazano do Harmonogramu`);
  if (summary.knowledge) parts.push(`${summary.knowledge} dokumentów dodano do bazy wiedzy`);
  if (summary.errors.length) parts.push(`błędy: ${summary.errors.join('; ')}`);
  setCurrentInfoStatus(`${parts.join(', ')}. Pliki nie opuściły urządzenia.`);
  input.value = '';
}

function addCurrentInfoDraftFiles(input) {
  currentInfoDraftFiles.push(...[...(input.files || [])]);
  currentInfoDraftFiles = currentInfoDraftFiles.slice(0, 20);
  renderCurrentInfoDraftFiles();
  input.value = '';
}

function renderCurrentInfoDraftFiles() {
  const element = document.getElementById('current-info-draft-files');
  if (!element) return;
  element.innerHTML = currentInfoDraftFiles.map((file, index) => `<span>📎 ${escapeHtml(file.name)} <button type="button" onclick="removeCurrentInfoDraftFile(${index})" aria-label="Usuń plik">×</button></span>`).join('');
}

function removeCurrentInfoDraftFile(index) {
  currentInfoDraftFiles.splice(index, 1);
  renderCurrentInfoDraftFiles();
}

function buildCurrentInfoTitle(body = '') {
  return String(body).split(/\r?\n/).map(line => line.trim()).find(line => line.length > 3)?.slice(0, 140) || 'Informacja bez tytułu';
}

function updateCurrentInfoCounter(visible, total) {
  const element = document.getElementById('current-info-count');
  if (element) element.textContent = visible === total ? `Wpisy: ${total}` : `Wyniki: ${visible} z ${total}`;
}

function setCurrentInfoStatus(text) {
  const element = document.getElementById('current-info-status');
  if (element) element.textContent = text;
}

function normalizeForCurrentInfoSearch(value = '') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
}

function getCurrentInfoContext() {
  return sortCurrentInfo(currentInfoItems).slice(0, 40).map(item => ({
    date: item.date, title: item.title, topic: item.topic, source: item.source,
    body: item.body.slice(0, 5000), attachments: item.attachments.map(attachment => attachment.name)
  }));
}

function askAIAboutCurrentInfo() {
  setAIContextScope('info');
  nav('s-ai', document.querySelector('.nav-btn:last-child'));
  const textarea = document.getElementById('chat-input');
  textarea.value = 'Podsumuj aktywne i najbliższe terminy z lokalnie zapisanych informacji dyrekcji. Podaj daty i źródła. Jeśli nie ma danych, powiedz to wprost.';
  autoResizeTA(textarea);
  sendChat();
}

function autoSyncCurrentInfoMail() {}
