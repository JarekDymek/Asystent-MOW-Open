/* Direct LAN sync. No signaling, STUN, TURN or storage server is used. */
(function () {
  const CHUNK_SIZE = 12000;
  let peer = null;
  let channel = null;
  let secret = null;
  let hostMode = false;
  let incoming = null;

  async function startHost() {
    if (!window.RTCPeerConnection) return setStatus('Ta przeglądarka nie obsługuje bezpośredniej synchronizacji. Użyj zaszyfrowanej kopii.');
    closeConnection();
    hostMode = true;
    secret = crypto.getRandomValues(new Uint8Array(32));
    peer = createPeer();
    channel = peer.createDataChannel('asmow-open-sync', { ordered: true });
    setupChannel(channel);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIce(peer);
    const code = await encodeConnectionCode({ role: 'offer', description: peer.localDescription, secret: toBase64Url(secret) });
    showCode('sync-offer-code', 'sync-offer-qr', code);
    showStep('host-offer');
    setStatus('Na telefonie wybierz „Dołącz”, zeskanuj ten kod i wygeneruj odpowiedź. Oba urządzenia pozostaw otwarte w tej samej sieci Wi-Fi.');
  }

  async function join() {
    if (!window.RTCPeerConnection) return setStatus('Ta przeglądarka nie obsługuje bezpośredniej synchronizacji.');
    const raw = document.getElementById('sync-remote-code')?.value.trim();
    if (!raw) return setStatus('Wklej lub zeskanuj kod z pierwszego urządzenia.');
    try {
      closeConnection();
      hostMode = false;
      const decoded = await decodeConnectionCode(raw);
      if (decoded.role !== 'offer' || !decoded.secret) throw new Error('To nie jest kod rozpoczęcia synchronizacji.');
      secret = fromBase64Url(decoded.secret);
      peer = createPeer();
      peer.ondatachannel = event => {
        channel = event.channel;
        setupChannel(channel);
      };
      await peer.setRemoteDescription(decoded.description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIce(peer);
      const code = await encodeConnectionCode({ role: 'answer', description: peer.localDescription });
      showCode('sync-answer-code', 'sync-answer-qr', code);
      showStep('join-answer');
      setStatus('Na pierwszym urządzeniu zeskanuj lub wklej kod odpowiedzi i wybierz „Połącz”.');
    } catch (error) {
      setStatus(`Nie udało się odczytać kodu połączenia: ${error.message}`);
    }
  }

  async function finishHost() {
    const raw = document.getElementById('sync-answer-input')?.value.trim();
    if (!peer || !raw) return setStatus('Wklej lub zeskanuj kod odpowiedzi z telefonu.');
    try {
      const decoded = await decodeConnectionCode(raw);
      if (decoded.role !== 'answer') throw new Error('To nie jest kod odpowiedzi.');
      await peer.setRemoteDescription(decoded.description);
      setStatus('Łączę urządzenia...');
    } catch (error) {
      setStatus(`Nie udało się zakończyć parowania: ${error.message}`);
    }
  }

  function createPeer() {
    const connection = new RTCPeerConnection({ iceServers: [] });
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') setStatus('Połączenie lokalne nie powiodło się. Sprawdź, czy urządzenia są w tej samej sieci Wi-Fi, albo użyj zaszyfrowanej kopii.');
      if (connection.connectionState === 'disconnected') setStatus('Urządzenia zostały rozłączone.');
    };
    return connection;
  }

  function setupChannel(dataChannel) {
    dataChannel.binaryType = 'arraybuffer';
    dataChannel.bufferedAmountLowThreshold = 64 * 1024;
    dataChannel.onopen = async () => {
      setStatus('Połączono bezpośrednio. Porównuję lokalne bazy...');
      if (hostMode) await sendSnapshot('host-snapshot');
    };
    dataChannel.onmessage = event => receiveMessage(event.data);
    dataChannel.onerror = () => setStatus('Wystąpił błąd bezpośredniego przesyłania. Dane nie zostały usunięte.');
  }

  async function sendSnapshot(mode) {
    const snapshot = await OpenData.exportSnapshot();
    const encrypted = await encryptSyncSnapshot(snapshot);
    await sendPacket({ mode, encrypted });
  }

  async function sendPacket(payload) {
    const text = JSON.stringify(payload);
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const chunks = [];
    for (let index = 0; index < text.length; index += CHUNK_SIZE) chunks.push(text.slice(index, index + CHUNK_SIZE));
    channel.send(JSON.stringify({ type: 'start', id, total: chunks.length }));
    for (let index = 0; index < chunks.length; index += 1) {
      await waitForBuffer();
      channel.send(JSON.stringify({ type: 'chunk', id, index, data: chunks[index] }));
    }
    channel.send(JSON.stringify({ type: 'end', id }));
  }

  async function receiveMessage(raw) {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (message.type === 'start') {
      incoming = { id: message.id, total: message.total, chunks: new Array(message.total) };
      return;
    }
    if (message.type === 'chunk' && incoming?.id === message.id) {
      incoming.chunks[message.index] = message.data;
      return;
    }
    if (message.type === 'end' && incoming?.id === message.id) {
      const packet = JSON.parse(incoming.chunks.join(''));
      incoming = null;
      await applyPacket(packet);
    }
  }

  async function applyPacket(packet) {
    try {
      const snapshot = await decryptSyncSnapshot(packet.encrypted);
      if (packet.mode === 'done') {
        setStatus('Synchronizacja zakończona. Obie bazy są zgodne logicznie.');
        return;
      }
      const summary = await OpenData.mergeSnapshot(snapshot);
      await refreshOpenDataViews();
      const text = `nowe ${summary.added}, aktualizacje ${summary.updated}, pliki ${summary.files}, bez zmian ${summary.unchanged}`;
      if (packet.mode === 'host-snapshot' && !hostMode) {
        setStatus(`Odebrano bazę pierwszego urządzenia: ${text}. Wysyłam scalony stan zwrotnie...`);
        await sendSnapshot('peer-snapshot');
      } else if (packet.mode === 'peer-snapshot' && hostMode) {
        setStatus(`Synchronizacja zakończona: ${text}. Obie bazy są zgodne logicznie.`);
        await sendPacket({ mode: 'done', encrypted: await encryptSyncSnapshot({ message: 'ok' }) });
      }
    } catch (error) {
      setStatus(`Nie udało się scalić przesłanych danych: ${error.message}`);
    }
  }

  async function encryptSyncSnapshot(snapshot) {
    const key = await crypto.subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(snapshot));
    const compressed = await compressBytes(plain);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed.bytes);
    return { iv: toBase64Url(iv), data: toBase64Url(new Uint8Array(encrypted)), compressed: compressed.compressed };
  }

  async function decryptSyncSnapshot(envelope) {
    const key = await crypto.subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(envelope.iv) }, key, fromBase64Url(envelope.data));
    const bytes = await decompressBytes(new Uint8Array(decrypted), envelope.compressed);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function encodeConnectionCode(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const compressed = await compressBytes(bytes);
    return `ASMOW1.${compressed.compressed ? 'G' : 'N'}.${toBase64Url(compressed.bytes)}`;
  }

  async function decodeConnectionCode(code) {
    const parts = String(code).trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'ASMOW1') throw new Error('Nieprawidłowy format kodu.');
    const bytes = await decompressBytes(fromBase64Url(parts[2]), parts[1] === 'G');
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function compressBytes(bytes) {
    if (!('CompressionStream' in window)) return { bytes, compressed: false };
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), compressed: true };
  }

  async function decompressBytes(bytes, compressed) {
    if (!compressed) return bytes;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function waitForIce(connection) {
    if (connection.iceGatheringState === 'complete') return;
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 5000);
      const listener = () => {
        if (connection.iceGatheringState !== 'complete') return;
        clearTimeout(timeout);
        connection.removeEventListener('icegatheringstatechange', listener);
        resolve();
      };
      connection.addEventListener('icegatheringstatechange', listener);
    });
  }

  async function waitForBuffer() {
    if (!channel || channel.readyState !== 'open') throw new Error('Połączenie zostało zamknięte.');
    if (channel.bufferedAmount < 256 * 1024) return;
    await new Promise(resolve => channel.addEventListener('bufferedamountlow', resolve, { once: true }));
  }

  function showCode(inputId, canvasId, code) {
    const input = document.getElementById(inputId);
    if (input) input.value = code;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (typeof window.qrcode === 'function' && code.length <= 2800) {
      try {
        const qr = window.qrcode(0, 'L');
        qr.addData(code);
        qr.make();
        const modules = qr.getModuleCount();
        const margin = 8;
        const size = 260;
        const cell = Math.max(1, Math.floor((size - margin * 2) / modules));
        const renderedSize = modules * cell + margin * 2;
        canvas.width = renderedSize;
        canvas.height = renderedSize;
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, renderedSize, renderedSize);
        context.fillStyle = '#001f3f';
        for (let row = 0; row < modules; row += 1) {
          for (let column = 0; column < modules; column += 1) {
            if (qr.isDark(row, column)) context.fillRect(margin + column * cell, margin + row * cell, cell, cell);
          }
        }
        canvas.hidden = false;
      } catch {
        canvas.hidden = true;
      }
    } else {
      canvas.hidden = true;
    }
  }

  function showStep(step) {
    document.querySelectorAll('[data-sync-step]').forEach(element => { element.hidden = element.dataset.syncStep !== step; });
  }

  async function copyCode(inputId) {
    const value = document.getElementById(inputId)?.value || '';
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setStatus('Kod skopiowano.');
  }

  async function scanCode(targetId) {
    if (!navigator.mediaDevices?.getUserMedia || !window.jsQR) return setStatus('Skanowanie kodu nie jest dostępne. Wklej kod ręcznie.');
    let overlay = document.getElementById('sync-scanner');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sync-scanner';
      overlay.className = 'sync-scanner';
      overlay.innerHTML = '<div><strong>Zeskanuj kod z drugiego urządzenia</strong><video playsinline></video><canvas hidden></canvas><button type="button" class="btn">Zamknij</button></div>';
      document.body.appendChild(overlay);
    }
    const video = overlay.querySelector('video');
    const canvas = overlay.querySelector('canvas');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    overlay.classList.add('open');
    let active = true;
    const close = () => {
      active = false;
      stream.getTracks().forEach(track => track.stop());
      overlay.classList.remove('open');
    };
    overlay.querySelector('button').onclick = close;
    const scan = () => {
      if (!active) return;
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(video, 0, 0);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = window.jsQR(image.data, image.width, image.height);
        if (result?.data?.startsWith('ASMOW1.')) {
          const target = document.getElementById(targetId);
          if (target) target.value = result.data;
          close();
          setStatus('Kod zeskanowano. Przejdź do następnego kroku.');
          return;
        }
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  }

  function setStatus(text) {
    const element = document.getElementById('device-sync-status');
    if (element) element.textContent = text;
  }

  function closeConnection() {
    try { channel?.close(); } catch {}
    try { peer?.close(); } catch {}
    channel = null;
    peer = null;
    incoming = null;
  }

  function toBase64Url(bytes) {
    return OpenData.arrayBufferToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Url(value) {
    const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return OpenData.base64ToUint8Array(padded);
  }

  window.OpenDeviceSync = { startHost, join, finishHost, copyCode, scanCode, closeConnection };
})();
