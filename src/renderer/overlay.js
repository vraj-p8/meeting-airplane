const api = window.meetingAirplane;
const flightPath = document.querySelector('#flightPath');
const bannerTitle = document.querySelector('#bannerTitle');
const bannerWhen = document.querySelector('#bannerWhen');
const plane = document.querySelector('.plane');

let doneTimer;

api.onOverlayPlay(payload => {
  loadPlaneAsset();

  const settings = payload.settings;
  const minutes = Math.max(1, Number(payload.minutesUntil || firstAlertMinute(settings.alertMinutesBefore) || 5));
  const title = payload.title || 'Meeting';

  document.documentElement.style.setProperty('--banner', settings.bannerColor);
  document.documentElement.style.setProperty('--text', settings.textColor);
  document.documentElement.style.setProperty('--smoke', settings.smokeColor);
  document.documentElement.style.setProperty('--duration', `${settings.flightDurationMs}ms`);
  document.documentElement.style.setProperty('--top', `${settings.verticalPercent}vh`);

  bannerTitle.textContent = title;
  bannerWhen.textContent = ` in ${minutes} min`;

  clearTimeout(doneTimer);
  flightPath.classList.remove('is-active');
  void flightPath.offsetWidth;
  flightPath.classList.add('is-active');

  doneTimer = setTimeout(() => {
    flightPath.classList.remove('is-active');
    api.overlayDone();
  }, settings.flightDurationMs + 250);
});

function firstAlertMinute(value) {
  if (Array.isArray(value)) return value[0];
  const number = Number(value);
  return Number.isFinite(number) ? number : 5;
}

async function loadPlaneAsset() {
  try {
    const asset = await api.getPlaneAsset();
    if (asset?.url) plane.src = asset.url;
  } catch (error) {
    console.error(error);
  }
}

loadPlaneAsset();
