import { test, expect } from "@playwright/test";
import { setup, noOverflow } from "./helpers";
const oldAwards = [
  {
    achievement_id: "films-1",
    owner: "family",
    xp: 25,
    unlocked_at: "2025-01-01",
    historical: true,
  },
  {
    achievement_id: "phase-1-v1",
    owner: "family",
    xp: 100,
    unlocked_at: "2025-02-01",
    historical: false,
  },
  {
    achievement_id: "anton-perfect1",
    owner: "anton",
    xp: 25,
    unlocked_at: "2025-03-01",
    historical: false,
  },
  {
    achievement_id: "tanya-ratings-1",
    owner: "tanya",
    xp: 10,
    unlocked_at: "2025-04-01",
    historical: true,
  },
];
test("old cached XP becomes fair offline-style XP on restart without losing owners or showing awards again", async ({
  page,
  context,
}, info) => {
  const b = await setup(page, context);
  const key = `mv-legend:${b.tables.mv_members[0].family_id}:${b.anton}`;
  await page.addInitScript(
    ({ key, awards }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          awards,
          seen: awards.map((a) => a.achievement_id),
          initial: false,
        }),
      ),
    { key, awards: oldAwards },
  );
  // Keep the shell/Auth fixture online, but make the award service unavailable.
  await context.route("**/rest/v1/rpc/mv_legend", (route) => route.abort());
  await page.goto("/#/legend");
  await page.reload();
  await expect(page.locator(".legend-summary h2")).toHaveText(
    "Уровень семьи 1",
  );
  await expect(page.locator(".legend-summary")).toContainText("60 XP");
  await expect(page.locator(".legend-summary")).toContainText(
    "Антон: уровень 1 · 10 XP",
  );
  await expect(page.locator(".legend-summary")).toContainText(
    "Таня: уровень 1 · 10 XP",
  );
  await page.reload();
  await expect(page.locator(".legend-summary")).toContainText("60 XP");
  await noOverflow(page);
  await page.screenshot({
    path: `docs/v2.5.3/after/${info.project.name}-cached-xp.png`,
    scale: "css",
  });
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
});
test("server reconciliation refreshes totals and details without creating a new trophy announcement", async ({
  page,
  context,
}) => {
  const b = await setup(page, context);
  b.legend.awards.push(
    ...oldAwards.map((a) => ({
      ...a,
      xp: (
        { bronze: 10, silver: 25, gold: 50, platinum: 100 } as Record<
          string,
          number
        >
      )[a.achievement_id === "phase-1-v1" ? "gold" : "bronze"],
    })),
  );
  await page.goto("/#/legend");
  await expect(page.locator(".legend-summary")).toContainText("60 XP");
  await page.goto("/#/legend/phase-1-v1");
  await expect(page.getByRole("dialog")).toContainText("Награда: +50 XP");
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await page.waitForTimeout(8000);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
  await expect(page.locator(".legend-summary")).toContainText("60 XP");
});
