import dayjs from "dayjs";
import {
  epicCategoryOptions,
  type AgentOption,
  type AppSettings,
  type Epic,
  type EpicCategory,
  type HolidayRange,
  type ImportedRow,
  type ImportPreview,
  type ManpowerAgentSummary,
  type PersonnelProjectSummary,
  type PersonnelScheduleSummary,
  type ProjectManpowerSummary,
  type SettingOption,
  type Task,
} from "./planner-types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDuration(startDate: string, finishDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const finish = new Date(`${finishDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) return 0;
  return Math.max(1, Math.round((finish.getTime() - start.getTime()) / DAY_MS) + 1);
}

export function getHolidayDateSet(holidays: HolidayRange[]) {
  const dates = new Set<string>();
  for (const holiday of holidays) {
    const start = new Date(`${holiday.startDate}T00:00:00`);
    const end = new Date(`${holiday.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
      dates.add(formatIso(current));
    }
  }
  return dates;
}

export function getWorkdayDuration(startDate: string, finishDate: string, holidayDates: Set<string>) {
  const start = new Date(`${startDate}T00:00:00`);
  const finish = new Date(`${finishDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || finish < start) return 0;
  let duration = 0;
  for (let current = new Date(start); current <= finish; current = addDays(current, 1)) {
    const day = current.getDay();
    if (day !== 0 && day !== 6 && !holidayDates.has(formatIso(current))) duration += 1;
  }
  return duration;
}

export function normalizeEpicCategory(value: unknown): EpicCategory {
  return epicCategoryOptions.includes(value as EpicCategory) ? (value as EpicCategory) : "機台";
}

export function isCompletedTask(task: Task) {
  const value = task.type.trim().toLowerCase();
  return value === "done" || task.type.trim() === "完成";
}

export function normalizeTask(task: Task): Task {
  const rawTaskType = task.type.trim();
  const type = rawTaskType.toLowerCase() === "done" ? "完成" : rawTaskType === "待確認" ? "待辦" : task.type;
  return {
    ...task,
    department: task.department || "企劃",
    type,
    duration: getDuration(task.startDate, task.finishDate),
    progress: Math.min(100, Math.max(0, Number(task.progress) || 0)),
  };
}

export function getEpicProgress(tasks: Task[]) {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(isCompletedTask).length / tasks.length) * 100);
}

export function normalizeEpic(epic: Epic): Epic {
  const tasks = epic.tasks.map(normalizeTask);
  return {
    ...epic,
    category: normalizeEpicCategory(epic.category),
    department: epic.department || "PM",
    starred: Boolean(epic.starred),
    tasks,
    duration: getDuration(epic.startDate, epic.finishDate),
    progress: getEpicProgress(tasks),
  };
}

export function renumberTasks(tasks: Task[], epicWbs: string) {
  return tasks.map((task, index) => ({ ...task, wbs: `${epicWbs}.${index + 1}` }));
}

export function reorderTasks(
  tasks: Task[],
  sourceTaskId: string,
  targetTaskId: string,
  epicWbs: string,
  position: "before" | "after" = "before",
) {
  if (sourceTaskId === targetTaskId) return tasks;
  const sourceIndex = tasks.findIndex((task) => task.id === sourceTaskId);
  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);
  if (sourceIndex < 0 || targetIndex < 0) return tasks;
  const next = [...tasks];
  const [movingTask] = next.splice(sourceIndex, 1);
  const adjustedTargetIndex = next.findIndex((task) => task.id === targetTaskId);
  if (adjustedTargetIndex < 0) return tasks;
  next.splice(position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, movingTask);
  return renumberTasks(next, epicWbs);
}

