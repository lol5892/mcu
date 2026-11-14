import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./contract";
async function login(page: Page, email: string) {
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
test("two personal impressions while confirmation is pending, Unicode limit and retained draft", async ({
  browser,
}) => {
  const backend = fixture(false, true);
  for (const p of backend.profiles.values()) {
    p.welcome_seen_at = "2026-11-08";
    p.onboarding_seen_at = "2026-11-08";
  }
  const a = await browser.newContext(),
    b = await browser.newContext();
  await backend.connect(a);
  await backend.connect(b);
  const anton = await a.newPage(),
    tanya = await b.newPage();
  await login(anton, "anton@example.test");
  await login(tanya, "tanya@example.test");
  await anton
    .getByRole("button", { name: "Открыть: Железный человек 2", exact: true })
    .click();
  await anton
    .locator(".detail")
    .getByRole("button", { name: "Посмотрели", exact: true })
    .click();
  const editor = anton.getByRole("dialog", {
    name: "Что осталось после титров?",
  });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Личное впечатление").fill("😀".repeat(201));
  await expect(
    editor.getByRole("button", { name: "Сохранить впечатление" }),
  ).toBeDisabled();
  await editor.getByLabel("Личное впечатление").fill("Наше приключение 😀");
  await editor.getByRole("button", { name: "Сохранить впечатление" }).click();
  await expect(editor).not.toBeVisible();
  expect(
    backend.tables.mv_entries.find((r) => r.project_id === "iron-man-2")
      .watched,
  ).toBe(false);
  await tanya
    .locator(".watch-inbox")
    .getByRole("button", { name: "Да, посмотрели", exact: true })
    .click();
  await expect(
    tanya.getByRole("dialog", { name: "Что осталось после титров?" }),
  ).toBeVisible();
  await tanya.getByLabel("Личное впечатление").fill("Моё впечатление");
  await tanya.getByRole("button", { name: "Сохранить впечатление" }).click();
  expect(backend.tables.mv_impressions).toHaveLength(2);
  await anton
    .locator(".impressions")
    .getByRole("button", { name: "Изменить", exact: true })
    .click();
  await anton.getByLabel("Личное впечатление").fill("Несохранённый черновик");
  await anton.getByRole("button", { name: "Не сейчас", exact: true }).click();
  await anton
    .locator(".impressions")
    .getByRole("button", { name: "Изменить", exact: true })
    .click();
  await expect(anton.getByLabel("Личное впечатление")).toHaveValue(
    "Несохранённый черновик",
  );
  await a.close();
  await b.close();
});
test("six navigation items, statistics and archived communication routes", async ({
  page,
  context,
}) => {
  const backend = fixture();
  await backend.connect(context);
  await login(page, "anton@example.test");
  const nav = page.locator(".bottom-nav");
  await expect(nav.getByRole("button")).toHaveCount(6);
  await nav.getByRole("button", { name: "Достижения", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Наша легенда", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Статистика", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Наша статистика", exact: true }),
  ).toBeVisible();
  for (const route of ["chat", "letters", "photos"]) {
    await page.goto("/#/" + route);
    await expect(
      page.getByRole("heading", { name: "Наш фотоархив", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".chat-room")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Написать любимому человеку" }),
    ).toHaveCount(0);
  }
});
test('session adds photographs without creating a message and preserves them in archive',async({page,context})=>{const backend=fixture();await backend.connect(context);await login(page,'anton@example.test');await page.goto('/#/sessions');await page.getByRole('button',{name:'Выбрать фильм',exact:true}).click();await page.getByLabel('Поиск фильма для просмотра').fill('Железный человек 2');await page.getByRole('button',{name:'Начать просмотр вместе',exact:true}).click();await expect(page.getByRole('button',{name:'Завершить просмотр',exact:true})).toBeVisible();await page.getByLabel('Фото из галереи').setInputFiles({name:'evening.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});await page.getByRole('button',{name:'Добавить фотографии',exact:true}).click();await expect(page.locator('.private-photo img')).toHaveCount(1);expect(backend.tables.mv_messages).toHaveLength(0);await page.getByRole('button',{name:'Завершить просмотр',exact:true}).click();await expect(page.getByRole('heading',{name:'Ещё один вечер в нашей вселенной ❤️'})).toBeVisible();await expect(page.locator('.private-photo img')).toHaveCount(1);await page.goto('/#/photos');await expect(page.locator('.private-photo img')).toHaveCount(1);});
