# Contributing

Thanks for wanting to help. This is a small project, so the process is light.

## Setup

```powershell
git clone https://github.com/vraj-p8/meeting-airplane.git
cd meeting-airplane
npm install
npm start
```

You need Windows and Node.js 22.12 or newer (Electron 42 requires it).

## Before you open a PR

- Run `npm run check` (syntax check of the main, preload and renderer scripts).
- Run `npm run smoke` (launches the app briefly and exits).
- Click **Test Airplane** and confirm the flight still looks right.
- Keep changes focused. One fix or feature per PR.
- Do not add dependencies without a good reason. Say why in the PR.
- Never commit `google-credentials.json`, tokens, or anything from your Electron user-data folder.

## Reporting bugs and ideas

Use the issue templates. For bugs, include your Windows version and what the settings window shows.

By contributing you agree that your work is released under the [MIT License](LICENSE).
