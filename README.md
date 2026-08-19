# Asystent MOW Open

Prywatna, instalowalna aplikacja PWA dla wychowawców młodzieżowych ośrodków wychowawczych. Działa bez konta, bez klucza API, bez Rendera i bez dostępu do poczty użytkownika.

## Uruchomienie i instalacja

Po publikacji aplikacja będzie dostępna pod adresem:

**https://jarekdymek.github.io/Asystent-MOW-Open/**

- Android: otwórz adres w Chrome i użyj przycisku **Zainstaluj** w aplikacji.
- Windows: otwórz adres w Edge lub Chrome i kliknij ikonę instalacji w pasku adresu albo przycisk **Zainstaluj**.
- iPhone/iPad: otwórz adres w Safari, wybierz **Udostępnij**, a następnie **Do ekranu początkowego**.

Instalacja nie wymaga konta, tokenu ani konfiguracji informatycznej.

## Co zawiera

- procedury MOW podane warstwowo: **NA JUŻ**, dalsze działania, dokumentacja i zakazy;
- stopnie uspołecznienia z lokalnym arkuszem interpretacji kryteriów;
- bazę prawną i źródła urzędowe;
- automatyczną kontrolę metadanych monitorowanych aktów w oficjalnym ELI dwa razy w tygodniu;
- kontrolowany bank 250 odpowiedzi oraz lokalne wyszukiwanie intencji;
- lokalny import wiadomości `.eml`, dokumentów `.docx`, `.xlsx`, `.xls`, `.pdf`, `.txt`, `.csv` i obrazów;
- odczyt grafików internatu i wyszukiwanie dyżurów według nazwiska oraz tygodnia;
- zaszyfrowaną kopię `.asmow` i bezpośrednią synchronizację dwóch urządzeń w tej samej sieci.

## Prywatność

Dodane pliki są przetwarzane w przeglądarce i zapisywane w IndexedDB urządzenia. Aplikacja nie wysyła ich do GitHuba, autora ani dostawcy AI. Użytkownik decyduje, które pliki importuje i komu przekazuje zaszyfrowaną kopię.

Szczegóły: [docs/PRYWATNOSC.md](docs/PRYWATNOSC.md).

## Uruchomienie lokalne

```powershell
npm install
npm run check
npm run serve
```

Następnie otwórz `http://127.0.0.1:4173`.

## Testy

```powershell
npm run check
```

Testy sprawdzają między innymi kompletność plików PWA, brak połączeń z AI/pocztą/Renderem, 250 odpowiedzi wzorcowych, źródła prawa i krytyczne procedury bezpieczeństwa.

## Aktualność prawa

GitHub Actions sprawdza w poniedziałek i czwartek urzędowe metadane monitorowanych aktów przez `api.sejm.gov.pl`. Wynik zapisuje w `assets/data/legal-status.json`. Aplikacja pokazuje zmiany statusu i powiązane publikacje jako pozycje **do oceny**, a nie jako gotową interpretację prawną. Każdy komunikat prowadzi do źródła w `eli.gov.pl`.

Automat można też uruchomić ręcznie poleceniem `npm run legal:update` albo z zakładki **Actions** w GitHubie.

## Ograniczenia

- lokalny asystent nie jest generatywnym modelem LLM i nie odpowiada poza zakresem bazy na siłę;
- skany obrazów są przechowywane do podglądu, ale nie są automatycznie odczytywane przez OCR;
- stary format Word `.doc` trzeba zapisać jako `.docx`;
- dane nie synchronizują się przez chmurę automatycznie;
- odpowiedź aplikacji nie zastępuje decyzji dyrektora, sądu, Policji, lekarza ani treści aktualnego dokumentu źródłowego.

## Licencje bibliotek

Aplikacja zawiera lokalne kopie bibliotek open source: Mammoth, SheetJS, PDF.js, PostalMime, jsQR i qrcode-generator. Ich licencje pozostają własnością autorów tych projektów.

Wersje, zastosowania i pełne informacje: [docs/BIBLIOTEKI.md](docs/BIBLIOTEKI.md).
