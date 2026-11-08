import { useState } from "react";
import { Download, ShieldCheck, ArrowRight } from "lucide-react";
import { readRecords, backup } from "../db";
import { validateBackup, type Records } from "../model";
import { useFamily } from "./FamilyProvider";
import { errorText } from "./client";
export function downloadJSON(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function MigrationWizard() {
  const f = useFamily();
  const [local, setLocal] = useState<Records | null>(null),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [exported, setExported] = useState(false);
  const pending = f.snapshot.legacy.filter((r) => !r.claimed_by);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel migration-panel">
      <ShieldCheck className="gold" />
      <h2>Сохраним нашу историю</h2>
      <p>
        Перенос из первой версии не удаляет IndexedDB и не перезаписывает более
        новые облачные записи. Каждый подтверждает свои старые оценки отдельно.
      </p>
      {f.role === "anton" && (
        <>
          {step === 0 ? (
            <button
              className="wide-button"
              onClick={() =>
                void run(async () => {
                  setLocal(await readRecords());
                  setStep(1);
                })
              }
            >
              Найти локальные записи
              <ArrowRight size={17} />
            </button>
          ) : (
            <>
              <div className="migration-counts">
                <span>
                  <b>{Object.keys(local || {}).length}</b>проектов
                </span>
                <span>
                  <b>
                    {Object.values(local || {}).filter((r) => r.watched).length}
                  </b>
                  отметок
                </span>
                <span>
                  <b>
                    {Object.values(local || {}).reduce(
                      (n, r) =>
                        n + Number(r.anton !== null) + Number(r.tanya !== null),
                      0,
                    )}
                  </b>
                  оценок
                </span>
              </div>
              <button
                className="wide-button"
                onClick={() => {
                  downloadJSON(
                    backup(local || {}),
                    "our-marvel-before-migration.json",
                  );
                  setExported(true);
                }}
              >
                <Download size={17} />
                Сохранить резервную копию
              </button>
              <label className="file-label">
                Или выбрать JSON первой версии
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void run(async () => {
                        if (file.size > 5_000_000)
                          throw Error("Файл слишком большой");
                        setLocal(validateBackup(JSON.parse(await file.text())));
                        setExported(false);
                      });
                  }}
                />
              </label>
              <button
                className="primary"
                disabled={
                  busy ||
                  !exported ||
                  !Object.keys(local || {}).length ||
                  f.offline
                }
                onClick={() =>
                  void run(async () => {
                    const op = crypto.randomUUID();
                    const result = await f.rpc<{
                      ok: boolean;
                      entries: number;
                    }>("mv_import_legacy", { p_id: op, p_records: local });
                    const { entries } = result;
                    if (!result.ok)
                      throw Error("Сервер не подтвердил перенос.");
                    await f.refresh();
                    setStep(2);
                    setMessage(
                      `Перенос подтверждён сервером: ${entries} проектов. Локальная копия сохранена. Теперь подтвердите собственные оценки ниже.`,
                    );
                  })
                }
              >
                {busy
                  ? "Переносим…"
                  : step === 2
                    ? "Повторить безопасный перенос"
                    : "Подтверждаю перенос в нашу семью"}
              </button>
            </>
          )}
        </>
      )}
      {pending.length > 0 && (
        <div className="claim-legacy">
          <p>
            Для вашего профиля найдено {pending.length} старых оценок. Они ещё
            не присвоены аккаунту.
          </p>
          <button
            className="primary"
            disabled={busy || f.offline}
            onClick={() =>
              void run(async () => {
                const count = await f.rpc<number>("mv_claim_legacy");
                await f.refresh();
                setMessage(
                  `Ваш профиль получил ${count} оценок. Чужие оценки не изменены.`,
                );
              })
            }
          >
            Подтвердить мои {pending.length} оценок
          </button>
        </div>
      )}
      {f.role === "tanya" && !pending.length && (
        <p className="muted">
          После переноса с iPhone Антона здесь появятся ваши старые оценки для
          подтверждения.
        </p>
      )}
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
    </section>
  );
}
