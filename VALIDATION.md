# Validation report

Validated on 15 July 2026.

- `npm run typecheck`: passed.
- `npx expo install --check`: dependencies reported up to date against Expo SDK 57's local dependency map.
- Android production bundle export: passed (`656 modules`, Android bundle generated successfully).
- `expo-doctor`: 18 of 20 checks passed. The two remaining checks could not contact Expo's config service and React Native Directory from the validation environment; no additional local dependency or TypeScript error was reported.

An APK is not included because an installable signed build requires an Expo/EAS account (or a local Android SDK), plus the final Supabase environment values. The included `preview` EAS profile is configured to produce an APK.
