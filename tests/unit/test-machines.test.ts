import { describe, expect, it } from "vitest";
import { bookingWarnings, findConflicts, nextRoundBooking, normalizeTestBookings, pushBookings, DEFAULT_TEST_MACHINES } from "../../lib/test-machines";
import type { TestBooking } from "../../lib/planner-types";

const booking = (id: string, machineId: string, startDate: string, finishDate: string, extra: Partial<TestBooking> = {}): TestBooking => ({
  id, machineId, epicIds: ["e1"], round: "R1", item: "", versionSet: "", qa: "", startDate, finishDate, status: "待佈署", taskRef: "", note: "", ...extra,
});

describe("test machines", () => {
  it("flags overlapping bookings on the same machine only", () => {
    const conflicts = findConflicts([
      booking("a", "m1", "2026-11-10", "2026-11-12"),
      booking("b", "m1", "2026-11-12", "2026-11-13"),
      booking("c", "m2", "2026-11-10", "2026-11-12"),
      booking("d", "m1", "2026-11-11", "2026-11-11", { status: "取消" }),
    ]);
    expect([...conflicts].sort()).toEqual(["a", "b"]);
  });

  it("warns about final rounds off the real machines and borrowing dev machines", () => {
    const machines = [...DEFAULT_TEST_MACHINES, { ...DEFAULT_TEST_MACHINES[0], id: "dev", name: "開發機", kind: "開發用機" as const }];
    expect(bookingWarnings({ machineId: "machine-pc-1", round: "Prod" }, machines)[0]).toContain("實體機台");
    expect(bookingWarnings({ machineId: "machine-pc-1", round: "規則測試" }, machines)).toEqual([]);
    expect(bookingWarnings({ machineId: "dev", round: "R1" }, machines)[0]).toContain("備案");
  });

  it("pushes later bookings on one machine and opens the next round", () => {
    const { bookings, moved } = pushBookings(
      [booking("a", "m1", "2026-11-09", "2026-11-10"), booking("b", "m1", "2026-11-12", "2026-11-13"), booking("c", "m2", "2026-11-12", "2026-11-13")],
      "m1", "2026-11-11", 2, new Set(),
    );
    expect(moved.map((item) => item.id)).toEqual(["b"]);
    expect(bookings[1]).toMatchObject({ startDate: "2026-11-16", finishDate: "2026-11-17" });
    expect(nextRoundBooking(booking("a", "m1", "2026-11-12", "2026-11-13", { round: "R2" }), new Set(), "n")).toMatchObject({
      round: "R3", startDate: "2026-11-16", finishDate: "2026-11-17", status: "待佈署",
    });
  });

  it("drops invalid bookings", () => {
    expect(normalizeTestBookings([{ id: "x", machineId: "m", startDate: "bad", finishDate: "2026-01-01" }])).toEqual([]);
  });
});
