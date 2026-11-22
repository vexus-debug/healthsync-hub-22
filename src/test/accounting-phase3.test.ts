import { describe, it, expect } from "vitest";
import { debtorGroup, pctChange, prevMonth } from "@/lib/accounting";
const now = new Date("2026-06-30T00:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
describe("phase 3 rules", () => {
  it("debtor groups: 0–30 Current, 31–60 Overdue, 60+ Delinquent", () => {
    expect(debtorGroup(ago(30), now)).toBe("Current");
    expect(debtorGroup(ago(31), now)).toBe("Overdue");
    expect(debtorGroup(ago(60), now)).toBe("Overdue");
    expect(debtorGroup(ago(61), now)).toBe("Delinquent");
  });
  it("MoM % change", () => { expect(pctChange(150, 100)).toBe(50); expect(pctChange(5, 0)).toBeNull(); });
  it("previous month wraps year", () => expect(prevMonth("2026-01")).toBe("2025-12"));
});
