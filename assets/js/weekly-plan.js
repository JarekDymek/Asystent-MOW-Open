/* Weekly view built exclusively from locally imported schedules. */
async function loadWeeklyPlanState() {
  const educator = localStorage.getItem('asmow_open_educator') || '';
  const input = document.getElementById('weekly-educator');
  if (input) input.value = educator;
  await refreshWeeklyPlanFromLocalSchedule(educator);
}

function saveWeeklySettings() {
  const educator = document.getElementById('weekly-educator')?.value.trim() || '';
  localStorage.setItem('asmow_open_educator', educator);
  return { educator };
}

function setWeeklyStatus(text) {
  const element = document.getElementById('weekly-status');
  if (element) element.textContent = text;
}

async function fetchWeeklyPlan() {
  const { educator } = saveWeeklySettings();
  if (!educator) return setWeeklyStatus('Wpisz swoje nazwisko, aby zbudować plan z lokalnych grafików.');
  await refreshWeeklyPlanFromLocalSchedule(educator);
  const count = weeklyPlan?.weeks?.filter(week => week.days?.some(day => day.shifts?.length)).length || 0;
  setWeeklyStatus(count
    ? `Zbudowano plan dla: ${educator}. Dane pochodzą wyłącznie z plików na tym urządzeniu.`
    : `Nie znaleziono wpisów dla: ${educator}. Sprawdź pisownię i dodane pliki grafików.`);
}

function loadSampleWeeklyPlan() {
  setWeeklyStatus('Wersja Open nie pobiera danych zewnętrznych. Dodaj własny plik grafiku.');
}

async function refreshWeeklyPlanFromLocalSchedule(educator = '') {
  const selected = educator || document.getElementById('weekly-educator')?.value.trim() || localStorage.getItem('asmow_open_educator') || '';
  const scheduleIndex = loadInternatScheduleIndex();
  const starts = [...new Set(scheduleIndex.map(item => item.weekStart).filter(Boolean))].sort();
  weeklyPlan = {
    educator: selected,
    updatedAt: new Date().toISOString(),
    weeks: starts.map(start => buildLocalWeeklyWeek(start, selected, scheduleIndex))
  };
  weeklyPlan.weeks = classifyWeeklyWeeks(weeklyPlan.weeks);
  renderWeeklyPlan();
  return weeklyPlan;
}

function buildLocalWeeklyWeek(weekStart, educator, scheduleIndex) {
  const active = buildActiveInternatSchedule(scheduleIndex, weekStart);
  const queryTokens = getInternatScheduleQueryTokens(educator);
  const names = [...new Set(active.records.map(record => record.employee))]
    .filter(name => queryTokens.length && internatScheduleNameMatches(name, queryTokens));
  const exactName = names.length === 1 ? names[0] : '';
  const records = exactName
    ? active.records.filter(record => normalizeInternatScheduleText(record.employee) === normalizeInternatScheduleText(exactName))
    : [];
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addInternatScheduleDays(weekStart, offset);
    const shifts = records.filter(record => record.date === date).sort((a, b) => a.from.localeCompare(b.from));
    return {
      name: ['PON', 'WT', 'ŚR', 'CZW', 'PT', 'SOB', 'ND'][offset],
      date: formatShortWeeklyDate(date),
      isoDate: date,
      shifts: shifts.map(record => ({
        label: record.from === '00:00' || record.to === '24:00' ? 'Noc' : record.group ? `Grupa ${record.group}` : 'Dyżur',
        hours: `${record.from}–${record.to}`,
        group: record.group
      }))
    };
  });
  const totalHours = records.reduce((sum, record) => sum + calculateScheduleHours(record.from, record.to), 0);
  const weekendHours = records.filter(record => [0, 6].includes(new Date(`${record.date}T12:00:00`).getDay()))
    .reduce((sum, record) => sum + calculateScheduleHours(record.from, record.to), 0);
  const source = active.documents[0];
  return {
    label: getLocalWeekLabel(source, weekStart),
    range: formatWeeklyRange(weekStart),
    dateFrom: weekStart,
    dateTo: addInternatScheduleDays(weekStart, 6),
    summary: { totalHours: formatHours(totalHours), overtimeHours: '—', weekendHours: formatHours(weekendHours) },
    days,
    sourceFilename: source?.sourceAttachment || '',
    documentCount: active.documents.length,
    recordsCount: active.records.length,
    matchedEmployee: exactName,
    ambiguousEmployee: names.length > 1
  };
}

function getLocalWeekNumber(source) {
  return String(source?.sourceAttachment || source?.sourceTitle || '').match(/(?:^|\s)(\d{1,2})[.)\s]/)?.[1] || '';
}

function getLocalWeekLabel(source, weekStart) {
  const number = getLocalWeekNumber(source);
  return number ? `Tydzień ${number}` : `Tydzień ${formatShortWeeklyDate(weekStart)}`;
}

function formatWeeklyRange(weekStart) {
  const end = addInternatScheduleDays(weekStart, 6);
  return `${formatShortWeeklyDate(weekStart)} – ${formatShortWeeklyDate(end)}.${weekStart.slice(0, 4)}`;
}

function formatShortWeeklyDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

function calculateScheduleHours(from, to) {
  const [fromHours, fromMinutes] = String(from).split(':').map(Number);
  const [toHours, toMinutes] = String(to).split(':').map(Number);
  return Math.max(0, ((toHours * 60 + toMinutes) - (fromHours * 60 + fromMinutes)) / 60);
}

