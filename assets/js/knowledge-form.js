async function saveKnowledgeItem() {
  const type = document.getElementById('kb-type')?.value || 'zmiana-czasowa';
  const title = document.getElementById('kb-title')?.value.trim() || '';
  const source = document.getElementById('kb-source')?.value.trim() || '';
  const documentDate = document.getElementById('kb-document-date')?.value || '';
  const validFrom = document.getElementById('kb-valid-from')?.value || '';
  const validTo = document.getElementById('kb-valid-to')?.value || '';
  const content = document.getElementById('kb-content')?.value.trim() || '';
  if (!title || !content) {
    setKnowledgeStatus('Dodaj tytuł i treść dokumentu albo wzoru.');
    return;
  }
  const item = {
    id: `knowledge-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    type,
    title: title.slice(0, 180),
    source: source.slice(0, 220),
    documentDate,
    validFrom,
    validTo,
    content: content.slice(0, 50_000),
    updatedAt: new Date().toISOString()
  };
  knowledgeItems.unshift(item);
  knowledgeItems = knowledgeItems.slice(0, 40);
  await saveKnowledgeBase();
  clearKnowledgeForm();
  renderKnowledgeList();
  setKnowledgeStatus('Zapisano w lokalnej bazie wiedzy. Asystent uwzględni wpis bez wysyłania go do Internetu.');
}

function clearKnowledgeForm() {
  ['kb-title','kb-source','kb-document-date','kb-valid-from','kb-valid-to','kb-content'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function setKnowledgeStatus(text) {
  const el = document.getElementById('kb-status');
  if (el) el.textContent = text;
}

async function handleKnowledgeFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  setKnowledgeStatus('Odczytuję plik...');
  try {
    const parsed = await OpenDocumentImport.parseFile(file);
    const text = parsed.text || '';
    if (!text.trim()) throw new Error('Nie udało się uzyskać tekstu z tego pliku.');
    await OpenData.putFile(file);
    document.getElementById('kb-title').value = document.getElementById('kb-title').value || file.name.replace(/\.[^.]+$/, '');
    document.getElementById('kb-source').value = document.getElementById('kb-source').value || file.name;
    document.getElementById('kb-content').value = text.slice(0, 50_000);
    setKnowledgeStatus('Wczytano plik do formularza. Sprawdź daty obowiązywania i zapisz wpis.');
  } catch (err) {
    setKnowledgeStatus(`Nie udało się wczytać pliku: ${err.message}`);
  } finally {
    input.value = '';
  }
}
