import { test, expect } from "@playwright/test";
import { setup, noOverflow, safeArea } from "./helpers";
import { readFileSync } from "node:fs";
const specs = JSON.parse(
  readFileSync(
    new URL("../../src/legend/registry.json", import.meta.url),
    "utf8",
  ),
);
test("all trophy tiers filter correctly and descriptions and conditions are available in detail", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  await page.goto("/#/legend");
  await safeArea(page);
  for (const [tier, count] of [
    ["bronze", 18],
    ["silver", 27],
    ["gold", 28],
    ["platinum", 9],
  ] as const) {
    await page.getByLabel("Уровень трофея").selectOption(tier);
    await expect(page.locator(".legend-card")).toHaveCount(count);
    const first = page.locator(".legend-card").first();
    await first.scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({
      path: `docs/v2.5.2/after/${info.project.name}-${tier}-cards.png`,
      scale: "css",
    });
    await expect(first.locator(".trophy-description")).not.toBeEmpty();
    await first.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Как получить", { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator(".trophy-tier")).toHaveText(
      {
        bronze: "БРОНЗА",
        silver: "СЕРЕБРО",
        gold: "ЗОЛОТО",
        platinum: "ПЛАТИНА",
      }[tier],
    );
    await noOverflow(page);
    await dialog.screenshot({
      path: `docs/v2.5.2/after/${info.project.name}-${tier}.png`,
      scale: "css",
    });
    await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  }
  await page.goto("/#/legend/episodes-100");
  await expect(
    page.getByRole("dialog").getByText("Награда: +25 XP"),
  ).toBeVisible();
  await expect(page.getByRole("dialog").locator(".trophy-tier")).toHaveText(
    "ПЛАТИНА",
  );
  await page.goto("/#/legend/phase-1-v1");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Награда: +100 XP"),
  ).toBeVisible();
});
test("new saved award waits for a safe moment, shows artwork and server XP once, and deep-links", async ({
  page,
  context,
}, info) => {
  const b = await setup(page, context);
  await page.goto("/#/project/iron-man");
  await expect(page.getByRole("dialog")).toBeVisible();
  b.legend.awards.push({
    achievement_id: "phase-1-v1",
    owner: "family",
    xp: 100,
    historical: false,
    unlocked_at: new Date().toISOString(),
  });
  b.tables.mv_notifications.push({
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    family_id: b.tables.mv_members[0].family_id,
    recipient_id: b.anton,
    type: "achievement",
    title: "ЗОЛОТО",
    route: "/legend/phase-1-v1",
    created_at: new Date().toISOString(),
    read_at: null,
  });
  // Force the fixture snapshot refresh; unlike production this fixture has no Realtime service.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  const toast = page.locator(".trophy-toast");
  await expect(toast).toBeVisible({ timeout: 20000 });
  await expect(toast).toContainText("+100 XP");
  await expect(toast.locator("img")).toHaveAttribute(
    "src",
    /thumbs\/phase-1-v1.webp$/,
  );
  await toast.screenshot({
    path: `docs/v2.5.2/after/${info.project.name}-toast.png`,
    scale: "css",
  });
  await toast.getByRole("button", { name: "Посмотреть достижение" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => b.legend.seen.includes("phase-1-v1")).toBe(true);
  await page.reload();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Закрыть окно" })
    .click();
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
});
test("old awards without new server events never create a trophy burst", async ({
  page,
  context,
}) => {
  const b = await setup(page, context);
  b.legend.awards.push(
    ...specs.slice(0, 12).map((a: any) => ({
      achievement_id: a.id,
      owner: a.owner,
      xp: 25,
      historical: false,
      unlocked_at: "2026-11-01T12:00:00Z",
    })),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
});

test("typing, photo upload, synchronization and active viewing defer one compact award batch", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const b = await setup(page, context);
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    input.id = "notice-draft";
    document.body.append(input);
    input.focus();
    input.value = "Наше впечатление";
  });
  for (const [id, xp] of [
    ["phase-1-v1", 100],
    ["hero-stark", 25],
  ] as const) {
    b.legend.awards.push({
      achievement_id: id,
      owner: "family",
      xp,
      historical: false,
      unlocked_at: new Date().toISOString(),
    });
    b.tables.mv_notifications.push({
      id: crypto.randomUUID(),
      family_id: b.tables.mv_members[0].family_id,
      recipient_id: b.anton,
      type: "achievement",
      title: id,
      route: "/legend/" + id,
      created_at: new Date().toISOString(),
      read_at: null,
    });
  }
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
  const block = async (key: string, value: boolean) =>
    page.evaluate(
      async ({ key, value }) => {
        const url = "/src/pwa/safety.ts";
        const mod = await import(/* @vite-ignore */ url);
        mod.setUpdateBlocker(key, value);
      },
      { key, value },
    );
  await block("test-photo-upload", true);
  await page.locator("#notice-draft").evaluate((e) => e.remove());
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
  await block("test-sync", true);
  await block("test-photo-upload", false);
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
  b.tables.mv_sessions.push({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    family_id: b.tables.mv_members[0].family_id,
    project_id: "iron-man",
    author_id: b.anton,
    participants: [b.anton],
    status: "active",
    version: 1,
    created_at: new Date().toISOString(),
    finished_at: null,
  });
  await page.waitForTimeout(6000);
  await block("test-sync", false);
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
  b.tables.mv_sessions.length = 0;
  const toast = page.locator(".trophy-toast");
  await expect(toast).toBeVisible({ timeout: 20000 });
  await expect(toast).toContainText("И ещё 1");
  await expect(toast).toContainText("+100 XP");
  await expect.poll(() => b.legend.seen.length).toBe(2);
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    document.body.append(input);
    input.focus();
  });
  await expect(toast).toHaveCount(0);
});
