/* Local assistant scope and chat state. */
const CHAT_STORE_KEY = 'asmow_open_chat_history_v1';
const CHAT_META_KEY = 'open-chat-history-v1';
let currentAIScope = 'general';

function setAIContextScope(scope = 'general') {
  const allowed = ['general', 'procedury', 'stopnie', 'prawo', 'harmonogram', 'info'];
  currentAIScope = allowed.includes(scope) ? scope : 'general';
  const label = document.getElementById('ai-scope-label');
  if (!label) return;
  const names = {
    general: 'Wszystkie obszary',
    procedury: 'Procedury MOW',
    stopnie: 'Stopnie uspołecznienia',
    prawo: 'Prawo i baza wiedzy',
    harmonogram: 'Harmonogram',
    info: 'Bieżące informacje'
  };
  label.textContent = names[currentAIScope];
}
