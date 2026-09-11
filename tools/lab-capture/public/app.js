const SETTINGS_KEY = 'lab-capture.settings.v1';
const DB_NAME = 'lab-capture';
const DB_VERSION = 1;
const QUEUE_STORE = 'uploads';
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const CONCENTRATIONS = new Set(['2500', '250', '25', '0', 'background']);

const elements = {
  connection: document.querySelector('#connection-status'),
  connectionLabel: document.querySelector('#connection-status .connection-label'),
  modeTabs: [...document.querySelectorAll('[data-view]')],
  viewPanels: [...document.querySelectorAll('[data-view-panel]')],
  settingsButton: document.querySelector('#open-settings'),
  deviceChip: document.querySelector('#device-chip'),
  deviceChipLabel: document.querySelector('#device-chip-label'),
  concentrationInputs: [...document.querySelectorAll('input[name="concentration"]')],
  captureButton: document.querySelector('#capture-button'),
  captureConcentration: document.querySelector('#capture-concentration'),
  cameraInput: document.querySelector('#camera-input'),
  uploadFeedback: document.querySelector('#upload-feedback'),
  uploadFeedbackText: document.querySelector('#upload-feedback-text'),
  photoCount: document.querySelector('#photo-count'),
  queueBar: document.querySelector('#queue-bar'),
  queueTitle: document.querySelector('#queue-title'),
  queueDetail: document.querySelector('#queue-detail'),
  retryUploads: document.querySelector('#retry-uploads'),
  refreshState: document.querySelector('#refresh-state'),
  uploadsList: document.querySelector('#recent-uploads-list'),
  uploadsEmpty: document.querySelector('#uploads-empty'),
  newTimer: document.querySelector('#new-timer-button'),
  activeTimerCount: document.querySelector('#active-timer-count'),
  activeSectionCount: document.querySelector('#active-section-count'),
  activeTimersList: document.querySelector('#active-timers-list'),
  timersEmpty: document.querySelector('#timers-empty'),
  completedTimersList: document.querySelector('#completed-timers-list'),
  historyEmpty: document.querySelector('#history-empty'),
  clearCompleted: document.querySelector('#clear-completed'),
  setupDialog: document.querySelector('#setup-dialog'),
  setupForm: document.querySelector('#setup-form'),
  setupError: document.querySelector('#setup-error'),
  deviceNameInput: document.querySelector('#device-name'),
  platformInputs: [...document.querySelectorAll('input[name="platform"]')],
  cancelSettings: document.querySelector('#cancel-settings'),
  toastRegion: document.querySelector('#toast-region'),
};

let settings = readSettings();
let serverState = {
  serverTime: Date.now(),
  durationMs: 180_000,
  photoCount: 0,
  timers: [],
  uploads: [],
};
let serverClockOffset = 0;
let eventSource;
let queueProcessing = false;
let initialStateReceived = false;
let notifiedTimers = new Set();
let audioContext;

void initialize();

async function initialize() {
  bindEvents();
  applySettingsToUi();
  selectView(location.hash === '#timers' ? 'timers' : 'capture');
  await refreshQueueUi();

  if (!settings) {
    openSettings(false);
  }

  await refreshServerState();
  connectEvents();
  void processUploadQueue();

  window.setInterval(() => renderTimers(), 250);
  window.setInterval(() => void refreshServerState({ quiet: true }), 30_000);
}

