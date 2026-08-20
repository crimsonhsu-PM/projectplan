import { describe, expect, it } from "vitest";
import {
  buildImportPreview,
  buildPersonnelScheduleSummaries,
  buildProjectExportHtml,
  buildProjectManpowerSummary,
  decodeSpreadsheetBuffer,
  getDuration,
  getHolidayDateSet,
  getWorkdayDuration,
  mapImportedRows,
  normalizeEpic,
  normalizeSettings,
  normalizeTask,
  parseDelimitedRows,
  parseImportedDate,
  parseSpreadsheetText,
  reorderTasks,
} from "../../lib/planner-domain";
import { epicFixture, settingsFixture, taskFixture } from "../fixtures/project";

describe("calendar calculations", () => {
  it("counts inclusive calendar days and handles invalid values", () => {
    expect(getDuration("2026-06-15", "2026-06-15")).toBe(1);
    expect(getDuration("2026-06-15", "2026-06-17")).toBe(3);
    expect(getDuration("invalid", "2026-06-17")).toBe(0);
  });

  it("counts weekdays while excluding weekends, holidays and reversed ranges", () => {
    const holidays = getHolidayDateSet(settingsFixture.holidays);
    expect(getWorkdayDuration("2026-06-15", "2026-06-21", holidays)).toBe(4);
    expect(getWorkdayDuration("2026-02-27", "2026-03-02", new Set())).toBe(2);
    expect(getWorkdayDuration("2026-06-20", "2026-06-19", holidays)).toBe(0);
    expect(getWorkdayDuration("bad", "2026-06-19", holidays)).toBe(0);
  });

  it("expands multi-day holidays and ignores invalid ranges", () => {
    const dates = getHolidayDateSet([
      { id: "a", startDate: "2026-01-01", endDate: "2026-01-03", note: "" },
      { id: "b", startDate: "bad", endDate: "bad", note: "" },
    ]);
    expect([...dates]).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});

describe("normalization and summaries", () => {
  it("normalizes task status, department, duration and progress", () => {
    expect(normalizeTask(taskFixture({ type: "Done", department: "", progress: 140 }))).toMatchObject({
      type: "完成",
      department: "企劃",
      duration: 2,
      progress: 100,
    });
    expect(normalizeTask(taskFixture({ type: "待確認", progress: -2 })).type).toBe("待辦");
  });

  it("recomputes epic progress from completed tasks", () => {
    const epic = normalizeEpic(epicFixture({ category: "invalid" as "機台", department: "", starred: undefined }));
    expect(epic.category).toBe("機台");
    expect(epic.department).toBe("PM");
    expect(epic.progress).toBe(50);
    expect(epic.starred).toBe(false);
  });

  it("normalizes legacy settings and removes duplicate agents", () => {
    const settings = normalizeSettings(
      ({
        departments: [" QA ", "QA", ""],
        agents: ["QA|Tester", "QA|Tester", { name: "Alice", department: "企劃" }],
        holidays: ["2026-01-01", { startDate: "2026-02-01", note: "休假" }],
        types: ["全新開發", { label: "優化", color: "#fff" }],
        statuses: [],
      } as unknown) as Partial<typeof settingsFixture>,
      settingsFixture,
    );
    expect(settings.departments).toEqual(["QA"]);
    expect(settings.agents.map((agent) => agent.name)).toEqual(["Tester", "Alice"]);
    expect(settings.holidays).toHaveLength(2);
    expect(settings.statuses).toBe(settingsFixture.statuses);
  });

  it("falls back when legacy setting collections are unusable", () => {
    expect(normalizeSettings(undefined, settingsFixture)).toEqual(settingsFixture);
    const normalized = normalizeSettings(
      ({ departments: "QA", agents: ["", 42], types: ["", 42], statuses: "todo", holidays: ["bad", 42] } as unknown) as Partial<typeof settingsFixture>,
      settingsFixture,
    );
    expect(normalized).toEqual(settingsFixture);
  });

  it("groups manpower by department and agent", () => {
    const summary = buildProjectManpowerSummary(epicFixture(), new Set());
    expect(summary).toMatchObject({ taskCount: 2, peopleCount: 2, workdays: 4 });
    expect(summary.departments.map((department) => department.name)).toEqual(["QA", "企劃"]);
    expect(summary.departments[0].agents[0].completedTaskCount).toBe(1);
  });

  it("builds personnel schedules including unassigned work", () => {
    const epic = epicFixture({ tasks: [taskFixture({ assignee: "", department: "" }), taskFixture({ id: "task-2", assignee: "Alice", type: "完成" })] });
    const people = buildPersonnelScheduleSummaries([epic], new Set());
    expect(people.map((person) => person.name)).toContain("未指派");
    expect(people.find((person) => person.name === "Alice")?.projects[0]).toMatchObject({ taskCount: 1, completedTaskCount: 1 });
  });
});

describe("task ordering", () => {
  const tasks = [taskFixture(), taskFixture({ id: "task-2", wbs: "1.2", title: "B" }), taskFixture({ id: "task-3", wbs: "1.3", title: "C" })];

  it("moves tasks before and after a target and renumbers WBS", () => {
    expect(reorderTasks(tasks, "task-3", "task-1", "1").map((task) => [task.id, task.wbs])).toEqual([
      ["task-3", "1.1"], ["task-1", "1.2"], ["task-2", "1.3"],
    ]);
    expect(reorderTasks(tasks, "task-1", "task-2", "1", "after").map((task) => task.id)).toEqual(["task-2", "task-1", "task-3"]);
  });

  it("returns the original reference for invalid moves", () => {
    expect(reorderTasks(tasks, "task-1", "task-1", "1")).toBe(tasks);
    expect(reorderTasks(tasks, "missing", "task-1", "1")).toBe(tasks);
  });
});

describe("spreadsheet import and export", () => {
  const csv = [
    "類型,標籤,WBS,Priority,Epic/Task,Type/狀態,部門,Agent,Start,Finish,RM/JIRA",
    'EPIC,機台,9,1,"逗號, 專案",全新開發,PM,Alice,2026/06/01,2026/06/30,RM-1',
    "TASK,機台,9.1,,驗收,完成,QA,Bob,26.06.15,2026-06-16,",
  ].join("\n");

  it("parses quoted CSV, TSV and HTML tables", () => {
    expect(parseDelimitedRows(csv)[1][4]).toBe("逗號, 專案");
    expect(parseDelimitedRows("kind\twbs\ttitle\nEPIC\t1\tA")).toHaveLength(2);
    expect(parseSpreadsheetText("<table><tr><th>WBS</th></tr><tr><td>1</td></tr></table>")).toEqual([["WBS"], ["1"]]);
  });

  it("maps aliases and produces a deterministic import preview", () => {
    const rows = mapImportedRows(parseSpreadsheetText(csv));
    const preview = buildImportPreview(rows, settingsFixture, 1234);
    expect(preview.errors).toEqual([]);
    expect(preview.epics[0]).toMatchObject({ id: "import-epic-1234-0", wbs: "9", title: "逗號, 專案" });
    expect(preview.epics[0].tasks[0]).toMatchObject({ id: "import-task-1234-3", wbs: "9.1", type: "完成" });
  });

  it("reports empty, malformed and orphan task rows", () => {
    expect(buildImportPreview([], settingsFixture).errors[0]).toContain("找不到可匯入");
    const rows = mapImportedRows(parseSpreadsheetText("類型,WBS,Epic/Task,Start,Finish\nWRONG,1,A,2026-01-01,2026-01-02\nTASK,2.1,B,2026-01-01,2026-01-02"));
    expect(buildImportPreview(rows, settingsFixture).errors).toEqual([
      "第 2 列：類型需為 EPIC 或 TASK",
      "第 3 列：找不到 WBS 2 的 EPIC",
    ]);
    expect(buildImportPreview([
      { kind: "EPIC", category: "", wbs: "", priority: "", title: "A", type: "", department: "", assignee: "", startDate: "2026-01-01", finishDate: "2026-01-02", rm: "", rowNumber: 1 },
      { kind: "EPIC", category: "", wbs: "1", priority: "", title: "", type: "", department: "", assignee: "", startDate: "2026-01-01", finishDate: "2026-01-02", rm: "", rowNumber: 2 },
      { kind: "EPIC", category: "", wbs: "2", priority: "", title: "B", type: "", department: "", assignee: "", startDate: "", finishDate: "2026-01-02", rm: "", rowNumber: 3 },
    ], settingsFixture).errors).toEqual([
      "第 1 列：WBS 必填",
      "第 2 列：Epic/Task 必填",
      "第 3 列：Start / Finish 日期格式不正確",
    ]);
  });

  it("decodes UTF-16 BOM and formats dates", () => {
    const encoded = new Uint8Array([0xff, 0xfe, 65, 0, 66, 0]);
    expect(decodeSpreadsheetBuffer(encoded.buffer)).toBe("AB");
    expect(parseImportedDate("26.6.5")).toBe("2026-06-05");
    expect(parseImportedDate("not-a-date")).toBe("");
    expect(decodeSpreadsheetBuffer(new Uint8Array([0xfe, 0xff, 0, 65]).buffer)).toBe("A");
    expect(decodeSpreadsheetBuffer(new TextEncoder().encode("plain utf8").buffer)).toBe("plain utf8");
  });

  it("escapes exported cells and includes workday and completion values", () => {
    const html = buildProjectExportHtml("A < B", "機台", "2026-06-01", [epicFixture()], new Set());
    expect(html).toContain("A &lt; B");
    expect(html).toContain("50%");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("RM/JIRA");
  });
});
