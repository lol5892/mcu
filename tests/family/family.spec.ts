import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./contract";
async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email для входа").fill(email);
  await page.getByRole("button", { name: "Получить письмо для входа" }).click();
  await page.getByLabel("Код подтверждения").fill("123456");
  await page.getByRole("button", { name: "Войти в нашу вселенную" }).click();
  await expect(
    page.locator(".family-stats,.welcome-scene,.universe-page"),
  ).toBeVisible();
}
test("Tanya greeting uses server text, manual controls, saved once and replay from settings", async ({
  browser,
}) => {
  const backend = fixture();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await backend.connect(ctx);
  const page = await ctx.newPage();
  await login(page, "tanya@example.test");
  await expect(
    page.getByRole("heading", { name: "Тестовая сцена 1" }),
  ).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(
    page.getByRole("heading", { name: "Тестовая сцена 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "К письму", exact: true }).click();
  await expect(
    page.getByText("Тестовое приватное письмо.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".welcome-content")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "docs/v2/welcome-contract.png" });
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await page
    .getByRole("button", { name: "Начнём наше приключение вместе ❤️" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Наши фильмы" }),
  ).toBeVisible();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Всегда рядом" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть нашу вселенную", exact: true })
    .click();
  await expect(page.locator(".family-stats")).toBeVisible();
  await page.reload();
  await expect(page.locator(".family-stats")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Личное письмо от Антона" }),
  ).toHaveCount(0);
  await page.goto("/#/preferences");
  await page
    .getByRole("button", { name: "Посмотреть письмо от Антона ❤️" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Тестовая сцена 1" }),
  ).toBeVisible();
  await ctx.close();
});
test("two browser accounts exchange delivered letters; drafts remain author-only in UI", async ({
  browser,
}) => {
  const backend = fixture();
  for (const profile of backend.profiles.values()) {
    profile.welcome_seen_at = "2026-11-08";
    profile.onboarding_seen_at = "2026-11-08";
  }
  const ac = await browser.newContext(),
    tc = await browser.newContext();
  await backend.connect(ac);
  await backend.connect(tc);
  const anton = await ac.newPage(),
    tanya = await tc.newPage();
  await login(anton, "anton@example.test");
  await login(tanya, "tanya@example.test");
  await anton.goto("/#/letters");
  await anton
    .getByRole("button", { name: "Написать любимому человеку" })
    .click();
  await anton.getByLabel("Заголовок письма").fill("Тестовое письмо вдвоём");
  await anton.getByLabel("Текст письма").fill("Проверяем доставленное письмо");
  await anton.getByRole("button", { name: "Отправить сейчас" }).click();
  await expect(
    anton.getByRole("heading", { name: "Тестовое письмо вдвоём" }),
  ).toBeVisible();
  await tanya.reload();
  await tanya.goto("/#/letters");
  await tanya
    .getByRole("button", { name: /ДЛЯ ТЕБЯ.*Тестовое письмо вдвоём/ })
    .click();
  await tanya.getByRole("button", { name: "Открыть конверт" }).click();
  await expect(
    tanya.getByText("Проверяем доставленное письмо", { exact: true }),
  ).toBeVisible();
  await tanya.getByRole("button", { name: "Написать ответ" }).click();
  await tanya.getByLabel("Текст письма").fill("Личный черновик Тани");
  await tanya.getByRole("button", { name: "Сохранить черновик" }).click();
  await anton.reload();
  await anton.goto("/#/letters");
  await expect(
    anton.getByText("Личный черновик Тани", { exact: true }),
  ).toHaveCount(0);
  await ac.close();
  await tc.close();
});
test("authenticated catalogue locks partner rating, season rating and chat compose work", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  await expect(page.getByLabel("Оценка Тани", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Оценка Антона", { exact: true })).toBeEnabled();
  await page.getByLabel("Оценка Антона", { exact: true }).selectOption("10");
  await expect(
    page.getByText("Изменение сохранено · статус в синхронизации", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/#/chat");
  await page.getByLabel("Текст сообщения").fill("Наш тестовый разговор");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(
    page
      .locator(".message-bubble p")
      .filter({ hasText: "Наш тестовый разговор" }),
  ).toBeVisible();
  await expect(page.getByLabel("Текст сообщения")).toHaveValue("");
  await page.screenshot({ path: "docs/v2/chat-contract.png" });
  await page.goto("/#/universe");
  await page.screenshot({
    path: "docs/v2/universe-contract.png",
    fullPage: true,
  });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("calendar invitation and viewing session use shared server operations", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  await page.goto("/#/events");
  await page.getByRole("button", { name: "Назначить киновечер" }).click();
  await page.getByLabel("Дата и время киновечера").fill("2026-12-01T20:30");
  await page.getByLabel("Комментарий киновечера").fill("Наш тестовый вечер");
  await page
    .getByRole("button", { name: "Пригласить на киновечер ❤️" })
    .click();
  await expect(
    page.getByText("Наш тестовый вечер", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Начать совместный просмотр" })
    .click();
  await expect(page.locator(".viewing-session")).toBeVisible();
  await page.getByLabel("Минута фильма").fill("42");
  await page.getByRole("button", { name: "Отметить", exact: true }).click();
  await expect(page.getByText("Сейчас на 42-й минуте")).toBeVisible();
  await page.getByRole("button", { name: "Завершить наш просмотр" }).click();
  await expect(
    page.getByRole("heading", { name: "Сохраним послевкусие" }),
  ).toBeVisible();
});
test("offline chat queues once and flushes after reconnection; no fake delivery status", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  await page.goto("/#/chat");
  await expect(page.getByLabel("Текст сообщения")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Текст сообщения").fill("Сообщение без сети");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(
    page.getByText("В очереди на отправку", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.mv_messages).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => backend.tables.mv_messages.length).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Сообщение без сети", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.mv_messages).toHaveLength(1);
});
test("a concurrent rating change is shown as a conflict instead of overwriting partner data", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  backend.tables.mv_ratings[0].score = 6;
  backend.tables.mv_ratings[0].version = 2;
  await page.getByLabel("Оценка Антона", { exact: true }).selectOption("10");
  await expect(page.locator(".error-banner")).toBeVisible();
  expect(backend.tables.mv_ratings[0].score).toBe(6);
  expect(backend.tables.mv_ratings[1].score).toBe(9);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/#/sync");
  await expect(
    page.getByText("Автоматического перезаписывания нет.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".pending-operation pre")).toContainText("10");
});
test("notification permission is never requested merely by opening settings", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await page.addInitScript(() => {
    (window as any).permissionRequests = 0;
    Object.defineProperty(window, "Notification", {
      value: class {
        static permission = "default";
        static async requestPermission() {
          (window as any).permissionRequests++;
          return "denied";
        }
      },
    });
  });
  await login(page, "anton@example.test");
  await page.goto("/#/settings/notifications");
  await expect(
    page.getByRole("heading", { name: "Всегда на связи" }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).permissionRequests)).toBe(0);
  await page
    .getByRole("button", { name: "Включить / восстановить push" })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(await page.evaluate(() => (window as any).permissionRequests)).toBe(1);
});
test("own old score can be cleared after partner unmarks the film", async ({
  page,
  context,
}) => {
  const backend = fixture();
  backend.tables.mv_entries[0].watched = false;
  await backend.connect(context);
  await login(page, "anton@example.test");
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  await expect(page.getByLabel("Оценка Антона", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Оценка Тани", { exact: true })).toBeDisabled();
  await page.getByLabel("Оценка Антона", { exact: true }).selectOption("");
  await expect.poll(() => backend.tables.mv_ratings[0].score).toBeNull();
  expect(backend.tables.mv_ratings[1].score).toBe(9);
});

test("password entry for installed app persists session and never saves plaintext password", async ({
  browser,
}) => {
  const backend = fixture();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await backend.connect(context);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Email для входа").fill("anton@example.test");
  await page
    .getByRole("button", { name: "Войти по паролю", exact: true })
    .click();
  const password = "Disposable-private-password-42";
  await page.getByLabel("Пароль для входа").fill(password);
  await page
    .getByRole("button", { name: "Войти по паролю", exact: true })
    .click();
  await expect(page.locator(".family-stats")).toBeVisible();
  await page.reload();
  await expect(page.locator(".family-stats")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    password,
  );
  await page.goto("/#/preferences");
  await page.getByLabel("Новый пароль", { exact: true }).fill(password);
  await page.getByLabel("Повторите пароль").fill("A-different-password-42");
  await page
    .getByRole("button", { name: "Сохранить пароль для входа" })
    .click();
  await expect(
    page.getByText("Пароли не совпадают.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Повторите пароль").fill(password);
  await page
    .getByRole("button", { name: "Сохранить пароль для входа" })
    .click();
  await expect(
    page.getByText("Пароль сохранён.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Новый пароль", { exact: true })).toHaveValue(
    "",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    password,
  );
  await context.close();
});

test("email confirmation in a new tab retains the email-bound family invitation", async ({
  browser,
}) => {
  const backend = fixture();
  backend.tables.mv_members = backend.tables.mv_members.filter(
    (m) => m.role !== "tanya",
  );
  const context = await browser.newContext();
  await backend.connect(context);
  const original = await context.newPage();
  await original.goto("/#invite=" + "a".repeat(64));
  await expect(original.getByLabel("Email для входа")).toBeVisible();
  const confirmation = await context.newPage();
  await confirmation.goto("/");
  await confirmation.getByLabel("Email для входа").fill("tanya@example.test");
  await confirmation
    .getByRole("button", { name: "Получить письмо для входа", exact: true })
    .click();
  await confirmation.getByLabel("Код подтверждения").fill("123456");
  await confirmation
    .getByRole("button", { name: "Войти в нашу вселенную", exact: true })
    .click();
  await expect(
    confirmation.getByRole("button", {
      name: "Принять приглашение ❤️",
      exact: true,
    }),
  ).toBeVisible();
  await context.close();
});
