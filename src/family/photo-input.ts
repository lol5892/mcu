export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

// A missing/incorrect MIME label is common in iPhone sharing. Inspect bytes;
// the server independently validates the re-encoded JPEG before accepting it.
export function photoFormat(bytes: Uint8Array): "jpeg" | "png" | "webp" | "heic" | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return "png";
  const text = new TextDecoder().decode(bytes.slice(0, 32));
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "webp";
  if (text.slice(4, 8) === "ftyp" && /heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8))) return "heic";
  return null;
}

export async function validatePhoto(file: File) {
  if (!file.size) throw Error("Этот файл пустой. Выберите другую фотографию.");
  if (file.size > MAX_PHOTO_BYTES) throw Error("Фото больше 25 МБ. Выберите снимок меньшего размера.");
  const format = photoFormat(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
  if (!format) throw Error("Выберите фотографию JPEG, PNG, WebP или HEIC. Этот формат не поддерживается.");
  return format;
}
