// Supabase client configuration for the Beacon site.
// The publishable key is designed to be public (RLS is the security boundary);
// the secret/service_role key must NEVER appear in this repo.
window.SUPABASE_URL = "https://lnflmycqaxdfmtmdmhvx.supabase.co";
window.SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_tRs9a6i7dzQOIv_Xum16Eg_0XY19zj8";

// ---- feature 004 (ticket booking) ----------------------------------------
// Edge Functions base for ticket-checkout / space-checkout. The browser only
// ever calls our functions and redirects to the Stripe Checkout URL they
// return — no Stripe.js and no Stripe publishable key are needed client-side.
window.FUNCTIONS_BASE = window.SUPABASE_URL + "/functions/v1";
// Display-only price for the "+1 ticket space" add-on; the server is
// authoritative (space-checkout uses SPACE_PRICE_CENTS env, default 9900).
window.SPACE_PRICE_CENTS = 1000;
