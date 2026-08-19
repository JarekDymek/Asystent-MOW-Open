/* Generated from the tested Harmonogram-MOW parser. */
(function () {
function classifyInternatScheduleKind(value = '') {
  const normalized = normalizeMailSearch(value);
  if (/\bzespol/.test(normalized)) return 'team';
  if (/\binternat/.test(normalized)) return 'internat';
  return 'unknown';
}

function parseInternatScheduleHtml(html, source = {}) {
  const documentText = decodeInternatHtmlCell(html);
  const sourceHint = `${source.sourceTitle || ''} ${source.sourceAttachment || ''}`;
  const weekStart = extractInternatWeekStart(sourceHint) || extractInternatWeekStart(documentText);
  const ignoreReason = getNonInternatScheduleReason(documentText);
  if (ignoreReason) {
    return {
      weekStart,
      records: [],
      hasCompleteWeek: false,
      ambiguous: false,
      warning: '',
      ignored: true,
      ignoreReason
    };
  }

  const tables = extractInternatHtmlTables(html);
  const tableText = tables.flat(2).join(' ');
  const declaredDates = getInternatDeclaredWeekDates(tables, weekStart);
  const records = [];
  let unresolvedTimedCells = 0;

  tables.forEach(table => {
    const parsed = parseInternatScheduleTable(table, weekStart, source);
    records.push(...parsed.records);
    unresolvedTimedCells += parsed.unresolvedTimedCells;
  });

  const seen = new Set();
  const uniqueRecords = records.filter(record => {
    const key = `${record.date}|${normalizeMailSearch(record.employee)}|${record.group}|${record.from}|${record.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ambiguous = !weekStart || !tables.length || !uniqueRecords.length || unresolvedTimedCells > 0;
  return {
    weekStart,
    records: uniqueRecords,
    hasCompleteWeek: declaredDates.size >= 7,
    ambiguous,
    warning: ambiguous ? 'Nie wszystkie dane tabeli udało się przypisać jednoznacznie.' : '',
    ignored: false,
    ignoreReason: ''
  };
}

function getNonInternatScheduleReason(value = '') {
  const text = normalizeMailSearch(value);
  if (/zespol\w*\s+diagnostyczno[\s–—-]+terapeutyczn/.test(text)) {
    return 'Grafik zespołu diagnostyczno-terapeutycznego nie jest grafikiem wychowawców internatu.';
  }
  return '';
}

function getInternatDeclaredWeekDates(tables, weekStart) {
  const dates = new Set();
  tables.forEach(table => {
    const maxColumns = Math.max(0, ...table.map(row => row.length));
    for (let column = 0; column < maxColumns; column += 1) {
      let headerText = '';
      for (let rowIndex = 0; rowIndex < Math.min(table.length, 5); rowIndex += 1) {
        headerText = `${headerText} ${table[rowIndex][column] || ''}`.trim();
        const date = parseInternatScheduleCellDate(headerText, weekStart);
        if (date) {
          dates.add(date);
          break;
        }
      }
    }
  });
  return dates;
}

function extractInternatHtmlTables(html = '') {
  const tables = [];
  const tableMatches = String(html).match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];

  tableMatches.forEach(tableHtml => {
    const rows = [];
    const pendingSpans = [];
    const rowMatches = tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    rowMatches.forEach(rowHtml => {
      const row = [];
      pendingSpans.forEach((span, column) => {
        if (!span) return;
        row[column] = span.text;
        span.remaining -= 1;
        if (span.remaining <= 0) pendingSpans[column] = null;
      });

      const cellPattern = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
      let match;
      let column = 0;
      while ((match = cellPattern.exec(rowHtml))) {
        while (row[column] !== undefined) column += 1;
        const attributes = match[1] || '';
        const text = decodeInternatHtmlCell(match[2]);
        const colspan = Math.max(1, Number(attributes.match(/colspan=["']?(\d+)/i)?.[1] || 1));
        const rowspan = Math.max(1, Number(attributes.match(/rowspan=["']?(\d+)/i)?.[1] || 1));
        for (let offset = 0; offset < colspan; offset += 1) {
          row[column + offset] = text;
          if (rowspan > 1) pendingSpans[column + offset] = { text, remaining: rowspan - 1 };
        }
        column += colspan;
      }
      if (row.some(cell => String(cell || '').trim())) rows.push(row.map(cell => cell || ''));
    });

    if (rows.length) tables.push(rows);
  });
  return tables;
}

function decodeInternatHtmlCell(value = '') {
  return String(value)
    .replace(/<sup\b[^>]*>\s*(\d{2})\s*<\/sup>/gi, ':$1')
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseInternatScheduleTable(table, weekStart, source) {
  const structured = parseInternatStructuredRows(table, weekStart, source);
  if (structured.matched) return structured;
  return parseInternatDateColumns(table, weekStart, source);
}

function parseInternatStructuredRows(table, weekStart, source) {
  const headerIndex = table.slice(0, 6).findIndex(row => {
    const normalized = row.map(normalizeMailSearch);
    const hasEmployee = normalized.some(cell => /wychowaw|pracownik|nazwisko|imie/.test(cell));
    const hasDate = normalized.some(cell => /(^|\s)(data|dzien)(\s|$)/.test(cell));
    const hasHours = normalized.some(cell => /godzin|dyzur|od\s*[-/]?\s*do|poczatek|koniec/.test(cell));
    const hasStartAndEnd = normalized.some(cell => /(^|\s)od($|\s)/.test(cell))
      && normalized.some(cell => /(^|\s)do($|\s)/.test(cell));
    return hasEmployee && hasDate && (hasHours || hasStartAndEnd);
  });
  if (headerIndex < 0) return { matched: false, records: [], unresolvedTimedCells: 0 };

  const headers = table[headerIndex].map(normalizeMailSearch);
  const employeeColumn = headers.findIndex(cell => /wychowaw|pracownik|nazwisko|imie/.test(cell));
  const dateColumn = headers.findIndex(cell => /(^|\s)(data|dzien)(\s|$)/.test(cell));
  const groupColumn = headers.findIndex(cell => /grupa|(^|\s)gr\.?($|\s)/.test(cell));
  const hoursColumn = headers.findIndex(cell => /godzin|dyzur|od\s*[-/]?\s*do/.test(cell));
  const fromColumn = headers.findIndex(cell => /poczatek|(^|\s)od($|\s)/.test(cell));
  const toColumn = headers.findIndex(cell => /koniec|(^|\s)do($|\s)/.test(cell));
  const records = [];
  let unresolvedTimedCells = 0;

  table.slice(headerIndex + 1).forEach(row => {
    const hours = hoursColumn >= 0 ? row[hoursColumn] : `${row[fromColumn] || ''}-${row[toColumn] || ''}`;
    const ranges = extractInternatTimeRanges(hours);
    if (!ranges.length) return;
    const date = parseInternatScheduleCellDate(row[dateColumn], weekStart);
    const employee = extractInternatEmployee(row[employeeColumn]);
    const group = groupColumn >= 0 ? extractInternatGroup(row[groupColumn]) : '';
    if (!date || !employee) {
      unresolvedTimedCells += 1;
      return;
    }
    ranges.forEach(range => records.push(...buildInternatScheduleRecords(date, employee, group, range, weekStart, source)));
  });

  return { matched: true, records, unresolvedTimedCells };
}

function parseInternatDateColumns(table, weekStart, source) {
  const maxColumns = Math.max(0, ...table.map(row => row.length));
  const dateColumnCandidates = [];

  for (let column = 0; column < maxColumns; column += 1) {
    let headerText = '';
    for (let rowIndex = 0; rowIndex < Math.min(table.length, 5); rowIndex += 1) {
      headerText = `${headerText} ${table[rowIndex][column] || ''}`.trim();
      const date = parseInternatScheduleCellDate(headerText, weekStart);
      if (date) {
        dateColumnCandidates.push({ column, date, headerText, rowIndex });
        break;
      }
    }
  }

  const weekdayColumns = dateColumnCandidates.filter(item => getInternatWeekdayOffset(item.headerText) >= 0);
  const dateColumns = weekdayColumns.length >= 5 ? weekdayColumns : dateColumnCandidates;
  if (!dateColumns.length) return { matched: false, records: [], unresolvedTimedCells: 0 };
  const headerEnd = Math.max(...dateColumns.map(item => item.rowIndex));

  const records = [];
  let unresolvedTimedCells = 0;
  const firstDateColumn = Math.min(...dateColumns.map(item => item.column));
  table.slice(headerEnd + 1).forEach(row => {
    const labelCells = row.filter((_, column) => !dateColumns.some(item => item.column === column));
    const leadingLabelCells = row.filter((_, column) => column < firstDateColumn);
    const rowEmployee = leadingLabelCells.map(extractInternatEmployee).find(Boolean) || '';
    const rowGroup = leadingLabelCells.map(extractInternatGroup).find(Boolean)
      || labelCells.map(extractInternatGroup).find(Boolean)
      || '';
    const rowKind = leadingLabelCells.some(cell => /(^|\s)noc($|\s)/.test(normalizeMailSearch(cell))) ? 'night-row' : '';

    dateColumns.forEach(({ column, date }) => {
      const cell = row[column] || '';
      const ranges = extractInternatTimeRanges(cell);
      const entries = parseInternatScheduleCellEntries(cell, rowEmployee, rowGroup, rowKind);
      if (ranges.length > entries.length) unresolvedTimedCells += ranges.length - entries.length;
      entries.forEach(entry => {
        records.push(...buildInternatScheduleRecords(date, entry.employee, entry.group, entry.range, weekStart, source));
      });
    });
  });

  return { matched: true, records, unresolvedTimedCells };
}

function parseInternatScheduleCellEntries(cell, rowEmployee, rowGroup, rowKind = '') {
  const ranges = extractInternatTimeRanges(cell);
  if (!ranges.length) return [];
  const group = extractInternatGroup(cell) || rowGroup;
  const withRowContext = range => rowKind === 'night-row'
    ? { ...range, label: `noc-row ${range.label}` }
    : range;
  if (rowEmployee) return ranges.map(range => ({ employee: rowEmployee, group, range: withRowContext(range) }));

  const candidates = extractInternatEmployeeCandidates(cell);
  if (candidates.length === 1) {
    return ranges.map(range => ({ employee: candidates[0], group, range: withRowContext(range) }));
  }
  return parseInternatScheduleCellSequence(cell, group, withRowContext);
}

function parseInternatScheduleCellSequence(cell, group, withRowContext = range => range) {
  const entries = [];
  const pendingRanges = [];
  const pendingEmployees = [];
  const lines = String(cell || '').split(/\n+/).map(line => line.trim()).filter(Boolean);

  const addEntry = (employee, range) => {
    if (!employee || !range) return;
    entries.push({ employee, group, range: withRowContext(range) });
  };

  lines.forEach(line => {
    const lineRanges = extractInternatTimeRanges(line);
    const lineEmployees = extractInternatEmployeeCandidates(line);

    if (lineRanges.length && lineEmployees.length) {
      if (lineEmployees.length === 1) lineRanges.forEach(range => addEntry(lineEmployees[0], range));
      else lineRanges.forEach((range, index) => addEntry(lineEmployees[index], range));
      return;
    }

    if (lineRanges.length) {
      lineRanges.forEach(range => {
        const employee = pendingEmployees.shift();
        if (employee) addEntry(employee, range);
        else pendingRanges.push(range);
      });
      return;
    }

    lineEmployees.forEach(employee => {
      const range = pendingRanges.pop();
      if (range) addEntry(employee, range);
      else pendingEmployees.push(employee);
    });
  });

  return entries;
}

function extractInternatEmployee(value = '') {
  const candidates = extractInternatEmployeeCandidates(value);
  return candidates.length === 1 ? candidates[0] : '';
}

function extractInternatEmployeeCandidates(value = '') {
  const raw = String(value || '').trim();
  if (!raw || /zast[eę]puje|zamiast|zmienia|zast[eę]pstwo/i.test(raw)) return [];
  const isNumberedList = /^\s*\d+\s*[.)]/m.test(raw);
  const wholeCellCandidate = extractInternatTimeRanges(raw).length || isNumberedList
    ? ''
    : parseInternatEmployeeCandidate(raw);
  if (wholeCellCandidate && wholeCellCandidate.split(/\s+/).length >= 2) return [wholeCellCandidate];
  const parts = raw.split(/\n|[;|]/);
  const generic = new Set([
    'brak', 'dzien', 'dyzur', 'godziny', 'grupa', 'harmonogram', 'koniec', 'nazwisko', 'noc',
    'lacz', 'pon', 'poniedzialek', 'praca', 'pracownik', 'pt', 'siedziba', 'sob', 'sr', 'wt', 'wolne',
    'wychowawca', 'czw', 'nd'
  ]);
  const candidates = [];

  parts.forEach(part => {
    const candidate = parseInternatEmployeeCandidate(part, generic);
    if (!candidate) return;
    if (!candidates.some(item => normalizeMailSearch(item) === normalizeMailSearch(candidate))) candidates.push(candidate);
  });

  return candidates;
}

function parseInternatEmployeeCandidate(value = '', genericWords) {
  const generic = genericWords || new Set([
    'brak', 'dzien', 'dyzur', 'godziny', 'grupa', 'harmonogram', 'koniec', 'nazwisko', 'noc',
    'lacz', 'pon', 'poniedzialek', 'praca', 'pracownik', 'pt', 'siedziba', 'sob', 'sr', 'wt', 'wolne',
    'wychowawca', 'czw', 'nd'
  ]);
  const cleaned = String(value)
    .replace(internatTimeRangePattern(), ' ')
    .replace(/\b(?:grupa|gr)\.?\s*[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9-]+/gi, ' ')
    .replace(/\b(?:noc|dyzur|godziny|praca|wolne|urlop|zastepstwo)\b/gi, ' ')
    .replace(/[\d()[\]{}:,]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const tokens = cleaned.match(/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż'-]{2,}/g) || [];
  if (!tokens.length || tokens.length > 3) return '';
  if (tokens.some(token => generic.has(normalizeMailSearch(token)))) return '';
  return tokens.join(' ');
}

function extractInternatGroup(value = '') {
  const match = String(value).match(/\b(?:grupa|gr)\.?\s*([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9-]+)/i);
  return match ? match[1] : '';
}

function internatTimeRangePattern() {
  return /(?:^|[^\d])([01]?\d|2[0-4])(?:[:.]([0-5]\d))?\s*(?:-|–|—|do)\s*([01]?\d|2[0-4])(?:[:.]([0-5]\d))?(?=$|[^\d])/giu;
}

function extractInternatTimeRanges(value = '') {
  const text = String(value || '');
  const ranges = [];
  const pattern = internatTimeRangePattern();
  let match;
  while ((match = pattern.exec(text))) {
    const from = normalizeInternatTime(match[1], match[2]);
    const to = normalizeInternatTime(match[3], match[4]);
    if (!from || !to || from === to) continue;
    ranges.push({ from, to, label: text });
  }
  return ranges;
}

function normalizeInternatTime(hour, minute = '00') {
  const hours = Number(hour);
  const minutes = Number(minute || 0);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return '';
  if (hours === 24 && minutes !== 0) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildInternatScheduleRecords(date, employee, group, range, weekStart, source) {
  const base = {
    employee,
    group,
    weekStart,
    sourceMailUid: source.sourceMailUid || '',
    sourceTitle: source.sourceTitle || '',
    sourceAttachment: source.sourceAttachment || '',
    sourceDate: source.sourceDate || ''
  };
  const fromMinutes = internatTimeToMinutes(range.from);
  const toMinutes = internatTimeToMinutes(range.to);
  if (fromMinutes < toMinutes) return [{ ...base, date, from: range.from, to: range.to }];

  const rangeLabel = normalizeMailSearch(range.label);
  const nightRow = rangeLabel.includes('noc-row');
  if (nightRow && range.from === '24:00') {
    return range.to === '00:00' ? [] : [{ ...base, date, from: '00:00', to: range.to }];
  }
  const nightAssignedToEndDate = !nightRow && rangeLabel.includes('noc');
  const startDate = nightAssignedToEndDate ? addInternatDays(date, -1) : date;
  const endDate = nightAssignedToEndDate ? date : addInternatDays(date, 1);
  const records = [{ ...base, date: startDate, from: range.from, to: '24:00' }];
  if (range.to !== '00:00') records.push({ ...base, date: endDate, from: '00:00', to: range.to });
  return records;
}

function internatTimeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function parseInternatScheduleCellDate(value, weekStart) {
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return createInternatIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const full = text.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/);
  if (full) return createInternatIsoDate(Number(full[3]), Number(full[2]), Number(full[1]));

  if (!weekStart) return '';
  const weekday = getInternatWeekdayOffset(text);
  const partial = text.match(/\b(\d{1,2})[.\/-](\d{1,2})(?:\s*r\.?\b)?/i);
  const isStandaloneDate = /^\s*\d{1,2}[.\/-]\d{1,2}(?:\s*r\.?)?\s*$/i.test(text);
  if (partial && (weekday >= 0 || isStandaloneDate)) {
    const base = new Date(`${weekStart}T12:00:00`);
    let candidate = new Date(base.getFullYear(), Number(partial[2]) - 1, Number(partial[1]), 12);
    if (candidate.getTime() - base.getTime() > 180 * 86_400_000) candidate.setFullYear(candidate.getFullYear() - 1);
    if (base.getTime() - candidate.getTime() > 180 * 86_400_000) candidate.setFullYear(candidate.getFullYear() + 1);
    return formatInternatServerIsoDate(candidate);
  }
  return weekday >= 0 ? addInternatDays(weekStart, weekday) : '';
}

function getInternatWeekdayOffset(value = '') {
  const text = normalizeMailSearch(value);
  const weekdays = [
    /\b(pon|poniedzialek)\b/, /\b(wt|wtorek)\b/, /\b(sr|sroda)\b/, /\b(czw|czwartek)\b/,
    /\b(pt|piatek)\b/, /\b(sob|sobota)\b/, /\b(nd|niedz|niedziela)\b/
  ];
  return weekdays.findIndex(pattern => pattern.test(text));
}

function extractInternatWeekStart(value = '') {
  const text = String(value || '');
  const range = text.match(/(?:^|[^\d])(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](20\d{2}))?\s*[.]?\s*(?:r\.?)?\s*(?:-|–|—)\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/i);
  if (range) {
    let year = Number(range[3] || range[6]);
    if (!range[3] && Number(range[2]) > Number(range[5])) year -= 1;
    return getInternatMonday(createInternatIsoDate(year, Number(range[2]), Number(range[1])));
  }

  const shortRange = text.match(/(?:^|[^\d])(\d{1,2})\s*[.]?\s*(?:-|–|—)\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/i);
  if (shortRange) {
    const startDay = Number(shortRange[1]);
    const endDay = Number(shortRange[2]);
    let month = Number(shortRange[3]);
    let year = Number(shortRange[4]);
    if (startDay > endDay) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    return getInternatMonday(createInternatIsoDate(year, month, startDay));
  }

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return getInternatMonday(createInternatIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3])));
  const full = text.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/);
  if (full) return getInternatMonday(createInternatIsoDate(Number(full[3]), Number(full[2]), Number(full[1])));
  return '';
}

function getInternatMonday(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return formatInternatServerIsoDate(date);
}

function addInternatDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return formatInternatServerIsoDate(date);
}

function createInternatIsoDate(year, month, day) {
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return formatInternatServerIsoDate(date);
}

function formatInternatServerIsoDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function normalizeMailSearch(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
}

  window.OpenScheduleParser = {
    classifyKind: classifyInternatScheduleKind,
    parseHtml: parseInternatScheduleHtml,
    extractWeekStart: extractInternatWeekStart,
    normalizeText: normalizeMailSearch
  };
})();
