# Contract: Auth & Account Flows (`auth.js`, `supabase-config.js`)

`auth.js` is included on **every** page after `supabase-config.js` and the pinned supabase-js CDN script. It owns the client, session, nav UI, auth modal, verification banner, and pending-action resume. All other scripts consume it via `window.BeaconAuth`.

## Module surface

```js
window.BeaconAuth = {
  client,                       // supabase client (PKCE, persistSession, detectSessionInUrl)
  getUser(): User | null,       // current user (null = anonymous)
  onChange(fn),                 // subscribe to auth-state changes (fires once immediately)
  requireAuth(pendingAction?),  // gate helper: signed-in → true; else store action + open modal → false
  openModal(mode),              // 'signin' | 'signup'
  signOut(),                    // global sign-out, then re-render nav
}
```

## Flows

### F1. Email/password sign-up (FR-001, FR-007a)
`signUp({ email, password })` → session returned immediately ("Confirm email" is OFF) → modal closes → nav shows account → verification banner appears (F5) → pending action replays (F7). Password rule: ≥ 8 chars (client-validated). Errors surface the friendly message, never whether the email exists (FR-007).

### F2. Email/password sign-in + reset (FR-001, FR-006)
`signInWithPassword`; on failure show the same generic "email or password didn't match" message. "Forgot password?" → `resetPasswordForEmail(email, { redirectTo: <origin>/account.html#reset })`; `account.js` handles the `PASSWORD_RECOVERY` event with a new-password form.

### F3. Social sign-in (FR-002)
Four buttons → `signInWithOAuth({ provider: 'google'|'facebook'|'linkedin_oidc'|'x', options: { redirectTo: location.href } })`. Full-page redirect; on return `detectSessionInUrl` completes the session on whichever page started it. Cancel/denied at the provider → land back signed-out → toast "Sign-in was cancelled — you can try again." (spec edge case). Returning social users resolve to the same account (Supabase auto-link by verified email — FR-003, native).

### F4. Missing email after social sign-in (X edge case)
If `user.email` is null: banner "Add an email to finish your account" → form → `updateUser({ email })` → Supabase sends confirmation to the new address; account features stay available except linking-dependent ones until verified.

### F5. Soft verification banner (FR-007a, clarification Q1)
Shown when `user.email_confirmed_at == null`: "Please verify your email — Resend link". Resend → `signInWithOtp({ email, options: { shouldCreateUser: false } })`. Banner disappears once confirmed (re-check on `USER_UPDATED` / next load). Non-blocking — never gates features.

### F6. Linked sign-in methods — Settings tab (FR-003a, clarification Q4)
List: `getUserIdentities()` → render provider chips (Email, Google, Facebook, LinkedIn, X). Connect: `linkIdentity({ provider })` (manual linking enabled in dashboard) → OAuth redirect → identity added. **No unlink UI in v1.**

### F7. Pending-action resume (FR-011, research R11)
`requireAuth({type:'save', id})` when anonymous: stores JSON at `localStorage['beacon.pendingAction']`, opens modal (or survives OAuth redirect). On the first auth-state change to signed-in on any page: replay (`save` → upsert saved row + flip heart; `route:'account#saved'` → navigate), then clear. Stale entries (> 1 h) are dropped.

### F8. Sign-out (FR-005)
Nav menu → `signOut()` (global scope) → nav re-renders to "Sign in"; gated UI reverts on `onChange`. Other tabs revert via supabase-js cross-tab auth-state propagation (spec edge case).

### F9. Account deletion (FR-023)
Client code cannot delete an auth user (requires service role — never shipped to the browser). v1 contract: Settings → "Delete my account" → confirm dialog → the client deletes all owned rows (cascade covers most) **and** storage objects, then calls the `delete_account` Edge Function with the user's JWT (slug uses an underscore — matches the dashboard-deployed function) — the function verifies the JWT and removes the auth user via the Admin API (service role key held server-side only) — then the client signs out and shows a confirmation notice. Deletion is fully self-service (FR-023).

## Environment / config contract

- `supabase-config.js`: `window.SUPABASE_URL`, `window.SUPABASE_PUBLISHABLE_KEY` — publishable key only; service_role/secret keys must never appear anywhere in the repo.
- CDN script pinned to an exact supabase-js v2 version (no floating `@2`).
- `location.protocol === 'file:'` → account UI renders disabled state: "Sign-in needs the site served over http — run `npx http-server`" (research R7). No supabase calls attempted.
- `user_metadata` is used **only** to pre-fill display fields (name/photo), never for authorization (skill checklist).
