const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly'];

const DEFAULT_SETTINGS = {
  alertMinutesBefore: [10, 5, 1],
  pollIntervalSeconds: 60,
  flightDurationMs: 8500,
  verticalPercent: 38,
  startWithWindows: false,
  bannerColor: '#ff7ab8',
  textColor: '#ffffff',
  smokeColor: '#ffc4dc',
  preset: 'pink'
};

const APP_NAME = 'Meeting Airplane';
const BACKGROUND_ARG = '--background';
const IS_SMOKE_TEST = process.env.MEETING_AIRPLANE_SMOKE_TEST === '1' || process.argv.includes('--smoke-test');

const COLOR_PRESETS = [
  {
    id: 'pink',
    name: 'Pink Sky',
    bannerColor: '#ff7ab8',
    textColor: '#ffffff',
    smokeColor: '#ffc4dc'
  },
  {
    id: 'blue',
    name: 'Classic Blue',
    bannerColor: '#79c7ff',
    textColor: '#0b1a2a',
    smokeColor: '#d7edff'
  },
  {
    id: 'sunset',
    name: 'Sunset',
    bannerColor: '#ffd166',
    textColor: '#2b1600',
    smokeColor: '#ffe8a3'
  },
  {
    id: 'mint',
    name: 'Mint',
    bannerColor: '#8ef0d2',
    textColor: '#063126',
    smokeColor: '#cbfff1'
  },
  {
    id: 'night',
    name: 'Night',
    bannerColor: '#536dfe',
    textColor: '#ffffff',
    smokeColor: '#b3c1ff'
  },
  {
    id: 'mono',
    name: 'Monochrome',
    bannerColor: '#f3f4f6',
    textColor: '#111827',
    smokeColor: '#cbd5e1'
  }
];

const TRAY_ICON_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAALhSURBVFhH7Zc7aBRRFIZT2lmmtBGbQAqLoEVIIzayiLoEBQOSiKJLCMbFImJhChFTCD7QoCBG0BUiCT5IISiiiIW4hGAkggs+Iz4Dmt2dbO5/5R/vjDNn7u7OPtL5wwf7uHP+c+49985MS8t/1SkA7QA6A7TLMU2V1noVgN0ArgL4DmCxDBkAe7XWq2WMusWAAHIWs0p8ApBi4jJebLEKAA8twWshC2CNjF1VvAjArCVgPXA2OqVHWZnKm2XuwSTWSa+ITLM1Ou1WFh31avBGlSTYOPLCRnk9rwpD4yhtGAbm5tV56enLVF9rt1v5+Vvlbz5TzvazUG3pZb0+7ejjE6pktnCr9HZltlskWC08z6lCOoNS25DWmwcW9MXerD5w8J3m988LKm/GDUtvVwAmZcA4sNqxJ8rZNALFSo/tm9Oz3Xd1dueU3jiY12uPaH3uvloKXJOV3l7nVzrhIjx4qYr9Y2qZBsn+r/pWz1Nd3HbdZaRvxjUmXPu8o+T14WYE0CENbHAaWU3XCYDV0ehDckLrrddc3nTf1omBH745ufwIjowDICETSFgG+Uy+QHH/FbjVck3v9Dz2TT243my4oHmZ6klKJhBpwLffVP7kPSwxSNehX67Blx3jEWP+1pv6GDL2mJpWRRnXcFQmkPT+nHmvCnsu/a3WW98zfdNWuARsPGlMtpyGshh7HJYJ8J7uD+BWkgFtsPPlbx4VqidJmUCrHFQpCS4LdwHH7brwb7Y8eADJeIKOUAImicg9wJYEf+Pe98bwM3dFcAyXUcYKkJPertgYlsF+EsGqJTTkacdx3C3yf8Go9HZllsF6GPGkC1Ztg1s1RvWk/PMjgFOWC2JTboYCZKRnSGYWmnJHtMDZrfw8QJlj2boUDRLeepVkDqZmJhE++eLIHE58lpPBaoFFxK9cyvQEX0Zk4DjwJaX6mseReRUbjdGgnDEmHP8xvFaZJuXDKw8uD35fOdOV0h/6eEzDqaajhgAAAABJRU5ErkJggg==';

