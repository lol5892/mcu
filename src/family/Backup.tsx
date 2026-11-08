import { useRef, useState } from "react";
import { Download, Upload, Trash2 } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback } from "./ui";
import { downloadJSON, MigrationWizard } from "./MigrationWizard";
import { supabase } from "./client";
import { validateBackup } from "../model";
import type { Letter, Message, Rating } from "./types";
type FamilyBackup = {
  app: "our-marvel-family";
  version: 2;
  userId: string;
  familyId: string;
  letters: Letter[];
  messages: Message[];
  ratings: Rating[];
};
export function validateFamilyBackup(value: unknown): FamilyBackup {
  if (!value || typeof value !== "object") throw Error("Неверный формат");
  const v = value as FamilyBackup;
  if (
    v.app !== "our-marvel-family" ||
    v.version !== 2 ||
    typeof v.userId !== "string" ||
    typeof v.familyId !== "string" ||
    ![v.letters, v.messages, v.ratings].every(Array.isArray)
  )
    throw Error("Неподдерживаемая резервная копия");
  for (const l of v.letters)
    if (
      typeof l.title !== "string" ||
      l.title.length > 120 ||
      typeof l.body !== "string" ||
      l.body.length > 20000 ||
      !["romantic", "cosmic", "minimal", "surprise"].includes(l.style)
    )
      throw Error("Повреждено письмо");
  for (const m of v.messages)
    if (typeof m.body !== "string" || m.body.length > 4000)
      throw Error("Повреждено сообщение");
  for (const r of v.ratings)
    if (
      r.score !== null &&
      (!Number.isInteger(r.score) || r.score < 1 || r.score > 10)
    )
      throw Error("Некорректная оценка");
  return v;
}
export function FamilyBackupPanel() {
  const f = useFamily(),
    a = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<FamilyBackup | null>(null),
    [deleting, setDeleting] = useState(false),
    [confirmText, setConfirmText] = useState("");
  async function exportAll() {
    await a.run(async () => {
      const data = await f.rpc("mv_export");
      downloadJSON(
        data,
        "our-marvel-family-" + new Date().toISOString().slice(0, 10) + ".json",
      );
      a.setFeedback(
        "JSON сохранён без токенов авторизации и push-ключей. Снимки скачиваются отдельно из полноэкранного просмотра фотографий.",
      );
    });
  }
  async function restore() {
    if (!pending) return;
    await a.run(async () => {
      if (pending.userId !== f.user?.id || pending.familyId !== f.familyId)
        throw Error(
          "Эта копия другого аккаунта или семьи. Чужое авторство не переносится.",
        );
      let restored = 0;
      for (const l of pending.letters.filter(
        (l) =>
          l.author_id === f.user!.id &&
          !f.snapshot.letters.some((x) => x.id === l.id),
      )) {
        await f.mutate("letter", l.id, {
          title: l.title,
          body: l.body,
          style: l.style,
          status: "draft",
        });
        restored++;
      }
      for (const r of pending.ratings.filter(
        (r) =>
          r.user_id === f.user!.id &&
          !f.snapshot.ratings.some(
            (x) =>
              x.user_id === r.user_id &&
              x.project_id === r.project_id &&
              x.season === r.season,
          ),
      )) {
        await f.mutate("rating", r.project_id, {
          season: r.season,
          score: r.score,
          favorite: r.favorite,
        });
        restored++;
      }
      setPending(null);
      a.setFeedback(
        `Восстановлено записей: ${restored}. Письма восстановлены только вашими черновиками, без повторной отправки. Чаты, общие события и фото не перезаписывались; JSON сохраняет их архив.`,
      );
    });
  }
  return (
    <div className="backup-panels">
      <MigrationWizard />
      <section className="panel">
        <h2>Резервная копия нашей вселенной</h2>
        <p>
          Экспорт включает доступные вам оценки, прогресс, сообщения, письма,
          события, сеансы и метаданные фото. Приватные черновики партнёра не
          экспортируются.
        </p>
        <button
          className="wide-button"
          disabled={a.busy || f.offline}
          onClick={() => void exportAll()}
        >
          <Download size={17} />
          Экспорт семейных данных JSON
        </button>
        <button
          className="wide-button"
          disabled={a.busy || f.offline}
          onClick={() => input.current?.click()}
        >
          <Upload size={17} />
          Проверить и восстановить копию
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void a.run(async () => {
                if (file.size > 25_000_000) throw Error("Файл больше 25 МБ");
                const value = JSON.parse(await file.text());
                if (value.app === "our-marvel") {
                  validateBackup(value);
                  throw Error(
                    "Это копия первой версии. Используйте мастер переноса выше.",
                  );
                }
                setPending(validateFamilyBackup(value));
              });
            e.target.value = "";
          }}
        />
        {pending && (
          <div className="import-confirmation">
            <h3>Подтвердить восстановление?</h3>
            <p>
              В копии {pending.letters.length} писем и {pending.ratings.length}{" "}
              оценок. Восстановятся только отсутствующие ваши оценки и ваши
              письма как черновики. Существующие записи, отправленные сообщения,
              события и фото не заменяются.
            </p>
            <button
              className="primary"
              disabled={a.busy}
              onClick={() => void restore()}
            >
              Подтверждаю восстановление
            </button>
            <button className="text-button" onClick={() => setPending(null)}>
              Отмена
            </button>
          </div>
        )}
        <p className="muted">
          Для полного восстановления базы администратором используйте резервное
          копирование Supabase. Пользовательский JSON — переносимый архив и
          безопасное восстановление собственных оценок/черновиков, а не
          автоматическая перезапись семейной базы.
        </p>
      </section>
      <section className="panel danger-panel">
        <h2>Удаление моих облачных данных</h2>
        <p>
          Удалятся ваши фото, письма, сообщения, оценки и моменты. Ваши события
          будут отменены. Общий прогресс и данные партнёра сохранятся. Аккаунт
          для входа и членство останутся.
        </p>
        {!deleting ? (
          <button className="danger-button" onClick={() => setDeleting(true)}>
            <Trash2 size={15} />
            Удалить мои данные
          </button>
        ) : (
          <div className="family-form">
            <p>Сначала экспортируйте копию. Введите УДАЛИТЬ МОИ ДАННЫЕ.</p>
            <input
              aria-label="Подтверждение удаления облачных данных"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            <button
              className="danger-button"
              disabled={
                confirmText !== "УДАЛИТЬ МОИ ДАННЫЕ" || a.busy || f.offline
              }
              onClick={() =>
                void a.run(async () => {
                  if (f.operations.length)
                    throw Error("Сначала разрешите очередь синхронизации.");
                  const { data, error } = await supabase!.functions.invoke(
                    "media-upload",
                    { body: { action: "delete-all", confirm: confirmText } },
                  );
                  if (error || !data?.ok)
                    throw (
                      error || Error("Сервер не подтвердил удаление фотографий")
                    );
                  await f.rpc("mv_delete_my_content", {
                    p_confirm: confirmText,
                  });
                  await f.refresh();
                  setDeleting(false);
                  setConfirmText("");
                  a.setFeedback(
                    "Ваши облачные данные удалены. Локальная база первой версии не затронута.",
                  );
                })
              }
            >
              Подтвердить удаление
            </button>
            <button className="text-button" onClick={() => setDeleting(false)}>
              Отмена
            </button>
          </div>
        )}
      </section>
      <Feedback text={a.feedback} />
    </div>
  );
}
