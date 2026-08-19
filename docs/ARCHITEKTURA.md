# Architektura wersji Open

## Warstwy

1. Statyczna PWA na GitHub Pages: interfejs, procedury, prawo i bank odpowiedzi.
2. IndexedDB: wpisy użytkownika, wiadomości, grafiki, pliki, historia rozmowy i notatki.
3. Lokalny router: rozpoznawanie intencji, wyszukiwanie w procedurach, banku 250 odpowiedzi i dokumentach urządzenia.
4. Import przeglądarkowy: DOCX, arkusze, PDF, EML, tekst i obrazy bez wysyłania pliku.
5. Wymiana danych: szyfrowana kopia `.asmow` lub bezpośrednia synchronizacja WebRTC w sieci lokalnej.

## Brak backendu

Repozytorium nie zawiera serwera, endpointów API, połączenia IMAP, kluczy modelu ani tokenów harmonogramu. GitHub Pages udostępnia wyłącznie publiczne pliki aplikacji.

## Rozstrzyganie konfliktów

Rekordy mają stabilny identyfikator i czas aktualizacji. Import lub synchronizacja wybiera nowszą wersję. Usunięcia są zapisywane jako znaczniki, aby usunięty wpis nie wrócił z drugiego urządzenia. Konflikt dwóch różnych wersji o tej samej dacie jest raportowany użytkownikowi i pozostawia wersję lokalną.
