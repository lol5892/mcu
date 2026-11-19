import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./contract";
async function login(page: Page, email: string) {
  await page.addLocatorHandler(
    page.getByRole("heading", {
      name: "Что осталось после титров?",
      exact: true,
    }),
    async () => {
      await page
        .getByRole("button", { name: "Не сейчас", exact: true })
        .click();
    },
  );
  await page.goto("/");
  await page.getByLabel("Email для входа").fill(email);
  await page
    .getByRole("button", { name: "Получить письмо для входа", exact: true })
    .click();
  await page.getByLabel("Код подтверждения").fill("123456");
  await page
    .getByRole("button", { name: "Войти в нашу вселенную", exact: true })
    .click();
  await expect(page.locator(".family-stats")).toBeVisible();
}
test("device-only filters preserve scores, impressions, trophies and pending watches; confirmation removes the card", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const backend = fixture(false, true);
  for (const profile of backend.profiles.values()) {
    profile.welcome_seen_at = "2026-11-08";
    profile.onboarding_seen_at = "2026-11-08";
  }
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  await backend.connect(ca);
  await backend.connect(cb);
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await login(a, "anton@example.test");
    await login(b, "tanya@example.test");
    const before = JSON.stringify({
      tables: backend.tables,
      legend: backend.legend,
    });
    let applies = 0;
    a.on("request", (r) => {
      if (r.url().includes("/rpc/mv_apply")) applies++;
    });
    await a.getByLabel("Скрыть просмотренное", { exact: true }).check();
    await expect(
      a.locator('.project-card[data-project-id="iron-man"]'),
    ).toHaveCount(0);
    await expect(
      b.getByLabel("Скрыть просмотренное", { exact: true }),
    ).not.toBeChecked();
    await a.getByLabel("Скрыть просмотренное", { exact: true }).uncheck();
    await expect(
      a.locator('.project-card[data-project-id="iron-man"]'),
    ).toHaveCount(1);
    expect(applies).toBe(0);
    expect(
      JSON.stringify({ tables: backend.tables, legend: backend.legend }),
    ).toBe(before);
    await a.getByLabel("Скрыть просмотренное", { exact: true }).check();
    const card = a.locator('.project-card[data-project-id="iron-man-2"]');
    await card.getByRole("button", { name: "Посмотрели", exact: true }).click();
    await expect(
      card.getByText("Ожидает подтверждения", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        backend.tables.mv_watch_requests.some(
          (r) => r.project_id === "iron-man-2" && r.status === "pending",
        ),
      )
      .toBe(true);
    expect(
      Boolean(
        backend.tables.mv_entries.find((r) => r.project_id === "iron-man-2")
          ?.watched,
      ),
    ).toBe(false);
    await expect(
      b
        .locator(".watch-inbox")
        .getByRole("button", { name: "Да, посмотрели", exact: true }),
    ).toBeVisible({ timeout: 12000 });
    await b
      .locator(".watch-inbox")
      .getByRole("button", { name: "Да, посмотрели", exact: true })
      .click();
    await expect(card).toHaveCount(0, { timeout: 12000 });
    await expect(
      b.locator('.project-card[data-project-id="iron-man-2"]'),
    ).toHaveCount(1);
    await a.reload();
    await expect(
      a.getByLabel("Скрыть просмотренное", { exact: true }),
    ).toBeChecked();
    await expect(
      a.locator('.project-card[data-project-id="iron-man-2"]'),
    ).toHaveCount(0);
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("partner rating hides a watched card and removing own rating restores it without losing progress", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const backend = fixture(false, true);
  for (const profile of backend.profiles.values()) {
    profile.welcome_seen_at = "2026-11-08";
    profile.onboarding_seen_at = "2026-11-08";
  }
  backend.tables.mv_ratings.find(
    (r) => r.user_id === backend.tanya && r.project_id === "iron-man",
  )!.score = null;
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  await backend.connect(ca);
  await backend.connect(cb);
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await login(a, "anton@example.test");
    await login(b, "tanya@example.test");
    const savedEntry = structuredClone(
      backend.tables.mv_entries.find((r) => r.project_id === "iron-man"),
    );
    const savedEpisodes = structuredClone(backend.tables.mv_episodes);
    const before = JSON.stringify(backend.tables);
    let writes = 0;
    a.on("request", (r) => {
      if (r.url().includes("/rpc/mv_apply")) writes++;
    });
    await a.getByLabel("Скрыть просмотренное", { exact: true }).check();
    await a.getByLabel("Оставлять без оценки", { exact: true }).check();
    const card = a.locator('.project-card[data-project-id="iron-man"]');
    await expect(card.locator(".watched-badge")).toBeVisible();
    await expect(
      b.getByLabel("Оставлять без оценки", { exact: true }),
    ).not.toBeChecked();
    expect(writes).toBe(0);
    expect(JSON.stringify(backend.tables)).toBe(before);
    await card
      .getByRole("button", { name: "Открыть: Железный человек", exact: true })
      .click();
    await b
      .getByRole("button", { name: "Открыть: Железный человек", exact: true })
      .click();
    await b.getByLabel("Оценка Тани", { exact: true }).selectOption("9");
    await expect(card).toHaveCount(0, { timeout: 12000 });
    await a.getByLabel("Оценка Антона", { exact: true }).selectOption("");
    await expect(card).toHaveCount(1, { timeout: 12000 });
    expect(
      backend.tables.mv_entries.find((r) => r.project_id === "iron-man"),
    ).toEqual(savedEntry);
    expect(backend.tables.mv_episodes).toEqual(savedEpisodes);
    await expect
      .poll(
        () =>
          backend.tables.mv_ratings.find(
            (r) => r.user_id === backend.anton && r.project_id === "iron-man",
          )?.score,
      )
      .toBeNull();
    await a.getByRole("button", { name: "Закрыть", exact: true }).click();
    await b.getByRole("button", { name: "Закрыть", exact: true }).click();
    const pending = a.locator('.project-card[data-project-id="iron-man-2"]');
    await pending
      .getByRole("button", { name: "Посмотрели", exact: true })
      .click();
    await expect(
      pending.getByText("Ожидает подтверждения", { exact: true }),
    ).toBeVisible();
    await expect(
      b
        .locator(".watch-inbox")
        .getByRole("button", { name: "Да, посмотрели", exact: true }),
    ).toBeVisible({ timeout: 12000 });
    await b
      .locator(".watch-inbox")
      .getByRole("button", { name: "Да, посмотрели", exact: true })
      .click();
    await expect(pending.locator(".watched-badge")).toBeVisible({
      timeout: 12000,
    });
    await expect(pending.locator(".card-pending")).toHaveCount(0);
  } finally {
    await ca.close();
    await cb.close();
  }
});
