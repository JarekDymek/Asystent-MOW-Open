import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets/js/local-assistant.js'), 'utf8');
const context = {
  console,
  window: {},
  fetch: async () => ({ ok: true, text: async () => '' }),
  OpenData: { search: async () => [] },
  resolveAnswerBankIntent: question => String(question).includes('pensum')
    ? {
        type: 'answer',
        confidence: 1,
        entry: {
          answer: 'Pensum wychowawcy MOW wynosi 24 godziny tygodniowo.',
          action: 'Sprawdź art. 42 ust. 3 Karty Nauczyciela.',
          caution: '',
          sources: ['Karta Nauczyciela']
        }
      }
    : null,
  formatAnswerBankReply: result => result.entry.answer,
  formatAnswerBankClarification: () => '',
  PROCS: [],
  STOPNIE: [],
  LAWS: []
};
context.window.PROCS = context.PROCS;
context.window.STOPNIE = context.STOPNIE;
context.window.LAWS = context.LAWS;
vm.createContext(context);
vm.runInContext(source, context);

const first = await context.window.OpenLocalAssistant.answer('Ile wynosi pensum wychowawcy w MOW?');
const second = await context.window.OpenLocalAssistant.answer('Co z urlopem?', 'general', [
  { role: 'user', content: 'Ile wynosi pensum wychowawcy w MOW?' },
  { role: 'assistant', content: first.text }
]);

if (!first.text.includes('24 godziny')) throw new Error('Brak kontrolnej odpowiedzi o pensum 24 godziny.');
if (!second.text.includes('Czy chodzi o urlopowanie') || second.text.includes('24 godziny')) {
  throw new Error('Nowy temat „Co z urlopem?” został błędnie potraktowany jako kontynuacja pytania o pensum.');
}

console.log('OK: lokalny asystent nie przenosi odpowiedzi między odrębnymi tematami rozmowy.');
