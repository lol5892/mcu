import { expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { catalog } from "./model";
it("ships 81 distinct local illustrated WebP covers within the offline artwork budget", () => {
  expect(catalog).toHaveLength(81);
  const hashes = new Set<string>();
  let bytes = 0;
  for (const p of catalog) {
    expect(p.poster).toBe(`covers-v25/${p.id}.webp`);
    const data = readFileSync("public/" + p.poster);
    expect(data.toString("ascii", 0, 4)).toBe("RIFF");
    expect(data.toString("ascii", 8, 12)).toBe("WEBP");
    expect(statSync("public/" + p.poster).size).toBeLessThan(300000);
    bytes += data.length;
    hashes.add(createHash("sha256").update(data).digest("hex"));
  }
  expect(hashes.size).toBe(81);
  expect(bytes).toBeLessThan(12 * 1024 * 1024);
});
