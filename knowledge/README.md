# Baza wiedzy Asystenta MOW Open

Ten katalog zawiera jawne, statyczne materiały używane lokalnie przez aplikację.

## Zasady

- Krótkie wyciągi `.md` służą do szybkiego odnajdywania odpowiedzi.
- Pełne teksty aktów są archiwum kontrolnym w `_archiwum_pelne_teksty`.
- Dokumenty MOW mają pierwszeństwo w sprawach procedur wewnętrznych, o ile są zgodne z prawem wyższego rzędu.
- Nowszy, obowiązujący dokument zastępuje wcześniejszy w tym samym zakresie.
- Zmiana czasowa obowiązuje tylko między datą rozpoczęcia i zakończenia.
- Własne dokumenty użytkownika są przechowywane wyłącznie w IndexedDB urządzenia, a nie w tym katalogu GitHuba.

## Bank odpowiedzi

`07_bank_odpowiedzi_mow_250.md` dokumentuje 250 kontrolowanych odpowiedzi. Dane używane przez router aplikacji są generowane do `assets/js/data-answer-bank.js` poleceniem:

```powershell
node scripts/generate-answer-bank.mjs
```

Po zmianie bazy należy uruchomić `npm run check`.