function bindEvents() {
  for (const tab of elements.modeTabs) {
    tab.addEventListener('click', () => selectView(tab.dataset.view));
  }
  elements.settingsButton.addEventListener('click', () => openSettings(true));
  elements.deviceChip.addEventListener('click', () => openSettings(true));
  elements.cancelSettings.addEventListener('click', () => elements.setupDialog.close());
  elements.setupForm.addEventListener('submit', saveSettings);

  for (const input of elements.concentrationInputs) {
    input.addEventListener('change', () => {
      if (!settings || !CONCENTRATIONS.has(input.value)) return;
      settings.concentration = input.value;
      persistSettings();
      applySettingsToUi();
    });
  }

  elements.captureButton.addEventListener('click', () => {
    if (!settings) {
      openSettings(false);
      return;
    }
    elements.cameraInput.click();
  });
  elements.cameraInput.addEventListener('change', handleSelectedPhoto);
  elements.retryUploads.addEventListener('click', () => void processUploadQueue(true));
  elements.refreshState.addEventListener('click', () => void refreshServerState());
  elements.newTimer.addEventListener('click', () => void createTimer());
  elements.clearCompleted.addEventListener('click', () => void clearCompletedTimers());

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) return;
    if (elements.setupDialog.open) return;
    event.preventDefault();
    void createTimer();
  });

  window.addEventListener('online', () => {
    setConnection('connecting', 'Подключение…');
    void refreshServerState({ quiet: true });
    void processUploadQueue(true);
  });
  window.addEventListener('offline', () => setConnection('offline', 'Нет сети'));
  window.addEventListener('hashchange', () => {
    selectView(location.hash === '#timers' ? 'timers' : 'capture', false);
  });
}

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (
      value &&
      (value.platform === 'iPhone' || value.platform === 'Android') &&
      typeof value.deviceName === 'string' &&
      value.deviceName.trim() &&
      CONCENTRATIONS.has(value.concentration)
    ) {
      return value;
    }
  } catch {}
  return null;
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function openSettings(canCancel) {
  elements.setupError.hidden = true;
  elements.cancelSettings.hidden = !canCancel || !settings;
  elements.deviceNameInput.value = settings?.deviceName ?? '';
  for (const input of elements.platformInputs) {
    input.checked = input.value === settings?.platform;
  }
  if (!elements.setupDialog.open) elements.setupDialog.showModal();
}

function saveSettings(event) {
  event.preventDefault();
  const platform = elements.platformInputs.find((input) => input.checked)?.value;
  const deviceName = elements.deviceNameInput.value.trim();
  if (platform !== 'iPhone' && platform !== 'Android') {
    showSetupError('Выберите iPhone или Android.');
    return;
  }
  if (!deviceName || deviceName.length > 48) {
    showSetupError('Введите короткое название телефона.');
    return;
  }
  if (deviceName.includes('/') || deviceName.includes('\\') || deviceName.includes('..')) {
    showSetupError('В названии нельзя использовать пути или две точки подряд.');
    return;
  }

  settings = {
    platform,
    deviceName,
    concentration: settings?.concentration ?? '2500',
  };
  persistSettings();
  applySettingsToUi();
  elements.setupDialog.close();
  showToast(`Устройство сохранено: ${deviceName}`);
}

function showSetupError(message) {
  elements.setupError.textContent = message;
  elements.setupError.hidden = false;
}

function applySettingsToUi() {
  const concentration = settings?.concentration ?? '';
  elements.deviceChipLabel.textContent = settings
    ? `${settings.platform} · ${settings.deviceName}`
    : 'Настроить устройство';
  elements.captureConcentration.textContent = concentration
    ? formatConcentration(concentration, true)
    : '—';
  elements.captureButton.disabled = !settings || !concentration;
  for (const input of elements.concentrationInputs) {
    input.checked = input.value === concentration;
  }
}

function selectView(view, updateHash = true) {
  if (view !== 'capture' && view !== 'timers') return;
  for (const tab of elements.modeTabs) {
    const active = tab.dataset.view === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const panel of elements.viewPanels) {
    const active = panel.dataset.viewPanel === view;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  }
  if (updateHash) history.replaceState(null, '', view === 'timers' ? '#timers' : '#capture');
}

async function handleSelectedPhoto() {
  const file = elements.cameraInput.files?.[0];
  elements.cameraInput.value = '';
  if (!file || !settings) return;

  try {
    const mimeType = inferMimeType(file);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      setUploadFeedback('error', 'Этот формат изображения не поддерживается');
      showToast('Поддерживаются JPEG, PNG, WebP, HEIC и HEIF.', true);
      return;
    }
    if (file.size === 0 || file.size > 30 * 1024 * 1024) {
      setUploadFeedback('error', file.size === 0 ? 'Файл пустой' : 'Файл больше 30 МБ');
      return;
    }

    const queued = {
      id: createClientId(),
      blob: file,
      fileName: file.name || `capture.${extensionForMime(mimeType)}`,
      mimeType,
      platform: settings.platform,
      concentration: settings.concentration,
      deviceName: settings.deviceName,
      createdAt: Date.now(),
    };
    await queuePut(queued);
    setUploadFeedback('busy', `Отправляем ${queued.fileName}…`);
    await refreshQueueUi();
    void processUploadQueue(true);
  } catch (error) {
    console.error('[lab-capture] Could not queue selected photo:', error);
    setUploadFeedback('error', 'Не удалось подготовить снимок к отправке');
    showToast('Браузер не смог сохранить снимок в очередь. Обновите страницу и попробуйте ещё раз.', true);
  }
}

