<p align="center">
  <a href="README.en.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="UMM Logo" width="128" height="128">
</p>

<h1 align="center">UMM — Unified Multimedia Manager</h1>

<p align="center">
  <a href="https://github.com/um-2023/um-multimedia-manager/releases"><img src="https://img.shields.io/badge/version-5.4.0-blue?logo=git" alt="Version"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Chrome-88%2B-brightgreen?logo=googlechrome" alt="Chrome"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Manifest_V3-orange?logo=googlechrome" alt="MV3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-green?logo=apache" alt="License"></a>
  <a href="https://ko-fi.com/unforgetmemory"><img src="https://img.shields.io/badge/donate-Ko--fi-ff5f5f?logo=ko-fi" alt="Ko-fi"></a>
</p>

<p align="center">
  <b>A Chrome extension that unifies your media tracking across Douban, IMDb, NeoDB, TMDB, and private trackers — with cross-platform sync, automatic PT dimming, and WebDAV backup.</b>
</p>

<p align="center">
  <sub>Built with Vue 3 · TypeScript · WXT · Tailwind CSS v4</sub>
</p>

---

## Features

| | |
|---|---|
| 🎯 **Cross-Platform Marking** | One-click status and rating on Douban, IMDb, NeoDB, TMDB pages |
| 🔗 **ID Linking** | Auto-map IDs across platforms — one record, all platforms |
| 🌙 **PT Auto-Dimming** | Gray out watched torrents on supported private trackers |
| 📦 **WebDAV Backup** | Auto-backup to any WebDAV server, plus ZIP export/import |
| 🧩 **NeoDB Integration** | Pull ratings and push scores via NeoDB API |
| 🎨 **Theme Switching** | Light, dark, and system-following themes |
| 📊 **Statistics Dashboard** | Popup overview + full options page with heatmap, distribution, ratings |
| 🔞 **Adult Content Support** | Unified tracking for JavDB and Sehuatang |
| 🌐 **Internationalization** | Multi-language support (Chinese, English) |

## Supported Sites

| Category | Sites |
|---|---|
| Film & TV | `movie.douban.com` `imdb.com` `neodb.social` `themoviedb.org` |
| Music | `music.douban.com` `neodb.social/album` |
| Books | `book.douban.com` |
| Games | `game.douban.com` |
| Private Trackers | M-Team, Audiences, HDHome, HDArea, OurBits, PTerClub, and more |
| Adult | JavDB, Sehuatang |

## Quick Start

```bash
# Clone and build
git clone https://github.com/UnforgetMemory/um-multimedia-manager.git
cd um-multimedia-manager
npm install
npm run build
```

Load `dist/chrome-mv3` into Chrome via `chrome://extensions/` (Developer mode).

## Configuration

### WebDAV Backup

Configure in the extension settings:

| Field | Description |
|---|---|
| Server URL | WebDAV endpoint (e.g. `https://example.com/remote.php/dav/`) |
| Username | WebDAV login |
| Password | WebDAV password or app password |

### NeoDB Token

1. Log in to [NeoDB](https://neodb.social)
2. Generate an API token in your profile settings
3. Enter it in the extension settings

## Development

Requires Node.js >= 22 and npm >= 10.

```bash
npm run dev          # Hot-reload development mode
npm run build        # Production build
npm run type-check   # TypeScript type checking
npm test             # Run Playwright tests
npm run zip          # Build and package for Chrome Web Store
```

## Contributing

- **Report issues** — Open a GitHub issue for bugs or feature requests
- **Submit PRs** — Fork the repo, create a feature branch, and open a pull request
- **Translate** — Help improve or add language support
- **Test** — Write or improve Playwright E2E tests

Run `npm run type-check` before committing — TypeScript type checking is the project's quality gate.

## License

[Apache 2.0](LICENSE)

---

<p align="center">
  <a href="https://ko-fi.com/unforgetmemory">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=3" alt="Support on Ko-fi" width="180" height="36">
  </a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="UMM Logo" width="48" height="48">
  <br/>
  <em>Unify your media. Everywhere.</em>
</p>