export function buildProjectManpowerSummary(epic: Epic, holidayDates: Set<string>): ProjectManpowerSummary {
  const departmentMap = new Map<string, Map<string, ManpowerAgentSummary>>();
  let startDate = "";
  let finishDate = "";

  for (const task of epic.tasks) {
    if (!startDate || task.startDate < startDate) startDate = task.startDate;
    if (!finishDate || task.finishDate > finishDate) finishDate = task.finishDate;
    const department = task.department.trim() || "未設定部門";
    const agent = task.assignee.trim() || "未指派";
    const workdays = getWorkdayDuration(task.startDate, task.finishDate, holidayDates);
    const agents = departmentMap.get(department) ?? new Map<string, ManpowerAgentSummary>();
    const current = agents.get(agent) ?? {
      key: `${epic.id}-${department}-${agent}`,
      name: agent,
      completedTaskCount: 0,
      taskCount: 0,
      workdays: 0,
      tasks: [],
    };
    agents.set(agent, {
      ...current,
      completedTaskCount: current.completedTaskCount + (isCompletedTask(task) ? 1 : 0),
      taskCount: current.taskCount + 1,
      workdays: current.workdays + workdays,
      tasks: [...current.tasks, toManpowerTask(task, workdays)],
    });
    departmentMap.set(department, agents);
  }

  const departments = Array.from(departmentMap.entries())
    .map(([name, agentMap]) => {
      const agents = Array.from(agentMap.values()).sort(
        (left, right) => right.workdays - left.workdays || left.name.localeCompare(right.name),
      );
      return {
        key: `${epic.id}-${name}`,
        name,
        taskCount: agents.reduce((total, agent) => total + agent.taskCount, 0),
        workdays: agents.reduce((total, agent) => total + agent.workdays, 0),
        agents,
      };
    })
    .sort((left, right) => right.workdays - left.workdays || left.name.localeCompare(right.name));

  return {
    key: epic.id,
    wbs: epic.wbs,
    category: epic.category,
    title: epic.title,
    startDate,
    finishDate,
    taskCount: epic.tasks.length,
    peopleCount: new Set(epic.tasks.map((task) => task.assignee.trim()).filter(Boolean)).size,
    workdays: departments.reduce((total, department) => total + department.workdays, 0),
    departments,
  };
}

export function buildPersonnelScheduleSummaries(epics: Epic[], holidayDates: Set<string>): PersonnelScheduleSummary[] {
  const people = new Map<string, { key: string; name: string; departments: Set<string>; projects: Map<string, PersonnelProjectSummary> }>();
  for (const epic of epics) {
    for (const task of epic.tasks) {
      const name = task.assignee.trim() || "未指派";
      const person = people.get(name) ?? { key: `person-${name}`, name, departments: new Set<string>(), projects: new Map<string, PersonnelProjectSummary>() };
      person.departments.add(task.department.trim() || "未設定部門");
      const current = person.projects.get(epic.id) ?? {
        key: `${name}-${epic.id}`,
        wbs: epic.wbs,
        category: epic.category,
        title: epic.title,
        startDate: task.startDate,
        finishDate: task.finishDate,
        taskCount: 0,
        completedTaskCount: 0,
        tasks: [],
      };
      person.projects.set(epic.id, {
        ...current,
        startDate: task.startDate < current.startDate ? task.startDate : current.startDate,
        finishDate: task.finishDate > current.finishDate ? task.finishDate : current.finishDate,
        taskCount: current.taskCount + 1,
        completedTaskCount: current.completedTaskCount + (isCompletedTask(task) ? 1 : 0),
        tasks: [...current.tasks, toManpowerTask(task, getWorkdayDuration(task.startDate, task.finishDate, holidayDates))],
      });
      people.set(name, person);
    }
  }

  return Array.from(people.values())
    .map((person) => {
      const projects = Array.from(person.projects.values()).sort((left, right) => {
        const leftProgress = left.taskCount ? left.completedTaskCount / left.taskCount : 0;
        const rightProgress = right.taskCount ? right.completedTaskCount / right.taskCount : 0;
        const completionDifference = Number(leftProgress === 1) - Number(rightProgress === 1);
        return completionDifference || epicCategoryOptions.indexOf(left.category) - epicCategoryOptions.indexOf(right.category) || rightProgress - leftProgress || left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title);
      });
      return {
        key: person.key,
        name: person.name,
        departments: Array.from(person.departments).sort((left, right) => left.localeCompare(right)),
        projectCount: projects.length,
        taskCount: projects.reduce((total, project) => total + project.taskCount, 0),
        projects,
      };
    })
    .sort((left, right) => (left.departments[0] ?? "未設定部門").localeCompare(right.departments[0] ?? "未設定部門", "zh-Hant") || right.projectCount - left.projectCount || right.taskCount - left.taskCount || left.name.localeCompare(right.name));
}

