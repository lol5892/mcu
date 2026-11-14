import { expect, it } from "vitest";
import { characterCount } from "./impressions";
it("counts Unicode code points rather than UTF-16 units consistently with PostgreSQL char_length", () => {
  expect(characterCount("Таня ❤️")).toBe(7);
  expect(characterCount("😀".repeat(200))).toBe(200);
  expect(characterCount("😀".repeat(201))).toBe(201);
  expect(characterCount("е\u0301")).toBe(2);
});
