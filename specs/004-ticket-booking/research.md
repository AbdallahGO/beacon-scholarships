# Phase 0 Research: Ticket Booking, Profiles & Cleanup

All decisions below resolve the open/configurable items noted in the spec (ranking source, +1 price, notification channel, Stripe surface) plus the integration unknowns. No `NEEDS CLARIFICATION` remain.

## R1 — Payment architecture: Stripe Checkout via Supabase Edge Functions

- **Decision**: Use **Stripe-hosted Checkout Sessions** created by a Supabase **Edge Function** (`ticket-checkout`), and a separate **`stripe-webhook`** edge function as the *only* trusted writer of tickets/capacity. The browser calls the function with the user's Supabase JWT + the scholarship id, gets back `session.url`, and is redirected. On `checkout.session.completed`, the webhook creates the `tickets` row and stamps `cooldown_end = now() + interval '3 days'`.
- **Rationale**: Keeps the Stripe **secret key off the client**; lets the **server compute the price** from `scholarship_rankings` (a client-supplied price can never be trusted); makes the **cooldown server-anchored** (FR-011) and the ticket creation **idempotent** and tied to *confirmed* payment (FR-009/FR-010, SC-002); minimal PCI surface (no card fields on our site). Aligns with the Stripe best-practices guidance to prefer Checkout Sessions for straightforward one-off payments.
- **Idempotency**: `tickets.stripe_session_id` is `UNIQUE`; the webhook upserts on it and ignores replays. Stripe event ids are also checked to no-op duplicate deliveries.
- **Alternatives considered**: *Payment Element / PaymentIntents* — more client code and PCI surface, rejected for this static site. *Stripe Payment Links* — cannot reliably enforce per-user price, capacity, and one-per-scholarship at creation time, rejected. *Client-only Stripe.js with price in the browser* — insecure (price tampering), rejected.

## R2 — Edge function deployment & secrets (read-only MCP)

- **Decision**: Provide the three functions' source in-repo under `supabase/functions/<slug>/index.ts`; the **owner deploys them via the Supabase dashboard** (Edge Functions → deploy), exactly as feature 003's `delete_account` was deployed. Required secrets set by the owner in the dashboard: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and (optional) `RESEND_API_KEY` + `OWNER_EMAIL`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the Edge runtime.
- **Rationale**: The configured Supabase MCP is **read-only** and blocks `deploy_edge_function` (confirmed in feature 003). The owner-deploy path is already proven on this project.
- **Alternatives considered**: Supabase CLI deploy — viable but the owner's workflow has been dashboard-only; documented as an optional path in quickstart. Lifting MCP read-only — out of scope/not desired.

## R3 — Ranking tier source & matching (no Python)

- **Decision**: Curate `ScholarShips_Data/rankings.csv` from a **recognized world ranking** (QS / Times Higher Education world university rankings) with columns `institution,country,rank`. A PowerShell generator `build_ranking_index.ps1` normalizes names (lowercase, strip punctuation and leading "the/university of" variants), matches each catalogue item's `org`/`title`/`country`, assigns a **tier by band**, and writes two outputs:
  1. `ranking-index.js` → `window.RANKING_INDEX = { <id>: { tier, price, institution } }` for **display only**.
  2. A dated, idempotent **SQL seed block** appended to `supabase-setup.sql` (`insert into public.scholarship_rankings … on conflict (scholarship_id) do update …`) — the **authoritative** price source read by `ticket-checkout`.
  - **Band → tier → price** (single configurable constant block in the script):
    | Band (world rank) | Tier | Price |
    |---|---|---|
    | Top ~200 | `high` | $300 |
    | ~201–500 | `medium` | $250 |
    | 501+ (ranked) | `lowest` | $200 |
    | Not on the list | `out_of_rank` | $150 |
  - Unmatched/unknown institutions default to **`out_of_rank` / $150** (safe lowest price). A manual `rankings-overrides.csv` (`scholarship_id,tier`) fixes any mis-matches.
- **Rationale**: Server-authoritative price (in Postgres) with a fast offline client display copy; pure PowerShell honors the **no-Python** constraint; owner pastes the SQL seed per [[sql-via-paste-ready-file]]; bands are easy to retune later.
- **Alternatives considered**: Live ranking API at runtime — adds a dependency, rate limits, and still can't price server-side cheaply, rejected. Tiers hardcoded only in client JS — price could be tampered with, rejected. Storing rank numbers and computing tier in the edge function — fine, but precomputing tier+price in the seed keeps the function simple; we store both `tier` and `amount_cents`.

## R4 — Book Ticket animation (vanilla, accessible)

