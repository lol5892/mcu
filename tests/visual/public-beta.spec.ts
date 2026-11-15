import { test, expect } from "@playwright/test";
import { fixture } from "../family/contract";
import { noOverflow } from "./helpers";
async function signIn(page: any, email: string) {
  await page.getByLabel("Email для входа").fill(email);
  await page
    .getByRole("button", { name: "Получить письмо для входа", exact: true })
    .click();
  await page.getByLabel("Код подтверждения").fill("123456");
  await page
    .getByRole("button", { name: "Подтвердить email", exact: true })
    .click();
}
test("public landing has honest installation steps, independent branding and no source-pair names", async ({
  page,
  context,
}, info) => {
  const b = fixture();
  await b.connect(context, false);
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Создайте вашу маленькую киновселенную",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Создать нашу вселенную", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Присоединиться к партнёру",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Антон|Таня/);
  await page.getByRole("button", { name: "Установить на iPhone" }).click();
  await expect(
    page.getByRole("heading", { name: "Установите приложение на iPhone" }),
  ).toBeVisible();
  for (const width of [320, 375, 402, 414, 440]) {
    await page.setViewportSize({ width, height: 896 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: `docs/public-beta/screenshots/${info.project.name}-welcome.png`,
    fullPage: true,
    scale: "css",
  });
});
test("two independent identities create and explicitly confirm a QR invitation without exposing original names", async ({
  browser,
}, info) => {
  const b = fixture();
  b.tables.mv_members = [];
  b.tables.mv_families = [];
  for (const profile of b.profiles.values()) {
    profile.onboarding_seen_at = "2026-11-01";
    profile.welcome_seen_at = "2026-11-01";
  }
  const ca = await browser.newContext({
    viewport: {
      width: info.project.name.includes("16") ? 402 : 414,
      height: 896,
    },
    locale: "ru-RU",
  });
  const cb = await browser.newContext({
    viewport: { width: 402, height: 874 },
    locale: "ru-RU",
  });
  await b.connect(ca);
  await b.connect(cb, false);
  const a = await ca.newPage(),
    partner = await cb.newPage();
  await a.goto("/");
  await signIn(a, "anton@example.test");
  await a.getByLabel("Ваше имя", { exact: true }).fill("Ира");
  await a.getByLabel("Название вселенной").fill("Вечера Иры и Леры");
  await a
    .getByRole("button", { name: "Создать нашу вселенную", exact: true })
    .click();
  await expect(a).toHaveURL(/#\/preferences$/);
  await expect(
    a.getByRole("heading", { name: "Пригласить партнёра" }),
  ).toBeVisible();
  await a.getByLabel("Email партнёра").fill("tanya@example.test");
  await a
    .getByRole("button", { name: "Создать приглашение", exact: true })
    .click();
  await expect(
    a.getByAltText("QR-код одноразового приглашения партнёра"),
  ).toBeVisible();
  await a.screenshot({
    path: `docs/public-beta/screenshots/${info.project.name}-qr.png`,
    fullPage: true,
    scale: "css",
  });
  await partner.goto("/#/join/" + "f".repeat(64));
  await signIn(partner, "tanya@example.test");
  await partner.getByLabel("Ваше имя", { exact: true }).fill("Лера");
  await partner
    .getByRole("button", { name: "Проверить приглашение", exact: true })
    .click();
  await expect(partner.getByText("Ира приглашает вас")).toBeVisible();
  expect(b.tables.mv_members).toHaveLength(1);
  await partner
    .getByRole("button", { name: "Подтвердить подключение", exact: true })
    .click();
  await expect(
    partner.getByRole("heading", { name: "Ваша команда собрана" }),
  ).toBeVisible();
  await expect(
    a.getByRole("heading", { name: "Ваша команда собрана" }),
  ).toBeVisible();
  await partner.goto("/#/legend");
  await expect(partner.locator(".legend-summary")).toContainText(
    "Ира: уровень",
  );
  await expect(partner.locator(".legend-summary")).toContainText(
    "Лера: уровень",
  );
  await noOverflow(partner);
  await partner.goto("/#/preferences");
  await expect(
    partner.getByRole("link", { name: "Поддержать проект", exact: true }),
  ).toHaveCount(0);
  await expect(partner.locator(".main-shell")).not.toContainText(/Антон|Таня/);
  await ca.close();
  await cb.close();
});
test("both participants can skip onboarding and it is not replayed after restart", async ({
  browser,
}) => {
  const b = fixture();
  b.profiles.get(b.anton)!.onboarding_seen_at = null;
  b.profiles.get(b.tanya)!.onboarding_seen_at = null;
  for (const email of ["anton@example.test", "tanya@example.test"]) {
    const context = await browser.newContext({
      viewport: { width: 402, height: 874 },
      locale: "ru-RU",
    });
    await b.connect(context);
    const page = await context.newPage();
    await page.goto("/");
    await signIn(page, email);
    await expect(
      page.getByRole("dialog", { name: "Знакомство с приложением" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Пропустить обучение" }).click();
    await expect(page.locator(".family-stats")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("dialog", { name: "Знакомство с приложением" }),
    ).toHaveCount(0);
    await expect(page.locator(".family-stats")).toBeVisible();
    await context.close();
  }
});
