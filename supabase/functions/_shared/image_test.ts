import { strict as assert } from "node:assert";
import { encode, decode } from "npm:jpeg-js@0.4.4";
import { sanitizeJPEG, readLimited } from "./image.ts";
Deno.test(
  "server re-encodes image and removes injected GPS/EXIF metadata",
  async () => {
    const source = encode(
      { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(200) },
      80,
    ).data;
    const metadata = new TextEncoder().encode(
      "Exif\u0000\u0000GPS PRIVATE LOCATION",
    );
    const segment = new Uint8Array(metadata.length + 4);
    segment.set([
      255,
      225,
      (metadata.length + 2) >> 8,
      (metadata.length + 2) & 255,
    ]);
    segment.set(metadata, 4);
    const input = new Uint8Array(source.length + segment.length);
    input.set(source.slice(0, 2));
    input.set(segment, 2);
    input.set(source.slice(2), 2 + segment.length);
    const clean = new Uint8Array(await sanitizeJPEG(input).arrayBuffer());
    assert.equal(
      new TextDecoder().decode(clean).includes("PRIVATE LOCATION"),
      false,
    );
    assert.equal(decode(clean).width, 4);
  },
);
Deno.test("invalid image format is rejected on the server", () => {
  assert.throws(() =>
    sanitizeJPEG(
      new TextEncoder().encode("<html>this is not a photograph</html>"),
    ),
  );
});
Deno.test(
  "request size limit works without trusting Content-Length",
  async () => {
    const req = new Request("https://test.invalid", {
      method: "POST",
      body: new Uint8Array(100),
    });
    await assert.rejects(() => readLimited(req, 50), /BODY_TOO_LARGE/);
  },
);
