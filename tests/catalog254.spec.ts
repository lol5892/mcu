import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog: Array<{
  id: string;
  type: string;
  section: string;
  date: string;
}> = JSON.parse(
  readFileSync(new URL("../src/catalog.json", import.meta.url), "utf8"),
);
import { defaultFilters, FILTER_STORAGE_KEY } from "../src/catalog-preferences";

const films = catalog
  .filter((p) => p.section === "main" && p.type === "film")
  .sort((a, b) => a.date.localeCompare(b.date));
async function seed(page: Page) {
  await page.goto("/");
  const records = Object.fromEntries(
    films.slice(0, 8).map((p) => [
      p.id,
      {
        watched: true,
        date: "2026-11-07",
        favorite: false,
        episodes: [],
        updatedAt: "2026-11-07T18:00:00Z",
        anton: 9,
        tanya: 8,
        note: "Сохраняем нашу историю",
      },
    ]),
  );
  await page.evaluate(
    async ({ records, key, filters }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("our-marvel", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("entries");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("entries", "readwrite");
        for (const [id, r] of Object.entries(records))
          tx.objectStore("entries").put(r, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      localStorage.setItem(key, JSON.stringify({ version: 1, filters }));
    },
    {
      records,
      key: FILTER_STORAGE_KEY,
      filters: { ...defaultFilters(), type: "film" },
    },
  );
  await page.reload();
  await expect(page.locator(".project-card").first()).toHaveAttribute(
    "data-project-id",
    "iron-man",
  );
}
async function rows(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("our-marvel");
      r.onsuccess = () => resolve(r.result);
    });
    const values = await new Promise((resolve) => {
      const r = db.transaction("entries").objectStore("entries").getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return values;
  });
}
test("hide watched selects the next twelve, preserves numbering and records, persists offline", async ({
  page,
  context,
}) => {
  await seed(page);
  const before = await rows(page);
  await page.getByLabel("Скрыть просмотренное", { exact: true }).check();
  await expect(page.locator(".project-card")).toHaveCount(12);
  await expect(page.locator(".project-card").first()).toHaveAttribute(
    "data-project-id",
    "winter-soldier",
  );
  await expect(
    page.locator(".project-card").first().locator(".card-number"),
  ).toHaveText("09");
  await expect(page.locator(".hero h2")).toHaveText(
    "Первый мститель: Другая война",
  );
  expect(await rows(page)).toEqual(before);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByLabel("Скрыть просмотренное", { exact: true }),
  ).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".project-card").first()).toHaveAttribute(
    "data-project-id",
    "winter-soldier",
  );
  await page.getByLabel("Скрыть просмотренное", { exact: true }).uncheck();
  await expect(page.locator(".project-card").first()).toHaveAttribute(
    "data-project-id",
    "iron-man",
  );
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  await expect(page.getByLabel("Оценка Антона")).toHaveValue("9");
  await expect(page.getByLabel("Наша заметка")).toHaveValue(
    "Сохраняем нашу историю",
  );
  await context.setOffline(false);
});
test("released seasons interleave with films and open the corresponding existing season", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Главная навигация" })
    .getByRole("button", { name: "Каталог", exact: true })
    .click();
  await page
    .getByLabel("Что смотреть?", { exact: true })
    .selectOption("film-series");
  const ids = await page
    .locator(".project-card")
    .evaluateAll((cards) =>
      cards.map(
        (c) =>
          `${c.getAttribute("data-project-id")}:${c.getAttribute("data-season") || ""}`,
      ),
    );
  expect(ids.indexOf("loki:1")).toBeLessThan(ids.indexOf("widow:"));
  expect(ids.indexOf("widow:")).toBeLessThan(ids.indexOf("loki:2"));
  await page.getByLabel("Поиск", { exact: true }).fill("Локи");
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Открыть: Локи — сезон 2", exact: true })
    .click();
  const target = page.locator('.detail details[data-season="2"]');
  await expect(target).toHaveAttribute("open", "");
  await expect(
    target.getByRole("button", { name: "Сезон 2, серия 1", exact: true }),
  ).toBeInViewport();
});
test("composition, search, status conflicts, extra sections and reset stay coherent", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Главная навигация" })
    .getByRole("button", { name: "Каталог", exact: true })
    .click();
  await page.getByRole("button", { name: "Всё Marvel", exact: true }).click();
  await page
    .getByLabel("Что смотреть?", { exact: true })
    .selectOption("special");
  expect(await page.locator(".project-card").count()).toBeGreaterThan(0);
  await page
    .getByLabel("Что смотреть?", { exact: true })
    .selectOption("series");
  await page.getByLabel("Поиск", { exact: true }).fill("Loki");
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.getByLabel("Скрыть просмотренное", { exact: true }).check();
  await page.locator(".catalog-more-filters summary").click();
  await page
    .getByLabel("Статус просмотра", { exact: true })
    .selectOption("watched");
  await expect(
    page.getByLabel("Скрыть просмотренное", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Скрыть просмотренное", { exact: true }).check();
  await expect(
    page.getByLabel("Статус просмотра", { exact: true }),
  ).toHaveValue("all");
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await expect(page.getByLabel("Что смотреть?", { exact: true })).toHaveValue(
    "all",
  );
  await expect(
    page.getByLabel("Скрыть просмотренное", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Поиск", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Впереди", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(page.locator(".hero")).toHaveCount(0);
});
test("invalid saved preferences do not prevent opening the catalogue", async ({
  page,
  context,
}) => {
  await context.addInitScript((key) => {
    localStorage.setItem(key, "{broken");
  }, FILTER_STORAGE_KEY);
  await page.goto("/");
  await expect(
    page.getByLabel("Скрыть просмотренное", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Скрыть просмотренное", { exact: true }).check();
  await expect(page.locator(".project-card").first()).toBeVisible();
});

test("unavailable localStorage keeps filters usable in memory", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage denied", "SecurityError");
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByLabel("Скрыть просмотренное", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Скрыть просмотренное", { exact: true }).check();
  await expect(
    page.getByLabel("Скрыть просмотренное", { exact: true }),
  ).toBeChecked();
  await expect(page.locator(".project-card").first()).toBeVisible();
});