function createClientId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }

  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function inferMimeType(file) {
  const explicit = String(file.type || '').split(';', 1)[0].toLowerCase();
  if (ALLOWED_MIME_TYPES.has(explicit)) return explicit;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  }[extension] ?? explicit;
}

function extensionForMime(mimeType) {
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }[mimeType];
}

async function processUploadQueue(force = false) {
  if (queueProcessing || (!navigator.onLine && !force)) return;
  queueProcessing = true;
  try {
    const queued = (await queueAll()).sort((a, b) => a.createdAt - b.createdAt);
    for (const item of queued) {
      try {
        setUploadFeedback('busy', `Отправляем ${item.fileName}…`);
        const response = await fetch('/api/uploads', {
          method: 'POST',
          headers: {
            'Content-Type': item.mimeType,
            'X-Lab-Platform': item.platform,
            'X-Lab-Concentration': item.concentration,
            'X-Lab-Device-Name': encodeURIComponent(item.deviceName),
            'X-Lab-File-Name': encodeURIComponent(item.fileName),
          },
          body: item.blob,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
          error.permanent = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
          throw error;
        }
        await queueDelete(item.id);
        setUploadFeedback('success', `Сохранено: ${payload.upload.fileName}`);
        showToast(`${item.platform} · ${item.concentration}: снимок сохранён`);
        applyServerState({
          ...serverState,
          photoCount: Number.isInteger(payload.photoCount)
            ? payload.photoCount
            : serverState.photoCount,
          uploads: [payload.upload, ...serverState.uploads],
        });
      } catch (error) {
        if (error.permanent) {
          await queueDelete(item.id);
          setUploadFeedback('error', `Не удалось сохранить ${item.fileName}`);
          showToast(error.message, true);
          continue;
        }
        setConnection('offline', 'Сервер недоступен');
        setUploadFeedback('error', 'Снимок в очереди — отправим после подключения');
        break;
      } finally {
        await refreshQueueUi();
      }
    }
  } finally {
    queueProcessing = false;
  }
}

function setUploadFeedback(type, message) {
  elements.uploadFeedback.classList.remove('is-success', 'is-error', 'is-busy');
  if (type) elements.uploadFeedback.classList.add(`is-${type}`);
  elements.uploadFeedbackText.textContent = message;
}

async function refreshQueueUi() {
  const count = await queueCount().catch(() => 0);
  elements.queueBar.hidden = count === 0;
  elements.queueTitle.textContent = `В очереди: ${count}`;
  elements.queueDetail.textContent = navigator.onLine
    ? 'Отправка начнётся автоматически'
    : 'Отправим автоматически после подключения';
}

async function refreshServerState({ quiet = false } = {}) {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    applyServerState(payload);
    setConnection('online', 'Подключено');
  } catch {
    setConnection('offline', navigator.onLine ? 'Сервер недоступен' : 'Нет сети');
    if (!quiet) showToast('Не удалось получить состояние сервера.', true);
  }
}

function connectEvents() {
  eventSource?.close();
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('open', () => setConnection('online', 'Подключено'));
  eventSource.addEventListener('state', (event) => {
    try {
      applyServerState(JSON.parse(event.data));
      setConnection('online', 'Подключено');
      void processUploadQueue();
    } catch {}
  });
  eventSource.addEventListener('error', () => {
    setConnection('offline', navigator.onLine ? 'Переподключение…' : 'Нет сети');
  });
}

function applyServerState(payload) {
  if (!payload || !Array.isArray(payload.timers) || !Array.isArray(payload.uploads)) return;
  const completed = payload.timers.filter((timer) => timer.status === 'completed');
  if (!initialStateReceived) {
    notifiedTimers = new Set(completed.map((timer) => timer.id));
    initialStateReceived = true;
  } else {
    for (const timer of completed) {
      if (!notifiedTimers.has(timer.id)) {
        notifiedTimers.add(timer.id);
        playCompletionSound();
        showToast(`Таймер №${timer.number} завершён`);
      }
    }
  }

  serverState = {
    serverTime: Number(payload.serverTime) || Date.now(),
    durationMs: Number(payload.durationMs) || 180_000,
    photoCount: Number.isInteger(payload.photoCount)
      ? payload.photoCount
      : serverState.photoCount,
    timers: deduplicateTimers(payload.timers),
    uploads: deduplicateUploads(payload.uploads).slice(0, 100),
  };
  serverClockOffset = serverState.serverTime - Date.now();
  elements.photoCount.textContent = new Intl.NumberFormat('ru-RU').format(serverState.photoCount);
  renderUploads();
  renderTimers();
}

