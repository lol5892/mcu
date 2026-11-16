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