let tray;
let settingsWindow;
let overlayWindow;
let pollTimer;
let firedEventKeys = new Set();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes(BACKGROUND_ARG)) return;
    if (app.isReady()) {
      createSettingsWindow();
    } else {
      app.once('ready', createSettingsWindow);
    }
  });
}

function dataPath(fileName) {
  return path.join(app.getPath('userData'), fileName);
}

const DEFAULT_PLANE_PATH = path.join(__dirname, 'renderer', 'assets', 'airplane.svg');

// Custom planes live in userData so the bundled asset stays untouched (and writable installs aren't required).
function customPlanePath() {
  return dataPath('custom-plane.svg');
}

async function getPlaneAsset() {
  const assetPath = fsSync.existsSync(customPlanePath()) ? customPlanePath() : DEFAULT_PLANE_PATH;
  const stat = await fs.stat(assetPath);
  return {
    url: `${pathToFileURL(assetPath).toString()}?v=${Math.round(stat.mtimeMs)}`,
    updatedAt: stat.mtime.toISOString()
  };
}

async function readJson(fileName, fallback) {
  try {
    const content = await fs.readFile(dataPath(fileName), 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function writeJson(fileName, value) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(dataPath(fileName), JSON.stringify(value, null, 2), 'utf8');
}

async function getSettings() {
  const stored = await readJson('settings.json', {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  return {
    ...merged,
    alertMinutesBefore: normalizeAlertMinutes(merged.alertMinutesBefore)
  };
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = {
    ...current,
    ...patch,
    alertMinutesBefore: normalizeAlertMinutes(patch.alertMinutesBefore ?? current.alertMinutesBefore),
    pollIntervalSeconds: clampNumber(patch.pollIntervalSeconds ?? current.pollIntervalSeconds, 15, 600),
    flightDurationMs: clampNumber(patch.flightDurationMs ?? current.flightDurationMs, 3000, 20000),
    verticalPercent: clampNumber(patch.verticalPercent ?? current.verticalPercent, 10, 80),
    startWithWindows: Boolean(patch.startWithWindows ?? current.startWithWindows)
  };
  await writeJson('settings.json', next);
  if (!IS_SMOKE_TEST) applyStartupSetting(next.startWithWindows);
  schedulePolling();
  return next;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function normalizeAlertMinutes(value) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? '')
      .split(',')
      .map(part => part.trim());

  const normalized = Array.from(new Set(values
    .map(part => Number(part))
    .filter(number => Number.isFinite(number))
    .map(number => Math.round(number))
    .filter(number => number >= 1 && number <= 240)))
    .sort((a, b) => b - a);

  return normalized.length > 0 ? normalized : [5];
}

function maxAlertMinutes(value) {
  return Math.max(...normalizeAlertMinutes(value));
}

function activeAlertMinute(msUntil, alertMinutes) {
  const alerts = normalizeAlertMinutes(alertMinutes);
  for (let index = 0; index < alerts.length; index += 1) {
    const upperMs = alerts[index] * 60000;
    const lowerMs = (alerts[index + 1] || 0) * 60000;
    if (msUntil > 0 && msUntil <= upperMs && msUntil > lowerMs) {
      return alerts[index];
    }
  }
  return null;
}

function firstAlertMinute(value) {
  return normalizeAlertMinutes(value)[0] || 5;
}

function isBackgroundLaunch() {
  return process.argv.includes(BACKGROUND_ARG) || process.argv.includes('--hidden');
}

function loginItemOptions() {
  const args = [BACKGROUND_ARG];
  if (process.defaultApp) {
    args.unshift(app.getAppPath());
  }

  return {
    path: process.execPath,
    args,
    name: APP_NAME
  };
}

function getStartupStatus() {
  if (!['win32', 'darwin'].includes(process.platform)) {
    return {
      startWithWindows: false,
      supported: false,
      path: null,
      args: []
    };
  }

  const options = loginItemOptions();
  const status = app.getLoginItemSettings(options);
  return {
    startWithWindows: Boolean(status.openAtLogin),
    executableWillLaunchAtLogin: Boolean(status.executableWillLaunchAtLogin),
    supported: true,
    path: options.path,
    args: options.args
  };
}

function applyStartupSetting(enabled) {
  if (!['win32', 'darwin'].includes(process.platform)) return getStartupStatus();

  app.setLoginItemSettings({
    ...loginItemOptions(),
    openAtLogin: Boolean(enabled),
    enabled: Boolean(enabled)
  });

  return getStartupStatus();
}

async function syncStartupPreference() {
  const settings = await getSettings();
  return applyStartupSetting(settings.startWithWindows);
}

function trayImage() {
  const image = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64'));
  const resized = image.resize({ width: 16, height: 16 });
  resized.setTemplateImage(false);
  return resized;
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Settings', click: createSettingsWindow },
    { label: 'Test Airplane', click: async () => {
      const settings = await getSettings();
      return triggerOverlay({ title: 'Test Meeting', minutesUntil: firstAlertMinute(settings.alertMinutesBefore) });
    } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 940,
    height: 720,
    minWidth: 820,
    minHeight: 620,
    title: 'Meeting Airplane Settings',
    backgroundColor: '#f6f8fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const bounds = screen.getPrimaryDisplay().bounds;
  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  return overlayWindow;
}

async function triggerOverlay(event) {
  const settings = await getSettings();
  const win = createOverlayWindow();
  const bounds = screen.getPrimaryDisplay().bounds;
  win.setBounds(bounds);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.showInactive();
  win.webContents.send('overlay:play', {
    title: event.title || 'Meeting',
    minutesUntil: event.minutesUntil ?? firstAlertMinute(settings.alertMinutesBefore),
    settings
  });
}

async function getAuthState() {
  const credentials = await readJson('google-oauth-client.json', null);
  const token = await readJson('google-token.json', null);
  return {
    hasCredentials: Boolean(credentials?.clientId),
    connected: Boolean(token?.access_token || token?.refresh_token),
    credentialProjectId: credentials?.projectId || null
  };
}

function normalizeOAuthClient(json) {
  const source = json.installed || json.web || json;
  if (!source.client_id) {
    throw new Error('OAuth JSON does not contain client_id. Use a Google OAuth Desktop app JSON file.');
  }
  return {
    clientId: source.client_id,
    clientSecret: source.client_secret || '',
    projectId: source.project_id || null
  };
}

async function selectOAuthJson() {
  const result = await dialog.showOpenDialog(settingsWindow || undefined, {
    title: 'Select Google OAuth Desktop JSON',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return getAuthState();

  const content = await fs.readFile(result.filePaths[0], 'utf8');
  const parsed = normalizeOAuthClient(JSON.parse(content));
  await writeJson('google-oauth-client.json', parsed);
  return getAuthState();
}

async function selectPlaneSvg() {
  const result = await dialog.showOpenDialog(settingsWindow || undefined, {
    title: 'Select Airplane SVG',
    filters: [{ name: 'SVG', extensions: ['svg'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return getPlaneAsset();
  }

  const sourcePath = result.filePaths[0];
  if (path.resolve(sourcePath) !== path.resolve(customPlanePath())) {
    await fs.copyFile(sourcePath, customPlanePath());
  }

  return getPlaneAsset();
}

async function getOAuthClient(redirectUri) {
  const credentials = await readJson('google-oauth-client.json', null);
  if (!credentials?.clientId) {
    throw new Error('Select a Google OAuth Desktop JSON file first.');
  }
  return new google.auth.OAuth2(credentials.clientId, credentials.clientSecret, redirectUri);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Could not allocate a local OAuth callback port.'));
      });
    });
  });
}

async function connectGoogleCalendar() {
  const port = await getFreePort();
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const oauth2Client = await getOAuthClient(redirectUri);
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });

  const token = await waitForOAuthCallback({ port, state, oauth2Client, authUrl });
  await writeJson('google-token.json', token);
  schedulePolling();
  return getAuthState();
}

function waitForOAuthCallback({ port, state, oauth2Client, authUrl }) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Google sign-in timed out. Try Connect again.'));
    }, 120000);

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        if (url.searchParams.get('state') !== state) {
          throw new Error('OAuth state mismatch.');
        }
        const code = url.searchParams.get('code');
        if (!code) {
          throw new Error(url.searchParams.get('error') || 'Google did not return an authorization code.');
        }
        const { tokens } = await oauth2Client.getToken(code);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Meeting Airplane connected.</h1><p>You can close this browser tab.</p>');
        clearTimeout(timeout);
        server.close();
        resolve(tokens);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>Connection failed</h1><p>${escapeHtml(error.message)}</p>`);
        clearTimeout(timeout);
        server.close();
        reject(error);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      shell.openExternal(authUrl);
    });
  });
}

async function disconnectGoogleCalendar() {
  try {
    await fs.rm(dataPath('google-token.json'), { force: true });
  } catch {
    // Nothing to remove.
  }
  firedEventKeys = new Set();
  schedulePolling();
  return getAuthState();
}

async function fetchUpcomingEvents() {
  const credentials = await readJson('google-oauth-client.json', null);
  const token = await readJson('google-token.json', null);
  if (!credentials?.clientId || !token) return [];

  const oauth2Client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  oauth2Client.setCredentials(token);
  oauth2Client.on('tokens', async nextTokens => {
    await writeJson('google-token.json', { ...token, ...nextTokens });
  });

  const settings = await getSettings();
  const now = new Date();
  const timeMax = new Date(now.getTime() + Math.max(maxAlertMinutes(settings.alertMinutesBefore) + 30, 60) * 60000);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20
  });

  return (response.data.items || [])
    .filter(item => item.status !== 'cancelled')
    .filter(item => item.start?.dateTime)
    .map(item => {
      const start = new Date(item.start.dateTime);
      return {
        id: item.id,
        title: item.summary || 'Untitled meeting',
        start,
        htmlLink: item.htmlLink || null
      };
    });
}

async function pollCalendar() {
  try {
    const authState = await getAuthState();
    if (!authState.connected) return;

    const settings = await getSettings();
    const now = Date.now();
    const events = await fetchUpcomingEvents();

    for (const event of events) {
      const msUntil = event.start.getTime() - now;
      const minutesUntil = Math.ceil(msUntil / 60000);
      const alertMinute = activeAlertMinute(msUntil, settings.alertMinutesBefore);
      const key = `${event.id}:${event.start.toISOString()}:alert:${alertMinute}`;
      if (alertMinute && !firedEventKeys.has(key)) {
        firedEventKeys.add(key);
        await triggerOverlay({ title: event.title, minutesUntil });
      }
    }

    if (firedEventKeys.size > 500) {
      firedEventKeys = new Set(Array.from(firedEventKeys).slice(-100));
    }
  } catch (error) {
    console.error('Calendar poll failed:', error);
  }
}

async function schedulePolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const settings = await getSettings();
  const authState = await getAuthState();
  if (!authState.connected) return;

  pollTimer = setInterval(pollCalendar, settings.pollIntervalSeconds * 1000);
  pollCalendar();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function registerIpc() {
  ipcMain.handle('settings:get', async () => ({ settings: await getSettings(), presets: COLOR_PRESETS }));
  ipcMain.handle('settings:update', async (_event, patch) => ({ settings: await saveSettings(patch), presets: COLOR_PRESETS }));
  ipcMain.handle('settings:reset', async () => ({ settings: await saveSettings(DEFAULT_SETTINGS), presets: COLOR_PRESETS }));
  ipcMain.handle('startup:status', getStartupStatus);
  ipcMain.handle('startup:set', async (_event, enabled) => {
    const settings = await saveSettings({ startWithWindows: Boolean(enabled) });
    return { settings, startup: getStartupStatus() };
  });
  ipcMain.handle('asset:plane', getPlaneAsset);
  ipcMain.handle('asset:selectPlaneSvg', selectPlaneSvg);
  ipcMain.handle('overlay:test', async () => {
    const settings = await getSettings();
    await triggerOverlay({ title: 'Test Meeting', minutesUntil: firstAlertMinute(settings.alertMinutesBefore) });
    return { ok: true };
  });
  ipcMain.handle('calendar:status', getAuthState);
  ipcMain.handle('calendar:selectCredentials', selectOAuthJson);
  ipcMain.handle('calendar:connect', connectGoogleCalendar);
  ipcMain.handle('calendar:disconnect', disconnectGoogleCalendar);
  ipcMain.on('overlay:done', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  if (!fsSync.existsSync(app.getPath('userData'))) {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
  }

  registerIpc();
  createTray();
  createOverlayWindow();
  if (!IS_SMOKE_TEST) await syncStartupPreference();
  if (!isBackgroundLaunch() && !IS_SMOKE_TEST) createSettingsWindow();
  await schedulePolling();

  if (IS_SMOKE_TEST) {
    setTimeout(() => app.exit(0), 2500);
  }
});

app.on('activate', () => {
  createSettingsWindow();
});

app.on('window-all-closed', event => {
  event.preventDefault();
});

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer);
});
