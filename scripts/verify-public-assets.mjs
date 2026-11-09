import { readdir, readFile } from "node:fs/promises";
const files = await readdir("dist/assets");
for (const name of files) {
  const text = await readFile("dist/assets/" + name, "utf8");
  if (
    /sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----|VAPID_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(
      text,
    )
  )
    throw Error("Server secret marker in public bundle");
  for (const match of text.matchAll(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      const claims = JSON.parse(
        Buffer.from(match[0].split(".")[1], "base64url").toString(),
      );
      if (claims.role === "service_role")
        throw Error("Service-role JWT found in bundle");
    } catch (e) {
      if (e.message.includes("Service-role")) throw e;
    }
  }
}
console.log("No server-secret markers or service-role JWTs in public assets.");