function deduplicateUploads(uploads) {
  const seen = new Set();
  return uploads.filter((upload) => {
    if (!upload?.id || seen.has(upload.id)) return false;
    seen.add(upload.id);
    return true;
  });
}

function deduplicateTimers(timers) {
  const byId = new Map();
  for (const timer of timers) {
    if (timer?.id) byId.set(timer.id, timer);
  }
  return [...byId.values()];
}

function setConnection(status, label) {
  elements.connection.classList.toggle('is-online', status === 'online');
  elements.connection.classList.toggle('is-offline', status === 'offline');
  elements.connectionLabel.textContent = label;
}

function renderUploads() {
  elements.uploadsList.replaceChildren();
  const uploads = serverState.uploads.slice(0, 20);
  elements.uploadsEmpty.hidden = uploads.length > 0;
  elements.uploadsList.hidden = uploads.length === 0;
  for (const upload of uploads) {
    const item = document.createElement('li');
    item.className = 'activity-item';
    const badge = document.createElement('span');
    badge.className = 'activity-badge';
    badge.textContent = formatConcentration(upload.concentration);
    const copy = document.createElement('div');
    copy.className = 'activity-copy';
    const name = document.createElement('strong');
    name.textContent = upload.fileName;
    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    for (const value of [upload.platform, upload.deviceName, formatDateTime(upload.createdAt)]) {
      const span = document.createElement('span');
      span.textContent = value;
      meta.append(span);
    }
    copy.append(name, meta);
    item.append(badge, copy);
    elements.uploadsList.append(item);
  }
}

