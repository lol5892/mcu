import { test, expect } from "@playwright/test";
import { setup, heartGeometry, noOverflow, safeArea } from "./helpers";
test("catalogue geometry across mobile widths", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Каталог", exact: true })
    .click();
  for (const width of [320, 375, 390, 393, 402, 414, 428, 430, 440]) {
    await page.setViewportSize({ width, height: 896 });
    await safeArea(page);
    await noOverflow(page);
    const geometry = await heartGeometry(page);
    expect(Math.abs(geometry.dx)).toBeLessThan(0.1);
    expect(Math.abs(geometry.dy)).toBeLessThan(0.1);
    expect(geometry.button.width).toBe(geometry.button.height);
    const items = await page
      .locator(".bottom-nav button")
      .evaluateAll((items) =>
        items.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, height: r.height };
        }),
      );
    expect(items[0].left).toBeGreaterThanOrEqual(0);
    expect(items.at(-1)!.right).toBeLessThanOrEqual(width);
    expect(items.every((i) => i.height >= 44)).toBeTruthy();
  }
  await page.setViewportSize(info.project.use.viewport!);
  await page.screenshot({
    path: `docs/v2.2/after/${info.project.name}-catalog.png`,
    scale: "css",
  });
});
test("family screens fit both phones and landscape", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  for (const screen of [
    "universe",
    "chat",
    "letters",
    "moments",
    "events",
    "sessions",
    "settings/notifications",
    "preferences",
    "backup",
  ]) {
    await page.goto("/#/" + screen);
    await page.locator("main").waitFor();
    await noOverflow(page);
    await page.screenshot({
      path: `docs/v2.2/after/${info.project.name}-${screen.replaceAll("/", "-")}.png`,
      scale: "css",
    });
  }
  await page.setViewportSize({ width: 896, height: 414 });
  await noOverflow(page);
});
test("focused chat keeps composer inside viewport and above navigation", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page.goto("/#/chat");
  await safeArea(page, 44, 34);
  const input = page.locator(".compose-row textarea");
  await input.fill("Черновик остаётся");
  await input.focus();
  await expect(page.locator(".chat-keyboard-active")).toBeVisible();
  const bounds = await input.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(44);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await expect(input).toHaveValue("Черновик остаётся");
  await noOverflow(page);
});

test("legend phase collection opens existing project card", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await page.goto("/#/legend");
  await expect(
    page.getByRole("heading", { name: "Наша легенда", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Коллекция наград").selectOption("phases");
  await noOverflow(page);
  await page.screenshot({
    path: `docs/v2.3/${info.project.name}-legend.png`,
    scale: "css",
  });
  await page.getByRole("button", { name: /Фьюри, мы собрали семью/ }).click();
  await page
    .getByRole("button", { name: /Железный человек$/, exact: false })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
