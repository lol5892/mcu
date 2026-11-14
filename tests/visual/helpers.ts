import { expect, type Page, type BrowserContext } from "@playwright/test";
import { fixture } from "../family/contract";
export async function setup(page: Page, context: BrowserContext) {
  const backend = fixture();
  for (const p of backend.profiles.values()) {
    p.welcome_seen_at = "2026-11-08";
    p.onboarding_seen_at = "2026-11-08";
  }
  await backend.connect(context);
  await page.goto("/");
  await page.getByLabel("Email для входа").fill("anton@example.test");
  await page
    .getByRole("button", { name: "Получить письмо для входа", exact: true })
    .click();
  await page.getByLabel("Код подтверждения").fill("123456");
  await page
    .getByRole("button", { name: "Войти в нашу вселенную", exact: true })
    .click();
  await expect(page.locator(".family-stats")).toBeVisible();
  return backend;
}
export async function safeArea(
  page: Page,
  top = 44,
  bottom = 34,
  left = 0,
  right = 0,
) {
  await page.addStyleTag({
    content: `:root{--safe-top:${top}px;--safe-bottom:${bottom}px;--safe-left:${left}px;--safe-right:${right}px}`,
  });
}
export async function noOverflow(page: Page) {
  await expect
    .poll(
      () =>
        page.locator("img").evaluateAll((images) =>
          images
            .filter((img) => {
              const r = img.getBoundingClientRect();
              return (
                r.width > 0 &&
                r.height > 0 &&
                r.bottom > 0 &&
                r.top < innerHeight
              );
            })
            .every(
              (img) =>
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0,
            ),
        ),
      { timeout: 15000 },
    )
    .toBe(true);

  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return (
            r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
          );
        })
        .map((img) => (img as HTMLImageElement).decode().catch(() => {})),
    );
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
export async function heartGeometry(page: Page) {
  return page
    .locator(".favorite-button")
    .first()
    .evaluate((button) => {
      const svg = button.querySelector("svg")!;
      const b = button.getBoundingClientRect(),
        s = svg.getBoundingClientRect(),
        css = getComputedStyle(button);
      return {
        button: { x: b.x, y: b.y, width: b.width, height: b.height },
        svg: { x: s.x, y: s.y, width: s.width, height: s.height },
        dx: s.x + s.width / 2 - b.x - b.width / 2,
        dy: s.y + s.height / 2 - b.y - b.height / 2,
        padding: css.padding,
        display: css.display,
        viewBox: svg.getAttribute("viewBox"),
      };
    });
}
