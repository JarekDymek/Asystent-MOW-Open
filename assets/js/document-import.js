/* Browser-only document extraction. Imported files never leave the device. */
(function () {
  const MAX_FILE_SIZE = 25 * 1024 * 1024;

  async function parseFile(file) {
    if (!file) throw new Error('Nie wybrano pliku.');
    if (file.size > MAX_FILE_SIZE) throw new Error(`Plik ${file.name} jest większy niż 25 MB.`);
    const extension = getExtension(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const mimeType = file.type || guessOpenMime(file.name);

    if (['txt', 'md', 'csv', 'tsv', 'json'].includes(extension)) {
      return { name: file.name, mimeType, text: decodeText(arrayBuffer), html: '', kind: 'text' };
    }
    if (extension === 'doc') {
      throw new Error(`Plik ${file.name} ma stary format DOC. Otwórz go w Wordzie i zapisz jako DOCX albo PDF.`);
    }
    if (extension === 'docx') return extractDocx(file.name, mimeType, arrayBuffer);
    if (extension === 'xls' || extension === 'xlsx') return extractSpreadsheet(file.name, mimeType, arrayBuffer);
    if (extension === 'pdf') return extractPdf(file.name, mimeType, arrayBuffer);
    if (extension === 'eml') return extractEml(file.name, mimeType, arrayBuffer);
    if (/^image\//i.test(mimeType) || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
      return { name: file.name, mimeType, text: '', html: '', kind: 'image' };
    }
    throw new Error(`Format pliku ${file.name} nie jest obsługiwany. Użyj DOCX, XLSX, PDF, EML, TXT, CSV lub obrazu.`);
  }

  async function extractDocx(name, mimeType, arrayBuffer) {
    if (!window.mammoth) throw new Error('Moduł odczytu Worda nie został załadowany. Odśwież aplikację online.');
    const [htmlResult, textResult] = await Promise.all([
      window.mammoth.convertToHtml({ arrayBuffer }),
      window.mammoth.extractRawText({ arrayBuffer })
    ]);
    return {
      name,
      mimeType,
      text: normalizeExtractedText(textResult.value || ''),
      html: htmlResult.value || '',
      warnings: [...(htmlResult.messages || []), ...(textResult.messages || [])],
      kind: 'docx'
    };
  }

  async function extractSpreadsheet(name, mimeType, arrayBuffer) {
    if (!window.XLSX) throw new Error('Moduł odczytu Excela nie został załadowany. Odśwież aplikację online.');
    const workbook = window.XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const texts = [];
    const tables = [];
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      texts.push(`[Arkusz: ${sheetName}]\n${window.XLSX.utils.sheet_to_csv(sheet, { FS: '\t', blankrows: false })}`);
      tables.push(window.XLSX.utils.sheet_to_html(sheet));
    });
    return { name, mimeType, text: normalizeExtractedText(texts.join('\n\n')), html: tables.join('\n'), kind: 'spreadsheet' };
  }

  async function extractPdf(name, mimeType, arrayBuffer) {
    let pdfjs;
    try {
      const moduleUrl = new URL('assets/vendor/pdf.min.mjs', document.baseURI).href;
      pdfjs = await import(moduleUrl);
    } catch {
      throw new Error('Moduł odczytu PDF nie został załadowany. Odśwież aplikację online.');
    }
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/vendor/pdf.worker.min.mjs', document.baseURI).href;
    const document = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(`[Strona ${pageNumber}]\n${content.items.map(item => item.str).join(' ')}`);
    }
    return { name, mimeType, text: normalizeExtractedText(pages.join('\n\n')), html: '', kind: 'pdf' };
  }

  async function extractEml(name, mimeType, arrayBuffer) {
    try {
      const moduleUrl = new URL('assets/vendor/postal-mime/postal-mime.js', document.baseURI).href;
      const module = await import(moduleUrl);
      const PostalMime = module.default || module.PostalMime;
      const parsed = await new PostalMime().parse(arrayBuffer);
      return {
        name,
        mimeType,
        kind: 'eml',
        text: normalizeExtractedText(parsed.text || stripOpenHtml(parsed.html || '')),
        html: parsed.html || '',
        message: {
          subject: parsed.subject || '',
          from: formatEmlAddress(parsed.from),
          date: parsed.date || '',
          text: normalizeExtractedText(parsed.text || stripOpenHtml(parsed.html || '')),
          attachments: Array.isArray(parsed.attachments) ? parsed.attachments : []
        }
      };
    } catch (error) {
      const fallback = decodeText(arrayBuffer);
      const split = fallback.split(/\r?\n\r?\n/);
      const headers = split.shift() || '';
      return {
        name,
        mimeType,
        kind: 'eml',
        text: normalizeExtractedText(split.join('\n\n')),
        html: '',
        message: {
          subject: headerValue(headers, 'subject'),
          from: headerValue(headers, 'from'),
          date: headerValue(headers, 'date'),
          text: normalizeExtractedText(split.join('\n\n')),
          attachments: []
        },
        warnings: [String(error?.message || error)]
      };
    }
  }

  async function importFiles(fileList, options = {}) {
    const files = [...(fileList || [])];
    const summary = { imported: 0, schedules: 0, information: 0, knowledge: 0, errors: [] };
    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        const stored = await OpenData.putFile(file, { name: file.name, mimeType: parsed.mimeType });
        const result = parsed.kind === 'eml'
          ? await importMessage(parsed, stored, options)
          : await importParsedDocument(parsed, stored, options);
        summary.imported += 1;
        summary.schedules += result.schedules || 0;
        summary.information += result.information || 0;
        summary.knowledge += result.knowledge || 0;
      } catch (error) {
        summary.errors.push(`${file.name}: ${error.message}`);
      }
    }
    await refreshOpenViews();
    return summary;
  }

  async function importParsedDocument(parsed, storedFile, options = {}) {
    const classification = options.preferredType || classifyDocument(parsed.name, parsed.text);
    if (classification === 'schedule') {
      const schedule = await saveScheduleDocument(parsed, storedFile, options);
      return { schedules: schedule ? 1 : 0 };
    }
    if (classification === 'currentInfo') {
      await saveInformationDocument(parsed, storedFile, options);
      return { information: 1 };
    }
    await saveKnowledgeDocument(parsed, storedFile, options);
    return { knowledge: 1 };
  }

  async function importMessage(parsed, storedFile, options = {}) {
    const message = parsed.message || {};
    const attachmentMetas = [];
    let schedules = 0;
    let knowledge = 0;

    for (let index = 0; index < (message.attachments || []).length; index += 1) {
      const attachment = message.attachments[index];
      const bytes = attachment.content instanceof ArrayBuffer
        ? new Uint8Array(attachment.content)
        : attachment.content instanceof Uint8Array
          ? attachment.content
          : new Uint8Array(attachment.content || []);
      const attachmentFile = new File([bytes], attachment.filename || `zalacznik-${index + 1}`, {
        type: attachment.mimeType || 'application/octet-stream'
      });
      const storedAttachment = await OpenData.putFile(attachmentFile);
      attachmentMetas.push(storedAttachment);
      try {
        const attachmentParsed = await parseFile(attachmentFile);
        const classification = classifyDocument(attachmentParsed.name, `${message.subject || ''} ${attachmentParsed.text || ''}`);
        if (classification === 'schedule') {
          if (await saveScheduleDocument(attachmentParsed, storedAttachment, {
            sourceTitle: message.subject,
            sourceDate: normalizeOpenDate(message.date),
            sourceMessageFileId: storedFile.id
          })) schedules += 1;
        } else if (classification === 'knowledge') {
          await saveKnowledgeDocument(attachmentParsed, storedAttachment, { sourceTitle: message.subject });
          knowledge += 1;
        }
      } catch {}
    }

    const item = {
      id: `info-${storedFile.hash.slice(0, 24)}`,
      date: normalizeOpenDate(message.date) || new Date().toISOString().slice(0, 10),
      title: message.subject || buildOpenTitle(message.text),
      topic: detectOpenTopic(message.subject, message.text),
      source: message.from || 'Wiadomość zaimportowana lokalnie',
      body: message.text || parsed.text || '',
      originalFileId: storedFile.id,
      attachments: attachmentMetas,
      importedAt: new Date().toISOString()
    };
    const scheduleOnly = schedules > 0 && isScheduleText(`${item.title} ${item.body}`);
    if (!scheduleOnly || options.keepScheduleMessage) {
      await OpenData.putRecord({ id: item.id, type: 'currentInfo', hash: storedFile.hash, payload: item });
      return { schedules, knowledge, information: 1 };
    }
    return { schedules, knowledge, information: 0 };
  }

  async function saveScheduleDocument(parsed, storedFile, options = {}) {
    if (!parsed.html || !window.OpenScheduleParser) {
      await OpenData.putRecord({
        id: `schedule-${storedFile.hash.slice(0, 24)}`,
        type: 'scheduleDocument',
        hash: storedFile.hash,
        payload: {
          id: `schedule-${storedFile.hash.slice(0, 24)}`,
          weekStart: window.OpenScheduleParser?.extractWeekStart(`${parsed.name} ${parsed.text}`) || '',
          sourceTitle: options.sourceTitle || parsed.name,
          sourceAttachment: parsed.name,
          sourceDate: options.sourceDate || new Date().toISOString().slice(0, 10),
          sourceFileId: storedFile.id,
          scheduleKind: 'unknown',
          isCorrection: /korekt|zmian/i.test(`${parsed.name} ${options.sourceTitle || ''}`),
          ambiguous: true,
          warning: parsed.kind === 'image' ? 'Obraz zapisano bez automatycznego odczytu treści.' : 'Nie udało się odczytać tabeli grafiku.',
          records: [],
          text: parsed.text || ''
        }
      });
      return false;
    }
    const source = {
      sourceMailUid: options.sourceMessageFileId || storedFile.id,
      sourceTitle: options.sourceTitle || parsed.name,
      sourceAttachment: parsed.name,
      sourceDate: options.sourceDate || new Date().toISOString().slice(0, 10)
    };
    const extracted = window.OpenScheduleParser.parseHtml(parsed.html, source);
    const payload = {
      id: `schedule-${storedFile.hash.slice(0, 24)}`,
      ...extracted,
      ...source,
      sourceAttachmentId: storedFile.id,
      sourceFileId: storedFile.id,
      indexedAt: new Date().toISOString(),
      scheduleKind: window.OpenScheduleParser.classifyKind(`${source.sourceTitle} ${source.sourceAttachment}`),
      isCorrection: /korekt|zmian/i.test(`${source.sourceTitle} ${source.sourceAttachment}`),
      text: parsed.text || ''
    };
    await OpenData.putRecord({ id: payload.id, type: 'scheduleDocument', hash: storedFile.hash, payload });
    return payload.records.length > 0;
  }

  async function saveInformationDocument(parsed, storedFile, options = {}) {
    const payload = {
      id: `info-${storedFile.hash.slice(0, 24)}`,
      date: options.date || inferDateFromName(parsed.name) || new Date().toISOString().slice(0, 10),
      title: options.title || options.sourceTitle || buildOpenTitle(parsed.text) || parsed.name,
      topic: options.topic || detectOpenTopic(parsed.name, parsed.text),
      source: options.source || 'Plik dodany ręcznie',
      body: parsed.text || '',
      originalFileId: storedFile.id,
      attachments: [storedFile],
      importedAt: new Date().toISOString()
    };
    await OpenData.putRecord({ id: payload.id, type: 'currentInfo', hash: storedFile.hash, payload });
  }

  async function saveKnowledgeDocument(parsed, storedFile, options = {}) {
    const payload = {
      id: `knowledge-${storedFile.hash.slice(0, 24)}`,
      type: options.type || 'dokument-lokalny',
      title: options.title || options.sourceTitle || parsed.name,
      source: options.source || 'Plik dodany lokalnie',
      documentDate: options.documentDate || inferDateFromName(parsed.name),
      validFrom: options.validFrom || '',
      validTo: options.validTo || '',
      version: options.version || 'lokalna',
      content: parsed.text || '',
      originalFileId: storedFile.id,
      updatedAt: new Date().toISOString()
    };
    await OpenData.putRecord({ id: payload.id, type: 'knowledge', hash: storedFile.hash, payload });
  }

  function classifyDocument(name = '', text = '') {
    const signature = normalizeOpenSearch(`${name} ${text.slice(0, 5000)}`);
    if (isScheduleText(signature)) return 'schedule';
    if (/ustawa|rozporzadzenie|regulamin|statut|standardy ochrony|procedur|zarzadzenie/.test(signature)) return 'knowledge';
    if (/dyrektor|komunikat|rada pedagogiczna|termin|spotkanie|informacja|urlop|wydarzenie/.test(signature)) return 'currentInfo';
    return 'knowledge';
  }

  function isScheduleText(value = '') {
    const text = normalizeOpenSearch(value);
    return /harmonogram|grafik|tydzien|internat/.test(text)
      && /wychowawc|dyzur|grupa|poniedzialek|wtorek|sroda/.test(text);
  }

  function detectOpenTopic(title = '', body = '') {
    const text = normalizeOpenSearch(`${title} ${body}`);
    if (/harmonogram|grafik|dyzur/.test(text)) return 'harmonogram';
    if (/rada pedagogiczna|zebranie|spotkanie/.test(text)) return 'spotkanie';
    if (/urlop|wniosek urlop/.test(text)) return 'urlopy';
    if (/telefon/.test(text)) return 'telefony';
    if (/stopien|uspołeczn/.test(text)) return 'stopnie uspołecznienia';
    if (/sport|turniej|mecz|wyjazd/.test(text)) return 'wydarzenie';
    return 'informacja';
  }

  function buildOpenTitle(text = '') {
    return String(text).split(/\r?\n/).map(line => line.trim()).find(line => line.length > 4)?.slice(0, 140) || 'Wiadomość bez tytułu';
  }

  function normalizeOpenDate(value = '') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  function inferDateFromName(name = '') {
    const full = String(name).match(/(20\d{2})[-_. ](\d{1,2})[-_. ](\d{1,2})/);
    if (full) return `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`;
    const polish = String(name).match(/(\d{1,2})[-_. ](\d{1,2})[-_. ](20\d{2})/);
    if (polish) return `${polish[3]}-${String(polish[2]).padStart(2, '0')}-${String(polish[1]).padStart(2, '0')}`;
    return '';
  }

  function getExtension(name = '') {
    return String(name).toLowerCase().split('.').pop() || '';
  }

  function guessOpenMime(name = '') {
    const extension = getExtension(name);
    const types = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      pdf: 'application/pdf',
      eml: 'message/rfc822',
      txt: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values'
    };
    return types[extension] || 'application/octet-stream';
  }

  function decodeText(arrayBuffer) {
    let text = new TextDecoder('utf-8').decode(arrayBuffer);
    if ((text.match(/�/g) || []).length > 3) {
      try { text = new TextDecoder('windows-1250').decode(arrayBuffer); } catch {}
    }
    return normalizeExtractedText(text);
  }

  function normalizeExtractedText(value = '') {
    return String(value).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  }

  function stripOpenHtml(value = '') {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    return template.content.textContent || '';
  }

  function headerValue(headers, key) {
    return headers.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))?.[1]?.trim() || '';
  }

  function formatEmlAddress(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return [value.name, value.address].filter(Boolean).join(' <').replace(/$/, value.name && value.address ? '>' : '');
  }

  function normalizeOpenSearch(value = '') {
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  }

  async function refreshOpenViews() {
    if (typeof loadCurrentInfo === 'function') await loadCurrentInfo();
    if (typeof loadInternatScheduleIndexFromDb === 'function') await loadInternatScheduleIndexFromDb();
    if (typeof loadKnowledgeBase === 'function') await loadKnowledgeBase();
    if (typeof renderKnowledgeList === 'function') renderKnowledgeList();
  }

  window.OpenDocumentImport = {
    parseFile,
    importFiles,
    classifyDocument,
    isScheduleText,
    inferDateFromName
  };
})();
