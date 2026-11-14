import { test, expect } from "@playwright/test";
import { setup, noOverflow, safeArea } from "./helpers";
import { readFileSync } from "node:fs";
const registry = JSON.parse(
  readFileSync(
    new URL("../../src/legend/registry.json", import.meta.url),
    "utf8",
  ),
) as { id: string }[];
test("all 82 collectible paintings load small and enlarged without clipping", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  await setup(page, context);
  await page.goto("/#/legend");
  await safeArea(page);
  const cards = page.locator(".legend-card");
  await expect(cards).toHaveCount(82);
  for (let i = 0; i < registry.length; i++) {
    const card = cards.nth(i);
    await card.scrollIntoViewIfNeeded();
    const img = card.locator(".trophy-art img");
    await expect
      .poll(() =>
        img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth),
      )
      .toBe(320);
    await expect(img).toHaveAttribute(
      "src",
      new RegExp(`/thumbs/${registry[i].id}\\.webp$`),
    );
    const g = await img.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        p = el.parentElement!.getBoundingClientRect();
      return {
        w: r.width,
        h: r.height,
        dx: r.x + r.width / 2 - p.x - p.width / 2,
        dy: r.y + r.height / 2 - p.y - p.height / 2,
      };
    });
    expect(g.w).toBeGreaterThan(90);
    expect(Math.abs(g.w - g.h)).toBeLessThan(0.5);
    expect(Math.abs(g.dx)).toBeLessThan(0.5);
    expect(Math.abs(g.dy)).toBeLessThan(0.5);
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const large = dialog.locator(".trophy-art-large img");
    await expect
      .poll(() =>
        large.evaluate(
          (el: HTMLImageElement) => el.complete && el.naturalWidth,
        ),
      )
      .toBe(512);
    await expect(large).toHaveAttribute(
      "src",
      new RegExp(`/trophies-v251/${registry[i].id}\\.webp$`),
    );
    const box = await large.boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.width).toBeCloseTo(box!.height, 0);
    await dialog
      .getByRole("button", { name: "Закрыть окно", exact: true })
      .click();
  }
  await page.getByLabel("Коллекция наград").selectOption("phases");
  await page.evaluate(() => scrollTo(0, 0));
  await noOverflow(page);
  await page.screenshot({
    path: `docs/v2.5.1/after/${info.project.name}-phases-full.png`,
    fullPage: true,
    scale: "css",
  });
  await cards.first().click();
  await noOverflow(page);
  await page.getByRole("dialog").screenshot({
    path: `docs/v2.5.1/after/${info.project.name}-phase-large.png`,
    scale: "css",
  });
});
test("all six collections remain readable and enlarged artwork has a smaller-image recovery", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await page.goto("/#/legend");
  await safeArea(page);
  for (const category of [
    "path",
    "phases",
    "heroes",
    "series",
    "critics",
    "family",
  ]) {
    await page.getByLabel("Коллекция наград").selectOption(category);
    await page.evaluate(() => scrollTo(0, 0));
    await noOverflow(page);
    await page.evaluate(() => {
      const grid = document.querySelector(".legend-grid")!;
      window.scrollTo(
        0,
        grid.getBoundingClientRect().top + window.scrollY - 56,
      );
    });
    await noOverflow(page);
    await page.screenshot({
      path: `docs/v2.5.1/after/${info.project.name}-${category}.png`,
      scale: "css",
    });
  }
  await page.getByLabel("Коллекция наград").selectOption("phases");
  await page.route("**/trophies-v251/phase-1-v1.webp", (r) => r.abort());
  await page.locator(".legend-card").first().click();
  const image = page.getByRole("dialog").locator(".trophy-art-large img");
  await expect(image).toHaveAttribute("src", /thumbs\/phase-1-v1.webp$/);
  await expect
    .poll(() =>
      image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth),
    )
    .toBe(320);
  await noOverflow(page);
});

test("trophy gallery loads thumbnails lazily and records scroll/open diagnostics", async ({
  page,
  context,
}, info) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/trophies-v251/")) requests.push(r.url());
  });
  await setup(page, context);
  await page.goto("/#/legend");
  await noOverflow(page);
  const initial = new Set(requests.filter((p) => p.includes("/thumbs/"))).size;
  expect(initial).toBeGreaterThan(0);
  expect(initial).toBeLessThan(82);
  expect(requests.filter((p) => !p.includes("/thumbs/"))).toHaveLength(0);
  const frames = await page.evaluate(async () => {
    const a: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 90; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const now = performance.now();
      a.push(now - last);
      last = now;
      window.scrollBy(0, 40);
    }
    return a.sort((x, y) => x - y);
  });
  await page.evaluate(() => scrollTo(0, 0));
  const start = Date.now();
  await page.locator(".legend-card").first().click();
  const image = page.getByRole("dialog").locator(".trophy-art-large img");
  await expect
    .poll(() =>
      image.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth),
    )
    .toBe(512);
  const detailOpenMs = Date.now() - start;
  const heap = await page.evaluate(
    () => (performance as any).memory?.usedJSHeapSize ?? null,
  );
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir("docs/v2.5.1/after", { recursive: true });
  await writeFile(
    `docs/v2.5.1/after/${info.project.name}-performance.json`,
    JSON.stringify(
      {
        environment:
          "Synthetic family; desktop browser emulation, not physical iPhone performance. JS heap excludes decoded image/GPU memory.",
        initialUniqueThumbnails: initial,
        frameMedianMs: frames[45],
        frameP95Ms: frames[85],
        detailOpenMs,
        jsHeapBytes: heap,
      },
      null,
      2,
    ),
  );
});
