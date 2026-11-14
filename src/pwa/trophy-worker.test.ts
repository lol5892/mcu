import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function worker(visible = false, url = "https://example.test/mcu/") {
  const listeners: Record<string, (e: any) => void> = {},
    receipts = new Map<string, unknown>(),
    shown: any[] = [],
    opened: string[] = [];
  const cache = {
    match: async (k: string) => receipts.get(k),
    put: async (k: string, v: unknown) => {
      receipts.set(k, v);
    },
    keys: async () => [...receipts.keys()],
    delete: async (k: string) => receipts.delete(k),
  };
  const self = {
    addEventListener: (n: string, f: any) => (listeners[n] = f),
    registration: {
      scope: "https://example.test/mcu/",
      showNotification: async (title: string, options: any) => {
        shown.push({ title, ...options });
      },
    },
    clients: {
      matchAll: async () =>
        visible ? [{ url, visibilityState: "visible" }] : [],
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  runInNewContext(readFileSync("public/sw-family.js", "utf8"), {
    self,
    caches: { open: async () => cache },
    URL,
    Response,
  });
  async function push(id = "aaaaaaaa-1111-4111-8111-111111111111") {
    let done: Promise<any> = Promise.resolve();
    listeners.push({
      data: {
        json: () => ({
          id,
          title: "Новое достижение",
          body: "ЗОЛОТО · Фьюри · +100 XP",
          route: "/legend/phase-1-v1",
        }),
      },
      waitUntil: (p: Promise<any>) => (done = p),
    });
    await done;
  }
  return { push, shown, opened, listeners };
}
it("deduplicates trophy push receipts and preserves the exact award route and text", async () => {
  const w = worker();
  await w.push();
  await w.push();
  expect(w.shown).toHaveLength(1);
  expect(w.shown[0].body).toContain("ЗОЛОТО");
  expect(w.shown[0].data.route).toBe("/legend/phase-1-v1");
  let done = Promise.resolve();
  w.listeners.notificationclick({
    notification: { close() {}, data: { route: "/legend/phase-1-v1" } },
    waitUntil: (p: Promise<any>) => (done = p),
  });
  await done;
  expect(w.opened[0]).toBe("https://example.test/mcu/#/legend/phase-1-v1");
});
it("leaves visible-app trophy announcements to the safe in-app queue", async () => {
  const w = worker(true);
  await w.push();
  await w.push();
  expect(w.shown).toHaveLength(0);
});

it("does not suppress MCU push for an unrelated visible application on the same origin", async () => {
  const w = worker(true, "https://example.test/other-app/");
  await w.push();
  expect(w.shown).toHaveLength(1);
});