function toManpowerTask(task: Task, workdays: number) {
  return {
    key: task.id,
    wbs: task.wbs,
    title: task.title,
    status: task.type.trim() || "未設定",
    completed: isCompletedTask(task),
    startDate: task.startDate,
    finishDate: task.finishDate,
    workdays,
  };
}

export function escapeSpreadsheetCell(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function spreadsheetRow(cells: unknown[]) {
  return `<tr>${cells.map((cell) => `<td>${escapeSpreadsheetCell(cell)}</td>`).join("")}</tr>`;
}

export function buildProjectExportHtml(projectName: string, projectType: string, startDate: string, epics: Epic[], holidayDates: Set<string>) {
  const rows = [
    spreadsheetRow(["專案名稱", projectName]),
    spreadsheetRow(["Project type", projectType]),
    spreadsheetRow(["Start date", startDate]),
    spreadsheetRow([]),
    spreadsheetRow(["類型", "標籤", "WBS", "Priority", "Epic/Task", "Type/狀態", "部門", "Agent", "Start", "Finish", "工作天數", "完成度", "RM/JIRA"]),
    ...epics.flatMap((epic) => [
      spreadsheetRow(["EPIC", epic.category, epic.wbs, epic.priority, epic.title, epic.type, epic.department, epic.assignee, epic.startDate, epic.finishDate, getWorkdayDuration(epic.startDate, epic.finishDate, holidayDates), `${getEpicProgress(epic.tasks)}%`, epic.rm]),
      ...epic.tasks.map((task) => spreadsheetRow(["TASK", epic.category, task.wbs, "", task.title, task.type, task.department, task.assignee, task.startDate, task.finishDate, getWorkdayDuration(task.startDate, task.finishDate, holidayDates), "", task.rm])),
    ]),
  ];
  return `<!doctype html><html><head><meta charset="UTF-8"></head><body><table>${rows.join("")}</table></body></html>`;
}

export function parseImportedDate(value: string) {
  const text = value.trim();
  if (!text) return "";
  const normalized = text.replace(/\//g, "-").replace(/\./g, "-");
  const match = normalized.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = match[1].length === 2 ? `20${match[1]}` : match[1];
    const date = new Date(Number(year), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(date.getTime())) return formatIso(date);
  }
  const fallback = dayjs(normalized);
  return fallback.isValid() ? fallback.format("YYYY-MM-DD") : "";
}

export function parseDelimitedRows(text: string) {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') inQuotes = !inQuotes;
    else if (char === delimiter && !inQuotes) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      cell = ""; row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseHtmlTableRows(text: string) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return Array.from(doc.querySelectorAll("tr"))
    .map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? ""))
    .filter((row) => row.some(Boolean));
}

export function parseSpreadsheetText(text: string) {
  return /<table[\s>]/i.test(text) ? parseHtmlTableRows(text) : parseDelimitedRows(text);
}

export function decodeSpreadsheetBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const sample = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset = sample.match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1];
  if (charset) {
    try { return new TextDecoder(charset).decode(bytes); } catch { /* fall through */ }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function headerColumnIndex(headers: string[], aliases: string[], fallback: number) {
  const index = headers.findIndex((header) => aliases.some((alias) => header.toLowerCase() === alias.toLowerCase()));
  return index >= 0 ? index : fallback;
}

export function mapImportedRows(rows: string[][]): ImportedRow[] {
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.toLowerCase() === "wbs"));
  const headers = headerIndex >= 0 ? rows[headerIndex].map((cell) => cell.trim()) : [];
  const offset = headers.some((header) => ["標籤", "tag", "category"].includes(header.toLowerCase())) ? 1 : 0;
  const indexes = {
    kind: headerColumnIndex(headers, ["類型", "kind"], 0), category: headerColumnIndex(headers, ["標籤", "tag", "category"], -1),
    wbs: headerColumnIndex(headers, ["wbs"], 1 + offset), priority: headerColumnIndex(headers, ["priority"], 2 + offset),
    title: headerColumnIndex(headers, ["epic/task", "epic/task description", "task", "title"], 3 + offset),
    type: headerColumnIndex(headers, ["type/狀態", "type", "狀態", "status"], 4 + offset), department: headerColumnIndex(headers, ["部門", "department"], 5 + offset),
    assignee: headerColumnIndex(headers, ["agent", "assignee"], 6 + offset), startDate: headerColumnIndex(headers, ["start", "start date"], 7 + offset),
    finishDate: headerColumnIndex(headers, ["finish", "finish date"], 8 + offset), rm: headerColumnIndex(headers, ["rm/jira", "rm", "jira"], 9 + offset),
  };
  return rows.slice(headerIndex >= 0 ? headerIndex + 1 : 0).map((row, index) => ({
    kind: row[indexes.kind]?.trim().toUpperCase() ?? "", category: indexes.category >= 0 ? row[indexes.category]?.trim() ?? "" : "",
    wbs: row[indexes.wbs]?.trim() ?? "", priority: row[indexes.priority]?.trim() ?? "", title: row[indexes.title]?.trim() ?? "",
    type: row[indexes.type]?.trim() ?? "", department: row[indexes.department]?.trim() ?? "", assignee: row[indexes.assignee]?.trim() ?? "",
    startDate: parseImportedDate(row[indexes.startDate] ?? ""), finishDate: parseImportedDate(row[indexes.finishDate] ?? ""), rm: row[indexes.rm]?.trim() ?? "",
    rowNumber: (headerIndex >= 0 ? headerIndex + 2 : 1) + index,
  })).filter((row) => row.kind || row.wbs || row.title);
}

