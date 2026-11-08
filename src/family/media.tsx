import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { supabase } from "./client";
import type { Media } from "./types";
import { useAction, Feedback } from "./ui";
export async function compressPhoto(file: File): Promise<Blob> {
  if (file.size > 25 * 1024 * 1024)
    throw Error("Фото больше 25 МБ. Выберите снимок меньшего размера.");
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))
    throw Error(
      "Поддерживаются JPEG, PNG, WebP и фотографии HEIC, читаемые вашим iPhone.",
    );
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(Error("Не удалось прочитать фото. Экспортируйте его в JPEG."));
      image.src = url;
    });
    const scale = Math.min(
      1,
      1800 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Обработка фото недоступна");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("Не удалось сжать фото"))),
        "image/jpeg",
        0.82,
      ),
    );
    if (blob.size > 3 * 1024 * 1024)
      throw Error("После сжатия фото больше 3 МБ.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function uploadPhoto(
  file: File,
  kind: Media["kind"],
  targetId: string | null,
  rpc: <T = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<T>,
) {
  if (!supabase) throw Error("Сервис фотографий не настроен");
  const blob = await compressPhoto(file);
  const id = crypto.randomUUID();
  await rpc("mv_prepare_media", {
    p_id: id,
    p_kind: kind,
    p_target: targetId,
    p_type: blob.type,
    p_size: blob.size,
  });
  const form = new FormData();
  form.append("id", id);
  form.append("photo", blob, "photo.jpg");
  const { data, error } = await supabase.functions.invoke("media-upload", {
    body: form,
  });
  if (error || !data?.ok)
    throw error || Error("Сервер не подтвердил загрузку фотографии.");
  return id;
}
export function PhotoUpload({
  kind,
  target,
  onDone,
}: {
  kind: Media["kind"];
  target: string | null;
  onDone?: () => void;
}) {
  const f = useFamily(),
    a = useAction();
  const library = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  async function upload(file?: File) {
    if (!file) return;
    await a.run(async () => {
      if (f.offline) throw Error("Для отправки фотографии нужен интернет.");
      await uploadPhoto(file, kind, target, f.rpc);
      await f.refresh();
      onDone?.();
    });
    if (library.current) library.current.value = "";
    if (camera.current) camera.current.value = "";
  }
  return (
    <div className="photo-upload">
      <button
        className="wide-button"
        disabled={a.busy || f.offline}
        onClick={() => library.current?.click()}
      >
        <ImagePlus size={17} />
        {a.busy ? "Сжимаем и отправляем…" : "Выбрать фото"}
      </button>
      <button
        className="camera-button"
        disabled={a.busy || f.offline}
        aria-label="Снять фотографию"
        onClick={() => camera.current?.click()}
      >
        <Camera size={21} />
      </button>
      <input
        hidden
        ref={library}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <input
        hidden
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <small>
        Сжимаем перед отправкой и удаляем геометки. Хранилище приватное.
      </small>
      <Feedback text={a.feedback} />
    </div>
  );
}
export function PrivatePhoto({ media }: { media: Media }) {
  const f = useFamily(),
    a = useAction();
  const [url, setUrl] = useState(""),
    [full, setFull] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let object = "";
    setFailed(false);
    if (!supabase) return;
    void supabase.storage
      .from("marvel-private")
      .download(media.object_path)
      .then(({ data, error }) => {
        if (error || !data) {
          if (active) setFailed(true);
          return;
        }
        object = URL.createObjectURL(data);
        if (active) setUrl(object);
        else URL.revokeObjectURL(object);
      });
    return () => {
      active = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [media.object_path]);
  async function remove() {
    if (!confirm("Удалить вашу фотографию?")) return;
    await a.run(async () => {
      const { data, error } = await supabase!.functions.invoke("media-upload", {
        body: { action: "delete", id: media.id },
      });
      if (error || !data?.ok)
        throw error || Error("Не удалось удалить фотографию");
      await f.refresh();
    });
  }
  return (
    <div className="private-photo">
      {url ? (
        <button
          className="photo-open"
          onClick={() => setFull(true)}
          aria-label="Открыть фото на весь экран"
        >
          <img src={url} alt="Наш личный киновечер" />
        </button>
      ) : (
        <div className="photo-placeholder">
          {failed
            ? "Фото доступно после подключения к интернету"
            : "Открываем воспоминание…"}
        </div>
      )}
      {media.author_id === f.user?.id && (
        <button
          className="photo-remove"
          aria-label="Удалить мою фотографию"
          disabled={a.busy}
          onClick={() => void remove()}
        >
          <Trash2 size={15} />
        </button>
      )}
      <Feedback text={a.feedback} />
      {full && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Наша фотография"
        >
          <button
            aria-label="Закрыть фотографию"
            onClick={() => setFull(false)}
          >
            <X size={26} />
          </button>
          <img src={url} alt="Наш личный киновечер" />
          <a href={url} download={"our-moment-" + media.id + ".jpg"}>
            Сохранить фотографию
          </a>
        </div>
      )}
    </div>
  );
}
