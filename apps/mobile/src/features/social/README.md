# Social

Accounts, handles, privacy settings, friends, and feed events.

Current implementation:

- Lazy, optional Supabase client setup for Expo React Native. Missing configuration never prevents local workout logging.
- SDK-managed sessions persist in AsyncStorage, refresh on access and while the native app is foregrounded, and are shared by profile and avatar requests.
- Legacy `orca9.auth.session` entries migrate to the project-scoped SDK storage key on first account access. Expired tokens refresh; unrelated project sessions are not imported.
- Email/password sign up and sign in from onboarding.
- Email confirmation redirects use the app callback route at `projectorca9://auth/callback`.
- Unique handle validation before saving profile data.
- Display name, optional avatar URL, and profile visibility fields.
- Private profile visibility by default.
- Sign out of the current session from the Profile tab without removing workout or rest-day data.
- Guest Profile and Continue without account actions keep workouts, history, and streaks available independently of auth.

Verification:

- `npm test` uses Node 22.18+ (or Node 24+) and the installed Supabase SDK with simulated HTTP responses. It covers session persistence, expiry/rotation, concurrent refresh, legacy migration, rejected/offline refresh, sign out, email confirmation, and guest mode.
- `npm run typecheck` checks native and web TypeScript usage.
- To test without cloud configuration, start Expo with `EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm start`. Log a workout and a rest day, reload, and check history/streaks.
- Real-device checks: sign in, restart the app, leave it backgrounded through token expiry, then open Profile and save a profile change. Sign out and confirm local workout history remains available.

Session integration follows [Supabase's React Native auth setup](https://supabase.com/docs/guides/auth/quickstarts/react-native). Login/confirmation transport and session rotation are handled by the SDK; do not introduce a second token cache.

Backend setup:

- Run `supabase/social-schema.sql` in the Supabase SQL editor before using cloud social profiles.
- Run `supabase/avatar-storage.sql` after `social-schema.sql` to create the public avatar bucket and upload policies.
- Add `projectorca9://auth/callback` to Supabase Auth redirect URLs before testing email confirmation in an installed/dev-client app.
- Keep the mobile app on the publishable key only.
- Never ship a Supabase `service_role` key in the app.

Future work:

- Friend request UI.
- Feed tab or feed section.
- PR/session-summary publishing from local SQLite.
- Friend-visible avatar/privacy rules beyond the first profile upload flow.
