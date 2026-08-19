# Biblioteki lokalne

Aplikacja nie pobiera bibliotek z CDN podczas działania. Sprawdzone kopie są zapisane w `assets/vendor`, aby aplikacja działała offline i nie przekazywała danych do zewnętrznych serwerów.

| Biblioteka | Wersja | Zastosowanie | Licencja | Źródło |
| --- | --- | --- | --- | --- |
| Mammoth | 1.12.1 | odczyt DOCX | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js |
| SheetJS CE | 0.20.3 | odczyt XLS/XLSX | Apache-2.0 | https://cdn.sheetjs.com/ |
| PDF.js | 6.2.108 | odczyt PDF | Apache-2.0 | https://github.com/mozilla/pdf.js |
| PostalMime | 3.0.0 | odczyt EML | MIT | https://github.com/postalsys/postal-mime |
| jsQR | 1.4.0 | skanowanie kodów QR | Apache-2.0 | https://github.com/cozmo/jsQR |
| qrcode-generator | 2.0.4 | tworzenie kodów QR | MIT | https://github.com/kazuhikoarase/qrcode-generator |

Pełne teksty licencji dystrybuowanych bibliotek znajdują się w `assets/vendor/licenses`. Plik `qrcode.min.js` zachowuje nagłówek praw autorskich Kazuhiko Arase i informację o licencji MIT.