async function createTimer() {
  unlockAudio();
  elements.newTimer.disabled = true;
  try {
    const response = await fetch('/api/timers', { method: 'POST' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    applyServerState({ ...serverState, timers: [...serverState.timers, payload.timer], serverTime: Date.now() });
    setConnection('online', 'Подключено');
    showToast(`Таймер №${payload.timer.number} запущен`);
  } catch (error) {
    showToast(`Таймер не запущен: ${error.message}`, true);
    setConnection('offline', 'Сервер недоступен');
  } finally {
    elements.newTimer.disabled = false;
  }
}

function renderTimers() {
  const now = Date.now() + serverClockOffset;
  const running = serverState.timers
    .filter((timer) => timer.status === 'running' && timer.endsAt > now)
    .sort((a, b) => a.endsAt - b.endsAt);
  const completed = serverState.timers
    .filter((timer) => timer.status === 'completed' || timer.endsAt <= now)
    .sort((a, b) => (b.completedAt || b.endsAt) - (a.completedAt || a.endsAt));

  elements.activeTimerCount.hidden = running.length === 0;
  elements.activeTimerCount.textContent = running.length;
  elements.activeSectionCount.textContent = running.length;
  elements.timersEmpty.hidden = running.length > 0;
  elements.activeTimersList.hidden = running.length === 0;
  elements.activeTimersList.replaceChildren(...running.map((timer) => timerCard(timer, now)));

  elements.historyEmpty.hidden = completed.length > 0;
  elements.clearCompleted.hidden = completed.length === 0;
  elements.completedTimersList.hidden = completed.length === 0;
  elements.completedTimersList.replaceChildren(...completed.map(historyItem));
}

function timerCard(timer, now) {
  const remaining = Math.max(0, timer.endsAt - now);
  const progress = Math.max(0, Math.min(100, (remaining / serverState.durationMs) * 100));
  const card = document.createElement('article');
  card.className = 'timer-card';
  const progressNode = document.createElement('div');
  progressNode.className = 'timer-progress';
  progressNode.style.setProperty('--progress', `${progress}%`);
  const content = document.createElement('div');
  content.className = 'timer-card-content';
  const top = document.createElement('div');
  top.className = 'timer-topline';
  const number = document.createElement('span');
  number.className = 'timer-number';
  number.textContent = `Таймер №${timer.number}`;
  top.append(number, deleteTimerButton(timer));
  const time = document.createElement('time');
  time.className = 'timer-time';
  time.textContent = formatRemaining(remaining);
  const finish = document.createElement('span');
  finish.className = 'timer-finish-time';
  finish.textContent = `Финиш в ${formatClock(timer.endsAt)}`;
  content.append(top, time, finish);
  card.append(progressNode, content);
  return card;
}

function historyItem(timer) {
  const item = document.createElement('article');
  item.className = 'history-item';
  const main = document.createElement('div');
  main.className = 'history-main';
  const title = document.createElement('strong');
  title.textContent = `Таймер №${timer.number}`;
  const started = document.createElement('span');
  started.textContent = `Запущен ${formatClock(timer.startedAt)}`;
  main.append(title, started);
  const ended = document.createElement('span');
  ended.className = 'history-ended';
  ended.textContent = `Завершён ${formatClock(timer.completedAt || timer.endsAt)}`;
  const status = document.createElement('span');
  status.className = 'history-status';
  status.textContent = 'Готово';
  item.append(main, ended, status, deleteTimerButton(timer));
  return item;
}

function deleteTimerButton(timer) {
  const button = document.createElement('button');
  button.className = 'delete-timer';
  button.type = 'button';
  button.setAttribute('aria-label', `Удалить таймер №${timer.number}`);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
  button.addEventListener('click', () => void deleteTimer(timer));
  return button;
}

async function deleteTimer(timer) {
  try {
    const response = await fetch(`/api/timers/${encodeURIComponent(timer.id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    serverState.timers = serverState.timers.filter((item) => item.id !== timer.id);
    notifiedTimers.delete(timer.id);
    renderTimers();
  } catch (error) {
    showToast(`Не удалось удалить таймер: ${error.message}`, true);
  }
}

async function clearCompletedTimers() {
  try {
    const response = await fetch('/api/timers/completed', { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const completedIds = new Set(
      serverState.timers.filter((timer) => timer.status === 'completed').map((timer) => timer.id),
    );
    serverState.timers = serverState.timers.filter((timer) => !completedIds.has(timer.id));
    for (const id of completedIds) notifiedTimers.delete(id);
    renderTimers();
  } catch (error) {
    showToast(`Не удалось очистить историю: ${error.message}`, true);
  }
}

function unlockAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ??= new AudioContextClass();
  if (audioContext.state === 'suspended') void audioContext.resume();
}

function playCompletionSound() {
  unlockAudio();
  if (!audioContext || audioContext.state !== 'running') return;
  const start = audioContext.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.22, 660], [0.44, 880]]) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.17);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.18);
  }
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' is-error' : ''}`;
  const icon = document.createElement('span');
  icon.innerHTML = isError
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon, text);
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4_500);
}

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatConcentration(value, long = false) {
  if (value === 'background') return long ? 'Без полоски' : 'Фон';
  return value;
}

function formatClock(value) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function isEditableTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches('input, textarea, select, button, a[href]')
  );
}

function openQueueDb() {
  return new Promise((resolveDb, rejectDb) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(QUEUE_STORE)) {
        request.result.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolveDb(request.result);
    request.onerror = () => rejectDb(request.error);
  });
}

async function queueTransaction(mode, callback) {
  const db = await openQueueDb();
  return new Promise((resolveTransaction, rejectTransaction) => {
    const transaction = db.transaction(QUEUE_STORE, mode);
    const store = transaction.objectStore(QUEUE_STORE);
    let result;
    try {
      result = callback(store);
    } catch (error) {
      db.close();
      rejectTransaction(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolveTransaction(result?.result);
    };
    transaction.onerror = () => {
      db.close();
      rejectTransaction(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      rejectTransaction(transaction.error || new Error('IndexedDB transaction aborted'));
    };
  });
}

function queuePut(value) {
  return queueTransaction('readwrite', (store) => store.put(value));
}

function queueDelete(id) {
  return queueTransaction('readwrite', (store) => store.delete(id));
}

async function queueAll() {
  const db = await openQueueDb();
  return new Promise((resolveItems, rejectItems) => {
    const transaction = db.transaction(QUEUE_STORE, 'readonly');
    const request = transaction.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolveItems(request.result || []);
    request.onerror = () => rejectItems(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function queueCount() {
  const db = await openQueueDb();
  return new Promise((resolveCount, rejectCount) => {
    const transaction = db.transaction(QUEUE_STORE, 'readonly');
    const request = transaction.objectStore(QUEUE_STORE).count();
    request.onsuccess = () => resolveCount(request.result);
    request.onerror = () => rejectCount(request.error);
    transaction.oncomplete = () => db.close();
  });
}