function formatHours(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function classifyWeeklyWeeks(weeks = []) {
  const today = startOfDay(new Date());
  const sorted = [...weeks].sort(compareWeeklyWeeks);
  const future = sorted.filter(week => parseWeeklyDate(week.dateFrom) > today);
  const past = sorted.filter(week => parseWeeklyDate(week.dateTo) < today);
  const previous = past.at(-1);
  return sorted.map(week => {
    const start = parseWeeklyDate(week.dateFrom);
    const end = parseWeeklyDate(week.dateTo);
    let relation = 'archiwalny tydzień';
    if (start <= today && end >= today) relation = 'bieżący tydzień';
    else if (previous === week) relation = 'poprzedni tydzień';
    else if (start > today) {
      const index = future.indexOf(week);
      relation = index === 0 ? 'następny tydzień' : index === 1 ? 'kolejny tydzień' : `za ${index + 1} tygodnie`;
    }
    return { ...week, relation };
  });
}

function compareWeeklyWeeks(a, b) { return String(a.dateFrom || '').localeCompare(String(b.dateFrom || '')); }

function parseWeeklyDate(value = '') {
  const match = String(value).match(/(20\d{2})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(NaN);
}

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function toDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

function renderWeeklyPlan() {
  const element = document.getElementById('weekly-plan');
  if (!element) return;
  const weeks = (weeklyPlan?.weeks || []).filter(shouldShowWeeklyWeek);
  if (!weeks.length) {
    element.innerHTML = '<div class="weekly-empty-state">Dodaj lokalny plik grafiku. Pojawią się tu dostępne tygodnie.</div>';
    return;
  }
  element.innerHTML = weeks.slice(0, 8).map((week, index) => {
    const panelId = `weekly-week-${index}`;
    const summary = weeklyPlan.educator
      ? `Godziny: ${escapeHtml(week.summary.totalHours)} · Nadgodziny: — · Weekend: ${escapeHtml(week.summary.weekendHours)}`
      : `Lokalne źródła: ${week.documentCount || 0} · Wpisy grafiku: ${week.recordsCount || 0}`;
    return `<div class="weekly-card"><button class="section-toggle weekly-toggle" type="button" data-accordion-target="${panelId}" onclick="toggleAccordion('${panelId}')"><span class="st-main"><span>${escapeHtml(week.label)} <em class="weekly-relation">${escapeHtml(week.relation)}</em></span><small>${summary}</small></span><span class="weekly-range">${escapeHtml(week.range)}</span><span class="st-state">Rozwiń</span></button><div class="weekly-body collapsible-card accordion-panel" id="${panelId}">${weeklyPlan.educator ? renderLocalWeekDays(week) : '<div class="weekly-day weekly-day--notice"><strong>Wpisz swoje nazwisko</strong><span class="weekly-empty">Aplikacja pokaże Twoje dyżury z tego tygodnia.</span></div>'}</div></div>`;
  }).join('');
  setupAccordions(element);
}

function renderLocalWeekDays(week) {
  if (week.ambiguousEmployee) return '<div class="weekly-day weekly-day--notice">Nazwisko pasuje do kilku osób. Wpisz pełniejsze dane.</div>';
  if (!week.matchedEmployee) return '<div class="weekly-day weekly-day--notice">Brak dyżurów tej osoby w tym tygodniu.</div>';
  return week.days.map(day => `<div class="weekly-day"><strong>${escapeHtml(day.name)} ${escapeHtml(day.date)}</strong>${day.shifts.length ? day.shifts.map(formatWeeklyShift).join('') : '<span class="weekly-empty">Brak dyżuru</span>'}</div>`).join('');
}

function shouldShowWeeklyWeek(week) {
  return ['poprzedni tydzień', 'bieżący tydzień', 'następny tydzień', 'kolejny tydzień'].includes(week.relation)
    || /^za \d+ tygodnie$/.test(week.relation || '');
}

function formatWeeklyShift(shift) { return `<span class="weekly-shift">${escapeHtml(shift.label || 'Dyżur')} ${escapeHtml(shift.hours || '')}</span>`; }

function weeklyPlanToText() {
  if (!weeklyPlan?.weeks) return '';
  return [`Plan lokalny dla: ${weeklyPlan.educator || 'nie wybrano wychowawcy'}`,
    ...weeklyPlan.weeks.map(week => [`\n${week.label} (${week.relation}) ${week.range}`,
      ...week.days.map(day => `${day.name} ${day.date}: ${day.shifts.length ? day.shifts.map(shift => `${shift.label} ${shift.hours}`).join('; ') : 'brak dyżuru'}`)
    ].join('\n'))].join('\n');
}

function askAIAboutWeeklyPlan() {
  if (!weeklyPlan?.weeks?.length) return setWeeklyStatus('Najpierw dodaj plik grafiku.');
  const workingWeeks = weeklyPlan.weeks.filter(week => week.days.some(day => day.shifts.length));
  const nightCount = workingWeeks.reduce((sum, week) => sum + week.days.flatMap(day => day.shifts).filter(shift => shift.label === 'Noc').length, 0);
  const answer = workingWeeks.length
    ? `Plan dla ${weeklyPlan.educator}: dostępne tygodnie z dyżurami: ${workingWeeks.length}. Odcinki dyżurów nocnych: ${nightCount}. Rozwiń wybrany tydzień, aby zobaczyć dokładne dni i godziny.`
    : 'W lokalnych grafikach nie znaleziono dyżurów wybranej osoby. Sprawdź nazwisko i pliki źródłowe.';
  setWeeklyStatus(answer);
}
