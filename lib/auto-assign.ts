// 自動分派：把沒有負責人（空白或「沿用」）的 Epic／工作項目，依部門分給設定裡的人員。
// 規則：
// 1. 部門 → 人員：用 settings.agents 的部門。複合部門（如「企+前」「後+Q」）取第一個部門；
//    沒有人員的部門（音樂、行銷、客服、MIS、ALL、各部門自測）改由 FALLBACK_DEPARTMENT 指定的部門負責。
// 2. 同一個 Epic 裡同部門已經有人負責，就沿用那個人（任務最多者），讓同一個專案的同部門工作由同一人跟進。
// 3. 否則挑該部門在這段日期內手上工作天數最少的人；平手時選總任務較少者，再依人員設定順序。
import type { AgentOption, Epic, Task } from "./planner-types";

export const PLACEHOLDER_ASSIGNEES = ["", "沿用", "未指派"];

const DEPARTMENT_ALIASES: Record<string, string> = {
  企: "企劃",
  前: "前端",
  後: "後端",
  P: "PM",
  Q: "QA",
  美: "美術",
  RD: "後端",
};

export const FALLBACK_DEPARTMENT: Record<string, string> = {
  音樂: "企劃",
  行銷: "企劃",
  客服: "PM",
  MIS: "後端",
  ALL: "PM",
  各部門自測: "PM",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDay(date: string) {
  const time = new Date(`${date}T00:00:00Z`).getTime();
  return Number.isNaN(time) ? null : Math.round(time / DAY_MS);
}

function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const [as, ae, bs, be] = [toDay(aStart), toDay(aEnd), toDay(bStart), toDay(bEnd)];
  if (as === null || ae === null || bs === null || be === null) return 0;
  return Math.max(0, Math.min(ae, be) - Math.max(as, bs) + 1);
}

export function isUnassigned(assignee: string | undefined) {
  return PLACEHOLDER_ASSIGNEES.includes((assignee ?? "").trim());
}

export function resolveDepartment(department: string, agents: AgentOption[]): string | null {
  const has = (dept: string) => agents.some((agent) => agent.department === dept);
  const raw = (department ?? "").trim();
  if (has(raw)) return raw;
  if (FALLBACK_DEPARTMENT[raw] && has(FALLBACK_DEPARTMENT[raw])) return FALLBACK_DEPARTMENT[raw];
  if (raw.includes("+")) {
    for (const part of raw.split("+").map((item) => item.trim())) {
      const dept = DEPARTMENT_ALIASES[part] ?? part;
      if (has(dept)) return dept;
    }
  }
  return has("PM") ? "PM" : agents[0]?.department ?? null;
}

type Booking = { start: string; end: string };

export type AutoAssignResult = {
  epics: Epic[];
  changes: Record<string, string>; // item id → 原本的負責人（還原用）
  count: number;
};

export function autoAssign(epics: Epic[], agents: AgentOption[]): AutoAssignResult {
  const names = new Set(agents.map((agent) => agent.name));
  const bookings = new Map<string, Booking[]>();
  const totals = new Map<string, number>();
  const book = (name: string, item: Task) => {
    if (!names.has(name)) return;
    bookings.set(name, [...(bookings.get(name) ?? []), { start: item.startDate, end: item.finishDate }]);
    totals.set(name, (totals.get(name) ?? 0) + 1);
  };
  for (const epic of epics) for (const task of epic.tasks) if (!isUnassigned(task.assignee)) book(task.assignee.trim(), task);

  const load = (name: string, item: Task) =>
    (bookings.get(name) ?? []).reduce((sum, b) => sum + overlapDays(b.start, b.end, item.startDate, item.finishDate), 0);

  const pickLeastLoaded = (dept: string, item: Task) => {
    const candidates = agents.filter((agent) => agent.department === dept);
    let best: AgentOption | null = null;
    let bestKey: [number, number] = [Infinity, Infinity];
    for (const agent of candidates) {
      const key: [number, number] = [load(agent.name, item), totals.get(agent.name) ?? 0];
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = agent;
        bestKey = key;
      }
    }
    return best?.name ?? null;
  };

  const changes: Record<string, string> = {};
  const result = epics.map((epic) => ({ ...epic, tasks: epic.tasks.map((task) => ({ ...task })) }));

  for (const epic of result) {
    // 這個 Epic 裡各部門目前誰負責最多
    const owners = new Map<string, Map<string, number>>();
    const note = (dept: string, name: string) => {
      const counts = owners.get(dept) ?? new Map<string, number>();
      counts.set(name, (counts.get(name) ?? 0) + 1);
      owners.set(dept, counts);
    };
    const agentDept = (name: string) => agents.find((agent) => agent.name === name)?.department;
    for (const task of epic.tasks) {
      const name = task.assignee.trim();
      const dept = resolveDepartment(task.department, agents);
      if (!isUnassigned(name) && dept && agentDept(name) === dept) note(dept, name);
    }
    const ownerOf = (dept: string) => {
      const counts = owners.get(dept);
      if (!counts?.size) return null;
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };

    const order = [...epic.tasks].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.wbs.localeCompare(b.wbs, undefined, { numeric: true }));
    for (const task of order) {
      if (!isUnassigned(task.assignee)) continue;
      const dept = resolveDepartment(task.department, agents);
      if (!dept) continue;
      const name = ownerOf(dept) ?? pickLeastLoaded(dept, task);
      if (!name) continue;
      changes[task.id] = task.assignee;
      task.assignee = name;
      book(name, task);
      note(dept, name);
    }

    if (isUnassigned(epic.assignee)) {
      const dept = resolveDepartment(epic.department, agents);
      const name = dept ? ownerOf(dept) ?? pickLeastLoaded(dept, epic) : null;
      if (name) {
        changes[epic.id] = epic.assignee;
        epic.assignee = name;
      }
    }
  }
  return { epics: result, changes, count: Object.keys(changes).length };
}
