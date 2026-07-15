# Tracking Tabs

Tracking Tabs is a private mobile-first daily number tracker built with Expo, React Native, and Supabase. It lets one user account track multiple named items, enter one count per date for each item, edit backdated data, and view each tracker as an independent GitHub-style heatmap.

The app is designed for personal use first: quick daily entry, synced data across devices, and an installable Android APK through EAS.

## Features

- Email/password authentication with Supabase Auth.
- Cloud sync across devices using the same Supabase account.
- Multiple named trackers, each with its own entries and heatmap.
- Left hamburger drawer for tracker switching and adding trackers.
- Long-press or action button on a tracker to rename or delete it.
- One whole-number count per tracker per date.
- Backdated editing through date picker, previous/next buttons, or heatmap tap.
- Future dates are blocked.
- Dynamic heatmap intensity: the highest count in the selected view is darkest.
- Full RGB heatmap color selection with live shade preview.
- Week start setting: Monday or Sunday.
- Stats window setting: 30, 90, or 365 days.
- Current streak, max streak, days at max, logged days, total, and daily average.
- Right-side menu for global settings, reminder, backup sync, logout, and delete account.
- Dark mode setting.
- Local cache for faster startup and offline viewing.
- Failed writes are queued locally and retried on refresh/startup.
- Daily reminder setting for installed mobile builds through `expo-notifications`.
- Supabase Row Level Security for per-user data isolation.

## Tech Stack

- Expo SDK 57
- React 19
- React Native 0.86
- TypeScript
- Supabase Auth and Postgres
- Async Storage for local session/cache/pending writes
- EAS Build for APK generation

## Project Structure

```text
tracking-tabs/
├─ App.tsx
├─ app.json
├─ eas.json
├─ package.json
├─ src/
│  ├─ components/
│  │  ├─ AuthScreen.tsx
│  │  ├─ Heatmap365.tsx
│  │  └─ TrackerScreen.tsx
│  ├─ lib/
│  │  ├─ storage.ts
│  │  └─ supabase.ts
│  ├─ services/
│  │  └─ entries.ts
│  ├─ types.ts
│  └─ utils/
│     └─ date.ts
└─ supabase/
   └─ schema.sql
```

## Supabase Setup

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Paste and run all of `supabase/schema.sql`.
4. In **Authentication -> Providers**, enable Email.
5. For development, you can temporarily disable email confirmation to avoid rate limits.
6. Copy the project URL and publishable key from Supabase project API settings.

The schema creates:

- `tracked_items`: one row per user-created tracker.
- `daily_entries`: one count per user, tracker, and date.
- RLS policies for tracked items and daily entries.
- `delete_my_account()` RPC used by the Delete account setting.

Do not put a Supabase service-role key in this app.

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

## Install

```bash
npm install
```

If Expo reports dependency mismatches:

```bash
npx expo install --fix
```

## Run Locally

```bash
npm start
```

For web testing:

```bash
npm run web
```

For Android emulator/device through Expo:

```bash
npm run android
```

The current local test URL is usually:

```text
http://localhost:8081
```

## Build Android APK

Sign in to Expo/EAS:

```bash
npx eas-cli@latest login
```

Configure if needed:

```bash
npx eas-cli@latest build:configure
```

Build preview APK:

```bash
npm run build:apk
```

The `preview` profile in `eas.json` is configured for an installable APK.

## App Settings

The right-side menu includes:

- Dark mode
- RGB heatmap color
- Week start day
- Stats window
- Reminder notification time
- Backup sync status and manual sync
- Logout
- Delete account

The left drawer includes:

- Current tracker pinned at top
- Other trackers below
- Add tracker
- Rename/delete tracker through long press or the action button

## Data Behavior

- Each user can create multiple trackers.
- Each tracker can store one count per date.
- Saving `0` clears that date.
- Entries are stored in Supabase and cached locally.
- Offline saves are queued locally and retried.
- If two devices edit the same tracker/date offline, the last change that reaches Supabase wins.

## Validation

Useful checks:

```bash
npm run typecheck
npm run doctor
```

Current local validation performed during development:

- TypeScript check passes.
- Expo web bundle builds.
- Supabase table access verified after running schema.

## Privacy Notes

- Supabase Auth identifies the user.
- Row Level Security restricts data to `auth.uid() = user_id`.
- Session, cached entries, settings, and pending writes use Async Storage.
- Async Storage is persistent but not encrypted.
- Delete account calls the `delete_my_account()` Supabase RPC, which deletes the authenticated user and cascades their tracker data.

## Publishing Notes

Before public distribution, change these identifiers in `app.json`:

```text
expo.android.package
expo.ios.bundleIdentifier
```

Current package:

```text
com.privategrid.dailytracker
```

Use a unique reverse-domain identifier you control before publishing widely.
