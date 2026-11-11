import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2, X, Heart, RotateCw } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { supabase } from "./client";
import type { Media, Snapshot } from "./types";
import { useAction, Feedback, Person } from "./ui";
import { validatePhoto } from "./photo-input";
import { acquireUpdateBlocker } from "../pwa/safety";
import { useUpdateBlocker } from "../pwa/useUpdateBlocker";
import "./media-chat.css";

type Rpc = <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<T>;
export type SelectedPhoto = { id: string; file: File; preview: string; blob?: Blob; uploaded?: boolean };

export async function compressPhoto(file: File): Promise<Blob> {
  const format = await validatePhoto(file);
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Не удалось открыть фото за 30 секунд. Попробуйте выбрать снимок ещё раз.")), 30000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => {
        clearTimeout(timer);
        reject(Error(format === "heic"
          ? "Этот браузер не смог открыть HEIC. В «Фото» сохраните или отправьте снимок в формате JPEG; также можно выбрать «Наиболее совместимый» в настройках камеры iPhone."
          : "Не удалось прочитать фотографию. Попробуйте сохранить её из «Фото» в JPEG и выбрать снова."));
      };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw Error("У фотографии не определился размер. Выберите другой снимок.");
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Обработка фотографии недоступна. Закройте лишние вкладки и попробуйте ещё раз.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.7, 0.55]) {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("Обработка фото заняла слишком много времени. Попробуйте снимок меньшего размера.")), 20000);
        canvas.toBlob((b) => { clearTimeout(timer); b ? resolve(b) : reject(Error("Не удалось сжать фотографию. Выберите другой снимок.")); }, "image/jpeg", quality);
      });
      if (blob.type !== "image/jpeg") throw Error("Браузер не смог преобразовать фото в JPEG.");
      if (blob.size <= 3 * 1024 * 1024) return blob;
    }
    throw Error("После сжатия фото больше 3 МБ. Выберите снимок меньшего размера.");
  } finally {
    image.onload = image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
  }
}

async function invokePhoto(form: FormData) {
  if (!supabase) throw Error("Сервис фотографий не настроен");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90000);
  try {
    const { data, error } = await supabase.functions.invoke("media-upload", { body: form, signal: abort.signal });
    if (error || !data?.ok) {
      let detail = data?.error;
      if (error && "context" in error && error.context instanceof Response) {
        try { detail = (await error.context.clone().json()).error; } catch { /* Generic failure below. */ }
      }
      if (detail === "INVALID_IMAGE" || detail === "INVALID_FILE") throw Error("Сервер не смог проверить фотографию. Попробуйте другой снимок или JPEG из приложения «Фото».");
      if (detail === "UNAUTHORIZED") throw Error("Для загрузки нужно восстановить вход в приложение. Выбранное фото остаётся здесь.");
      throw Error("Фотография пока не отправлена. Проверьте интернет и повторите — второй экземпляр не создастся.");
    }
  } catch (error) {
    if (abort.signal.aborted) throw Error("Загрузка заняла больше 90 секунд. Фото и подпись сохранены на этом экране. Повторите при устойчивой связи.");
    throw error;
  } finally { clearTimeout(timer); }
}

export async function uploadPhoto(file: File, kind: Media["kind"], targetId: string | null, rpc: Rpc, stableId: string = crypto.randomUUID(), prepared?: Blob) {
  const release = acquireUpdateBlocker("photo-upload");
  try {
    const blob = prepared || await compressPhoto(file);
    await rpc("mv_prepare_media", { p_id: stableId, p_kind: kind, p_target: targetId, p_type: blob.type, p_size: blob.size });
    const form = new FormData();
    form.append("id", stableId);
    form.append("photo", blob, "photo.jpg");
    await invokePhoto(form);
    return stableId;
  } finally { release(); }
}

export async function uploadSelection(photos: SelectedPhoto[], rpc: Rpc) {
  const ids: string[] = [];
  for (const photo of photos) {
    if (!photo.blob) photo.blob = await compressPhoto(photo.file);
    if (!photo.uploaded) {
      await uploadPhoto(photo.file, "staged", null, rpc, photo.id, photo.blob);
      photo.uploaded = true;
    }
    ids.push(photo.id);
  }
  return ids;
}

