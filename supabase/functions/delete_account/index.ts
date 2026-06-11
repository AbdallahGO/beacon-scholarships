// delete_account Edge Function (specs/003-user-auth-profiles, contract F9 / task T042a).
// Verifies the caller's JWT, then deletes their auth user via the Admin API.
// The service role key exists ONLY here (server-side) — never in the browser.
//
// Deploy (dashboard → Edge Functions → New function → paste this), or with the CLI:
//   supabase functions deploy delete_account
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2.108.1";

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // resolve the caller from their own JWT (anon client + token)
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: userErr } = await anon.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;

    // admin client: remove remaining storage objects, then the auth user
    // (row data cascades via the FK constraints)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    for (const folder of ["photo", "certificates"]) {
      const { data: files } = await admin.storage.from("user-files").list(`${uid}/${folder}`, { limit: 1000 });
      if (files?.length) {
        await admin.storage.from("user-files").remove(files.map((f) => `${uid}/${folder}/${f.name}`));
      }
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Deletion failed" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
