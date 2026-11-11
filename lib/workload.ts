// 人員負載：給 PM 判斷「這個人手上有多少、哪天開始有空、還能不能再排」。
import { addDays, formatIso, isCompletedTask } from "./planner-domain";
import type { AgentOption, Epic, Task } from "./planner-types";

export type OpenTask = {
  epicId: string;
  epicTitle: string;
  task: Task;
  overdue: boolean;
};

export type PersonWorkload = {
  name: string;
  department: string;
  openCount: number;
  overdueCount: number;
  weeklyLoad: number[]; // 未來每週同時進行的未完成工作數
  availableFrom: string; // 最早可接新工作日（工作日）
  openTasks: OpenTask[];
};

const PLACEHOLDERS = new Set(["", "沿用", "未指派"]);

function isDone(task: Task) {
  return task.progress >= 100 || isCompletedTask(task);
}

function parse(date: string) {
  return new Date(`${date}T00:00:00`);
}

export function isWorkday(date: Date, holidayDates: Set<string>) {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !holidayDates.has(formatIso(date));
}

export function nextWorkday(fromIso: string, holidayDates: Set<string>, inclusive = false) {
  let current = parse(fromIso);
  if (Number.isNaN(current.getTime())) return fromIso;
  if (!inclusive) current = addDays(current, 1);
  for (let guard = 0; guard < 60 && !isWorkday(current, holidayDates); guard += 1) {
    current = addDays(current, 1);
  }
  return formatIso(current);
}

export function weekStarts(todayIso: string, weeks: number) {
  const today = parse(todayIso);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return Array.from({ length: weeks }, (_, index) => formatIso(addDays(monday, index * 7)));
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && startB <= endA;
}

export function buildWorkloads(
  epics: Epic[],
  agents: AgentOption[],
  holidayDates: Set<string>,
  todayIso: string,
  weeks = 8,
): PersonWorkload[] {
  const starts = weekStarts(todayIso, weeks);
  const people = new Map<string, PersonWorkload>();
  const ensure = (name: string, department: string) => {
    const existing = people.get(name);
    if (existing) return existing;
    const created: PersonWorkload = {
      name,
      department,
      openCount: 0,
      overdueCount: 0,
      weeklyLoad: starts.map(() => 0),
      availableFrom: nextWorkday(todayIso, holidayDates, true),
      openTasks: [],
    };
    people.set(name, created);
    return created;
  };
  for (const agent of agents) ensure(agent.name, agent.department);

  for (const epic of epics) {
    for (const task of epic.tasks) {
      const name = task.assignee.trim();
      if (PLACEHOLDERS.has(name) || isDone(task)) continue;
      const person = ensure(name, task.department.trim());
      const overdue = Boolean(task.finishDate) && task.finishDate < todayIso;
      person.openCount += 1;
      if (overdue) person.overdueCount += 1;
      person.openTasks.push({ epicId: epic.id, epicTitle: epic.title, task, overdue });
      starts.forEach((weekStart, index) => {
        const weekEnd = formatIso(addDays(parse(weekStart), 6));
        // 逾期未完成的工作視為還在手上，算進本週
        const finish = overdue ? todayIso : task.finishDate;
        if (overlaps(task.startDate, finish, weekStart, weekEnd)) person.weeklyLoad[index] += 1;
      });
    }
  }

  for (const person of people.values()) {
    person.openTasks.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.task.finishDate.localeCompare(b.task.finishDate));
    // 逾期的工作視為今天要做完；最早可接 = 手上最後一筆結束後的下一個工作日
    const busyUntil = person.openTasks.reduce((latest, item) => {
      const finish = item.overdue ? todayIso : item.task.finishDate;
      return finish > latest ? finish : latest;
    }, "");
    person.availableFrom = busyUntil ? nextWorkday(busyUntil, holidayDates) : nextWorkday(todayIso, holidayDates, true);
  }

  return Array.from(people.values()).sort(
    (a, b) => a.availableFrom.localeCompare(b.availableFrom) || a.openCount - b.openCount || a.name.localeCompare(b.name),
  );
}

// 某人在一段日期內已有幾件未完成工作（排除指定的那一筆），派工時提示是否撞期
export function countConcurrent(epics: Epic[], name: string, startDate: string, finishDate: string, excludeTaskId?: string) {
  if (!name) return 0;
  let count = 0;
  for (const epic of epics) {
    for (const task of epic.tasks) {
      if (task.id === excludeTaskId || task.assignee.trim() !== name || isDone(task)) continue;
      if (overlaps(task.startDate, task.finishDate, startDate, finishDate)) count += 1;
    }
  }
  return count;
}

export type DepartmentCapacity = {
  department: string;
  people: number;
  scheduledDays: number; // 未來 N 週已排的人天（未完成工作與期間重疊的工作日）
  availableDays: number; // 人數 × 期間工作日
};

// 各部門未來 N 週：已排人天 ÷ 可用人天，判斷整個部門還接不接得了新專案
export function buildDepartmentCapacity(
  epics: Epic[],
  agents: AgentOption[],
  holidayDates: Set<string>,
  todayIso: string,
  weeks = 4,
): DepartmentCapacity[] {
  const rangeStart = weekStarts(todayIso, 1)[0];
  const rangeEnd = formatIso(addDays(parse(rangeStart), weeks * 7 - 1));
  const workdaysIn = (start: string, end: string) => {
    let count = 0;
    for (let current = parse(start); formatIso(current) <= end; current = addDays(current, 1)) {
      if (isWorkday(current, holidayDates)) count += 1;
    }
    return count;
  };
  const rangeWorkdays = workdaysIn(rangeStart, rangeEnd);
  const departmentOf = new Map(agents.map((agent) => [agent.name, agent.department]));
  const result = new Map<string, DepartmentCapacity>();
  for (const agent of agents) {
    const current = result.get(agent.department) ?? { department: agent.department, people: 0, scheduledDays: 0, availableDays: 0 };
    current.people += 1;
    current.availableDays += rangeWorkdays;
    result.set(agent.department, current);
  }
  for (const epic of epics) {
    for (const task of epic.tasks) {
      const name = task.assignee.trim();
      const department = departmentOf.get(name);
      if (!department || isDone(task)) continue;
      const start = task.startDate > rangeStart ? task.startDate : rangeStart;
      const end = task.finishDate < rangeEnd ? task.finishDate : rangeEnd;
      if (start > end) continue;
      result.get(department)!.scheduledDays += workdaysIn(start, end);
    }
  }
  return Array.from(result.values()).sort((a, b) => b.scheduledDays / (b.availableDays || 1) - a.scheduledDays / (a.availableDays || 1));
}

// 把日期往後（或往前）移 N 個工作日，跳過週末與假日
export function shiftWorkdays(iso: string, amount: number, holidayDates: Set<string>) {
  let current = parse(iso);
  if (Number.isNaN(current.getTime()) || !amount) return iso;
  const step = amount > 0 ? 1 : -1;
  let remaining = Math.abs(amount);
  while (remaining > 0) {
    current = addDays(current, step);
    if (isWorkday(current, holidayDates)) remaining -= 1;
  }
  return formatIso(current);
}
