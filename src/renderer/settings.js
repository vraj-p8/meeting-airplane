const api = window.meetingAirplane;

const elements = {
  testButton: document.querySelector('#testButton'),
  presetList: document.querySelector('#presetList'),
  bannerColor: document.querySelector('#bannerColor'),
  textColor: document.querySelector('#textColor'),
  smokeColor: document.querySelector('#smokeColor'),
  previewPlane: document.querySelector('.preview-plane'),
  selectPlaneButton: document.querySelector('#selectPlaneButton'),
  planeAssetHelp: document.querySelector('#planeAssetHelp'),
  alertMinutesBefore: document.querySelector('#alertMinutesBefore'),
  pollIntervalSeconds: document.querySelector('#pollIntervalSeconds'),
  flightDurationSeconds: document.querySelector('#flightDurationSeconds'),
  verticalPercent: document.querySelector('#verticalPercent'),
  startWithWindows: document.querySelector('#startWithWindows'),
  startupHelp: document.querySelector('#startupHelp'),
  calendarBadge: document.querySelector('#calendarBadge'),
  calendarHelp: document.querySelector('#calendarHelp'),
  selectCredentialsButton: document.querySelector('#selectCredentialsButton'),
  connectGoogleButton: document.querySelector('#connectGoogleButton'),
  disconnectGoogleButton: document.querySelector('#disconnectGoogleButton')
};

let state = {
  settings: null,
  presets: [],
  calendar: null,
  planeAsset: null,
  startup: null
};

async function init() {
  const payload = await api.getSettings();
  state.settings = payload.settings;
  state.presets = payload.presets;
  state.planeAsset = await api.getPlaneAsset();
  state.startup = await api.getStartupStatus();
  state.calendar = await api.getCalendarStatus();
  render();
  bindEvents();
}

function bindEvents() {
  elements.testButton.addEventListener('click', () => api.testOverlay());

  for (const key of ['bannerColor', 'textColor', 'smokeColor']) {
    elements[key].addEventListener('input', event => {
      updateSettings({ [key]: event.target.value, preset: 'custom' });
    });
  }

  elements.alertMinutesBefore.addEventListener('change', event => {
    updateSettings({ alertMinutesBefore: parseAlertMinutes(event.target.value) });
  });
  elements.pollIntervalSeconds.addEventListener('change', event => {
    updateSettings({ pollIntervalSeconds: Number(event.target.value) });
  });
  elements.flightDurationSeconds.addEventListener('change', event => {
    updateSettings({ flightDurationMs: Math.round(Number(event.target.value) * 1000) });
  });
  elements.verticalPercent.addEventListener('input', event => {
    updateSettings({ verticalPercent: Number(event.target.value) });
  });
  elements.startWithWindows.addEventListener('change', async event => {
    const payload = await api.setStartupEnabled(event.target.checked);
    state.settings = payload.settings;
    state.startup = payload.startup;
    renderSettings();
  });

  elements.selectPlaneButton.addEventListener('click', async () => {
    setBusy(elements.selectPlaneButton, true);
    try {
      state.planeAsset = await api.selectPlaneSvg();
      renderPlaneAsset();
    } catch (error) {
      showPlaneAssetMessage(error.message);
    } finally {
      setBusy(elements.selectPlaneButton, false);
    }
  });

  elements.selectCredentialsButton.addEventListener('click', async () => {
    setBusy(elements.selectCredentialsButton, true);
    try {
      state.calendar = await api.selectCredentials();
      renderCalendarStatus();
    } catch (error) {
      showCalendarMessage(error.message);
    } finally {
      setBusy(elements.selectCredentialsButton, false);
    }
  });

  elements.connectGoogleButton.addEventListener('click', async () => {
    setBusy(elements.connectGoogleButton, true);
    try {
      state.calendar = await api.connectGoogle();
      renderCalendarStatus();
      showCalendarMessage('Connected. Upcoming meetings will trigger the airplane reminder.');
    } catch (error) {
      showCalendarMessage(error.message);
    } finally {
      setBusy(elements.connectGoogleButton, false);
    }
  });

  elements.disconnectGoogleButton.addEventListener('click', async () => {
    state.calendar = await api.disconnectGoogle();
    renderCalendarStatus();
  });
}

async function updateSettings(patch) {
  const payload = await api.updateSettings(patch);
  state.settings = payload.settings;
  state.presets = payload.presets;
  renderSettings();
}

