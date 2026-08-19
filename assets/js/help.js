function openHelp() {
  const title = document.getElementById('det-title');
  const source = document.getElementById('det-source');
  const body = document.getElementById('det-body');
  const view = document.getElementById('detail-view');
  if (!title || !source || !body || !view) return;

  title.textContent = 'Pomoc';
  source.textContent = 'Instrukcja praktyczna · Asystent MOW Open v1.0';
  body.innerHTML = `
    <div class="help-panel">
      <div class="help-card help-card--strong">
        <h3>Gdy sytuacja jest pilna</h3>
        <p>Najpierw zabezpiecz życie i zdrowie, wezwij wsparcie oraz odpowiednie służby. Przy bezpośrednim zagrożeniu dzwoń 112. Aplikacja jest pomocą, ale nie zastępuje decyzji osoby kierującej dyżurem ani procedury obowiązującej w MOW.</p>
      </div>

      <div class="help-card">
        <h3>Co oznacza wersja Open</h3>
        <ul>
          <li>Nie wymaga konta, klucza API ani tokenów AI.</li>
          <li>Pytania są analizowane na urządzeniu z użyciem banku 250 odpowiedzi, procedur, prawa i lokalnych dokumentów.</li>
          <li>Treść pytań, wiadomości i grafików nie jest wysyłana do modelu AI ani na Render.</li>
          <li>Przy braku pewnego dopasowania asystent dopytuje albo wskazuje dokument do samodzielnego sprawdzenia.</li>
        </ul>
      </div>

      <div class="help-card">
        <h3>Procedury i stopnie</h3>
        <ul>
          <li>W sytuacji kryzysowej otwórz procedurę. Najpilniejsze czynności znajdują się na początku.</li>
          <li>Asystent najpierw stosuje zatwierdzone dokumenty MOW, a prawo traktuje jako nadrzędną ramę.</li>
          <li>Arkusz stopni porządkuje obserwacje, ale nie kwalifikuje wychowanka i nie zastępuje zespołu.</li>
          <li>Przed zastosowaniem odpowiedzi sprawdź aktualny regulamin, datę i decyzje dyrekcji.</li>
        </ul>
      </div>

      <div class="help-card">
        <h3>Dodawanie wiadomości dyrekcji</h3>
        <ul>
          <li>Pobierz z własnej poczty wiadomość EML lub jej załącznik.</li>
          <li>W zakładce Inf. wybierz „Importuj wiadomość lub dokument”.</li>
          <li>Obsługiwane są EML, DOCX, XLSX, PDF, TXT, CSV i obrazy. Stary DOC zapisz najpierw jako DOCX albo PDF.</li>
          <li>Pliki można otwierać i pobierać z lokalnego archiwum.</li>
          <li>Grafik znaleziony w EML zostanie przekazany również do zakładki Harmonogram.</li>
        </ul>
      </div>

      <div class="help-card">
        <h3>Harmonogram</h3>
        <ul>
          <li>Dodaj pliki grafików DOCX lub XLSX. Oryginały pozostają na urządzeniu.</li>
          <li>Wpisz nazwisko, aby wyświetlić poprzedni, bieżący i dostępne przyszłe tygodnie.</li>
          <li>Dyżur nocny przekraczający północ jest pokazywany jako dwa odcinki w dwóch kolejnych dniach.</li>
          <li>Przy ostrzeżeniu o niejednoznacznym odczycie zawsze porównaj wynik z plikiem źródłowym.</li>
          <li>Obrazy nie są automatycznie rozpoznawane. Można je powiększyć i odczytać ręcznie.</li>
        </ul>
      </div>

      <div class="help-card">
        <h3>Prawo i baza wiedzy</h3>
        <ul>
          <li>Wspólne wyciągi prawne i bank odpowiedzi są częścią aplikacji i pozostają tylko do odczytu.</li>
          <li>Własne zarządzenia, wzory i zmiany czasowe zapisują się na urządzeniu.</li>
          <li>Nowszy aktywny wpis może zastąpić starszy, ale historia pozostaje dostępna w kopii danych.</li>
          <li>Kontrola prawa pokazuje opublikowane zestawienie ELI. Jest sygnałem do weryfikacji, a nie poradą prawną.</li>
          <li>Otwieraj urzędowe źródło i sprawdzaj datę wejścia w życie aktu.</li>
        </ul>
      </div>

      <div class="help-card">
        <h3>Kopia i synchronizacja</h3>
        <ul>
          <li>W zakładce Prawo rozwiń „Kopia i synchronizacja urządzeń”.</li>
          <li>Ustaw hasło i pobierz zaszyfrowany plik .asmow. Bez hasła nie można go odzyskać.</li>
          <li>Przy imporcie aplikacja scala dane, nie nadpisuje bezwarunkowo całej bazy.</li>
          <li>PC i telefon mogą połączyć się bezpośrednio przez kody QR w tej samej sieci Wi-Fi.</li>
          <li>Oba urządzenia muszą mieć wtedy otwartą aplikację. Gdy połączenie lokalne jest blokowane, użyj pliku .asmow i Quick Share, AirDrop albo kabla.</li>
        </ul>
      </div>

      <div class="help-card help-card--warn">
        <h3>Dane służbowe</h3>
        <p>Nie zapisuj pełnych danych osobowych, jeżeli nie są konieczne. Chroń urządzenie blokadą ekranu, nie udostępniaj hasła kopii i usuń lokalną bazę przed przekazaniem telefonu innej osobie. Dyktowanie może korzystać z usługi rozpoznawania mowy producenta przeglądarki; dla informacji wrażliwych użyj klawiatury.</p>
      </div>

      <div class="help-card">
        <h3>Instalacja i aktualizacje</h3>
        <ul>
          <li>Na Androidzie użyj Chrome i przycisku Instaluj.</li>
          <li>Na iPhone lub iPadzie użyj Safari, Udostępnij i „Do ekranu początkowego”.</li>
          <li>Na Windows użyj Edge lub Chrome. Instalacja jest dostępna z paska adresu albo menu Aplikacje.</li>
          <li>Po komunikacie o nowej wersji wybierz Odśwież. Lokalna baza nie zostanie usunięta.</li>
        </ul>
      </div>
    </div>`;
  view.classList.add('open');
}
