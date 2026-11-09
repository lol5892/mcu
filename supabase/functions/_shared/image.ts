import { decode, encode } from "npm:jpeg-js@0.4.4";
export function sanitizeJPEG(bytes: Uint8Array): Blob {
  if (
    bytes.length < 32 ||
    bytes.length > 3145728 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw Error("INVALID_JPEG");
  // Decode with hard resource limits, then encode only pixels. No original EXIF,
  // XMP, IPTC, comments, thumbnails or GPS data survive server-side encoding.
  const image = decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    maxResolutionInMP: 4,
    maxMemoryUsageInMB: 64,
  });
  if (
    !image.width ||
    !image.height ||
    image.width > 2000 ||
    image.height > 2000
  )
    throw Error("IMAGE_DIMENSIONS_TOO_LARGE");
  const clean = encode(
    { width: image.width, height: image.height, data: image.data },
    85,
  );
  if (clean.data.byteLength > 3145728) throw Error("IMAGE_TOO_LARGE");
  return new Blob([Uint8Array.from(clean.data).buffer], { type: "image/jpeg" });
}
export async function readLimited(req: Request, max: number) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("EMPTY_BODY");
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw Error("BODY_TOO_LARGE");
    }
    parts.push(value);
  }
  const result = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    result.set(p, at);
    at += p.length;
  }
  return result;
}