export function usePhotoSelection() {
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const latest = useRef(photos);
  latest.current = photos;
  useEffect(() => () => { for (const p of latest.current) URL.revokeObjectURL(p.preview); }, []);
  useUpdateBlocker("selected-photos", photos.length > 0);
  const add = (files: File[]) => {
    const room = Math.max(0, 8 - latest.current.length);
    setPhotos((old) => [...old, ...files.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))]);
  };
  const remove = (id: string) => setPhotos((old) => {
    const photo = old.find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    return old.filter((p) => p.id !== id);
  });
  const clear = () => { for (const p of latest.current) URL.revokeObjectURL(p.preview); setPhotos([]); };
  return { photos, add, remove, clear };
}

export function PhotoPicker({ onFiles, disabled = false, label = "Добавить фото", compact = false }: { onFiles: (files: File[]) => void; disabled?: boolean; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const library = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const choose = (input: HTMLInputElement) => {
    if (input.files?.length) onFiles(Array.from(input.files));
    input.value = "";
    setOpen(false);
  };
  return <div className={"photo-picker " + (compact ? "compact" : "")}>
    <button type="button" className={compact ? "camera-button" : "wide-button"} disabled={disabled} aria-label={compact ? "Прикрепить фотографию" : label} aria-expanded={open} onClick={() => setOpen(!open)}><Camera size={21} />{!compact && label}</button>
    {open && <div className="photo-source-menu" role="group" aria-label="Откуда добавить фотографию">
      <button type="button" onClick={() => library.current?.click()}><ImagePlus size={20} />Из галереи</button>
      <button type="button" onClick={() => camera.current?.click()}><Camera size={20} />Сделать фото</button>
      <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть выбор фотографии"><X size={20} />Закрыть</button>
    </div>}
    <input hidden ref={library} aria-label="Фото из галереи" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={(e) => choose(e.currentTarget)} />
    <input hidden ref={camera} aria-label="Фото с камеры" type="file" accept="image/*" capture="environment" onChange={(e) => choose(e.currentTarget)} />
  </div>;
}

export function PhotoPreviews({ photos, remove, busy = false }: { photos: SelectedPhoto[]; remove: (id: string) => void; busy?: boolean }) {
  return <div className="selected-photos">{photos.map((p) => <div key={p.id} className="selected-photo"><img src={p.preview} alt="Предпросмотр фотографии" /><span>{p.file.name}</span><button type="button" disabled={busy} aria-label="Убрать выбранную фотографию" onClick={() => remove(p.id)}><X size={18} /></button></div>)}</div>;
}

export function mediaForTarget(snapshot: Snapshot, kind: "moment" | "message" | "session", target: string) {
  const links = snapshot.mediaLinks || [];
  return snapshot.media.filter((p) => p.ready && ((p.kind === kind && p.target_id === target) || links.some((l) => l.kind === kind && l.target_id === target && l.media_id === p.id)));
}

export function PhotoUpload({ kind, target, onDone }: { kind: Media["kind"]; target: string | null; onDone?: () => void }) {
  const f = useFamily(), a = useAction(), selection = usePhotoSelection();
  useUpdateBlocker("photo-upload-form", a.busy);
  async function upload() {
    await a.run(async () => {
      if (f.offline) throw Error("Для отправки фотографии нужен интернет. Выбранное фото остаётся на этом экране.");
      if (kind === "moment" && target) {
        const ids = await uploadSelection(selection.photos, f.rpc);
        await f.mutate("moment_attach", target, { media_ids: ids });
      } else for (const photo of selection.photos) {
        if (!photo.blob) photo.blob = await compressPhoto(photo.file);
        await uploadPhoto(photo.file, kind, target, f.rpc, photo.id, photo.blob);
      }
      await f.refresh();
      selection.clear();
      onDone?.();
    });
  }
  return <div className="photo-upload">
    <PhotoPicker disabled={a.busy || selection.photos.length >= 8} label="Добавить фото" onFiles={selection.add} />
    <PhotoPreviews photos={selection.photos} remove={selection.remove} busy={a.busy} />
    {selection.photos.length > 0 && <button type="button" className="primary" disabled={a.busy || f.offline} onClick={() => void upload()}>{a.busy ? "Сжимаем и отправляем…" : "Добавить фотографии"}</button>}
    <small>До 8 фото за раз. Сжимаем снимки и удаляем геометки перед отправкой.</small>
    <Feedback text={a.feedback} />
  </div>;
}

export function SaveToMoments({ media, projectId, sessionId, caption = "" }: { media: Media[]; projectId?: string; sessionId?: string; caption?: string }) {
  const f = useFamily(), a = useAction();
  const id = useRef(crypto.randomUUID());
  const already = media.length > 0 && media.every((p) => f.snapshot.mediaLinks?.some((l) => l.media_id === p.id && l.kind === "moment"));
  const [saved, setSaved] = useState(false);
  if (!media.length) return null;
  return <div className="save-memory">
    <button className="text-button" type="button" disabled={a.busy || f.offline || saved || already} onClick={() => void a.run(async () => {
      await f.mutate("moment", id.current, { caption, project_id: projectId || null, session_id: sessionId || null, moment_date: new Date().toLocaleDateString("en-CA"), media_ids: media.map((p) => p.id) });
      setSaved(true);
    })}><Heart size={17} />{saved || already ? "Сохранено в наших моментах ❤️" : a.busy ? "Сохраняем…" : "Сохранить в наши моменты ❤️"}</button>
    <Feedback text={a.feedback} />
  </div>;
}

export function PrivatePhoto({ media }: { media: Media }) {
  const f = useFamily(), a = useAction();
  const [url, setUrl] = useState(""), [full, setFull] = useState(false), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, object = "";
    setFailed(false);
    setUrl("");
    if (!supabase) return;
    void supabase.storage.from("marvel-private").download(media.object_path).then(({ data, error }) => {
      if (error || !data) { if (active) setFailed(true); return; }
      object = URL.createObjectURL(data);
      if (active) setUrl(object); else URL.revokeObjectURL(object);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (object) URL.revokeObjectURL(object); };
  }, [media.object_path, media.ready, f.user?.id, retry]);
  useEffect(() => {
    const online = () => { if (failed) setRetry((v) => v + 1); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [failed]);
  async function remove() {
    const linked = (f.snapshot.mediaLinks || []).filter((l) => l.media_id === media.id).length > 1;
    if (!confirm(linked ? "Удалить вашу фотографию из переписки и всех связанных воспоминаний?" : "Удалить вашу фотографию?")) return;
    await a.run(async () => {
      const { data, error } = await supabase!.functions.invoke("media-upload", { body: { action: "delete", id: media.id } });
      if (error || !data?.ok) throw Error("Не удалось удалить фотографию. Попробуйте при устойчивой связи.");
      await f.refresh();
    });
  }
  return <div className="private-photo">
    {url ? <button className="photo-open" onClick={() => setFull(true)} aria-label="Открыть фото на весь экран"><img src={url} alt="Наш личный киновечер" loading="lazy" /></button> : <div className="photo-placeholder">{failed ? <><span>Не удалось загрузить фото</span><button type="button" className="text-button" onClick={() => setRetry((v) => v + 1)}><RotateCw size={16} />Повторить</button></> : "Открываем воспоминание…"}</div>}
    <div className="photo-author"><Person id={media.author_id} /></div>
    {media.author_id === f.user?.id && <button className="photo-remove" aria-label="Удалить мою фотографию" disabled={a.busy} onClick={() => void remove()}><Trash2 size={18} /></button>}
    <Feedback text={a.feedback} />
    {full && <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Наша фотография"><button aria-label="Закрыть фотографию" onClick={() => setFull(false)}><X size={26} /></button><img src={url} alt="Наш личный киновечер" /><a href={url} download={"our-moment-" + media.id + ".jpg"}>Сохранить фотографию</a></div>}
  </div>;
}
