import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { cors, json } from "../_shared/http.ts";
const url = Deno.env.get("SUPABASE_URL")!,
  serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
import { sanitizeJPEG, readLimited } from "../_shared/image.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: cors(req) });
  if (req.method !== "POST")
    return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  const token = req.headers.get("Authorization");
  if (!token?.startsWith("Bearer "))
    return json(req, { error: "UNAUTHORIZED" }, 401);
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return json(req, { error: "UNAUTHORIZED" }, 401);
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = JSON.parse(
        new TextDecoder().decode(await readLimited(req, 4096)),
      );
      if (!["delete", "delete-all"].includes(body.action))
        return json(req, { error: "INVALID_ACTION" }, 400);
      if (body.action === "delete-all" && body.confirm !== "УДАЛИТЬ МОИ ДАННЫЕ")
        return json(req, { error: "CONFIRMATION_REQUIRED" }, 400);
      let query = admin.from("mv_media").select("*").eq("author_id", user.id);
      if (body.action === "delete") query = query.eq("id", body.id);
      const { data: rows, error } = await query;
      if (error) throw error;
      for (const row of rows || []) {
        const { error: remove } = await admin.storage
          .from("marvel-private")
          .remove([row.object_path]);
        if (remove) throw remove;
        const { error: deletion } = await admin
          .from("mv_media")
          .delete()
          .eq("id", row.id)
          .eq("author_id", user.id);
        if (deletion) throw deletion;
      }
      return json(req, { ok: true });
    }
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 3300000) return json(req, { error: "TOO_LARGE" }, 413);
    const { data: member } = await userClient
      .from("mv_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return json(req, { error: "FORBIDDEN" }, 403);
    const raw = await readLimited(req, 3300000);
    const form = await new Response(raw, {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData(),
      id = String(form.get("id") || ""),
      file = form.get("photo");
    if (!(file instanceof File) || file.size > 3145728 || file.size < 32)
      return json(req, { error: "INVALID_FILE" }, 400);
    const { data: media, error } = await userClient
      .from("mv_media")
      .select("*")
      .eq("id", id)
      .eq("author_id", user.id)
      .single();
    if (error || !media || media.ready)
      return json(req, { error: "FORBIDDEN" }, 403);
    // The app always re-encodes to JPEG. Disallow other formats here rather than
    // accepting MIME declarations or unstripped PNG/WebP metadata from a client.
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (
      file.type !== "image/jpeg" ||
      media.content_type !== "image/jpeg" ||
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      media.byte_size !== file.size
    )
      return json(req, { error: "INVALID_IMAGE" }, 400);
    const clean = sanitizeJPEG(bytes);
    const { error: upload } = await admin.storage
      .from("marvel-private")
      .upload(media.object_path, clean, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "0",
      });
    if (upload) throw upload;
    const { error: finalize } = await admin.rpc("mv_finalize_media", {
      p_id: id,
      p_size: clean.size,
    });
    if (finalize) {
      await admin.storage.from("marvel-private").remove([media.object_path]);
      throw finalize;
    }
    return json(req, { ok: true });
  } catch (error) {
    console.error(
      "media operation failed",
      error instanceof Error ? error.message : "error",
    );
    return json(req, { error: "MEDIA_OPERATION_FAILED" }, 400);
  }
});
