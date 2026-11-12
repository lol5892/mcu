import { test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { setup, heartGeometry } from "./helpers";
test("capture original screens and measurements", async ({
  page,
  context,
}, info) => {
  await setup(page, context);
  const shots = ["catalog", "universe", "chat", "letters", "moments", "events"];
  const measured: unknown[] = [];
  for (const screen of shots) {
    if (screen === "catalog")
      await page
        .locator(".bottom-nav")
        .getByRole("button", { name: "Каталог", exact: true })
        .click();
    else await page.goto("/#/" + screen);
    await page.locator("main").waitFor();
    if (screen === "catalog") {
      await page
        .locator(".filter-subrow")
        .evaluate((el) =>
          window.scrollTo(
            0,
            el.getBoundingClientRect().top + window.scrollY - 8,
          ),
        );
      measured.push(await heartGeometry(page));
    }
    await page.screenshot({
      path: `docs/v2.2/before/${info.project.name}-${screen}.png`,
      scale: "css",
    });
  }
  await writeFile(
    `docs/v2.2/before/${info.project.name}-measurements.json`,
    JSON.stringify(measured, null, 2),
  );
});
