import { describe, expect, it } from "vitest";
import { buildWorkloads, countConcurrent, nextWorkday, weekStarts } from "../../lib/workload";
import type { AgentOption, Epic, Task } from "../../lib/planner-types";

const agents: AgentOption[] = [
  { id: "1", name: "Ethan", department: "企劃" },
  { id: "2", name: "Nora", department: "企劃" },
];
const task = (id: string, assignee: string, startDate: string, finishDate: string, type = "進行中"): Task => ({
  id, wbs: id, department: "企劃", title: id, type, assignee, startDate, finishDate, duration: 1, rm: "", progress: type === "完成" ? 100 : 0,
});
const epic = (tasks: Task[]): Epic => ({ ...task("e1", "", "2026-11-01", "2026-12-31"), priority: "", category: "機台", tasks });
const today = "2026-11-11"; // Wednesday

describe("workload", () => {
  it("finds the next workday skipping weekends and holidays", () => {
    expect(nextWorkday("2026-11-13", new Set())).toBe("2026-11-16");
    expect(nextWorkday("2026-11-15", new Set(["2026-11-16"]), true)).toBe("2026-11-17");
    expect(weekStarts(today, 2)).toEqual(["2026-11-09", "2026-11-16"]);
  });

  it("counts open, overdue, weekly load and availability", () => {
    const epics = [
      epic([
        task("t1", "Ethan", "2026-11-02", "2026-11-06"), // overdue
        task("t2", "Ethan", "2026-11-10", "2026-11-20"),
        task("t3", "Ethan", "2026-11-01", "2026-11-05", "完成"),
        task("t4", "沿用", "2026-11-10", "2026-11-20"),
      ]),
    ];
    const [nora, ethan] = buildWorkloads(epics, agents, new Set(), today, 3);
    expect(nora.name).toBe("Nora");
    expect(nora.availableFrom).toBe("2026-11-11");
    expect(ethan.openCount).toBe(2);
    expect(ethan.overdueCount).toBe(1);
    expect(ethan.weeklyLoad).toEqual([2, 1, 0]);
    expect(ethan.availableFrom).toBe("2026-11-23");
    expect(ethan.openTasks[0].task.id).toBe("t1");
  });

  it("counts concurrent open work for a person in a date range", () => {
    const epics = [epic([task("t1", "Ethan", "2026-11-10", "2026-11-20"), task("t2", "Ethan", "2026-12-01", "2026-12-05")])];
    expect(countConcurrent(epics, "Ethan", "2026-11-15", "2026-11-16")).toBe(1);
    expect(countConcurrent(epics, "Ethan", "2026-11-15", "2026-11-16", "t1")).toBe(0);
  });
});

describe("department capacity", () => {
  it("compares scheduled person-days with available person-days", async () => {
    const { buildDepartmentCapacity } = await import("../../lib/workload");
    const epics = [epic([task("t1", "Ethan", "2026-11-09", "2026-11-13")])];
    const [planning] = buildDepartmentCapacity(epics, agents, new Set(), today, 1);
    expect(planning).toEqual({ department: "企劃", people: 2, scheduledDays: 5, availableDays: 10 });
  });
});

describe("shiftWorkdays", () => {
  it("moves across weekends and holidays", async () => {
    const { shiftWorkdays } = await import("../../lib/workload");
    expect(shiftWorkdays("2026-11-13", 1, new Set())).toBe("2026-11-16");
    expect(shiftWorkdays("2026-11-13", 2, new Set(["2026-11-16"]))).toBe("2026-11-18");
    expect(shiftWorkdays("2026-11-16", -1, new Set())).toBe("2026-11-13");
  });
});
