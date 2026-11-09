import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { validateFamilyBackup } from "./Backup";
const base = () => ({
  app: "our-marvel-family",
  version: 2,
  userId: "verified-user",
  familyId: "verified-family",
  letters: [],
  ratings: [],
  messages: [],
});
describe("v2 backup validation", () => {
  it("accepts versioned structure and rejects missing arrays", () => {
    expect(validateFamilyBackup(base()).version).toBe(2);
    expect(() => validateFamilyBackup({ ...base(), letters: null })).toThrow();
  });
  it("rejects out-of-range ratings and excessively long private text", () => {
    expect(() =>
      validateFamilyBackup({ ...base(), ratings: [{ score: 11 }] }),
    ).toThrow();
    expect(() =>
      validateFamilyBackup({
        ...base(),
        letters: [{ title: "x", body: "x".repeat(20001), style: "romantic" }],
      }),
    ).toThrow();
  });
});
