import { test, expect } from "@playwright/test";
import { setup, noOverflow, safeArea } from "./helpers";

test("smart catalogue filters and season navigation stay readable at all supported mobile widths", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await safeArea(page);
  await page.getByLabel("Что смотреть?", { exact: true }).selectOption("film");
  const before = await page
    .locator(".project-card")
    .first()
    .getAttribute("data-position");
  expect(before).toBe("1");
  await page.getByLabel("Скрыть просмотренное", { exact: true }).check();
  await expect(page.locator(".project-card").first()).toHaveAttribute(
    "data-position",
    "2",
  );
  const viewport = page.viewportSize()!;
  for (const width of [320, 375, 390, 393, 402, 414, 428, 430, 440]) {
    await page.setViewportSize({ width, height: viewport.height });
    await noOverflow(page);
    await expect(
      page.getByLabel("Скрыть просмотренное", { exact: true }),
    ).toBeVisible();
    const checkbox = await page.locator(".hide-watched-control").boundingBox();
    expect(checkbox!.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize(viewport);
  await page.locator(".collection-controls").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/v2.5.4/after/${info.project.name}-filters.png`,
    scale: "css",
  });
  await page
    .getByRole("navigation", { name: "Главная навигация" })
    .getByRole("button", { name: "Каталог", exact: true })
    .click();
  await page
    .getByLabel("Что смотреть?", { exact: true })
    .selectOption("film-series");
  await page.getByLabel("Поиск", { exact: true }).fill("Локи");
  await expect(page.locator(".project-card")).toHaveCount(2);
  await expect(page.locator('.project-card[data-season="1"]')).toContainText(
    "1/6 серий",
  );
  await noOverflow(page);
  await page.screenshot({
    path: `docs/v2.5.4/after/${info.project.name}-seasons.png`,
    scale: "css",
  });
  await page
    .getByRole("button", { name: "Открыть: Локи — сезон 2", exact: true })
    .click();
  await expect(
    page.locator('.detail details[data-season="2"]'),
  ).toHaveAttribute("open", "");
  await expect(
    page.getByRole("button", { name: "Сезон 2, серия 1", exact: true }),
  ).toBeInViewport();
  await noOverflow(page);
  await page.screenshot({
    path: `docs/v2.5.4/after/${info.project.name}-season-detail.png`,
    scale: "css",
  });
});
