import fs from "node:fs";
import { spawnSync } from "node:child_process";
const config = Object.fromEntries(
  fs
    .readFileSync(".github/beta-public.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
if (config.VITE_BETA_AUTH_READY !== "false")
  throw Error(
    "Technical staging must keep registration closed until mail, privacy and rights gates are reviewed",
  );
const env = { ...process.env, ...config };
for (const args of [
  ["scripts/verify-beta.mjs"],
  ["node_modules/typescript/bin/tsc", "-b"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-sw.mjs"],
  ["scripts/verify-public-assets.mjs"],
]) {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", env });
  if (r.status) process.exit(r.status);
}
