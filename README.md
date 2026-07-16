# Tracking Tabs

Tracking Tabs is a private daily number tracker built with Expo, React Native, and Supabase. It supports Android APK installs and a free GitHub Pages web app, both using the same Supabase account and synced data.

Live web app:

https://deepgada.github.io/daily-grid-tracker/

## What It Does

- Track multiple named items, each with its own graph and entries.
- Enter one number/count per tracker per date.
- Edit backdated entries.
- Add an optional comment per date, limited to 100 characters.
- View each tracker as a GitHub-style heatmap.
- Heatmap color is fully customizable with RGB controls.
- Highest value in the selected window is darkest; lower values become lighter.
- View 30, 90, or 365 day stats windows.
- See total, daily average, logged days, current streak, max streak, and days at max.
- Double tap the graph to open a full graph view; Android back returns to normal view.
- Use the same account on Android and web.

## App Screens

- Email/password sign in and sign up.
- Left hamburger drawer for trackers.
- Current tracker stays pinned at the top of the drawer.
- Add tracker from the drawer.
- Rename or delete tracker through long press or the tracker action button.
- Right-side menu for settings, sync, logout, and account deletion.

Google login is intentionally removed because Google OAuth is disabled for this project.

## Settings

- Dark mode with a black/charcoal theme.
- Heatmap RGB color picker.
- Week start day: Monday or Sunday.
- Stats window: 30, 90, or 365 days.
- Daily reminder notification time for installed mobile builds.
- Backup sync status and manual Sync Now feedback.
- Logout.
- Delete account.

## Tech Stack

- Expo SDK 57
- React 19
- React Native 0.86
- TypeScript
- Supabase Auth
- Supabase Postgres with Row Level Security
- Async Storage for local settings/cache/pending writes
- Expo Notifications
- EAS Build for Android APKs
- GitHub Pages for free web hosting

## Project Structure

```text
.
|-- App.tsx
|-- app.json
|-- eas.json
|-- package.json
|-- src
|   |-- components
|   |   |-- AuthScreen.tsx
|   |   |-- Heatmap365.tsx
|   |   `-- TrackerScreen.tsx
|   |-- lib
|   |   |-- storage.ts
|   |   `-- supabase.ts
|   |-- services
|   |   `-- entries.ts
|   |-- types.ts
|   `-- utils
|       `-- date.ts
|-- supabase
|   `-- schema.sql
|-- scripts
|   `-- prepare-gh-pages.js
`-- .github
    `-- workflows
        `-- pages.yml
```

## Supabase Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. In Authentication -> Providers, enable Email.
5. Copy the project URL and publishable key from Supabase API settings.

The schema creates:

- `tracked_items`
- `daily_entries`
- per-user Row Level Security policies
- `delete_my_account()` RPC for the in-app Delete account action

Never put a Supabase service-role key in this app.

## Environment

Copy the example file:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

`.env` is ignored by Git.

For GitHub Pages, the same public Supabase values are set in `.github/workflows/pages.yml`.

## Install

```bash
npm install
```

## Run Locally

Start Expo:

```bash
npm start
```

Run web locally:

```bash
npm run web
```

Run Android through Expo:

```bash
npm run android
```

## Web Build And Deploy

Create a static web build:

```bash
npm run build:web
```

Create a GitHub Pages-compatible build:

```bash
npm run build:web:gh-pages
```

The GitHub Pages workflow deploys automatically on pushes to `main`:

```text
.github/workflows/pages.yml
```

GitHub Pages source should be set to **GitHub Actions** in repo settings.

## Android APK Build

Build an installable preview APK with EAS:

```bash
npm run build:apk
```

The `preview` profile in `eas.json` builds an APK.

Before building on EAS, make sure the EAS preview environment has:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

## Local Android Build

Local Android builds need Android Studio, Android SDK, and Java/JDK installed.

Generate native Android files:

```bash
npm run prebuild:android
```

Run locally:

```bash
npm run android:local
```

Build a debug APK locally:

```bash
npm run build:android:debug
```

The debug APK is generated under:

```text
android/app/build/outputs/apk/debug/
```

## Data Behavior

- Each user can create multiple trackers.
- Each tracker stores one number per date.
- A comment can be attached to each date.
- Saving `0` clears that date.
- Supabase stores synced data.
- Async Storage keeps local cache, settings, and pending offline writes.
- Failed writes are queued locally and retried later.
- If two devices edit the same tracker/date offline, the last synced change wins.

## Privacy Notes

- Supabase Auth identifies the user.
- Row Level Security restricts rows to the authenticated user.
- Local settings/cache/pending writes are stored on device.
- Async Storage is persistent but not encrypted.
- Delete account calls the Supabase RPC and cascades tracker data deletion.

## Useful Checks

```bash
npm run typecheck
npm run doctor
```

## Current Identifiers

App name:

```text
Tracking Tabs
```

Version:

```text
0.1.0
```

Android package:

```text
com.deepgada.trackingtabs
```

Web URL:

```text
https://deepgada.github.io/daily-grid-tracker/
```
