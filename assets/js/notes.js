let openNotes = [];

async function loadNotes() {
  const records = await OpenData.getRecords('note');
  openNotes = records.map(record => ({ ...record.payload, _recordId: record.id }));
  renderNotesList();
}

async function saveNote() {
  const textarea = document.getElementById('note-input');
  const text = textarea.value.trim();
  if (!text) return;
  const id = `note-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const payload = { id, txt: text, date: new Date().toLocaleString('pl-PL'), createdAt: new Date().toISOString() };
  await OpenData.putRecord({ id, type: 'note', hash: await OpenData.sha256(text), payload });
  textarea.value = '';
  await loadNotes();
}

function getNotes() { return openNotes; }

async function deleteNote(id) {
  const note = openNotes.find(item => String(item.id) === String(id));
  if (!note) return;
  await OpenData.removeRecord(note._recordId || note.id);
  await loadNotes();
}

function renderNotesList() {
  const element = document.getElementById('notes-list');
  if (!element) return;
  element.innerHTML = openNotes.length
    ? `<p class="sec-title">📁 Zapisane notatki (${openNotes.length})</p>` + openNotes.map(note => `
        <div class="note-card">
          <div class="note-meta">📅 ${escapeHtml(note.date)}</div>
          <div class="note-content">${escapeHtml(note.txt).replace(/\n/g, '<br>')}</div>
          <button class="note-del" onclick="deleteNote('${escapeHtml(String(note.id))}')">✕</button>
        </div>`).join('')
    : '<p style="text-align:center;color:var(--muted);font-size:.85rem;padding:20px 0">Brak notatek</p>';
}

function openNota() {
  document.getElementById('nota-sheet').classList.add('open');
  loadNotes();
}

function closeNota(event) {
  if (event.target === document.getElementById('nota-sheet')) document.getElementById('nota-sheet').classList.remove('open');
}
