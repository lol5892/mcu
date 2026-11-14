// UI contracts use two isolated browser identities and an in-memory HTTP fixture.
// Real Auth/RLS/Storage/Realtime and physical iOS push are verified separately.
import { test, expect, type Page, type Browser } from "@playwright/test";
import { fixture } from "./contract";
const photo = {
  name: "evening.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
};
async function login(page: Page, email: string) {
  await page.addLocatorHandler(page.getByRole('heading',{name:'Что осталось после титров?',exact:true}),async()=>{await page.getByRole('button',{name:'Не сейчас',exact:true}).click();});
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
async function pair(browser: Browser, backend: ReturnType<typeof fixture>) {
  for (const p of backend.profiles.values()) {
    p.welcome_seen_at = "2026-11-08";
    p.onboarding_seen_at = "2026-11-08";
  }
  const ac = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const tc = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await backend.connect(ac);
  await backend.connect(tc);
  const a = await ac.newPage(),
    t = await tc.newPage();
  await login(a, "anton@example.test");
  await login(t, "tanya@example.test");
  return { ac, tc, a, t };
}
async function selectPhoto(
  page: Page,
  inputLabel = "Фото из галереи",
  file = photo,
) {
  await page.getByLabel(inputLabel, { exact: true }).last().setInputFiles(file);
  await expect(
    page.getByAltText("Предпросмотр фотографии").first(),
  ).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test.skip("two phones start, join, chat, react, exchange a photo, finish and rate the same viewing without automatic watched marks [retired communication UI in 2.4]", async ({
  browser,
}) => {
  test.setTimeout(100_000);
  const backend = fixture(false, true);
  const { ac, tc, a, t } = await pair(browser, backend);
  await a.goto("/#/sessions");
  await a.getByRole("button", { name: "Выбрать фильм", exact: true }).click();
  await a.getByLabel("Поиск фильма для просмотра").fill("Железный человек 2");
  await a
    .getByRole("button", { name: "Начать просмотр вместе", exact: true })
    .click();
  await expect(
    a.getByRole("button", { name: "Завершить просмотр", exact: true }),
  ).toBeVisible();
  await expect.poll(() => backend.tables.mv_sessions.length).toBe(1);
  const session = backend.tables.mv_sessions[0];
  await expect(
    t.getByRole("button", { name: "Открыть просмотр", exact: true }),
  ).toBeVisible({ timeout: 12_000 });
  await t
    .getByRole("button", { name: "Открыть просмотр", exact: true })
    .click();
  await t.getByRole("button", { name: "Я тоже здесь ❤️", exact: true }).click();
  await expect.poll(() => session.participants).toContain(backend.tanya);
  expect(
    backend.tables.mv_sessions.filter((s) => s.status === "active"),
  ).toHaveLength(1);

  const held = backend.pauseNextApply("message");
  await a
    .getByLabel("Текст сообщения")
    .fill("Наш тестовый вечер — сообщение Антона");
  await a
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await Promise.race([held.started, new Promise((_, reject) => setTimeout(() => reject(Error("message submit never reached API")), 10000))]);
  expect(backend.tables.mv_messages).toHaveLength(0);
  await expect(
    t.getByText("Наш тестовый вечер — сообщение Антона", { exact: true }),
  ).toHaveCount(0);
  held.release();
  await expect(a.getByLabel("Текст сообщения")).toHaveValue("");
  const doneTyping = a.getByRole("button", { name:"Готово", exact:true });
  if (await doneTyping.isVisible()) await doneTyping.click();
  await expect(
    t.getByText("Наш тестовый вечер — сообщение Антона", { exact: true }),
  ).toBeVisible({ timeout: 12_000 });
  await a
    .getByLabel("Наши реакции")
    .first()
    .getByRole("button", { name: "🔥", exact: true })
    .click();
  await expect
    .poll(
      () =>
        backend.tables.mv_reactions.filter(
          (r) => r.kind === "session" && r.emoji === "🔥",
        ).length,
    )
    .toBe(1);
  await expect(
    t
      .getByLabel("Наши реакции")
      .first()
      .getByRole("button", { name: "🔥 1", exact: true }),
  ).toBeVisible({ timeout: 12_000 });

  await t
    .getByRole("button", { name: "Прикрепить фотографию", exact: true })
    .click();
  await selectPhoto(t);
  await t.getByLabel("Текст сообщения").fill("Кадр нашего тестового вечера");
  await t
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await expect(
    a
      .locator(".message")
      .filter({ hasText: "Кадр нашего тестового вечера" })
      .getByRole("button", { name: "Открыть фото на весь экран", exact: true }),
  ).toBeVisible({ timeout: 12_000 });
  expect(backend.tables.mv_media).toHaveLength(1);
  const uploads = backend.uploadAttempts();
  await t
    .getByRole("button", { name: "Сохранить в наши моменты ❤️", exact: true })
    .click();
  await expect.poll(() => backend.tables.mv_moments.length).toBe(1);
  expect(backend.uploadAttempts()).toBe(uploads);
  expect(
    backend.tables.mv_media_links.filter(
      (l) => l.media_id === backend.tables.mv_media[0].id,
    ),
  ).toHaveLength(2);
  await noOverflow(a);
  await noOverflow(t);

  await a
    .getByRole("button", { name: "Завершить просмотр", exact: true })
    .click();
  await expect(
    a.getByRole("heading", {
      name: "Ещё один вечер в нашей вселенной ❤️",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    t.getByRole("heading", {
      name: "Ещё один вечер в нашей вселенной ❤️",
      exact: true,
    }),
  ).toBeVisible({ timeout: 12_000 });
  expect(
    backend.tables.mv_entries.find((r) => r.project_id === "iron-man-2")
      ?.watched || false,
  ).toBe(false);
  expect(backend.tables.mv_watch_requests).toHaveLength(0);
  await a.getByLabel("Моя оценка проекта").selectOption("8");
  await t.getByLabel("Моя оценка проекта").selectOption("9");
  await expect
    .poll(
      () =>
        backend.tables.mv_ratings.filter((r) => r.project_id === "iron-man-2")
          .length,
    )
    .toBe(2);
  await a.reload();
  await expect(a.getByLabel("Моя оценка проекта")).toHaveValue("8");
  expect(
    backend.tables.mv_ratings.find(
      (r) => r.user_id === backend.tanya && r.project_id === "iron-man-2",
    ).score,
  ).toBe(9);
  await ac.close();
  await tc.close();
});

test("top of a film opens the current active session instead of creating another", async ({
  page,
  context,
}) => {
  const backend = fixture();
  backend.tables.mv_sessions.push({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    family_id: backend.tables.mv_members[0].family_id,
    project_id: "iron-man",
    author_id: backend.anton,
    participants: [backend.anton],
    status: "active",
    version: 1,
    created_at: new Date().toISOString(),
    finished_at: null,
    season: null,
    episode: null,
    film_minute: 0,
  });
  await backend.connect(context);
  await login(page, "anton@example.test");
  await page
    .getByRole("button", { name: "Открыть: Железный человек 2", exact: true })
    .click();
  const open = page
    .locator(".detail")
    .getByRole("button", { name: "Открыть текущий просмотр", exact: true });
  await expect(open).toBeVisible();
  await open.click();
  await expect(
    page.getByRole("button", { name: "Завершить просмотр", exact: true }),
  ).toBeVisible();
  expect(backend.tables.mv_sessions).toHaveLength(1);
});

test("photo-first moments retain selected files and caption after failed upload, retry without duplicate publication, and let the partner add a photo", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const backend = fixture();
  const { ac, tc, a, t } = await pair(browser, backend);
  await a.goto("/#/moments");
  await a
    .getByRole("button", { name: "Добавить фото", exact: true })
    .first()
    .click();
  await a
    .getByLabel("Фото из галереи", { exact: true })
    .last()
    .setInputFiles([photo, { ...photo, name: "evening-two.png" }]);
  await expect(a.getByAltText("Предпросмотр фотографии")).toHaveCount(2);
  await a.getByLabel("Подпись воспоминания").fill("Два кадра нашего вечера");
  await a.getByLabel("Фильм воспоминания").selectOption("iron-man");
  backend.failNextUploads();
  await a.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(a.getByRole("status")).toBeVisible();
  expect(backend.tables.mv_moments).toHaveLength(0);
  await expect(a.getByLabel("Подпись воспоминания")).toHaveValue(
    "Два кадра нашего вечера",
  );
  await expect(a.getByAltText("Предпросмотр фотографии")).toHaveCount(2);
  await a.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(a.locator(".moment-card")).toHaveCount(1);
  expect(backend.tables.mv_moments).toHaveLength(1);
  expect(backend.tables.mv_media.filter((m) => m.ready)).toHaveLength(2);
  expect(backend.tables.mv_media_links).toHaveLength(2);
  await t.goto("/#/moments");
  await expect(t.locator(".moment-card")).toHaveCount(1, { timeout: 12_000 });
  await t
    .locator(".moment-card")
    .getByRole("button", { name: "Добавить фото", exact: true })
    .click();
  await selectPhoto(t);
  // Shared attachments retain their original author.
  await t
    .getByRole("button", { name: "Добавить фотографии", exact: true })
    .click();
  await expect.poll(() => backend.tables.mv_media_links.length).toBe(3);
  expect(
    backend.tables.mv_media.filter(
      (m) => m.author_id === backend.tanya && m.ready,
    ),
  ).toHaveLength(1);
  await ac.close();
  await tc.close();
});

test.skip("gallery photos appear inside both common and project chats and composer remains usable in a reduced visual viewport [retired communication UI in 2.4]", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  for (const route of ["/#/chat", "/#/project/iron-man"]) {
    await page.goto(route);
    await page
      .getByRole("button", { name: "Прикрепить фотографию", exact: true })
      .click();
    await selectPhoto(page, "Фото из галереи", {
      ...photo,
      mimeType: "application/octet-stream",
    });
    await page
      .getByLabel("Текст сообщения")
      .fill(route.includes("project") ? "Фото о фильме" : "Фото в разговоре");
    await page
      .getByRole("button", { name: "Отправить сообщение", exact: true })
      .click();
    await expect(page.locator(".message .private-photo img")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 480 });
    await page.getByLabel("Текст сообщения").focus();
    await page
      .getByLabel("Текст сообщения")
      .fill("Набираю с открытой клавиатурой");
    const compose = page.getByRole("button", {
      name: "Отправить сообщение",
      exact: true,
    });
    await expect(compose).toBeInViewport();
    await noOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  expect(backend.tables.mv_messages.map((m) => m.scope).sort()).toEqual([
    "chat",
    "project",
  ]);
});

test.skip("offline chat shows pending delivery and sends once after connectivity returns [retired communication UI in 2.4]", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  await page.goto("/#/chat");
  await context.setOffline(true);
  await page.getByLabel("Текст сообщения").fill("Сообщение без сети");
  await page
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await expect(
    page
      .getByText(/В очереди|Ожидает подключения|Ожидает сети|После подключения|Ждёт отправки/)
      .last(),
  ).toBeVisible();
  expect(backend.tables.mv_messages).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => backend.tables.mv_messages.length).toBe(1);
  await expect(page.locator(".message .pending-label")).toHaveCount(0);
  await page.reload();
  expect(backend.tables.mv_messages).toHaveLength(1);
});

test("mobile audit covers main sections, calendar, notification settings and private backup without horizontal overflow", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  for (const route of [
    "/",
    "/#/universe",
    "/#/letters",
    "/#/moments",
    "/#/events",
    "/#/settings/notifications",
    "/#/preferences",
    "/#/backup",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await noOverflow(page);
  }
  await page.goto("/#/events");
  await page
    .getByRole("button", { name: "Назначить киновечер", exact: true })
    .click();
  await page.getByLabel("Фильм киновечера").selectOption("loki");
  await page.getByLabel("Сезон киновечера").selectOption("1");
  await page.getByLabel("Серия киновечера").selectOption("2");
  await page.getByLabel("Дата и время киновечера").fill("2026-12-10T20:30");
  await noOverflow(page);
  const dateSize = await page
    .getByLabel("Дата и время киновечера")
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(parseFloat(dateSize)).toBeGreaterThanOrEqual(16);
  await page.goto("/#/photos");
  await expect(page.getByRole('heading',{name:'Наш фотоархив'})).toBeVisible();
  await noOverflow(page);
});
