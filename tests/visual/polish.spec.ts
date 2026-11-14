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
test.skip("retired chat composer in 2.4", async ({ page, context }) => {
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
test("after credits compact editor and six navigation items", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  await page
    .locator(".impressions")
    .getByRole("button", { name: "Написать", exact: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Что осталось после титров?",
  });
  await expect(sheet).toBeVisible();
  await sheet
    .getByLabel("Личное впечатление")
    .fill("Наша история начинается ❤️");
  await noOverflow(page);
  await page.screenshot({
    path: `docs/v2.4/${info.project.name}-after-credits.png`,
    scale: "css",
  });
  await sheet.getByRole("button", { name: "Не сейчас", exact: true }).click();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Достижения", exact: true })
    .click();
  await expect(page.locator(".bottom-nav button")).toHaveCount(6);
  await expect(page.locator(".bottom-nav button.active")).toHaveText(
    "Достижения",
  );
});
test("round icon geometry and painted close path", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  const geometry = await page.locator(".modal-close").evaluate((button) => {
    const svg = button.querySelector("svg")!;
    const b = button.getBoundingClientRect(),
      s = svg.getBoundingClientRect(),
      paint = svg.getBBox(),
      matrix = svg.getScreenCTM()!;
    const point = new DOMPoint(
      paint.x + paint.width / 2,
      paint.y + paint.height / 2,
    ).matrixTransform(matrix);
    return {
      button: { x: b.x, y: b.y, w: b.width, h: b.height },
      svg: { w: s.width, h: s.height },
      dx: s.x + s.width / 2 - b.x - b.width / 2,
      dy: s.y + s.height / 2 - b.y - b.height / 2,
      paintDx: point.x - b.x - b.width / 2,
      paintDy: point.y - b.y - b.height / 2,
      padding: getComputedStyle(button).padding,
    };
  });
  const { writeFile, mkdir } = await import("node:fs/promises");
  const folder = process.env.MV_ICON_BASELINE ? "before" : "after";
  await mkdir("docs/v2.5/" + folder, { recursive: true });
  await writeFile(
    `docs/v2.5/${folder}/${info.project.name}-close.json`,
    JSON.stringify(geometry, null, 2),
  );
  await page.screenshot({
    path: `docs/v2.5/${folder}/${info.project.name}-detail.png`,
    scale: "css",
  });
  if (!process.env.MV_ICON_BASELINE) {
    expect(geometry.svg.w).toBe(geometry.svg.h);
    expect(Math.abs(geometry.dx)).toBeLessThan(0.2);
    expect(Math.abs(geometry.dy)).toBeLessThan(0.2);
    expect(Math.abs(geometry.paintDx)).toBeLessThan(0.2);
    expect(Math.abs(geometry.paintDy)).toBeLessThan(0.2);
    expect(geometry.button.w).toBeGreaterThanOrEqual(44);
    const beforeScroll = await page.locator(".modal-close").boundingBox();
    await page.locator(".modal").evaluate((el) => {
      el.scrollTop = 450;
    });
    const afterScroll = await page.locator(".modal-close").boundingBox();
    expect(Math.abs(afterScroll!.y - beforeScroll!.y)).toBeLessThan(1);
    await noOverflow(page);
  }
});
test("icon-only controls and full page navigation remain aligned", async ({
  page,
  context,
}) => {
  await setup(page, context);
  for (const route of [
    "universe",
    "events",
    "moments",
    "preferences",
    "settings/notifications",
    "legend",
    "legend/stats",
    "photos",
  ]) {
    await page.goto("/#/" + route);
    await noOverflow(page);
    const buttons = await page.locator("button").evaluateAll((list) =>
      list
        .filter(
          (b) =>
            b.getBoundingClientRect().width > 0 &&
            b.textContent?.trim() === "" &&
            b.querySelector("svg"),
        )
        .map((b) => {
          const s = b.querySelector("svg")!.getBoundingClientRect(),
            r = b.getBoundingClientRect();
          return {
            label: b.getAttribute("aria-label") || b.className,
            w: r.width,
            h: r.height,
            dx: s.x + s.width / 2 - r.x - r.width / 2,
            dy: s.y + s.height / 2 - r.y - r.height / 2,
          };
        }),
    );
    for (const b of buttons) {
      expect(Math.abs(b.dx), b.label).toBeLessThan(0.5);
      expect(Math.abs(b.dy), b.label).toBeLessThan(0.5);
      expect(b.w, b.label).toBeGreaterThanOrEqual(44);
      expect(b.h, b.label).toBeGreaterThanOrEqual(44);
    }
  }
});
test("new universe screen review with complete illustrated catalogue", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  const { mkdir } = await import("node:fs/promises");
  await mkdir("docs/v2.5/after", { recursive: true });
  for (const route of [
    "home",
    "catalog",
    "saved",
    "legend",
    "legend/stats",
    "universe",
    "sessions",
    "moments",
    "events",
    "photos",
    "preferences",
    "settings/notifications",
  ]) {
    if (["home", "catalog", "saved"].includes(route)) {
      await page
        .locator(".bottom-nav")
        .getByRole("button", {
          name:
            route === "home"
              ? "Главная"
              : route === "catalog"
                ? "Каталог"
                : "Наше",
          exact: true,
        })
        .click();
    } else await page.goto("/#/" + route);
    await noOverflow(page);
    await page.screenshot({
      path: `docs/v2.5/after/${info.project.name}-${route.replaceAll("/", "-")}.png`,
      scale: "css",
    });
  }
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Каталог", exact: true })
    .click();
  await page.getByLabel("Поиск", { exact: true }).fill("Тор 2");
  await page
    .getByRole("button", { name: "Открыть: Тор 2: Царство тьмы", exact: true })
    .click();
  await page.screenshot({
    path: `docs/v2.5/after/${info.project.name}-thor-dark.png`,
    scale: "css",
  });
  await noOverflow(page);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.setViewportSize({ width: 896, height: 414 });
  await noOverflow(page);
});
test("catalogue rendering performance diagnostic", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Каталог", exact: true })
    .click();
  await noOverflow(page);
  const start = Date.now();
  await page
    .getByRole("button", { name: "Открыть: Железный человек", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Железный человек", exact: true }),
  ).toBeVisible();
  const detailOpenMs = Date.now() - start;
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  const metrics = await page.evaluate(async () => {
    const frames: number[] = [];
    let previous = performance.now();
    for (let i = 0; i < 30; i++) {
      window.scrollBy(0, 35);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const now = performance.now();
      frames.push(now - previous);
      previous = now;
    }
    frames.sort((a, b) => a - b);
    return {
      frameMedianMs: frames[Math.floor(frames.length / 2)],
      frameP95Ms: frames[Math.floor(frames.length * 0.95)],
      jsHeapUsedBytes:
        (performance as Performance & { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? null,
      visibleArtworkRequests: performance
        .getEntriesByType("resource")
        .filter((r) => r.name.includes("covers-v25")).length,
    };
  });
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir("docs/v2.5/performance", { recursive: true });
  await writeFile(
    `docs/v2.5/performance/${info.project.name}.json`,
    JSON.stringify(
      {
        environment:
          "Headless desktop engine, synthetic family, local Vite; not physical iPhone performance",
        detailOpenMs,
        ...metrics,
      },
      null,
      2,
    ),
  );
});

test("cover download failure uses a readable local fallback", async ({
  page,
  context,
}) => {
  await context.route("**/covers-v25/iron-man.webp", (r) => r.abort());
  await setup(page, context);
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Каталог", exact: true })
    .click();
  const img = page.getByAltText("Авторская обложка: Железный человек", {
    exact: true,
  });
  await expect(img).toHaveAttribute("src", /cover-fallback.svg$/);
  await noOverflow(page);
});
