import { describe, expect, it } from "vitest";
import { isEpicContinuedInSheet, isEpicInSheet } from "../../lib/planner-domain";
import type { Epic, SheetOption, Task } from "../../lib/planner-types";

const sheets: SheetOption[] = [
  { id: "h1", name: "2026 上半", startDate: "2026-01-02" },
  { id: "h2", name: "2026 下半", startDate: "2026-07-01" },
];
const task = (finishDate: string): Task => ({ id: finishDate, wbs: "1", department: "企劃", title: "", type: "", assignee: "", startDate: "2026-03-01", finishDate, duration: 1, rm: "", progress: 0 });
const epic = (sheetId: string | undefined, finishes: string[]): Epic => ({ ...task("2026-03-02"), priority: "", category: "機台", sheetId, tasks: finishes.map(task) });

describe("sheet membership", () => {
  it("continues a first-half epic into the second half when a task runs past its start", () => {
    const e = epic("h1", ["2026-05-01", "2026-08-10"]);
    expect(isEpicInSheet(e, sheets[0], sheets)).toBe(true);
    expect(isEpicContinuedInSheet(e, sheets[1], sheets)).toBe(true);
  });
  it("does not pull an epic backwards or when all tasks end before the sheet starts", () => {
    expect(isEpicInSheet(epic("h1", ["2026-06-30"]), sheets[1], sheets)).toBe(false);
    expect(isEpicInSheet(epic("h2", ["2026-08-01"]), sheets[0], sheets)).toBe(false);
    expect(isEpicInSheet(epic(undefined, ["2026-08-01"]), sheets[1], sheets)).toBe(false);
  });
});
