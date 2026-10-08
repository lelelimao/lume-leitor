"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const ui = {
    video: $("camera"), image: $("image-preview"), overlay: $("overlay"), stage: $("camera-stage"),
    placeholder: $("camera-placeholder"), camera: $("camera-toggle"), capture: $("capture"),
    upload: $("image-upload"), uploadButton: $("upload-button"), autoRead: $("auto-read"),
    mode: $("recognition-mode"), transcript: $("transcript"), speak: $("speak"),
    stopSpeech: $("stop-speech"), autoSpeak: $("auto-speak"), output: $("speech-output"),
    copy: $("copy-text"), clear: $("clear-text"),
  };
  const state = {
    stream: null, starting: false, source: null, file: null, imageUrl: null,
    session: 0, request: null, timer: null, regions: [], frameWidth: 0, frameHeight: 0,
    tracker: new ReadingStability.Tracker(), spokenTexts: new Set(), speaking: false, speechVersion: 0,
    alexaPending: false, nextAlexaAt: 0, maxImageMB: 8, modelExists: false,
    audioContext: null, audioSource: null, googleRequest: null, nextGoogleAt: 0,
    audioPlaying: false, mouthFrame: null, speechPreview: "", voiceCatalog: [], catalogVersion: 0,
  };
  const hasSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const captureCanvas = document.createElement("canvas");
  const captureContext = captureCanvas.getContext("2d");
  const overlayContext = ui.overlay.getContext("2d");

  function message(text, error = false) {
    $("message").textContent = text;
    $("message-bar").classList.toggle("error", error);
  }

  function warning(text = "") {
    $("warning-text").textContent = text;
    $("warning-bar").hidden = !text;
  }

  function errorText(error, fallback) {
    if (typeof error === "string") return error;
    if (error && typeof error.message === "string") return error.message;
    if (Array.isArray(error)) return error.map((item) => item.msg || "Dados inválidos").join(". ");
    return fallback;
  }

  async function responseBody(response) {
    let body;
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) {
      const error = new Error(errorText(body.detail || body.message, `O servidor não concluiu a operação (HTTP ${response.status}).`));
      error.retryAfter = Number(body.retry_after || body.detail?.retry_after || response.headers.get("Retry-After") || 0);
      throw error;
    }
    return body;
  }

  function updateControls() {
    const available = Boolean(state.source);
    ui.capture.disabled = !available || Boolean(state.request) || state.starting;
    ui.camera.disabled = false;
    ui.camera.querySelector("span").textContent = state.starting ? "Cancelar abertura" : state.stream ? "Desligar câmera" : "Ativar câmera";
    ui.autoRead.disabled = !state.stream;
    ui.capture.querySelector("span").textContent = state.request && !state.tracker.current ? "Reconhecendo…" : "Identificar texto";
    const textExists = Boolean(ui.transcript.value.trim());
    ui.speak.disabled = !textExists || state.alexaPending || (ui.output.value === "browser" && !hasSpeech);
    ui.stopSpeech.disabled = !state.speaking;
    ui.copy.disabled = !textExists;
    ui.clear.disabled = !textExists;
    ui.speak.querySelector("span").textContent = state.alexaPending ? "Enviando…" : state.speaking ? "Ouvir novamente" : "Ouvir texto";
    const mood = state.audioPlaying ? "speaking" : state.speaking ? "preparing" : state.request ? "reading" : state.alexaPending ? "sending" : state.stream ? "watching" : "idle";
    $("companion").dataset.mood = mood;
    $("mascot-message").textContent = {
      speaking: "Eu leio, você acompanha. Olha só…",
      preparing: "Achei as palavras. Estou preparando a voz…",
      reading: "Deixa eu ajeitar os óculos… já estou lendo.",
      sending: "Essas palavras estão a caminho do seu Echo.",
      watching: "Livro aberto, olhos atentos. Pode mostrar o texto!",
      idle: "O livro está aberto. Só falta o seu texto.",
    }[mood];
    $("mascot-excerpt").textContent = state.speechPreview;
    $("mascot-excerpt").hidden = !state.audioPlaying || !state.speechPreview;
    $("automation-state").textContent = ui.autoRead.checked && ui.autoSpeak.checked ? "Leitura e voz automáticas" : "Você controla a leitura";
  }

  function updateTranscript() {
    const length = Array.from(ui.transcript.value).length;
    $("character-count").textContent = `${length.toLocaleString("pt-BR")} ${length === 1 ? "caractere" : "caracteres"}`;
    $("text-state").textContent = length ? "PRONTO PARA OUVIR" : "AGUARDANDO";
    $("text-state").classList.toggle("has-text", length > 0);
    updateControls();
  }

  const normalize = ReadingStability.normalize;

  function resetStability() {
    state.tracker.reset();
  }

  function clearRegions() {
    state.regions = [];
    state.frameWidth = 0;
    state.frameHeight = 0;
    drawRegions();
  }

  function drawRegions() {
    const width = ui.stage.clientWidth;
    const height = ui.stage.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    ui.overlay.width = Math.round(width * dpr);
    ui.overlay.height = Math.round(height * dpr);
    overlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayContext.clearRect(0, 0, width, height);
    if (!state.frameWidth || !state.frameHeight) return;
    const scale = Math.min(width / state.frameWidth, height / state.frameHeight);
    const offsetX = (width - state.frameWidth * scale) / 2;
    const offsetY = (height - state.frameHeight * scale) / 2;
    overlayContext.strokeStyle = "#b7db8e";
    overlayContext.fillStyle = "rgba(164, 202, 123, 0.10)";
    overlayContext.lineWidth = 1.5;
    for (const region of state.regions) {
      if (!Array.isArray(region.box) || region.box.length !== 4 || !region.box.every(Number.isFinite)) continue;
      const [x1, y1, x2, y2] = region.box;
      const x = offsetX + Math.max(0, x1) * scale;
      const y = offsetY + Math.max(0, y1) * scale;
      const boxWidth = (Math.min(state.frameWidth, x2) - Math.max(0, x1)) * scale;
      const boxHeight = (Math.min(state.frameHeight, y2) - Math.max(0, y1)) * scale;
      if (boxWidth > 0 && boxHeight > 0) {
        overlayContext.fillRect(x, y, boxWidth, boxHeight);
        overlayContext.strokeRect(x, y, boxWidth, boxHeight);
      }
    }
  }

  function cancelRecognition() {
    state.session += 1;
    clearTimeout(state.timer);
    state.timer = null;
    if (state.request) state.request.abort();
    state.request = null;
    $("processing").hidden = true;
    resetStability();
  }

  function stopSpeech(announce = false) {
    state.speechVersion += 1;
    if (hasSpeech) window.speechSynthesis.cancel();
    state.googleRequest?.abort();
    state.googleRequest = null;
    if (state.audioSource) { state.audioSource.onended = null; try { state.audioSource.stop(); } catch {} }
    state.audioSource = null;
    state.speaking = false;
    state.audioPlaying = false;
    cancelAnimationFrame(state.mouthFrame);
    $("companion").dataset.mouth = "closed";
    updateControls();
    if (announce) message("Fala neste computador interrompida.");
  }

  function releaseImage() {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    state.imageUrl = null;
    state.file = null;
    ui.image.hidden = true;
    ui.image.removeAttribute("src");
  }

  function stopCamera(announce = true) {
    cancelRecognition();
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
    state.starting = false;
    ui.video.srcObject = null;
    ui.video.hidden = true;
    if (state.source === "camera") state.source = null;
    ui.placeholder.hidden = state.source === "image";
    $("camera-state").textContent = state.source === "image" ? "Imagem enviada" : "Câmera desligada";
    $("camera-state").classList.remove("active");
    if (!state.source) {
      $("source-info").textContent = "Nenhuma fonte selecionada";
      $("frame-info").textContent = "Câmera desligada";
    }
    clearRegions();
    stopSpeech();
    updateControls();
    if (announce) message("Câmera desligada. Você ainda pode ouvir ou editar o texto reconhecido.");
  }

  async function startCamera() {
    unlockAudio();
    if (!navigator.mediaDevices?.getUserMedia) {
      message("A câmera precisa de localhost ou HTTPS e de um navegador compatível. Você também pode enviar uma imagem.", true);
      return;
    }
    stopCamera(false);
    releaseImage();
    state.source = null;
    state.starting = true;
    const session = state.session;
    updateControls();
    message("Permita o uso da webcam no navegador para começar.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" }, audio: false });
      if (session !== state.session) { stream.getTracks().forEach((track) => track.stop()); return; }
      state.stream = stream;
      ui.video.srcObject = stream;
      await ui.video.play();
      if (session !== state.session) return;
      state.source = "camera";
      state.starting = false;
      ui.video.hidden = false;
      ui.placeholder.hidden = true;
      $("camera-state").textContent = "● Ao vivo";
      $("camera-state").classList.add("active");
      $("source-info").textContent = `Webcam · ${ui.video.videoWidth} × ${ui.video.videoHeight}`;
      $("frame-info").textContent = "Posicione o texto no enquadramento";
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (state.stream === stream) { stopCamera(false); message("A câmera foi desconectada. Conecte-a novamente ou envie uma imagem.", true); }
      }, { once: true });
      updateControls();
      message(ui.autoRead.checked ? "Câmera ativa. O primeiro texto reconhecido aparecerá e será lido automaticamente." : "Câmera ativa. Enquadre o texto e selecione Identificar texto.");
      if (ui.autoRead.checked) scheduleNext(300);
    } catch (error) {
      if (session !== state.session) return;
      stopCamera(false);
      const explanations = {
        NotAllowedError: "O acesso à câmera foi negado. Autorize a câmera nas permissões do navegador ou envie uma imagem.",
        NotFoundError: "Nenhuma webcam foi encontrada. Conecte uma câmera ou envie uma imagem.",
        NotReadableError: "Não foi possível acessar a câmera. Ela pode estar sendo usada por outro aplicativo.",
        OverconstrainedError: "A câmera não aceita a configuração solicitada. Você pode enviar uma imagem.",
      };
      message(explanations[error.name] || "Não foi possível iniciar a câmera. Verifique a conexão e as permissões do navegador.", true);
    }
  }

  function scheduleNext(delay = 1200) {
    clearTimeout(state.timer);
    if (!state.stream || !ui.autoRead.checked) return;
    state.timer = setTimeout(async () => {
      if (!state.stream || !ui.autoRead.checked) return;
      if (document.hidden || state.request) { scheduleNext(); return; }
      await recognize(true);
      scheduleNext(1200);
    }, delay);
  }

  async function cameraBlob() {
    if (!ui.video.videoWidth || !ui.video.videoHeight) throw new Error("A câmera ainda está preparando a imagem. Tente novamente em instantes.");
    const ratio = Math.min(1, 1600 / ui.video.videoWidth);
    captureCanvas.width = Math.round(ui.video.videoWidth * ratio);
    captureCanvas.height = Math.round(ui.video.videoHeight * ratio);
    captureContext.drawImage(ui.video, 0, 0, captureCanvas.width, captureCanvas.height);
    return new Promise((resolve, reject) => captureCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível capturar a imagem da câmera.")), "image/jpeg", 0.9));
  }

  async function recognize(automatic = false) {
    if (state.request || !state.source) return;
    if (ui.mode.value === "yolo_ocr" && !state.modelExists) {
      message("Adicione um modelo YOLO de texto ao servidor para usar este modo. Selecione Tesseract para ler agora.", true);
      ui.autoRead.checked = false;
      return;
    }
    const session = state.session;
    const controller = new AbortController();
    state.request = controller;
    const processingTimer = setTimeout(() => { if (state.request === controller && (!automatic || !state.tracker.current)) $("processing").hidden = false; }, 450);
    updateControls();
    const slowTimer = setTimeout(() => {
      if (state.request === controller) message("O reconhecimento continua em andamento. A primeira leitura pode demorar mais ao carregar o modelo; aguarde.");
    }, 12000);
    try {
      const blob = state.source === "camera" ? await cameraBlob() : state.file;
      if (session !== state.session) return;
      const form = new FormData();
      form.append("file", blob, state.source === "camera" ? "webcam.jpg" : (state.file.name || "imagem.png"));
      form.append("mode", ui.mode.value);
      const response = await fetch("/api/recognize", { method: "POST", body: form, signal: controller.signal });
      const data = await responseBody(response);
      if (session !== state.session) return;
      state.regions = Array.isArray(data.regions) ? data.regions : [];
      state.frameWidth = Number(data.width) || 0;
      state.frameHeight = Number(data.height) || 0;
      drawRegions();
      const rawText = typeof data.text === "string" ? data.text.trim() : "";
      const reading = automatic ? state.tracker.observe(rawText) : {text: rawText, committed: true};
      const text = reading.text;
      // Keep the last confirmed phrase visible through missing or unstable frames.
      if (!automatic || (reading.committed && document.activeElement !== ui.transcript)) ui.transcript.value = text;
      updateTranscript();
      const confidences = state.regions.map((region) => Number(region.confidence)).filter(Number.isFinite).map((value) => value <= 1 ? value * 100 : value);
      const average = confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : null;
      if (!automatic || reading.committed || !state.tracker.current) {
        $("confidence").textContent = average === null ? "—" : `${Math.max(0, Math.min(100, average))}%`;
        const elapsed = Number(data.elapsed_ms);
        $("elapsed").textContent = Number.isFinite(elapsed) ? (elapsed >= 1000 ? `${(elapsed / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : `${Math.round(elapsed)} ms`) : "—";
        $("region-count").textContent = String(state.regions.length).padStart(2, "0");
      }
      $("frame-info").textContent = `Última leitura · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
      warning(Array.isArray(data.warnings) ? data.warnings.map((item) => String(item)).join(" ") : "");
      if (automatic && reading.missing) {
        if (state.tracker.misses === 1) message("Imagem instável. Mantendo a última frase enquanto você reenquadra.");
      } else if (automatic && reading.waiting) message("Nova frase detectada. Confirmando a leitura…");
      else if (!text) message("Nenhum texto identificado. Aproxime a câmera, melhore a iluminação e mantenha o texto nítido.");
      else if (reading.committed) message(automatic ? "Texto identificado. Preparando a leitura em voz alta…" : "Texto identificado. Você pode ajustar as palavras ou ouvir novamente.");
      if (text && ui.autoSpeak.checked && (!automatic || !reading.waiting)) {
        const key = normalize(text);
        const spoken = [...state.spokenTexts].some((previous) => ReadingStability.similar(key, previous));
        if (!automatic) queueSpeech(text, true, session);
        else if (reading.committed && !spoken && document.activeElement !== ui.transcript) queueSpeech(text, false, session);
        else if (!spoken && !state.speaking && !state.alexaPending && !reading.missing && document.activeElement !== ui.transcript) queueSpeech(text, false, session);
      }
    } catch (error) {
      if (error.name !== "AbortError" && session === state.session) message(error instanceof TypeError ? "Não foi possível falar com o servidor. Verifique se o projeto Python continua em execução." : error.message, true);
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(processingTimer);
      if (state.request === controller) {
        state.request = null;
        $("processing").hidden = true;
        updateControls();
      }
    }
  }

  function queueSpeech(text, force, session = state.session) {
    const destination = ui.output.value;
    void speakText(text, force).then((accepted) => {
      if (accepted && session === state.session && destination === ui.output.value) {
        const key = normalize(text);
        state.spokenTexts.add(key);
      }
    }).catch(() => { message("Não foi possível iniciar a fala. Tente Ouvir texto.", true); });
  }

  function unlockAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!["google", "edge", "azure"].includes(ui.output.value) || !AudioContextClass) return;
    state.audioContext ||= new AudioContextClass();
    void state.audioContext.resume().catch(() => {});
  }

  function animateMouth(analyser, version) {
    cancelAnimationFrame(state.mouthFrame);
    const samples = new Uint8Array(analyser.fftSize);
    let previous = 0;
    const tick = (now) => {
      if (version !== state.speechVersion || !state.audioPlaying) {
        $("companion").dataset.mouth = "closed";
        return;
      }
      if (now - previous > 85) {
        analyser.getByteTimeDomainData(samples);
        const power = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        $("companion").dataset.mouth = power > .025 ? "open" : "closed";
        previous = now;
      }
      state.mouthFrame = requestAnimationFrame(tick);
    };
    state.mouthFrame = requestAnimationFrame(tick);
  }

  async function speakOnline(text, force) {
    if (!force && (state.speaking || Date.now() < state.nextGoogleAt)) return false;
    stopSpeech();
    const version = state.speechVersion;
    const provider = ui.output.value;
    const natural = provider !== "google";
    const voice = $("neural-voice").value;
    const style = provider === "azure" ? $("voice-style").value : "neutral";
    const rate = Number($("voice-rate").value);
    const label = provider === "google" ? "Google" : provider === "azure" ? "Azure" : "natural";
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      message("Áudio online indisponível. Tentando a voz do sistema…");
      return speakBrowser(text, force);
    }
    state.audioContext ||= new AudioContextClass();
    if (state.audioContext.state !== "running") {
      message("Áudio online bloqueado. Tentando a voz do sistema; se necessário, clique em Ouvir texto uma vez.");
      return speakBrowser(text, force);
    }
    state.speaking = true;
    updateControls();
    message(`Preparando a voz ${label} em português…`);
    // Short first chunk begins speaking sooner on slower connections.
    const chunks = speechChunks(text, natural ? 220 : 190);
    let settleStart;
    const started = new Promise((resolve) => { settleStart = resolve; });
    let firstChunkStarted = false;
    const playNext = async () => {
      if (version !== state.speechVersion) return;
      if (!chunks.length) { state.speaking = false; state.audioPlaying = false; updateControls(); message(`Leitura com voz ${label} concluída.`); return; }
      const controller = new AbortController();
      state.googleRequest = controller;
      try {
        const chunk = chunks.shift();
        state.speechPreview = chunk;
        const payload = natural ? {text: chunk, provider, voice, style, rate} : {text: chunk};
        const response = await fetch(natural ? "/api/voice/natural" : "/api/voice/google", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload), signal: controller.signal});
        if (!response.ok) await responseBody(response);
        const buffer = await state.audioContext.decodeAudioData(await response.arrayBuffer());
        if (version !== state.speechVersion) return;
        const source = state.audioContext.createBufferSource();
        source.buffer = buffer;
        const analyser = state.audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(state.audioContext.destination);
        source.onended = () => {
          source.disconnect(); analyser.disconnect();
          if (version === state.speechVersion) {
            state.audioPlaying = false;
            cancelAnimationFrame(state.mouthFrame);
            $("companion").dataset.mouth = "closed";
            updateControls();
            void playNext();
          }
        };
        state.audioSource = source;
        state.googleRequest = null;
        source.start();
        firstChunkStarted = true;
        settleStart(true);
        state.audioPlaying = true;
        updateControls();
        animateMouth(analyser, version);
        message(`Lendo com a voz ${label}…`);
      } catch (error) {
        if (version !== state.speechVersion) return;
        state.speaking = false;
        state.audioPlaying = false;
        state.spokenTexts.delete(normalize(text));
        state.nextGoogleAt = Date.now() + 4000;
        updateControls();
        if (error.name !== "AbortError" && !firstChunkStarted) {
          message("Voz online indisponível. Tentando a voz do sistema…", true);
          settleStart(await speakBrowser(text, false));
        } else {
          settleStart(false);
          if (error.name !== "AbortError") message(error.message || "A leitura parou. Vou tentar novamente.", true);
        }
      }
    };
    void playNext();
    return started;
  }

  function speechChunks(text, limit = 190) {
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    const chunks = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > limit && current) { chunks.push(current); current = ""; }
      if (word.length > limit) {
        if (current) { chunks.push(current); current = ""; }
        for (let index = 0; index < word.length; index += limit) chunks.push(word.slice(index, index + limit));
      } else current += `${current ? " " : ""}${word}`;
    }
    if (current) chunks.push(current);
    return chunks;
  }

  async function speakText(text, force) {
    text = text.trim();
    if (!text) { message("Identifique ou digite algum texto antes de ouvir."); return false; }
    if (["google", "edge", "azure"].includes(ui.output.value)) return speakOnline(text, force);
    if (ui.output.value === "alexa") {
      if (state.alexaPending || (!force && Date.now() < state.nextAlexaAt)) return false;
      state.alexaPending = true;
      updateControls();
      try {
        const response = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, force }) });
        const data = await responseBody(response);
        if (data.retry_after) state.nextAlexaAt = Date.now() + Number(data.retry_after) * 1000;
        message(data.message || (data.status === "duplicate" ? "Este texto já foi enviado para a Alexa." : "Texto enviado para a Alexa."));
        return data.status === "sent" || data.status === "duplicate";
      } catch (error) {
        state.nextAlexaAt = Date.now() + Math.max(10, error.retryAfter || 0) * 1000;
        message(error instanceof TypeError ? "Não foi possível enviar a fala. Verifique o servidor e a integração com a Alexa." : error.message, true);
        return false;
      } finally { state.alexaPending = false; updateControls(); }
    }
    return speakBrowser(text, force);
  }

  function speakBrowser(text, force) {
    if (!hasSpeech) { message("Este navegador não oferece síntese de voz. Abra o Lume no Chrome ou Edge para ouvir o texto.", true); return Promise.resolve(false); }
    if (!force && state.speaking) return false;
    stopSpeech();
    const version = state.speechVersion;
    const chunks = speechChunks(text);
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((item) => /^pt[-_]BR$/i.test(item.lang)) || voices.find((item) => /^pt/i.test(item.lang));
    state.speaking = true;
    updateControls();
    message("Lendo o texto neste computador…");
    let index = 0;
    let confirmStart;
    const started = new Promise((resolve) => { confirmStart = resolve; });
    const startTimeout = setTimeout(() => {
      if (version === state.speechVersion && !state.audioPlaying) {
        confirmStart(false);
        stopSpeech();
        message("A voz do sistema não iniciou. Verifique o áudio e clique em Ouvir texto.", true);
      }
    }, 8000);
    const next = () => {
      if (version !== state.speechVersion) return;
      if (index >= chunks.length) {
        state.speaking = false;
        state.audioPlaying = false;
        $("companion").dataset.mouth = "closed";
        updateControls();
        message("Leitura concluída. Se quiser, você pode ouvir novamente.");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      state.speechPreview = utterance.text;
      utterance.lang = "pt-BR";
      utterance.rate = 1;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => { if (version === state.speechVersion) { clearTimeout(startTimeout); confirmStart(true); state.audioPlaying = true; updateControls(); } };
      utterance.onboundary = () => {
        if (version !== state.speechVersion) return;
        $("companion").dataset.mouth = "open";
        setTimeout(() => { if (version === state.speechVersion) $("companion").dataset.mouth = "closed"; }, 130);
      };
      utterance.onend = next;
      utterance.onerror = (event) => {
        if (version !== state.speechVersion) return;
        state.speaking = false;
        state.audioPlaying = false;
        state.spokenTexts.delete(normalize(text));
        clearTimeout(startTimeout);
        confirmStart(false);
        updateControls();
        if (event.error !== "interrupted" && event.error !== "canceled") message("Não foi possível reproduzir a fala. Confira o volume e tente o botão Ouvir texto.", true);
      };
      // Keep an explicit reference while the browser is speaking.
      state.utterance = utterance;
      window.speechSynthesis.speak(utterance);
    };
    next();
    return started;
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.size > state.maxImageMB * 1024 * 1024) { message(`A imagem excede o limite de ${state.maxImageMB} MB. Envie uma imagem menor.`, true); return; }
    if (!/^image\/(jpeg|png|webp|bmp|x-ms-bmp)$/i.test(file.type)) { message("Envie uma imagem JPG, PNG, WebP ou BMP.", true); return; }
    stopCamera(false);
    releaseImage();
    const session = state.session;
    const url = URL.createObjectURL(file);
    state.imageUrl = url;
    state.source = null;
    updateControls();
    ui.image.src = url;
    try {
      await ui.image.decode();
      if (session !== state.session) return;
      state.source = "image";
      state.file = file;
      ui.image.hidden = false;
      ui.placeholder.hidden = true;
      $("camera-state").textContent = "Imagem enviada";
      $("source-info").textContent = `Imagem · ${ui.image.naturalWidth} × ${ui.image.naturalHeight}`;
      $("frame-info").textContent = file.name.length > 35 ? `${file.name.slice(0, 32)}…` : file.name;
      updateControls();
      message("Imagem carregada. Identificando o texto…");
      await recognize(false);
    } catch {
      if (session !== state.session) return;
      releaseImage();
      state.source = null;
      ui.placeholder.hidden = false;
      updateControls();
      message("Não foi possível abrir esta imagem. Tente outro arquivo JPG ou PNG.", true);
    }
  }

  async function loadStatus() {
    try {
      const response = await fetch("/api/status");
      const data = await responseBody(response);
      state.maxImageMB = Number(data.limits?.max_image_mb) || 8;
      state.modelExists = Boolean(data.vision?.model_exists);
      if (!state.modelExists) ui.mode.value = "ocr";
      const ready = data.vision?.ready !== false;
      $("server-dot").classList.toggle("ready", ready);
      $("server-dot").classList.toggle("error", !ready);
      $("server-status").textContent = ready ? "Leitor local conectado" : "Leitor precisa de configuração";
      if (!ready && data.vision?.warnings?.length) warning(data.vision.warnings.join(" "));
      else if (!state.modelExists) warning("Tesseract selecionado para leitura. O modo YOLO + Tesseract precisa de um modelo treinado para detectar texto ou letras.");
      const alexaReady = Boolean(data.alexa?.configured);
      $("alexa-option").disabled = !alexaReady;
      $("alexa-option").textContent = alexaReady ? "Alexa · integração configurada" : "Alexa · integração não configurada";
      $("alexa-config-status").textContent = alexaReady ? "Integração configurada no servidor. Selecione Alexa na saída de voz." : "Integração ainda não configurada. A voz do navegador está disponível.";
    } catch (error) {
      $("server-dot").classList.add("error");
      $("server-status").textContent = "Servidor desconectado";
      $("alexa-config-status").textContent = "Não foi possível verificar a integração com o servidor.";
      ui.mode.value = "ocr";
      message("Não foi possível conectar ao servidor. Inicie o projeto Python e recarregue esta página.", true);
    }
  }

  ui.camera.addEventListener("click", () => state.stream || state.starting ? stopCamera() : startCamera());
  ui.capture.addEventListener("click", () => recognize(false));
  ui.uploadButton.addEventListener("click", () => { unlockAudio(); ui.upload.click(); });
  ui.upload.addEventListener("change", () => { const file = ui.upload.files[0]; ui.upload.value = ""; loadFile(file); });
  ui.autoRead.addEventListener("change", () => {
    resetStability();
    if (ui.autoRead.checked) { message("Leitura contínua ativada. O próximo texto reconhecido aparecerá e será falado."); scheduleNext(100); }
    else { cancelRecognition(); updateControls(); message("Leitura contínua pausada. Use Identificar texto para uma nova captura."); }
  });
  ui.mode.addEventListener("change", () => {
    cancelRecognition();
    clearRegions();
    updateControls();
    if (ui.mode.value === "yolo_ocr" && !state.modelExists) warning("Modelo YOLO de texto não encontrado. Configure YOLO_MODEL_PATH no servidor ou selecione Tesseract para continuar.");
    else { warning(); message(ui.mode.value === "yolo_ocr" ? "YOLO detectará as regiões; Tesseract reconhecerá o texto." : "Tesseract selecionado para reconhecimento de texto."); }
    if (state.stream && ui.autoRead.checked) scheduleNext(100);
  });
  ui.transcript.addEventListener("input", () => { resetStability(); updateTranscript(); });
  ui.speak.addEventListener("click", async () => { unlockAudio(); if (state.audioContext?.state === "suspended" && ["google", "edge", "azure"].includes(ui.output.value)) await state.audioContext.resume(); queueSpeech(ui.transcript.value, true); });
  ui.stopSpeech.addEventListener("click", () => stopSpeech(true));
  ui.autoSpeak.addEventListener("change", () => {
    resetStability();
    if (!ui.autoSpeak.checked) stopSpeech();
    message(ui.autoSpeak.checked ? "Fala automática ativada. Textos repetidos não serão falados de novo." : "Fala automática desativada. Use Ouvir texto quando quiser.");
    updateControls();
  });
  ui.output.addEventListener("change", () => {
    stopSpeech();
    state.spokenTexts.clear();
    resetStability();
    unlockAudio();
    const notes = {edge: "Voz neural em português, com entonação natural. Requer internet e envia o texto à Microsoft.", azure: "Expressões disponíveis conforme a voz e a região. O texto é enviado ao Azure Speech.", alexa: "Seu Echo recebe automaticamente o texto estável. A entrega depende do Home Assistant.", google: "Áudio online em português. O texto é enviado ao Google Translate.", browser: "Usa as vozes instaladas no sistema. A leitura automática não repete o mesmo texto."};
    $("voice-note").textContent = notes[ui.output.value];
    $("natural-options").hidden = !["edge", "azure"].includes(ui.output.value);
    $("expression-field").hidden = ui.output.value !== "azure";
    void loadVoiceCatalog();
    updateControls();
  });

  const styleLabels = {neutral: "Natural", calm: "Calma", cheerful: "Alegre", happy: "Feliz", joyful: "Alegre", excited: "Animada", sad: "Triste", friendly: "Acolhedora", hopeful: "Esperançosa", whispering: "Sussurrada", softvoice: "Suave", shouting: "Gritada", angry: "Irritada", surprised: "Surpresa", determined: "Determinada", fearful: "Assustada", confused: "Confusa", relieved: "Aliviada", regretful: "Arrependida", embarrassed: "Envergonhada", jealous: "Ciumenta", disgusted: "Enojada"};
  function updateStyles() {
    const selected = state.voiceCatalog.find((voice) => voice.id === $("neural-voice").value);
    const styles = ui.output.value === "azure" ? selected?.styles || [] : [];
    $("voice-style").replaceChildren(...["neutral", ...styles].map((style) => new Option(styleLabels[style] || style, style)));
    $("voice-style").disabled = !styles.length;
  }
  async function loadVoiceCatalog() {
    const provider = ui.output.value;
    const version = ++state.catalogVersion;
    if (!["edge", "azure"].includes(provider)) return;
    const previous = $("neural-voice").value;
    $("neural-voice").disabled = true;
    try {
      const data = await responseBody(await fetch(`/api/voice/catalog?provider=${provider}`));
      if (version !== state.catalogVersion) return;
      state.voiceCatalog = data.voices;
      $("neural-voice").replaceChildren(...data.voices.map((voice) => new Option(voice.name, voice.id)));
      if (data.voices.some((voice) => voice.id === previous)) $("neural-voice").value = previous;
      updateStyles();
    } catch (error) { if (version === state.catalogVersion) message(error.message, true); }
    finally { if (version === state.catalogVersion) $("neural-voice").disabled = false; }
  }
  for (const id of ["neural-voice", "voice-style", "voice-rate"]) {
    $(id).addEventListener("change", () => {
      stopSpeech(); state.spokenTexts.clear(); state.nextGoogleAt = 0; resetStability(); unlockAudio();
      if (id === "neural-voice") updateStyles();
    });
  }
  const voicesDialog = $("voices-dialog");
  async function loadVoiceConfig() {
    try {
      const config = await responseBody(await fetch("/api/voice/config"));
      $("azure-option").disabled = !config.configured;
      $("azure-region").value = config.region;
      $("azure-key-hint").textContent = config.key_saved ? "Chave salva no servidor. Deixe em branco para mantê-la na mesma região." : "Salva somente no .env deste computador. Mantenha o arquivo privado.";
    } catch (error) { $("azure-status").textContent = error.message; }
  }
  $("open-voices").addEventListener("click", () => { voicesDialog.showModal(); void loadVoiceConfig(); });
  $("close-voices").addEventListener("click", () => voicesDialog.close());
  voicesDialog.addEventListener("close", () => { $("azure-key").value = ""; });
  $("azure-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("connect-azure").disabled = true;
    $("azure-status").textContent = "Validando sua conta e consultando as vozes…";
    $("azure-status").classList.remove("error");
    try {
      const data = await responseBody(await fetch("/api/voice/config", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({region: $("azure-region").value.trim(), key: $("azure-key").value.trim()})}));
      $("azure-key").value = "";
      $("azure-option").disabled = false;
      $("azure-key-hint").textContent = "Chave salva. Deixe em branco para manter a configuração.";
      $("azure-status").textContent = data.message;
      if (ui.output.value === "azure") await loadVoiceCatalog();
    } catch (error) { $("azure-status").textContent = error.message; $("azure-status").classList.add("error"); }
    finally { $("connect-azure").disabled = false; }
  });
  function toggleCompanion(open) {
    $("companion-bubble").hidden = !open;
    $("mascot-toggle").setAttribute("aria-expanded", String(open));
    $("mascot-toggle").setAttribute("aria-label", `${open ? "Recolher" : "Abrir"} Nilo, companheiro de leitura`);
  }
  $("mascot-toggle").addEventListener("click", () => toggleCompanion($("companion-bubble").hidden));
  $("close-companion").addEventListener("click", () => { toggleCompanion(false); $("mascot-toggle").focus(); });
  setInterval(() => {
    if (document.hidden || state.audioPlaying || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    $("companion").dataset.blink = "true";
    setTimeout(() => { $("companion").dataset.blink = "false"; }, 170);
  }, 6200);

  const settingsDialog = $("settings-dialog");
  const helpDialog = $("help-dialog");
  const configStatus = (text, error = false) => {
    $("alexa-config-status").textContent = text;
    $("alexa-config-status").classList.toggle("error", error);
  };
  const configPayload = () => ({url: $("ha-url").value.trim(), token: $("ha-token").value.trim(), entity: $("ha-entity").value});
  const configBusy = (busy) => { $("discover-alexa").disabled = busy; $("save-alexa").disabled = busy || !$("ha-entity").value; };
  let configSaved = false;
  let configVersion = 0;
  $("open-settings").addEventListener("click", async () => {
    settingsDialog.showModal();
    try {
      const data = await responseBody(await fetch("/api/alexa/config"));
      $("ha-url").value = data.url || "";
      $("ha-token").value = "";
      $("token-hint").textContent = data.token_saved ? "Já existe um token salvo. Deixe vazio para mantê-lo no mesmo endereço." : "Guardado apenas no .env deste computador. Nunca exibido de volta.";
      $("ha-entity").replaceChildren(new Option(data.entity || "Conecte para listar os dispositivos", data.entity || ""));
      $("ha-entity").disabled = !data.entity;
      configSaved = data.configured;
      $("test-alexa").disabled = !configSaved;
      configStatus(configSaved ? "Configuração salva. Você pode testar a voz." : "Siga os passos acima e conecte seu Home Assistant.");
    } catch (error) { configStatus(error.message, true); }
  });
  $("close-settings").addEventListener("click", () => settingsDialog.close());
  settingsDialog.addEventListener("close", () => { $("ha-token").value = ""; });
  $("open-help").addEventListener("click", () => helpDialog.showModal());
  $("close-help").addEventListener("click", () => helpDialog.close());
  ["ha-url", "ha-token"].forEach((id) => $(id).addEventListener("input", () => {
    configVersion += 1;
    configSaved = false;
    $("test-alexa").disabled = true;
    $("save-alexa").disabled = true;
    $("ha-entity").replaceChildren(new Option("Conecte novamente para atualizar", ""));
    $("ha-entity").disabled = true;
  }));
  $("ha-entity").addEventListener("change", () => { configSaved = false; $("test-alexa").disabled = true; $("save-alexa").disabled = !$("ha-entity").value; });
  $("discover-alexa").addEventListener("click", async () => {
    if (!$("ha-url").reportValidity()) return;
    const version = configVersion;
    configBusy(true);
    configStatus("Conectando ao Home Assistant e buscando dispositivos…");
    try {
      const data = await responseBody(await fetch("/api/alexa/discover", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(configPayload())}));
      if (version !== configVersion) return;
      $("ha-entity").replaceChildren(new Option("Escolha o seu Echo", ""), ...data.devices.map((device) => new Option(`${device.name} · ${device.entity_id}`, device.entity_id)));
      $("ha-entity").disabled = false;
      configStatus(data.devices.length ? data.message : "Conexão feita, mas nenhum media_player foi encontrado. Confira Alexa Media Player.");
    } catch (error) { if (version === configVersion) configStatus(error.message, true); }
    finally { configBusy(false); }
  });
  $("alexa-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    configBusy(true);
    configStatus("Validando o Echo e salvando a configuração…");
    try {
      const data = await responseBody(await fetch("/api/alexa/config", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(configPayload())}));
      $("ha-token").value = "";
      configSaved = true;
      $("test-alexa").disabled = false;
      $("token-hint").textContent = "Token salvo neste computador. Deixe vazio para mantê-lo.";
      await loadStatus();
      configStatus(data.message);
    } catch (error) { configStatus(error.message, true); }
    finally { configBusy(false); }
  });
  $("test-alexa").addEventListener("click", async () => {
    if (!configSaved) return;
    $("test-alexa").disabled = true;
    configStatus("Enviando uma frase de teste para seu Echo…");
    try {
      const data = await responseBody(await fetch("/api/speak", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({text: "Olá! Eu sou o Lume. Sua Alexa está pronta para ler com você.", force: true})}));
      configStatus(`${data.message} Agora selecione Alexa na saída de voz.`);
    } catch (error) { configStatus(error.message, true); }
    finally { $("test-alexa").disabled = false; }
  });
  ui.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ui.transcript.value);
      message("Texto copiado para a área de transferência.");
    } catch { ui.transcript.focus(); ui.transcript.select(); message("Não foi possível copiar automaticamente. O texto está selecionado: use Ctrl+C ou ⌘C."); }
  });
  ui.clear.addEventListener("click", () => {
    stopSpeech();
    ui.transcript.value = "";
    resetStability();
    clearRegions();
    ["confidence", "elapsed", "region-count"].forEach((id) => { $(id).textContent = "—"; });
    updateTranscript();
    message(state.stream && ui.autoRead.checked ? "Texto limpo. A leitura contínua permanece ativa." : "Texto limpo. Pronto para uma nova leitura.");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearTimeout(state.timer); resetStability(); }
    else if (state.stream && ui.autoRead.checked) scheduleNext(200);
  });
  window.addEventListener("pagehide", () => { stopCamera(false); releaseImage(); });
  if ("ResizeObserver" in window) new ResizeObserver(drawRegions).observe(ui.stage);
  else window.addEventListener("resize", drawRegions);
  if (hasSpeech) window.speechSynthesis.getVoices();
  else $("voice-note").textContent = "Síntese de voz indisponível neste navegador. Use Chrome ou Edge.";
  updateTranscript();
  loadStatus();
  void loadVoiceConfig();
  void loadVoiceCatalog();
})();
