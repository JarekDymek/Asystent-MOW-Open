/* ────────────────────────────────
   INIT
──────────────────────────────── */
async function init() {
  await OpenData.open();
  renderSchedule();
  renderQuickGrid();
  renderProcs();
  renderStopnie();
  renderLaws();
  renderChatPills();
  await loadChatHistory();
  loadChatDraft();
  await loadInternatScheduleIndexFromDb();
  await loadWeeklyPlanState();
  await loadKnowledgeBase();
  loadCentralKnowledgeCache();
  renderKnowledgeList();
  await refreshCentralKnowledgeBase();
  loadNotes();
  await loadCurrentInfo();
  clearCurrentInfoForm();
  setupAccordions();
  startClock();
  setupWorkSafeguards();
  setupInstall();
  checkOnline();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}


/* ────────────────────────────────
   START
──────────────────────────────── */
init().catch(error => {
  console.error(error);
  const status = document.getElementById('ai-status-txt');
  if (status) status.textContent = `Błąd uruchomienia lokalnej bazy: ${error.message}`;
});
