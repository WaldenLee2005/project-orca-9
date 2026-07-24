# Social

Accounts, handles, privacy settings, friends, and feed events.

Current implementation:

- Supabase client setup for Expo React Native.
- Email/password sign up and sign in from onboarding.
- Email confirmation redirects use the app callback route at `projectorca9://auth/callback`.
- Unique handle validation before saving profile data.
- Display name, optional avatar URL, and profile visibility fields.
- Private profile visibility by default.
- Sign out from the Profile tab.

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