export function buildImportPreview(rows: ImportedRow[], settings: AppSettings, now = Date.now()): ImportPreview {
  const errors: string[] = [];
  const epicMap = new Map<string, Epic>();
  const orderedEpics: Epic[] = [];
  if (!rows.length) return { epics: [], errors: ["找不到可匯入的資料，請確認檔案包含表格標題與 EPIC / TASK 資料列"] };
  for (const row of rows) {
    if (row.kind !== "EPIC" && row.kind !== "TASK") { errors.push(`第 ${row.rowNumber} 列：類型需為 EPIC 或 TASK`); continue; }
    if (!row.wbs) { errors.push(`第 ${row.rowNumber} 列：WBS 必填`); continue; }
    if (!row.title) { errors.push(`第 ${row.rowNumber} 列：Epic/Task 必填`); continue; }
    if (!row.startDate || !row.finishDate) { errors.push(`第 ${row.rowNumber} 列：Start / Finish 日期格式不正確`); continue; }
    if (row.kind === "EPIC") {
      const epic = normalizeEpic({
        id: `import-epic-${now}-${orderedEpics.length}`, wbs: row.wbs, priority: row.priority || String(orderedEpics.length + 1), category: normalizeEpicCategory(row.category),
        title: row.title, type: row.type || settings.types[0]?.label || "全新開發", department: row.department || "PM", assignee: row.assignee || agentNames(settings.agents)[0] || "Simon",
        startDate: row.startDate, finishDate: row.finishDate, duration: getDuration(row.startDate, row.finishDate), rm: row.rm, progress: 0, tasks: [],
      });
      epicMap.set(row.wbs, epic); orderedEpics.push(epic); continue;
    }
    const epicWbs = row.wbs.includes(".") ? row.wbs.split(".")[0] : row.wbs;
    const epic = epicMap.get(epicWbs);
    if (!epic) { errors.push(`第 ${row.rowNumber} 列：找不到 WBS ${epicWbs} 的 EPIC`); continue; }
    epic.tasks.push(normalizeTask({
      id: `import-task-${now}-${row.rowNumber}`, wbs: row.wbs, title: row.title, type: row.type || settings.statuses[0]?.label || "待辦",
      department: row.department || settings.departments[0] || "企劃", assignee: row.assignee || agentNames(settings.agents)[0] || "Simon",
      startDate: row.startDate, finishDate: row.finishDate, duration: getDuration(row.startDate, row.finishDate), rm: row.rm, progress: 0,
    }));
  }
  return { epics: orderedEpics.map((epic) => normalizeEpic({ ...epic, tasks: renumberTasks(epic.tasks, epic.wbs) })), errors };
}

