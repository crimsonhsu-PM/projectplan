import { describe, expect, it } from "vitest";
import { autoAssign, resolveDepartment } from "../../lib/auto-assign";
import type { AgentOption, Epic, Task } from "../../lib/planner-types";

const agents: AgentOption[] = [
  { id: "a1", name: "Ethan", department: "企劃" },
  { id: "a2", name: "Nora", department: "企劃" },
  { id: "a3", name: "Mia", department: "PM" },
  { id: "a4", name: "Lucas", department: "後端" },
  { id: "a5", name: "Daniel", department: "後端" },
  { id: "a6", name: "Olivia", department: "前端" },
];

function task(id: string, department: string, assignee: string, startDate: string, finishDate: string): Task {
  return { id, wbs: id, department, title: id, type: "", assignee, startDate, finishDate, duration: 1, rm: "", progress: 0 };
}

function epic(id: string, assignee: string, department: string, tasks: Task[]): Epic {
  return { ...task(id, department, assignee, "2026-01-01", "2026-12-31"), priority: "1", category: "機台", tasks };
}

describe("resolveDepartment", () => {
  it("maps combined and fallback departments", () => {
    expect(resolveDepartment("企劃", agents)).toBe("企劃");
    expect(resolveDepartment("企+前", agents)).toBe("企劃");
    expect(resolveDepartment("後+Q", agents)).toBe("後端");
    expect(resolveDepartment("各部門自測", agents)).toBe("PM");
    expect(resolveDepartment("音樂", agents)).toBe("企劃");
  });
});

describe("autoAssign", () => {
  it("fills blanks and 沿用, keeps existing people, records originals", () => {
    const epics = [
      epic("e1", "", "PM", [
        task("t1", "後端", "Daniel", "2026-03-01", "2026-03-05"),
        task("t2", "後端", "", "2026-03-02", "2026-03-03"),
        task("t3", "企劃", "沿用", "2026-03-01", "2026-03-02"),
        task("t4", "企劃", "", "2026-03-04", "2026-03-06"),
        task("t5", "各部門自測", "", "2026-03-07", "2026-03-08"),
      ]),
    ];
    const { epics: out, changes, count } = autoAssign(epics, agents);
    const byId = Object.fromEntries(out[0].tasks.map((t) => [t.id, t.assignee]));
    expect(byId.t1).toBe("Daniel");
    expect(byId.t2).toBe("Daniel"); // 同 Epic 同部門沿用
    expect(byId.t3).toBe(byId.t4); // 企劃同一人
    expect(byId.t5).toBe("Mia");
    expect(out[0].assignee).toBe("Mia");
    expect(changes.t3).toBe("沿用");
    expect(count).toBe(5);
    expect(epics[0].tasks[1].assignee).toBe(""); // 不改原資料
  });

  it("balances new epics across people by overlapping workload", () => {
    const epics = [
      epic("e1", "Mia", "PM", [task("t1", "企劃", "Ethan", "2026-05-01", "2026-05-20")]),
      epic("e2", "Mia", "PM", [task("t2", "企劃", "", "2026-05-05", "2026-05-10")]),
    ];
    const { epics: out } = autoAssign(epics, agents);
    expect(out[1].tasks[0].assignee).toBe("Nora");
  });
});
