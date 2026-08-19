/* Deterministic, offline-first assistant. It performs no network requests to AI services. */
(function () {
  const KNOWLEDGE_FILES = [
    'knowledge/01_wyciag_mow_ustawa_resocjalizacja_2026.md',
    'knowledge/02_wyciag_mow_rozporzadzenie_placowki_2023.md',
    'knowledge/03_wyciag_mow_prawo_oswiatowe_organizacja.md',
    'knowledge/04_wyciag_mow_praca_wychowawcy_awans_czas_pracy.md',
    'knowledge/05_wyciag_mow_bezpieczenstwo_dokumentacja_pomoc.md',
    'knowledge/06_odpowiedzi_wzorcowe_mow.md'
  ];
  const URGENT_TERMS = /bojka|agresj|samoboj|samookal|uciecz|pozar|narkot|alkohol|niebezpieczn|bron|zagrozen|przemoc/;
  let builtInKnowledge = [];
  let loadPromise;

  async function loadKnowledge() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all(KNOWLEDGE_FILES.map(async path => {
      try {
        const response = await fetch(path);
        if (!response.ok) return null;
        return { path, title: path.split('/').pop().replace(/\.md$/i, '').replace(/^\d+_/, '').replace(/_/g, ' '), text: await response.text() };
      } catch {
        return null;
      }
    })).then(items => {
      builtInKnowledge = items.filter(Boolean);
      return builtInKnowledge;
    });
    return loadPromise;
  }

  async function answer(question, scope = 'general', history = []) {
    await loadKnowledge();
    const contextQuestion = extendFollowUpQuestion(question, history);
    const normalized = normalize(contextQuestion);
    if (!normalized) return clarification('Napisz, czego dotyczy sytuacja lub dokument.');

    const genericQuestion = clarifyGenericQuestion(normalized);
    if (genericQuestion) return clarification(genericQuestion);

    const urgent = matchProcedure(contextQuestion, true);
    if (urgent) return formatProcedureAnswer(urgent, true);

    if (scope === 'harmonogram' || /grafik|harmonogram|dyzur|pracuje|praca w tygodniu/.test(normalized)) {
      const schedule = answerSchedule(contextQuestion);
      if (schedule) return schedule;
    }

    const bank = typeof resolveAnswerBankIntent === 'function' ? resolveAnswerBankIntent(contextQuestion) : null;
    if (bank?.type === 'answer') {
      return { text: formatAnswerBankReply(bank), sources: bank.entry.sources || [], confidence: bank.confidence, kind: 'answer-bank' };
    }
    if (bank?.type === 'clarify' && bank.confidence >= 0.48) {
      return { text: formatAnswerBankClarification(bank), sources: bank.candidates?.map(item => item.entry.category).filter(Boolean) || [], confidence: bank.confidence, kind: 'clarify' };
    }

    const procedure = matchProcedure(contextQuestion, false);
    if (procedure && (scope === 'procedury' || procedure.score >= 3)) return formatProcedureAnswer(procedure, false);

    const level = matchSocialLevel(contextQuestion);
    if (level && (scope === 'stopnie' || level.score >= 2)) return formatSocialLevelAnswer(level);

    const localMatches = await OpenData.search(contextQuestion, { limit: 8 });
    const relevantLocal = localMatches.filter(item => ['currentInfo', 'knowledge'].includes(item.record.type));
    if (relevantLocal.length && relevantLocal[0].score >= 2) return formatLocalRecordsAnswer(contextQuestion, relevantLocal);

    const builtIn = searchBuiltInKnowledge(contextQuestion);
    if (builtIn.length && builtIn[0].score >= 2) return formatBuiltInAnswer(contextQuestion, builtIn);

    const law = matchLaw(contextQuestion);
    if (law) return law;

    return clarification('Nie mam wystarczająco pewnego dopasowania w kontrolowanej bazie odpowiedzi i dokumentach.');
  }

  function matchProcedure(question, urgentOnly) {
    const query = normalize(question);
    if (urgentOnly && !URGENT_TERMS.test(query)) return null;
    const terms = queryTerms(query);
    const matches = (window.PROCS || PROCS || []).map(procedure => {
      const text = normalize(`${strip(procedure.title)} ${strip(procedure.sub)} ${strip(procedure.src)} ${(procedure.steps || []).map(strip).join(' ')}`);
      const hits = terms.filter(term => text.includes(term));
      const urgentBoost = URGENT_TERMS.test(normalize(procedure.title)) && URGENT_TERMS.test(query) ? 2 : 0;
      return { procedure, score: hits.length + urgentBoost };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    if (!matches.length || matches[0].score < (urgentOnly ? 2 : 1)) return null;
    if (matches[1] && matches[0].score === matches[1].score && matches[0].score < 3) return null;
    return matches[0];
  }

  function formatProcedureAnswer(match, urgent) {
    const item = match.procedure;
    const steps = (item.steps || []).map(strip).filter(Boolean);
    const immediate = steps.slice(0, Math.min(4, steps.length));
    const later = steps.slice(immediate.length);
    const sections = [
      urgent ? '**NA JUŻ**' : '**Najważniejsze kroki**',
      ...immediate.map((step, index) => `${index + 1}. ${step}`)
    ];
    if (later.length) sections.push('', '**Dalej**', ...later.map((step, index) => `${immediate.length + index + 1}. ${step}`));
    if (item.documentation?.length) sections.push('', '**Dokumentacja**', ...item.documentation.map(value => `- ${strip(value)}`));
    if (item.dont?.length) sections.push('', '**Nie rób**', ...item.dont.map(value => `- ${strip(value)}`));
    sections.push('', '**Sprawdź w placówce:** aktualną procedurę, polecenia dyżurnego i decyzje dyrekcji.');
    return { text: sections.join('\n'), sources: [strip(item.src || 'Procedury MOW')], confidence: Math.min(0.98, 0.55 + match.score * 0.08), kind: 'procedure' };
  }

  function answerSchedule(question) {
    if (typeof getInternatScheduleAnswer !== 'function') return null;
    const index = loadInternatScheduleIndex();
    if (!index.length) return { text: '**Brak lokalnych grafików.**\nDodaj plik DOCX lub XLSX w zakładce Harmonogram.', sources: [], confidence: 1, kind: 'schedule' };
    const selected = getSelectedInternatScheduleWeekStart(new Date());
    const requested = resolveInternatScheduleQueryWeek(question, selected, new Date());
    const result = getInternatScheduleAnswer(question, index, new Date(), requested);
    if (result.status === 'ambiguous') return clarification('Znalazłem kilka podobnych nazwisk. Podaj pełne nazwisko i wybierz tydzień w zakładce Harmonogram.');
    if (result.status !== 'ok') return { text: `Nie znaleziono dyżurów tej osoby w lokalnym grafiku na tydzień ${formatInternatScheduleWeek(requested)}. Sprawdź pisownię albo plik źródłowy.`, sources: result.sources?.map(sourceName) || [], confidence: 0.9, kind: 'schedule' };
    const rows = result.records.map(record => `- ${formatInternatScheduleDate(record.date)}: ${record.from}–${record.to}${record.group ? `, grupa ${record.group}` : ''}`);
    return {
      text: [`**${result.employee}**`, `Tydzień ${formatInternatScheduleWeek(result.weekStart)}:`, ...rows, result.requiresVerification ? '\n**Uwaga:** część danych wymaga porównania z plikiem źródłowym.' : ''].filter(Boolean).join('\n'),
      sources: result.sources?.map(sourceName) || [], confidence: 0.96, kind: 'schedule'
    };
  }

  function matchSocialLevel(question) {
    const normalized = normalize(question);
    const explicit = normalized.match(/(?:stopien|poziom)?\s*([+-]\s*[0-3]|minus\s*[12]|plus\s*[123])/);
    const terms = queryTerms(normalized);
    const matches = (window.STOPNIE || STOPNIE || []).map(level => {
      const text = normalize(`${strip(level.lvl)} ${(level.crit || []).map(strip).join(' ')} ${(level.przyw || []).map(strip).join(' ')}`);
      let score = terms.filter(term => text.includes(term)).length;
      if (explicit && normalize(level.lvl).includes(normalize(explicit[1]).replace('plus', '+').replace('minus', '-'))) score += 5;
      return { level, score };
    }).sort((a, b) => b.score - a.score);
    return matches[0]?.score ? matches[0] : null;
  }

  function formatSocialLevelAnswer(match) {
    const level = match.level;
    return {
      text: ['**Pomoc w ocenie stopnia**', `Rozważany poziom: **${strip(level.lvl)}**.`, '', '**Sprawdź łącznie:**', ...(level.crit || []).map(value => `- ${strip(value)}`), '', '**Możliwe uprawnienia:**', ...(level.przyw || []).map(value => `- ${strip(value)}`), '', '**Ważne:** to podpowiedź porządkująca. Ostateczna kwalifikacja wymaga pełnych faktów, aktualnego regulaminu i decyzji właściwego zespołu.'].join('\n'),
      sources: ['Regulamin stopni uspołecznienia MOW'], confidence: Math.min(0.95, 0.55 + match.score * 0.08), kind: 'social-level'
    };
  }

  function formatLocalRecordsAnswer(question, matches) {
    const selected = matches.slice(0, 3);
    const parts = ['**Znalezione w lokalnej bazie urządzenia**'];
    selected.forEach(({ record }) => {
      const payload = record.payload || {};
      parts.push('', `**${payload.title || payload.name || 'Dokument'}**${payload.date ? ` (${payload.date})` : ''}`, selectRelevantSentences(payload.body || payload.content || payload.text || '', question));
    });
    parts.push('', '**Ważne:** sprawdź datę obowiązywania i nowsze zarządzenia. Lokalny wpis nie zmienia aktu prawnego ani zatwierdzonego dokumentu MOW.');
    return { text: parts.join('\n'), sources: selected.map(item => item.record.payload?.source || item.record.payload?.title).filter(Boolean), confidence: 0.76, kind: 'local-document' };
  }

  function searchBuiltInKnowledge(question) {
    const terms = queryTerms(question);
    return builtInKnowledge.map(item => {
      const normalized = normalize(item.text);
      return { ...item, score: terms.filter(term => normalized.includes(term)).length };
    }).filter(item => item.score).sort((a, b) => b.score - a.score);
  }

  function formatBuiltInAnswer(question, matches) {
    const selected = matches.slice(0, 2);
    const parts = ['**Odpowiedź z kontrolowanej bazy MOW**'];
    selected.forEach(item => parts.push('', selectRelevantSentences(item.text, question)));
    parts.push('', '**Przed działaniem:** zweryfikuj aktualny tekst źródła i dokument wewnętrzny MOW obowiązujący w dniu zdarzenia.');
    return { text: parts.join('\n'), sources: selected.map(item => item.title), confidence: 0.7, kind: 'built-in' };
  }

  function matchLaw(question) {
    const terms = queryTerms(question);
    const matches = (window.LAWS || LAWS || []).map(item => {
      const text = normalize(item.t);
      return { item, score: terms.filter(term => text.includes(term)).length };
    }).filter(item => item.score).sort((a, b) => b.score - a.score);
    if (!matches.length) return null;
    return { text: `Najbliższe źródło prawne w aplikacji: **${matches[0].item.t}**. Rozwiń „Podstawy prawne MOW”, aby otworzyć urzędowe źródło.`, sources: [matches[0].item.t], confidence: 0.55, kind: 'law' };
  }

  function selectRelevantSentences(text, question) {
    const terms = queryTerms(question);
    const paragraphs = String(text).replace(/^#+\s*/gm, '').split(/\n{2,}|(?<=[.!?])\s+/).map(value => value.trim()).filter(value => value.length > 30);
    const scored = paragraphs.map(value => ({ value, score: terms.filter(term => normalize(value).includes(term)).length }))
      .filter(item => item.score).sort((a, b) => b.score - a.score).slice(0, 4);
    return scored.length ? scored.map(item => `- ${item.value.slice(0, 700)}`).join('\n') : 'Dokument pasuje tematycznie, ale nie zawiera jednoznacznego fragmentu odpowiedzi.';
  }

  function clarification(reason) {
    return {
      text: [`**Dopytam, żeby nie odpowiedzieć na siłę.**`, reason, '', 'Dopisz:', '- czego dokładnie dotyczy sytuacja,', '- kiedy i gdzie się wydarzyła,', '- czy istnieje bezpośrednie zagrożenie,', '- jaki dokument, stopień albo tydzień grafiku ma znaczenie.'].join('\n'),
      sources: [], confidence: 0, kind: 'clarify'
    };
  }

  function clarifyGenericQuestion(normalized) {
    if (/^(?:co z )?(?:urlop\w*|urlopowanie|wniosek urlopowy)$/.test(normalized)) {
      return 'Czy chodzi o urlopowanie lub przepustkę wychowanka, czy o urlop pracownika? Podaj też termin i etap sprawy.';
    }
    if (/^(grafik|harmonogram|dyzur)$/.test(normalized)) {
      return 'Podaj nazwisko wychowawcy oraz tydzień albo konkretną datę grafiku.';
    }
    if (/^(stopien|stopnie|poziom|poziom uspołecznienia)$/.test(normalized)) {
      return 'Podaj rozważany stopień i opisz konkretne zachowania oraz okres oceny wychowanka.';
    }
    if (/^(opinia|wniosek|dokument|notatka)$/.test(normalized)) {
      return 'Podaj rodzaj dokumentu, jego adresata, okres oraz cel sporządzenia.';
    }
    if (/^(prawo|przepisy|ustawa|rozporzadzenie|podstawa prawna)$/.test(normalized)) {
      return 'Podaj problem, którego dotyczy pytanie prawne, oraz datę zdarzenia lub decyzji.';
    }
    if (/^(telefon|telefony)$/.test(normalized)) {
      return 'Czy pytasz o aktualne zasady korzystania z telefonów, naruszenie zasad czy czasowe zarządzenie dyrektora?';
    }
    return '';
  }

  function extendFollowUpQuestion(question, history) {
    const terms = queryTerms(question);
    const normalized = normalize(question);
    const introducesTopic = /urlop|grafik|harmonogram|dyzur|stopien|poziom|opini|wniosek|dokument|notatk|prawo|przepis|ustaw|rozporzadzen|telefon|agresj|uciecz|pozar|lek|policj|pogotowi/.test(normalized);
    const followUpCue = /^(a\s|ale\s|czyli\s|w takim razie\s|a jesli\s|a jezeli\s|dlaczego\b|jak wtedy\b|kiedy dokladnie\b|a w\s)/.test(normalized);
    if (introducesTopic) return question;
    if (!followUpCue || terms.length >= 4) return question;
    const previous = [...(history || [])].reverse().find(message => message.role === 'user' && message.content !== question);
    return previous ? `${previous.content}\nPytanie uzupełniające: ${question}` : question;
  }

  function queryTerms(value) {
    const stop = new Set(['oraz', 'albo', 'jest', 'jaki', 'jaka', 'jakie', 'kiedy', 'gdzie', 'moge', 'mozna', 'trzeba', 'prosze', 'mow', 'pytanie', 'dotyczy']);
    return [...new Set(normalize(value).split(' ').filter(term => term.length > 2 && !stop.has(term)))];
  }

  function normalize(value = '') {
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9+\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function strip(value = '') {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    return (template.content.textContent || '').trim();
  }

  function sourceName(source) {
    return source?.sourceAttachment || source?.sourceTitle || 'Lokalny plik grafiku';
  }

  window.OpenLocalAssistant = { answer, loadKnowledge };
})();