export function normalizeSettings(settings: Partial<AppSettings> | undefined, defaults: AppSettings): AppSettings {
  const departments = normalizeSettingList(settings?.departments, defaults.departments);
  return {
    sheets: normalizeSheets(settings?.sheets, defaults.sheets),
    departments,
    agents: normalizeAgentList(settings?.agents, defaults.agents, departments),
    holidays: normalizeHolidayRanges(settings?.holidays, defaults.holidays),
    types: normalizeColoredSettingList(settings?.types, defaults.types),
    statuses: normalizeColoredSettingList(settings?.statuses, defaults.statuses),
  };
}

function normalizeSheets(values: unknown, fallback: AppSettings["sheets"]) {
  if (!Array.isArray(values)) return fallback;
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = value as { id?: unknown; name?: unknown };
    const id = String(item?.id ?? "").trim();
    const name = String(item?.name ?? "").trim();
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name }];
  });
}

export function settingLabels(values: SettingOption[]) { return values.map((value) => value.label); }
export function agentNames(agents: AgentOption[]) { return agents.map((agent) => agent.name).filter(Boolean); }

function normalizeSettingList(values: unknown, fallback: string[]) {
  if (!Array.isArray(values)) return fallback;
  const normalized = values.map((value) => String(value).trim()).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
}

function normalizeAgentList(values: unknown, fallback: AgentOption[], departments: string[]) {
  if (!Array.isArray(values)) return fallback;
  const seen = new Set<string>();
  const normalized = values.map((value, index) => {
    if (typeof value === "string") {
      const [maybeDepartment, maybeName] = value.includes("|") ? value.split("|").map((item) => item.trim()) : ["", value.trim()];
      const name = maybeName || maybeDepartment;
      if (!name || seen.has(name)) return null;
      seen.add(name);
      const existing = fallback.find((agent) => agent.name === name);
      return { id: existing?.id ?? `agent-${name}-${index}`, name, department: maybeName ? maybeDepartment : existing?.department ?? departments[0] ?? "企劃" };
    }
    if (value && typeof value === "object") {
      const item = value as Partial<AgentOption> & { label?: string; value?: string };
      const name = String(item.name ?? item.label ?? item.value ?? "").trim();
      if (!name || seen.has(name)) return null;
      seen.add(name);
      const existing = fallback.find((agent) => agent.name === name);
      return { id: String(item.id ?? existing?.id ?? `agent-${name}-${index}`), name, department: String(item.department ?? existing?.department ?? departments[0] ?? "企劃").trim() };
    }
    return null;
  }).filter((value): value is AgentOption => Boolean(value));
  return normalized.length ? normalized : fallback;
}

function normalizeColoredSettingList(values: unknown, fallback: SettingOption[]) {
  if (!Array.isArray(values)) return fallback;
  const seen = new Set<string>();
  const normalized = values.map((value, index) => {
    if (typeof value === "string") {
      const label = value.trim();
      if (!label || seen.has(label)) return null;
      seen.add(label); return { id: `option-${label}-${index}`, label, color: fallback.find((item) => item.label === label)?.color ?? "#0d5bff" };
    }
    if (value && typeof value === "object") {
      const item = value as Partial<SettingOption> & { value?: string; name?: string };
      const label = String(item.label ?? item.value ?? item.name ?? "").trim();
      if (!label || seen.has(label)) return null;
      seen.add(label); return { id: String(item.id ?? `option-${label}-${index}`), label, color: String(item.color ?? fallback.find((entry) => entry.label === label)?.color ?? "#0d5bff") };
    }
    return null;
  }).filter((value): value is SettingOption => Boolean(value));
  return normalized.length ? normalized : fallback;
}

function normalizeHolidayRanges(values: unknown, fallback: HolidayRange[]) {
  if (!Array.isArray(values)) return fallback;
  const normalized = values.map((value, index) => {
    if (typeof value === "string") {
      const date = value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
      return date ? { id: `holiday-${date}-${index}`, startDate: date, endDate: date, note: "" } : null;
    }
    if (value && typeof value === "object") {
      const item = value as Partial<HolidayRange>;
      const startDate = String(item.startDate ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
      const endDate = String(item.endDate ?? item.startDate ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
      return startDate && endDate ? { id: String(item.id ?? `holiday-${startDate}-${index}`), startDate, endDate, note: String(item.note ?? "") } : null;
    }
    return null;
  }).filter((value): value is HolidayRange => Boolean(value));
  return normalized.length ? normalized : fallback;
}
