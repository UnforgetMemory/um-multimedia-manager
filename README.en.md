# UMM - Universal Multimedia Manager

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/) [![Chrome](https://img.shields.io/badge/chrome-extension-brightgreen.svg)](https://chrome.google.com/webstore) [![Manifest V3](https://img.shields.io/badge/manifest-v3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/) [![Vue 3](https://img.shields.io/badge/vue-3.5-4FC08D.svg)](https://vuejs.org/) [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**UMM** is a Chrome extension (Manifest V3) that helps you manage your cross-platform watch and listen records. It unifies your movie, TV, and music history across multiple platforms, provides smart PT site dimming for already-watched items, and keeps your data safe with WebDAV cloud backup.

Built with **Vue 3 (Composition API)** + **TypeScript** + **WXT** + **Tailwind CSS** + **shadcn/vue**.

---

## Features

- **Multi-Platform Aggregation** — Collect and manage records from Douban (movie/music), IMDb, NeoDB, and TMDB, all in one place.
- **Floating Quick Panel** — A draggable overlay appears on supported pages. Mark items as done, want-to-watch, or set a rating in one click.
- **PT Site Dimmer** — Automatically dims or hides already-watched torrents on supported PT sites. No more accidentally downloading what you have already seen.
- **Cross-Platform ID Linking** — Link the same item across platforms (Douban ↔ IMDb ↔ NeoDB). If you mark it on one platform, it syncs everywhere.
- **Rich Popup Dashboard** — View your statistics, browse records by platform, filter by rating, and manage cross-platform links from the extension popup.
- **NeoDB API Integration** — Auto-fetch metadata and cover images from NeoDB when you tag items.
- **WebDAV Backup & Restore** — Sync your data to any WebDAV server. Export and import as ZIP archives for offline safekeeping.
- **Theme Support** — Light, dark, or system-following theme.
- **Service Worker Architecture** — Background service worker handles IndexedDB operations, alarms, messaging, and periodic tasks efficiently.

---

## Supported Sites

| Category | Sites | Features |
|----------|-------|----------|
| **Movie/Music Platforms** | Douban (movie.douban.com, music.douban.com, search.douban.com) | Quick panel, status tagging, rating |
| | IMDb (www.imdb.com) | Quick panel, status tagging, rating |
| | NeoDB (neodb.social) | Quick panel, status tagging, metadata fetch |
| | TMDB (themoviedb.org) | Quick panel, status tagging |
| **PT Sites (Dimmer)** | M-Team (m-team.cc) | Auto-dim watched items in torrent lists |
| | Audiences (audiences.me) | Auto-dim watched items in torrent lists |
| | HDHome (hdhome.org) | Auto-dim watched items in torrent lists |
| | HDArea (hdarea.club) | Auto-dim watched items in torrent lists |
| | OurBits (ourbits.club) | Auto-dim watched items in torrent lists |
| | PTerClub (pterclub.net) | Auto-dim watched items in torrent lists |
| **Other** | Mukaku (web5.mukaku.com) | Basic support |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Popup UI (Vue 3)                   │
│           Statistics · Browse · Settings              │
└──────────────────────┬──────────────────────────────┘
                       │ chrome.runtime.sendMessage
                       ▼
┌─────────────────────────────────────────────────────┐
│            Background Service Worker                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Message  │  │  NeoDB   │  │ WebDAV Sync/      │  │
│  │ Router   │  │   API    │  │ Backup & Restore   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Alarms  │  │  Notif.  │  │   Data Migrator   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ IndexedDB API
                       ▼
┌─────────────────────────────────────────────────────┐
│               IndexedDB (umm-media-db)               │
│  douban_records · imdb_records · neodb_records       │
│  tmdb_records · ttl_cache · sync_logs · pt_id_cache  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              Content Script (per-page)               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Router   │  │ Handlers │  │ PT Dimmer /       │  │
│  │          │  │ (douban, │  │ Search Enhancer   │  │
│  │          │  │  imdb…)  │  │                   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Key Components

- **Background Service Worker** (`src/entrypoints/background.ts`) — Central message router, IndexedDB singleton connection, alarm-based periodic tasks (shelf cache cleanup), and notification management.
- **Content Scripts** (`src/entrypoints/content.ts`) — Injected into matched pages. Uses a URL router to dispatch to the correct platform handler, then injects the floating quick panel and status tags.
- **Popup Dashboard** (`src/entrypoints/popup/`) — Vue 3 application with tabbed views for record overview, platform distribution, rating analysis, linked items, and settings.
- **PT Dimmer** (`src/content/enhancers/pt-dimmer.ts`) — Observes DOM mutations on PT torrent list pages, fetches watched IDs from IndexedDB with TTL caching, and dims matching rows in real time.
- **PT Detail Handler** (`src/content/handlers/pt-detail.ts`) — Extracts Douban and IMDb IDs from PT detail pages and caches them to IndexedDB for list-page dimming.
- **Data Layer** (`src/shared/models/database.ts`) — IndexedDB manager with per-platform object stores, composite keys (`type::providerId`), cross-platform `linkedIds`, and schema version migration (v7).

---

## Installation

### Requirements

- **Node.js** >= 22
- **npm** >= 10
- **Chrome** >= 88

### Build from Source

```bash
# Clone the repository
git clone <repo-url>
cd um-multimedia-manager

# Install dependencies
npm install

# Build the extension
npm run build
```

Build output goes to the `dist/` directory.

### Load into Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` directory
5. The UMM extension is now installed

### Package for Distribution

```bash
npm run zip
```

Creates a `.zip` file ready for Chrome Web Store submission.

---

## Usage Guide

### Quick Panel

Visit any supported page (e.g., Douban movie, IMDb title, NeoDB item). A floating panel appears in the top-right corner.

- **Drag** the panel to reposition it.
- **Minimize** (▬) to collapse, **Close** (✕) to dismiss.
- **Status buttons**: Click **Done** (✓), **Wish** (☆), or **Clear** to set the watch status.
- **Rating slider**: Adjust from 0 to 10 (in 0.5 steps).
- **Save** to persist the record.

The panel automatically recognizes the page and cross-references your existing records. If you have already linked the item on another platform, it shows the linked status.

### PT Site Dimmer

When browsing supported PT sites, any torrent that matches a watched movie or album in your database is automatically dimmed (reduced opacity) in the list. The dimmer:

- Works with dynamically loaded content (infinite scroll, pagination).
- Updates in real time when you mark new items.
- Caches watched IDs for 30 seconds for performance.
- Falls back to PT detail page caches for ID matching.

### Popup Dashboard

Click the UMM icon in the Chrome toolbar to open the popup.

| Tab | Description |
|-----|-------------|
| **Overview** | Total record count, distribution by type (movie/TV/music) |
| **Platforms** | Record counts broken down by platform |
| **Ratings** | Filter and browse records by rating |
| **Linked** | View and manage cross-platform linked records |
| **Settings** | Configure WebDAV, NeoDB token, theme, and more |

### Data Management

All records are stored locally in IndexedDB. No manual saving is needed.

Use the **Settings** tab to:
- **WebDAV Backup** — Upload your data to a WebDAV server. Supports manual backup and restore.
- **Data Export** — Download all records as a ZIP archive.
- **Data Import** — Restore from a previously exported ZIP archive.

---

## Configuration

### WebDAV (Cloud Backup)

1. Go to the **Settings** tab in the popup.
2. Enter your WebDAV server URL (e.g., `https://your-nextcloud.example.com/remote.php/dav/files/username/`).
3. Enter your WebDAV username and password.
4. Click **Test Connection** to verify.
5. Use **Backup Now** to upload, or **Restore** to download and merge data.

Backups are stored as standard ZIP archives containing JSON data files with metadata.

### NeoDB Token (Metadata)

To enable automatic metadata fetching from NeoDB:

1. Go to [NeoDB settings](https://neodb.social/settings/developer/) and generate an API token.
2. Enter the token in the **Settings** tab under NeoDB configuration.
3. The extension will now fetch metadata and cover images automatically when you tag items.

### Theme

Choose between **Light**, **Dark**, or **System** (follows OS preference) from the Settings tab. The content script floating panel also respects the theme setting.

---

## Development

### Setup

```bash
npm install
```

### Dev Mode (Hot Reload)

```bash
npm run dev
```

Starts the WXT development server with hot module replacement. Load the unpacked extension from the output directory in developer mode.

### Type Checking

```bash
npm run type-check
```

Runs `vue-tsc` for TypeScript type checking across the project.

### Testing

```bash
# Run all tests
npm run test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# UI mode (Playwright UI)
npm run test:ui
```

Tests are built with Playwright.

### Build Production

```bash
npm run build
```

Outputs the production build to `dist/`.

### Package a Release

```bash
npm run package        # auto-bump patch
npm run package:patch  # explicit patch bump
npm run package:minor  # minor version bump
npm run package:major  # major version bump
```

---

## Project Structure

```
um-multimedia-manager/
├── wxt.config.ts                # WXT build configuration (Manifest V3)
├── components.json              # shadcn/vue component configuration
├── tsconfig.json                # TypeScript configuration
├── package.json                 # Dependencies and scripts
├── playwright.config.ts         # Playwright test configuration
├── icons/                       # Extension icons (16/48/128px)
├── scripts/                     # Build and packaging utilities
├── docs/                        # Additional documentation
├── tests/                       # Playwright test suites
│   ├── unit/                    # Unit tests
│   └── integration/             # Integration tests
├── src/
│   ├── entrypoints/             # WXT entry points
│   │   ├── background.ts        # Service Worker (message routing, DB, alarms)
│   │   ├── content.ts           # Content script (floating panel, PT dimmer)
│   │   └── popup/               # Popup UI application
│   │       ├── main.ts          # Popup entry
│   │       └── App.vue          # Popup root component
│   ├── content/                 # Content script logic
│   │   ├── router.ts            # URL-based platform router
│   │   ├── handlers/            # Per-platform page handlers
│   │   │   ├── douban.ts        # Douban movie & music
│   │   │   ├── imdb.ts          # IMDb
│   │   │   ├── neodb.ts         # NeoDB
│   │   │   ├── pt-detail.ts     # PT detail page ID extraction
│   │   │   └── mukaku.ts        # Mukaku
│   │   ├── enhancers/           # Content page enhancements
│   │   │   ├── pt-dimmer.ts     # PT site dimmer
│   │   │   └── douban-search.ts # Douban search page enhancer
│   │   ├── styles/              # Injected CSS styles
│   │   └── utils/               # DOM and toast utilities
│   ├── shared/                  # Shared across all entry points
│   │   ├── config.ts            # Constants, keys, dataset definitions
│   │   ├── index.ts             # Barrel exports
│   │   ├── types/               # TypeScript type definitions
│   │   │   ├── index.ts         # Core types (StoreRecord, settings, export)
│   │   │   └── messages.ts      # Runtime message types
│   │   ├── api/                 # External API clients
│   │   │   ├── database.ts      # IndexedDB message-passing API
│   │   │   ├── neodb.ts         # NeoDB API client
│   │   │   └── webdav.ts        # WebDAV client (pure HTTP + ZIP)
│   │   ├── models/              # Data models and persistence
│   │   │   ├── database.ts      # IndexedDB manager (v7, per-platform stores)
│   │   │   ├── identity.ts      # URL identity parser
│   │   │   └── migrations.ts    # Schema migration utilities
│   │   └── utils/               # Shared utilities
│   │       ├── context.ts       # Message context helpers
│   │       ├── hash-utils.ts    # Store hash computation
│   │       ├── logger.ts        # Logging utilities
│   │       ├── requestQueue.ts  # Concurrent request limiter
│   │       ├── theme.ts         # Theme detection
│   │       └── zip-utils.ts     # ZIP packaging for WebDAV sync
│   ├── components/              # Vue components (shadcn/vue)
│   │   └── ui/                  # shadcn/vue UI components
│   ├── lib/                     # Vue library helpers
│   └── vite-env.d.ts            # Vite environment types
└── dist/                        # Build output (gitignored)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Vue 3 (Composition API, `<script setup>`) |
| **Language** | TypeScript |
| **Build / Ext Framework** | WXT (Vite-powered Chrome extension framework) |
| **UI Components** | shadcn/vue (Reka UI + Tailwind CSS) |
| **Styling** | Tailwind CSS v4 |
| **Icons** | Lucide (via lucide-vue-next) |
| **Animations** | GSAP |
| **Data Storage** | IndexedDB (via chrome.storage API) |
| **ZIP Handling** | JSZip |
| **Testing** | Playwright |
| **Architecture** | Manifest V3 (Service Worker + Content Scripts + Popup) |

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
