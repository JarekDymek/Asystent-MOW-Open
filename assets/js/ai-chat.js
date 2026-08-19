function setQuestion(q) {
  const ta = document.getElementById('chat-input');
  ta.value = q;
  autoResizeTA(ta);
  ta.focus();
}

function autoResizeTA(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

async function clearChat() {
  if (!confirm('Wyczyścić historię rozmowy asystenta na tym urządzeniu?')) return;
  chatHistory = [];
  localStorage.removeItem('mow_chat_history_v2');
  await OpenData.setMeta('chat-history', []);
  localStorage.removeItem(CHAT_DRAFT_KEY);
  const win = document.getElementById('chat-window');
  win.innerHTML = '<div class="msg ai">Historia wyczyszczona. Zadaj nowe pytanie!</div>';
}

async function checkOnline() {
  const dot = document.getElementById('ai-dot');
  const txt = document.getElementById('ai-status-txt');
  if (dot) dot.className = 'dot online';
  if (txt) txt.textContent = navigator.onLine
    ? 'Asystent lokalny gotowy - bez tokenów'
    : 'Asystent lokalny działa offline';
}

async function sendChat() {
  const ta = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const q = ta.value.trim();
  if (!q && !aiAttachments.length) return;
  const attachmentsToRead = aiAttachments.slice();
  ta.value = '';
  ta.style.height = 'auto';
  localStorage.removeItem(CHAT_DRAFT_KEY);
  aiAttachments = [];
  renderAIAttachments();
  if (sendBtn) sendBtn.disabled = true;

  const userContent = q || 'Przeanalizuj załączone pliki.';
  appendMsg('user', userContent);
  chatHistory.push({ role: 'user', content: userContent });
  saveChatHistory();

  const loading = appendMsg('loading', 'Szukam lokalnie w procedurach, prawie i dokumentach...');
  try {
    if (attachmentsToRead.length) {
      const summary = await OpenDocumentImport.importFiles(attachmentsToRead, { preferredType: 'knowledge' });
      if (summary.errors.length) appendMsg('err', `Nie odczytano części plików: ${summary.errors.join('; ')}`);
    }
    if (typeof ensureAnswerBankLoaded === 'function') await ensureAnswerBankLoaded();
    const result = await OpenLocalAssistant.answer(userContent, currentAIScope, chatHistory.slice(-18));
    loading.remove();
    chatHistory.push({ role: 'assistant', content: result.text });
    saveChatHistory();
    appendMsg('ai', result.text, result.sources || []);
  } catch (err) {
    loading.remove();
    appendMsg('err', `Nie udało się przeszukać lokalnej bazy: ${err.message}`);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function saveChatDraft() {
  const ta = document.getElementById('chat-input');
  if (!ta) return;
  const value = ta.value.trim();
  if (value) localStorage.setItem(CHAT_DRAFT_KEY, value);
  else localStorage.removeItem(CHAT_DRAFT_KEY);
}

function loadChatDraft() {
  const draft = localStorage.getItem(CHAT_DRAFT_KEY);
  if (!draft) return;
  const ta = document.getElementById('chat-input');
  if (!ta || ta.value.trim()) return;
  ta.value = draft;
  autoResizeTA(ta);
}

function setupWorkSafeguards() {
  window.addEventListener('beforeunload', e => {
    const draft = document.getElementById('chat-input')?.value.trim();
    const kbDraft = document.getElementById('kb-content')?.value.trim();
    if (draft || aiAttachments.length || kbDraft) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

async function loadChatHistory() {
  try {
    const stored = await OpenData.getMeta('chat-history', null);
    chatHistory = (Array.isArray(stored) ? stored : JSON.parse(localStorage.getItem(CHAT_STORE_KEY) || '[]'))
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-18);
  } catch {
    chatHistory = [];
  }
  if (!chatHistory.length) return;
  const win = document.getElementById('chat-window');
  win.innerHTML = '<div class="msg ai">Kontynuuję poprzedni wątek. Możesz dopytać albo wyczyścić historię.</div>';
  chatHistory.forEach(m => appendMsg(m.role === 'user' ? 'user' : 'ai', m.content));
}

function saveChatHistory() {
  chatHistory = chatHistory.slice(-40);
  OpenData.setMeta('chat-history', chatHistory).catch(() => {});
}

function appendMsg(type, text, sources = []) {
  const win = document.getElementById('chat-window');
  const el = document.createElement('div');
  el.className = `msg ${type}`;
  el.innerHTML = formatChatText(text);
  if (sources.length) {
    const src = document.createElement('div');
    src.style.marginTop = '8px';
    src.style.fontSize = '.72rem';
    src.style.color = 'var(--muted)';
    src.innerHTML = '<strong>Źródła:</strong> ' + sources.map(escapeHtml).join('; ');
    el.appendChild(src);
  }
  win.appendChild(el);
  win.scrollTop = win.scrollHeight;
  return el;
}

async function handleAIFileInput(input) {
  const files = [...input.files].slice(0, 6);
  if (!files.length) return;
  aiAttachments.push(...files);
  renderAIAttachments();
  input.value = '';
}

function renderAIAttachments() {
  const el = document.getElementById('ai-attachments');
  if (!el) return;
  el.innerHTML = aiAttachments.map((a, i) => `
    <span class="attach-chip">
      ${(a.type || a.mimeType || '').startsWith('image/') ? '🖼' : '📄'} ${escapeHtml(a.name)}
      <button type="button" onclick="removeAIAttachment(${i})">×</button>
    </span>
  `).join('');
}

function removeAIAttachment(index) {
  aiAttachments.splice(index, 1);
  renderAIAttachments();
}

function formatChatText(text) {
  return escapeHtml(String(text || ''))
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