- **Decision**: Implement the animation in `ticket.js` + `index.css`, no GIF dependency. On click: (1) the button label is split into word/letter `<span>`s that **fall top→bottom** (staggered `translateY` + fade — the spec's "words go from up to down"); (2) an inline-SVG **scene** plays — a left hand slides in holding a ticket → passes it to a right hand → the ticket drops into a **backpack**, which then receives a **laptop** and a **book**; (3) the label settles on **"Are You Ready!"**. Honor `prefers-reduced-motion` by jumping to the end state. Total ≈ 1.8 s, then initiate checkout. `Scene.gif` may play as a one-shot flourish layer but is not required for correctness.
- **Rationale**: Keeps the site dependency-free and the timing controllable (label swap must sync with the animation end); a raw GIF can't be sequenced with the text change or paused for reduced-motion. Inline SVG scales crisply in both themes.
- **Alternatives considered**: Use `Scene.gif` as the sole animation — can't control timing/label, no reduced-motion fallback, rejected as the primary mechanism (kept as optional flourish). A Lottie/JS animation lib — violates no-framework/dependency-free constraint, rejected.

## R5 — Owner notification channel

- **Decision**: On a confirmed booking the `stripe-webhook` function sends a **Resend** transactional email to `OWNER_EMAIL` (user, scholarship, tier/price, ticket code). The **owner dashboard is the durable, always-available record**; email is a convenience and **degrades gracefully** (if `RESEND_API_KEY`/`OWNER_EMAIL` are unset, skip email — the ticket and dashboard row are unaffected).
- **Rationale**: Satisfies "I need to get notified" (FR-018a) without coupling correctness to email; Resend is a simple HTTP call from Deno with a generous free tier and no SMTP setup.
- **Alternatives considered**: Supabase built-in email — reserved for auth flows, not arbitrary sends, rejected. SMTP from the edge function — heavier config, rejected. Dashboard-only (no push) — doesn't meet the "notified" ask.

## R6 — Owner-only access for the dashboard

- **Decision**: A `public.admins(user_id uuid primary key)` table seeded with the **owner's** auth user id (added in the `supabase-setup.sql` seed once the owner provides/confirms their id). Add admin RLS on `tickets`: in addition to "own select", an "admin select all" policy `using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))`. `admin.html`/`admin.js` check membership client-side for UX, but **RLS is the real boundary** (non-admins simply get zero rows). Writes still go only through the service-role webhook.
- **Rationale**: Simple, declarative, and enforced in the database (matches the project's "RLS is the security boundary" stance). No custom JWT claims or auth hooks needed.
- **Alternatives considered**: Custom `app_metadata` role + JWT claim — requires admin API/auth hook plumbing, heavier, rejected for now. Client-only gating — insecure, rejected.

## R7 — Filter persistence

- **Decision**: Persist the `index.js` `state` object `{ q, level, fund, country, sort }` to `localStorage` under `beacon.filters` on every change; on load, restore it **before** the first `render()` and reflect it into the controls (search box, chips, selects). The existing `?q=` deep-link (history re-run) takes precedence for `q` when present. Works for anonymous and signed-in users alike.
- **Rationale**: The state is lost today because opening a card is a full navigation to `scholarship.html` and back; `localStorage` survives navigation and browser reopen (FR-025/FR-026) with the least intrusive change. The existing signed-in `search_history` is a separate concern (recent-searches dropdown) and is left as-is.
- **Alternatives considered**: Encode filters in the URL/hash and use the History API — more invasive across both pages, rejected. Store in `search_history` only — signed-in only and not a full snapshot, rejected.

## R8 — Removing "For9a" / "فرصة"

- **Decision**: Scrub at **build time**: extend `build_catalogue.ps1` and `build_details.ps1` to remove the visible brand tokens "For9a" (any case) and "فرصة" from titles, orgs, and rendered section text, fixing surrounding punctuation/RTL, then **regenerate** `scholarships.js` and `details/*.js`. Add a light runtime sanitizer in `scholarship.js`'s section render as a belt-and-braces guard. Out of scope: non-visible `for9a.com` source URLs that never render as a visible word. **Verify** with a repo-wide content scan that yields zero visible occurrences across all pages and generated content (SC-009). Arabic regex in `.ps1` files saved **UTF-8 with BOM**, and `ConvertTo-Json` output escaped for non-ASCII, per [[browser-validation-setup]].
- **Rationale**: Cleaning the generated data at the source removes the word everywhere it renders, rather than patching each view; the runtime guard covers any stray content.
- **Alternatives considered**: Runtime-only string replacement on every render — slower and easy to miss spots, kept only as a secondary guard. Editing generated files by hand — not reproducible, rejected.

## Cross-cutting confirmations

- **+1 space price**: not specified by the user; set a single configurable constant (default **$99 / 9900 cents**) in `space-checkout` + `supabase-config.js` display; **owner to confirm** the amount during setup (flagged in quickstart). Booking fees ($150–$300) are always charged per ticket regardless (FR-015a).
- **Non-refundable**: the checkout/confirmation copy states purchases are final; no refund/void code path is built (clarification 2026-06-13).
- **Auth reuse**: identity, sessions, profile storage, the auth modal, and pending-action resume all reuse feature 003's `auth.js`; "Book Ticket" while signed out uses `requireAuth({ type: "route", href: <scholarship+intent> })` so the booking resumes after sign-in (FR-006).
- **`file://` degradation**: ticket UI shows the same "serve over http" guidance as the rest of the account UI when unavailable.
