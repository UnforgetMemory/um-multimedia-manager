# UMM - Universal Multimedia Manager

[![Version](https://img.shields.io/badge/version-3.3.0-blue.svg)](https://github.com/) [![Chrome](https://img.shields.io/badge/chrome-extension-brightgreen.svg)](https://chrome.google.com/webstore) [![Manifest V3](https://img.shields.io/badge/manifest-v3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/) [![Vue 3](https://img.shields.io/badge/vue-3.5-4FC08D.svg)](https://vuejs.org/) [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**UMM** is a Chrome extension (Manifest V3) that helps you manage your cross-platform watch and listen records. It unifies your movie, TV, and music history across multiple platforms, provides smart PT site dimming for already-watched items, and keeps your data safe with WebDAV cloud backup.

Built with **Vue 3 (Composition API)** + **TypeScript** + **WXT** + **Tailwind CSS** + **shadcn/vue**.

---

## Features

- **Multi-Platform Aggregation** — Collect and manage records from Douban (movie/music), IMDb, NeoDB, and TMDB, all in one place.
- **Floating Quick Panel** — A draggable overlay appears on supported pages. Mark items as done, want-to-watch, or set a rating in one click.
- **PT Site Dimmer** — Automatically dims or hides already-watched torrents on supported PT sites. No more accidentally downloading what you have already seen.
- **Cross-Platform ID Linking** — Link the same item across platforms (Douban ↔ IMDb ↔ NeoDB). If you mark it on one platform, it syncs everywhere.
- **Options Page** — Dedicated options page with rich statistics, GitHub-style heatmap, platform distribution, rating management, and appearance customization.
- **Rich Popup Dashboard** — Compact popup dashboard showing overview stats with a call-to-action to the options page.
- **NeoDB API Integration** — Auto-fetch metadata and cover images from NeoDB when you tag items.
- **WebDAV Backup & Restore** — Sync your data to any WebDAV server. Export and import as ZIP archives for offline safekeeping.
- **Theme Support** — Light, dark, or system-following theme with smooth transitions.
- **Design System** — Unified design tokens, extended typography system, and font scaling for consistent appearance.
- **Adult AV Support** — Recognize and manage watch records from JavDB, Sehuatang, and other adult video sources.
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
| **Adult Video** | JavDB (javdb.com) | Watch record management |
| | Sehuatang (sehuatang.net) | Watch record management |
| **Other** | Mukaku (web5.mukaku.com) | Basic support |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│          Options Page (Vue 3)   Popup (Vue 3)         │
│   Stats · Charts · Settings      Dashboard           │
└───────────────────────┬──────────────────────────────┘
                        │ chrome.runtime.sendMessage
                        ▼
┌──────────────────────────────────────────────────────┐
│              Background Service Worker                │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ Message  │  │  NeoDB   │  │ WebDAV Sync/       │  │
│  │ Router   │  │   API    │  │ Backup & Restore   │  │
│  └──────────┘  └──────────┘  └────────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Alarms  │  │  Notif.  │  │   Data Migrator    │  │
│  └──────────┘  └──────────┘  └────────────────────┘  │
└──────────────────────┬───────────────────────────────┘
                       │ IndexedDB API
                       ▼
┌──────────────────────────────────────────────────────┐
│              IndexedDB (umm-media-db)                 │
│  douban_records · imdb_records · neodb_records       │
│  tmdb_records · jav_records · ttl_cache              │
│  sync_logs · pt_id_cache · jav_id_cache              │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              Content Script (per-page)                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Router   │  │ Handlers │  │ PT Dimmer /       │  │
│  │          │  │ (douban, │  │ Search / Rating   │  │
│  │          │  │  javdb…) │  │ Observer          │  │
│  │          │  │          │  │ i18n              │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Key Components

- **Background Service Worker** (`src/entrypoints/background.ts`) — Central message router, IndexedDB singleton connection, alarm-based periodic tasks (shelf cache cleanup), and notification management. All DB access flows through this layer.
- **Content Scripts** (`src/entrypoints/content.ts`) — Injected into matched pages. Uses a URL router to dispatch to the correct platform handler, then injects the floating quick panel and status tags.
- **Options Page** (`src/entrypoints/options/`) — Full-featured Vue 3 application with sidebar layout, providing statistics dashboard (heatmap, charts, daily/weekly activity), rating management, cross-platform record linking, WebDAV sync, settings, and appearance customization.
- **Popup Dashboard** (`src/entrypoints/popup/`) — Compact Vue 3 dashboard with overview statistics, serving as a quick-launch entry point to the options page.
- **PT Dimmer** (`src/content/enhancers/pt-dimmer.ts`) — Observes DOM mutations on PT torrent list pages, fetches watched IDs from IndexedDB with TTL caching, and dims matching rows in real time.
- **PT Detail Handler** (`src/content/handlers/pt-detail.ts`) — Extracts Douban and IMDb IDs from PT detail pages and caches them to IndexedDB for list-page dimming.
- **Douban Handler Suite** (`src/content/handlers/douban-*.ts`) — Split from a monolithic handler into scanner, sync, NeoDB push, and toast notification modules for maintainability.
- **Data Layer** (`src/features/database/`) — IndexedDB manager with per-platform object stores, composite keys (`type::providerId`), cross-platform `linkedIds`, and schema version migration (v9).
- **Stores** (`src/stores/`) — Pinia stores for application state (`app`, `theme`, `confirm`) with VueUse integration (`useStorage`, `useMediaQuery`).
- **Composables** (`src/composables/`) — Shared Vue composition functions for stats computation, platform metadata, and toast notification system.

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

### Popup Dashboard & Options Page

Click the UMM icon in the Chrome toolbar to open the popup dashboard showing key statistics at a glance. Click **Open Options Page** for full management capabilities.

The dedicated options page provides:

| Tab | Description |
|-----|-------------|
| **Overview** | Total record count, GitHub-style heatmap, daily activity, platform distribution, and weekly chart |
| **Rating** | Browse and filter records by rating and source platform |
| **Linked** | View and manage cross-platform linked records with jav_id support |
| **Sync** | WebDAV backup/restore and data import/export |
| **Settings** | Configure NeoDB token, general preferences |
| **Appearance** | Theme selection (light/dark/system), font scaling |

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
npm run package:patch  # patch version bump + build
npm run package:minor  # minor version bump + build
npm run package:major  # major version bump + build
```

### Useful Scripts

```bash
npm run deps:audit     # Security audit
npm run data:export    # CLI data export
npm run data:import    # CLI data import
npm run resize-icons   # Resize extension icons
```

---

## Project Structure

```
um-multimedia-manager/
├── wxt.config.ts                 # WXT build configuration (Manifest V3)
├── components.json               # shadcn/vue component configuration
├── tsconfig.json                 # TypeScript configuration
├── playwright.config.ts          # Playwright test configuration
├── icons/                        # Extension icons (16/48/128px)
├── src/
│   ├── entrypoints/              # WXT entry points
│   │   ├── background.ts         # Service Worker (message routing, DB, alarms)
│   │   ├── content.ts            # Content script (floating panel, PT dimmer)
│   │   ├── popup/                # Popup UI application
│   │   │   ├── main.ts           # Popup entry
│   │   │   ├── App.vue           # Popup root component
│   │   │   └── pages/            # Popup pages
│   │   └── options/              # Options page UI (Vue 3 app)
│   │       ├── main.ts           # Options entry
│   │       ├── App.vue           # Options root with sidebar layout
│   │       ├── router.ts         # Tab-based routing
│   │       ├── tabs/             # Tab components
│   │       │   ├── OverviewTab.vue   # Stats, heatmap, charts
│   │       │   ├── RatingTab.vue     # Rating management
│   │       │   ├── LinkedTab.vue     # Cross-platform linked records
│   │       │   ├── SyncTab.vue       # WebDAV sync & import/export
│   │       │   ├── SettingsTab.vue   # General settings
│   │       │   └── AppearanceTab.vue # Theme & font scaling
│   │       └── index.html
│   ├── content/                  # Content script logic
│   │   ├── router.ts             # URL-based platform router
│   │   ├── handlers/             # Per-platform page handlers
│   │   │   ├── douban.ts         # Douban entry point
│   │   │   ├── douban-scanner.ts # Douban page scanning
│   │   │   ├── douban-sync.ts    # Douban save/sync
│   │   │   ├── douban-neodb.ts   # Douban NeoDB push
│   │   │   ├── douban-toast.ts   # Douban notifications
│   │   │   ├── imdb.ts           # IMDb
│   │   │   ├── neodb.ts          # NeoDB
│   │   │   ├── mukaku.ts         # Mukaku sync
│   │   │   ├── pt-detail.ts      # PT detail page ID extraction
│   │   │   ├── javdb.ts          # JavDB
│   │   │   └── sehuatang.ts      # Sehuatang
│   │   ├── enhancers/            # Content page enhancements
│   │   │   ├── pt-dimmer.ts      # PT site dimmer
│   │   │   └── douban-search.ts  # Douban search page enhancer
│   │   ├── observers/            # Page state observers
│   │   │   └── rating.ts         # Rating change watcher
│   │   ├── i18n/                 # Internationalization
│   │   ├── styles/               # Injected CSS styles
│   │   └── utils/                # DOM and toast utilities
│   ├── features/                 # Business logic modules
│   │   ├── database/             # IndexedDB models & CRUD
│   │   ├── identity/             # URL identity parser
│   │   ├── migration/            # Schema migration utilities
│   │   ├── neodb/                # NeoDB API client
│   │   ├── webdav/               # WebDAV client (pure HTTP + ZIP)
│   │   ├── settings/             # Cache management
│   │   └── adult-av/             # Adult video ID recognition & storage
│   ├── stores/                   # Pinia state management
│   │   ├── app.ts                # App-level state
│   │   ├── theme.ts              # Theme state
│   │   └── confirm.ts            # Confirm dialog state
│   ├── composables/              # Vue composables
│   │   ├── useStats.ts           # Stats computation
│   │   ├── usePlatformMeta.ts    # Platform metadata mapping
│   │   └── useToast.ts           # Toast notification system
│   ├── components/               # Shared components
│   │   ├── StatCard.vue          # Stat card
│   │   ├── HeatmapCalendar.vue   # Activity heatmap
│   │   ├── PlatformDistribution.vue # Platform distribution list
│   │   ├── ToastContainer.vue    # Toast container
│   │   ├── ConfirmDialog.vue     # Confirm dialog
│   │   └── ui/                   # shadcn/vue UI components
│   ├── styles/                   # Global styles
│   │   ├── design-tokens.css     # Design system tokens
│   │   └── typography.css        # Typography scales
│   └── types/                    # TypeScript type definitions
├── scripts/                      # Build and packaging utilities
│   ├── package.js                # Version management & packaging
│   ├── unpack.js                 # Unpack extension
│   ├── fix-paths.js              # Post-build path fixer
│   ├── resize-icons.ts           # Icon resizing
│   ├── data-export.js            # CLI data export
│   ├── data-import.js            # CLI data import
│   └── migrate-data.ts           # Data migration tool
├── .omo/                         # Work plans & spec docs
└── docs/                         # Additional documentation
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