function render() {
  renderSettings();
  renderPlaneAsset();
  renderPresets();
  renderCalendarStatus();
}

function renderSettings() {
  const settings = state.settings;
  document.documentElement.style.setProperty('--banner', settings.bannerColor);
  document.documentElement.style.setProperty('--text', settings.textColor);
  document.documentElement.style.setProperty('--smoke', settings.smokeColor);

  elements.bannerColor.value = settings.bannerColor;
  elements.textColor.value = settings.textColor;
  elements.smokeColor.value = settings.smokeColor;
  elements.alertMinutesBefore.value = formatAlertMinutes(settings.alertMinutesBefore);
  elements.pollIntervalSeconds.value = settings.pollIntervalSeconds;
  elements.flightDurationSeconds.value = (settings.flightDurationMs / 1000).toFixed(1).replace('.0', '');
  elements.verticalPercent.value = settings.verticalPercent;
  elements.startWithWindows.checked = Boolean(settings.startWithWindows);

  if (state.startup?.supported === false) {
    elements.startWithWindows.disabled = true;
    elements.startupHelp.textContent = 'Automatic startup is not supported on this operating system.';
  } else if (settings.startWithWindows) {
    elements.startupHelp.textContent = 'Enabled. Windows will start Meeting Airplane in the tray after login.';
  } else {
    elements.startupHelp.textContent = 'Disabled. Use the launcher or tray manually when needed.';
  }

  document.querySelectorAll('.preset-button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.preset === settings.preset);
  });
}

function renderPlaneAsset() {
  if (!state.planeAsset?.url) return;
  elements.previewPlane.src = state.planeAsset.url;
  const updated = state.planeAsset.updatedAt ? new Date(state.planeAsset.updatedAt).toLocaleString() : 'now';
  showPlaneAssetMessage(`Plane image loaded. Last updated: ${updated}.`);
}

function renderPresets() {
  elements.presetList.innerHTML = '';
  for (const preset of state.presets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-button';
    button.dataset.preset = preset.id;
    button.innerHTML = `
      <span class="preset-name">${escapeHtml(preset.name)}</span>
      <span class="swatches" aria-hidden="true">
        <span class="swatch" style="background:${preset.bannerColor}"></span>
        <span class="swatch" style="background:${preset.textColor}"></span>
        <span class="swatch" style="background:${preset.smokeColor}"></span>
      </span>
    `;
    button.addEventListener('click', () => {
      updateSettings({
        preset: preset.id,
        bannerColor: preset.bannerColor,
        textColor: preset.textColor,
        smokeColor: preset.smokeColor
      });
    });
    elements.presetList.append(button);
  }
}

function renderCalendarStatus() {
  const calendar = state.calendar || {};
  elements.calendarBadge.classList.toggle('is-connected', Boolean(calendar.connected));
  elements.calendarBadge.textContent = calendar.connected ? 'Connected' : calendar.hasCredentials ? 'Ready to connect' : 'Not connected';
  elements.connectGoogleButton.disabled = !calendar.hasCredentials;
  elements.connectGoogleButton.textContent = calendar.connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar';
  elements.connectGoogleButton.dataset.originalText = elements.connectGoogleButton.textContent;
  elements.disconnectGoogleButton.disabled = !calendar.connected;
  if (calendar.connected) {
    showCalendarMessage('Google Calendar is connected. Use Reconnect if you need to refresh permissions.');
  } else if (calendar.hasCredentials) {
    showCalendarMessage('OAuth JSON selected. Connect Google Calendar to start polling.');
  } else {
    showCalendarMessage('Use a Google OAuth Desktop app JSON file. The app requests read-only event access.');
  }
}

function showCalendarMessage(message) {
  elements.calendarHelp.textContent = message;
}

function showPlaneAssetMessage(message) {
  elements.planeAssetHelp.textContent = message;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = busy ? 'Working...' : button.dataset.originalText;
}

function parseAlertMinutes(value) {
  const minutes = String(value)
    .split(',')
    .map(part => Number(part.trim()))
    .filter(number => Number.isFinite(number))
    .map(number => Math.round(number))
    .filter(number => number >= 1 && number <= 240);

  return Array.from(new Set(minutes)).sort((a, b) => b - a);
}

function formatAlertMinutes(value) {
  const minutes = Array.isArray(value) ? value : [value];
  return minutes
    .map(number => Number(number))
    .filter(number => Number.isFinite(number))
    .join(', ');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

init().catch(error => {
  console.error(error);
  showCalendarMessage(error.message);
});
