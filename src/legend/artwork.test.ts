import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import registry from "./registry.json";
import artwork from "./artwork.json";
import manifest from "../../docs/v2.5.1/artwork-manifest.json";
function dimensions(b: Buffer) {
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8 ")
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw Error("Unexpected WebP encoding: " + chunk);
}
it("maps all 82 unchanged achievement definitions to individual original artwork", () => {
  expect(registry).toHaveLength(82);
  expect(Object.keys(artwork).sort()).toEqual(registry.map((a) => a.id).sort());
  expect(manifest).toHaveLength(82);
  const concepts = new Set<string>();
  for (const a of registry) {
    const m = manifest.find((m) => m.id === a.id)!;
    for (const [key, value] of Object.entries(a).filter(
      ([key]) => !["description", "howTo", "displayTier"].includes(key),
    ))
      expect(m[key as keyof typeof m]).toEqual(value);
    concepts.add(m.concept);
    expect(artwork[a.id as keyof typeof artwork]).toEqual({
      full: `trophies-v251/${a.id}.webp`,
      thumbnail: `trophies-v251/thumbs/${a.id}.webp`,
    });
  }
  expect(concepts.size).toBe(82);
});
it("ships square Retina assets, unique full images and thumbnails within a bounded offline budget", () => {
  const fullHashes = new Set<string>(),
    thumbHashes = new Set<string>();
  let bytes = 0;
  for (const [id, art] of Object.entries(artwork)) {
    for (const [kind, path] of Object.entries(art)) {
      const b = readFileSync("public/" + path);
      bytes += b.length;
      expect(b.toString("ascii", 0, 4)).toBe("RIFF");
      expect(b.toString("ascii", 8, 12)).toBe("WEBP");
      expect(dimensions(b)).toEqual(kind === "full" ? [512, 512] : [320, 320]);
      expect(b.length).toBeLessThan(kind === "full" ? 90000 : 40000);
      (kind === "full" ? fullHashes : thumbHashes).add(
        createHash("sha256").update(b).digest("hex"),
      );
      if (kind === "full")
        expect(createHash("sha256").update(b).digest("hex")).toBe(
          manifest.find((a) => a.id === id)!.sha256,
        );
    }
  }
  expect(fullHashes.size).toBe(82);
  expect(thumbHashes.size).toBe(82);
  expect(bytes).toBeLessThan(8 * 1024 * 1024);
  expect(
    readdirSync("public/trophies-v251").filter((p) => p.endsWith(".webp")),
  ).toHaveLength(82);
});
