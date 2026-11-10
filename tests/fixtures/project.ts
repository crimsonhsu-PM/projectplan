import type { AppSettings, Epic, StoredProjectData, Task } from "../../lib/planner-types";

export const settingsFixture: AppSettings = {
  sheets: [],
  departments: ["企劃", "QA", "PM"],
  agents: [
    { id: "agent-alice", name: "Alice", department: "企劃" },
    { id: "agent-bob", name: "Bob", department: "QA" },
  ],
  holidays: [{ id: "holiday", startDate: "2026-06-19", endDate: "2026-06-19", note: "端午節" }],
  types: [{ id: "type-new", label: "全新開發", color: "#0d5bff" }],
  statuses: [
    { id: "status-todo", label: "待辦", color: "#94a3b8" },
    { id: "status-done", label: "完成", color: "#16a34a" },
  ],
};

export function taskFixture(patch: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    wbs: "1.1",
    department: "企劃",
    title: "Task A",
    type: "待辦",
    assignee: "Alice",
    startDate: "2026-06-15",
    finishDate: "2026-06-16",
    duration: 2,
    rm: "",
    progress: 0,
    ...patch,
  };
}

export function epicFixture(patch: Partial<Epic> = {}): Epic {
  return {
    ...taskFixture({ id: "epic-1", wbs: "1", title: "測試專案", department: "PM" }),
    priority: "1",
    category: "機台",
    tasks: [taskFixture(), taskFixture({ id: "task-2", wbs: "1.2", title: "Task B", assignee: "Bob", department: "QA", type: "完成" })],
    ...patch,
  };
}

export function projectDataFixture(): StoredProjectData {
  return {
    project: { projectType: "機台", projectName: "E2E 專案", startDate: "2026-06-01", wk: "1" },
    epics: [epicFixture()],
    settings: settingsFixture,
  };
}
