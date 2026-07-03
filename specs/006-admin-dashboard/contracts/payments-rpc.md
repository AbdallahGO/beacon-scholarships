# Contract: Payments — Admin RPCs & Read Surface

How `admin.js` (Payments pane) and the public checkout talk to Supabase for **provider config, monitoring, and the enabled-provider list**. Money movement is NOT here — see [payment-functions.md](./payment-functions.md). All client calls use `BeaconAuth.client` (supabase-js v2).

## Authorization model

- **Admin config/monitoring**: provider toggles/config are `SECURITY DEFINER` RPCs that self-guard on `admins` and raise `not authorized`; the ledger and all-providers reads are behind `admin select all` RLS. A non-admin calling them gets `not authorized` / empty (SC-014).
- **Public checkout read**: anyone (anon/authenticated) may read **enabled** providers only, via the `providers public read enabled` RLS policy — non-secret columns only.

## RPC: provider management (admin)

### `admin_set_provider_enabled(p_provider, p_enabled) → boolean`
- **Use**: US7 toggle a provider on/off (FR-029).
- **Call**: `client.rpc('admin_set_provider_enabled', { p_provider, p_enabled })`.
- **Errors**: `not authorized` (non-admin), `unknown_provider`.
- **Effect**: sets `payment_providers.enabled` + `updated_at`. Takes effect for new checkouts immediately (SC-011).

### `admin_set_provider_config(p_provider, p_display_name, p_currency, p_fx_rate) → boolean`
- **Use**: US7 edit non-secret config (FR-030).
- **Call**: `client.rpc('admin_set_provider_config', { p_provider, p_display_name, p_currency, p_fx_rate })`.
- **Errors**: `not authorized`, `unknown_provider`, `bad_fx_rate` (`fx_rate <= 0`).
- **Effect**: updates display name / currency / fx_rate. **Never** accepts or stores a secret key (FR-031).

### `admin_payments_overview() → json`
- **Use**: US8 per-provider totals (FR-034) + Overview "payments received" (FR-038).
- **Call**: `client.rpc('admin_payments_overview')`.
- **Returns**: `{ total_received_cents, by_provider: [ { provider, paid_count, paid_cents } … ] }` (amounts summed within each provider's currency; UI labels currency per row).
- **Errors**: `not authorized`.

## Reads (RLS-guarded selects)

| View | Query | Policy relied on |
|------|-------|------------------|
| Enabled providers for checkout (US6) | `client.from('payment_providers').select('provider,display_name,currency,fx_rate,sort_order').eq('enabled',true).order('sort_order')` | `providers public read enabled` |
| All providers (admin config) (US7) | `client.from('payment_providers').select('*').order('sort_order')` | `providers admin read all` |
| Payments ledger (US8, FR-033) | `client.from('payments').select('*').order('created_at',{ascending:false})` | `payments → admin select all` |
| Per-user payments (Accounts pane, optional) | `client.from('payments').select('*').eq('user_id', uid).order('created_at',{ascending:false})` | `payments → admin select all` |

## Error-to-message mapping (client)

| Server error | Admin/user-facing message |
|--------------|---------------------------|
| `not authorized` | "You don't have admin access." → fall back to the "not authorized" state |
| `unknown_provider` | "Unknown payment provider." |
| `bad_fx_rate` | "Conversion rate must be greater than 0." |
| network/other | "Something went wrong — please try again." |

## Behavioral guarantees

- **Read-only monitoring** (FR-035): the Payments ledger view exposes **no** refund/cancel/edit action.
- **Enabled-only at checkout** (FR-020): the checkout reads only `enabled=true` rows; a disabled provider never appears.
- **No secrets on the client**: `payment_providers` carries no key column; the public read returns non-secret columns only (FR-031/SC-013).
