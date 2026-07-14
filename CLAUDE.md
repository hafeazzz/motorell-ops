# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Motorell Ops — a React + Vite single-page app for running a motorcycle dealership's daily
operations: staff attendance, unit purchase/sale finances, media/content tracking, tasks,
team management, monthly reports (Excel export), a group chat, a PDF handbook viewer, and a
pre-purchase vehicle inspection flow. UI text, comments, and commit messages are in Indonesian
— match that when editing.

Data storage: shared/team data lives in Supabase (Postgres + Realtime + Storage), personal
per-device data (theme, sound toggle) lives in `localStorage`. This is a deliberate migration
from an earlier localStorage-only prototype (see README.md) — the app's UI code talks to a
single `window.storage` abstraction so the backend can change without touching `App.jsx`.

## Commands

```bash
npm install       # install deps
npm run dev       # vite dev server (http://localhost:5173/)
npm run build     # vite build -> dist/
npm run preview   # preview the production build locally
```

There is no test suite and no lint script configured — Tailwind is loaded via CDN `<script>`
in `index.html` (no `tailwind.config.js`, no PostCSS build step). Deployment is to Vercel
(build command `vite build`, output dir `dist`), typically via GitHub integration.

A `graphify query` CLI has been used against this repo (see `graphify-out/`) to build a
code-graph index — `graphify-out/GRAPH_REPORT.md` has a summary if you need a quick map of
hubs/communities before diving into `App.jsx`.

## Architecture

**Bootstrap order matters**: `src/main.jsx` imports `./storage.js` *before* `App.jsx` so that
`window.storage` is populated before any component runs — nothing in `App.jsx` imports storage
directly, it's always accessed as the `window.storage` global.

**`src/storage.js`** — the storage abstraction:
- `storage.get/set/delete/list(key, shared)` — `shared: true` routes to a Supabase table
  (`kv`, keyed by `key`), `shared` falsy/omitted routes to `localStorage`. Supabase failures
  fall back to `localStorage` silently.
- `storage.subscribe(key, cb)` — Supabase Realtime channel per key, debounced 180ms, used so
  one device's changes show up on another without a manual refresh.
- Chat lives in its own append-only `chat` table (`chatList/chatSend/chatDelete/chatPrune*`)
  so concurrent sends don't clobber a single JSON blob.
- The staff handbook PDF is stored in a Supabase Storage bucket (`handbook`), always uploaded
  as a fixed filename `handbook.pdf` so the public URL is stable; a cache-busting query param
  is added on update.
- Web push (`savePushSub`/`sendPush`) posts to a Supabase Edge Function (`send-push`, with a
  `send-psuh` typo'd fallback kept for backward compatibility).

**`src/App.jsx`** (~2300 lines) is effectively the whole app — one file holding helpers, seed
data, state migration, all shared UI primitives, and one function per feature tab. A few
feature components were later split into their own files (`ArchiveTab.jsx`,
`InspectionDetailModal.jsx`, `SearchResultsOverlay.jsx`); they import shared primitives
(`Card`, `Tag`, `Modal`, `Field`, `Lightbox`, `INSPEKSI_SECTIONS`, `INS_STATUS`) back *from*
`App.jsx`, which is why those exports exist. When adding a new feature, prefer following this
existing pattern (component in its own file, pulling shared bits from `App.jsx`) rather than
growing `App.jsx` further.

Rough map of `App.jsx`, top to bottom:
- Helpers/formatters (`today`, `month`, `rp`, `compress` for client-side photo compression, etc.)
- `seed()` / `normalize()` — the whole app state is one JSON object
  (`users, units, expenses, attendance, lives, extras, media, tasks, chat, inspections`),
  versioned by `SEED_V` and stored under key `motorell-state-v3`. `normalize()` is the schema
  migration point — it backfills missing fields on load so old saved states keep working.
  `prunePhotos`/`stripAutoExtras`/`fixSaleBonus` are one-off/periodic cleanup passes run at
  load time in `MotorellOps`.
- Shared UI primitives: `Card`, `Btn`, `Field`, `Tag`, `Modal`, `Lightbox`, `Tilt`, `FunFX`
  (confetti/greeting effects), `PhotoInput`.
- `MotorellOps()` (wrapped in `ErrorBoundary`, exported as default `App`) — the root component.
  Owns the single `state` object and `me` (logged-in user), loads/subscribes via
  `window.storage`, and is the only place that calls `update(fn)` — which does
  `structuredClone(prev)`, runs `fn`, then persists via `saveState` (shared Supabase write).
  All child tabs receive `state` and `update` as props rather than touching storage directly.
- `Auth` — login is just picking a user from the shared `users` list and entering a password;
  there's no separate auth backend. The owner password is a hardcoded constant (`OWNER_PW`);
  staff/admin set their own password on first login and it's stored in `state.users[i].password`.
- Roles: `owner` / `admin` / `staff`, computed as `isOwner`/`isAdmin`/`isMgr` in `MotorellOps`
  and passed down to gate which bottom-nav tabs are visible and which actions each tab allows
  (e.g. only `isOwner` can add/edit/delete team members or assign tasks; `isMgr` can access
  Task/Tim/Laporan/Arsip).
- Feature tabs, each a top-level function taking `{ state, me, update, ... }`: `HomeTab`,
  `AbsenTab` (attendance/check-in with photo + live location proof), `UangTab` (unit
  purchase/sale finance, expenses, sale bonus calc), `MediaTab` (content tracking by category),
  `TaskTab`/`OwnerTaskTab` (staff vs. owner views of the same task list), `TimTab` (team CRUD,
  extra cash/bonus adjustments, role toggling), `LaporanTab` (monthly report + Excel export via
  a lazy-loaded XLSX lib), `HandbookPage` (PDF.js-based viewer with virtualized page rendering,
  full-text search index, table of contents), `InspeksiPage` (structured vehicle inspection
  checklist, sections defined in `INSPEKSI_SECTIONS`), `ChatPage` (group chat with optimistic
  send queue and retry-on-fail).
- Sale bonus logic is dynamic, not stored: `saleBonusFor`/`totalExtraFor` compute it per month
  from `state.units`/`state.extras` rather than persisting a running total, so owner overrides
  in `TimTab` (`saveExtra`) work by inserting a compensating `extras` entry rather than editing
  a stored bonus value directly.
- Photos (attendance, live proof, inspection items) are stored as compressed base64 strings
  directly in `state` (via `compress()`), and auto-stripped after `PHOTO_TTL_DAYS` days by
  `prunePhotos` to keep the shared state blob from growing unbounded.
