# Prywatność i przepływ danych

## Co opuszcza urządzenie

Podczas zwykłego używania żaden dodany dokument, wiadomość, grafik, notatka ani pytanie nie opuszcza urządzenia. Połączenie z Internetem służy tylko do pobrania publicznych plików aplikacji i aktualizacji PWA.

Wyjątkiem może być opcjonalne dyktowanie: przeglądarka lub system operacyjny może przekazywać nagranie do własnej usługi rozpoznawania mowy. Do danych służbowych i wrażliwych używaj klawiatury, jeśli nie znasz zasad przetwarzania mowy na urządzeniu.

## Gdzie są dane

Dane użytkownika znajdują się w pamięci IndexedDB profilu przeglądarki. Wyczyszczenie danych witryny usuwa również bazę aplikacji. Na współdzielonym urządzeniu inna osoba korzystająca z tego samego profilu przeglądarki może mieć do nich dostęp.

## Kopia `.asmow`

Eksport jest szyfrowany AES-GCM kluczem wyprowadzonym z hasła przez PBKDF2-SHA-256. Bez hasła kopii nie można przywrócić. Hasło nie jest zapisywane przez aplikację.

## Synchronizacja dwóch urządzeń

Synchronizacja używa bezpośredniego połączenia WebRTC bez serwera pośredniczącego STUN/TURN. Urządzenia powinny być w tej samej sieci Wi-Fi. Jednorazowy kod zawiera dane techniczne połączenia oraz sekret sesji. Nie należy publikować go ani zachowywać po synchronizacji.

## Zalecenia

- Nie dodawaj pełnych danych wychowanka, jeśli wystarczy opis zanonimizowany.
- Chroń urządzenie kodem ekranu i nie używaj współdzielonego profilu przeglądarki.
- Wykonuj zaszyfrowaną kopię po ważnych zmianach.
- Przed przekazaniem kopii upewnij się, że odbiorca jest uprawniony do zawartych danych.
