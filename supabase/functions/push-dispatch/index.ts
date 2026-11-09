import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import webpush from "npm:web-push@3.6.7";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
async function sameSecret(a: string, b: string) {
  const hash = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const { data: settings, error: settingsError } = await db.rpc("mv_delivery_settings");
  if (settingsError) return new Response("Configuration unavailable", { status: 503 });
  const expected = Deno.env.get("CRON_SECRET") || settings?.mv_cron_secret;
  if (
    !expected ||
    !(await sameSecret(
      req.headers.get("Authorization") || "",
      "Bearer " + expected,
    ))
  )
    return new Response("Unauthorized", { status: 401 });
  const tick = await db.rpc("mv_tick");
  if (tick.error) {
    console.error("scheduler failed", tick.error.code);
    return new Response("Scheduler failed", { status: 500 });
  }
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || settings?.mv_vapid_public_key,
    privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || settings?.mv_vapid_private_key,
    subject = Deno.env.get("VAPID_SUBJECT") || settings?.mv_vapid_subject;
  if (!publicKey || !privateKey || !subject)
    return Response.json(
      { scheduled: true, push: "not configured" },
      { status: 503 },
    );
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const { data: jobs, error } = await db.rpc("mv_claim_push", { p_limit: 30 });
  if (error) return new Response("Queue failed", { status: 500 });
  let accepted = 0;
  for (const job of jobs || []) {
    let ok = false,
      gone = false,
      errorCode = "";
    try {
      // Defense in depth: destination allowlist also lives in the database.
      const endpoint = new URL(job.subscription.endpoint);
      if (
        endpoint.protocol !== "https:" ||
        (endpoint.port && !["443", ""].includes(endpoint.port)) ||
        !/(^|\.)(push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com)$/.test(
          endpoint.hostname,
        )
      )
        throw Error("INVALID_ENDPOINT");
      await webpush.sendNotification(
        job.subscription,
        JSON.stringify({
          id: job.notification_id,
          title: job.title,
          route: job.route,
        }),
        { TTL: 3600, urgency: "normal", timeout: 10000 },
      );
      ok = true;
      accepted++;
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      gone = code === 404 || code === 410;
      errorCode = code ? String(code) : "TRANSPORT_ERROR";
    }
    await db.rpc("mv_ack_push", {
      p_job: job.job_id,
      p_attempt: job.attempt,
      p_ok: ok,
      p_gone: gone,
      p_error: errorCode || null,
    });
  }
  return Response.json({ processed: jobs?.length || 0, accepted });
});
