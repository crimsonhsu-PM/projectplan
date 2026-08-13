"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  ColorPicker,
  ConfigProvider,
  DatePicker,
  Input,
  Layout,
  Menu,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import {
  CalendarOutlined,
  BellOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  ProjectOutlined,
  PushpinOutlined,
  RightOutlined,
  SettingOutlined,
  TableOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

type Task = {
  id: string;
  wbs: string;
  department: string;
  title: string;
  type: string;
  assignee: string;
  startDate: string;
  finishDate: string;
  duration: number;
  rm: string;
  progress: number;
};

type Epic = Task & {
  priority: string;
  tasks: Task[];
};

type ProjectMeta = {
  projectType: string;
  projectName: string;
  startDate: string;
  wk: string;
};

type HolidayRange = {
  id: string;
  startDate: string;
  endDate: string;
  note: string;
};

type SettingOption = {
  id: string;
  label: string;
  color: string;
};

type AppSettings = {
  departments: string[];
  agents: string[];
  holidays: HolidayRange[];
  types: SettingOption[];
  statuses: SettingOption[];
};

type PlannerTableRow = {
  key: string;
  rowKind: "epic" | "section" | "task";
  epicId: string;
  item?: Task;
  priority?: string;
  department?: string;
  project?: string;
};

const STORAGE_KEY = "rsg-project-plan-v2";
const PINNED_TASK_COLUMNS_KEY = "rsg-project-plan-pinned-task-columns-v1";
const EPIC_MAIN_WIDTH_KEY = "rsg-project-plan-epic-main-width-v1";
const MIN_EPIC_MAIN_WIDTH = 520;
const MAX_EPIC_MAIN_WIDTH = 980;
const DAY_MS = 24 * 60 * 60 * 1000;

const taskColumnDefinitions = [
  { key: "wbs", label: "WBS", width: 48 },
  { key: "task", label: "Task", width: 220 },
  { key: "department", label: "部門", width: 92 },
  { key: "status", label: "狀態", width: 108 },
  { key: "agent", label: "Agent", width: 108 },
  { key: "start", label: "Start", width: 128 },
  { key: "finish", label: "Finish", width: 128 },
  { key: "workdays", label: "工作天數", width: 72 },
] as const;

type TaskColumnKey = (typeof taskColumnDefinitions)[number]["key"];

const defaultSettings: AppSettings = {
  departments: ["企劃", "前端", "後端", "QA", "PM"],
  agents: ["Simon", "PM", "Clara", "Anna", "Della", "shock", "GMS", "Will"],
  holidays: [
    { id: "holiday-2026-01-01", startDate: "2026-01-01", endDate: "2026-01-01", note: "元旦" },
    { id: "holiday-2026-02-16", startDate: "2026-02-16", endDate: "2026-02-18", note: "春節" },
    { id: "holiday-2026-04-03", startDate: "2026-04-03", endDate: "2026-04-03", note: "兒童節補假" },
    { id: "holiday-2026-06-19", startDate: "2026-06-19", endDate: "2026-06-19", note: "端午節" },
  ],
  types: [
    { id: "type-new", label: "全新開發", color: "#0d5bff" },
    { id: "type-optimize", label: "優化", color: "#f59e0b" },
    { id: "type-port", label: "移植開發", color: "#7c3aed" },
    { id: "type-done", label: "Done", color: "#16a34a" },
    { id: "type-qa", label: "QA進測前", color: "#06b6d4" },
    { id: "type-pending", label: "待確認", color: "#94a3b8" },
  ],
  statuses: [
    { id: "status-todo", label: "待辦", color: "#94a3b8" },
    { id: "status-progress", label: "進行中", color: "#0d5bff" },
    { id: "status-done", label: "完成", color: "#16a34a" },
    { id: "status-hold", label: "擱置", color: "#f97316" },
  ],
};

const defaultProject: ProjectMeta = {
  projectType: "機台、線上",
  projectName: "2026下半開發項目",
  startDate: "2026-06-01",
  wk: "1",
};

const sampleEpics: Epic[] = [
  {
    id: "epic-24",
    wbs: "24",
    department: "PM",
    priority: "1",
    title: "新遊戲開發 - 決戰賽特2",
    type: "全新開發",
    assignee: "Simon",
    startDate: "2026-05-08",
    finishDate: "2026-07-15",
    duration: 48,
    rm: "",
    progress: 74,
    tasks: [
      row("task-24-1", "24.1", "企劃規格書", "完成", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-2", "24.2", "overview", "完成", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-3", "24.3", "動畫清單", "完成", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-4", "24.4", "音樂清單", "完成", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-5", "24.5", "GameID、英文、中文", "完成", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-6", "24.6", "建制專案Git（遊戲Git、DII Git）", "完成", "Simon", "2026-06-16", "2026-06-16", "", 100),
      row("task-24-7", "24.7", "jira 項目", "完成", "Simon", "2026-06-16", "2026-06-16", "", 100),
      row("task-24-8", "24.8", "LED燈條表演規格", "完成", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-9", "24.9", "外包音效", "待辦", "PM", "2026-06-17", "2026-06-26", "待排程", 20),
      row("task-24-10", "24.10", "Demo會議", "完成", "Simon", "2026-06-26", "2026-06-26", "", 100),
    ],
  },
];

function row(
  id: string,
  wbs: string,
  title: string,
  type: string,
  assignee: string,
  startDate: string,
  finishDate: string,
  rm: string,
  progress: number,
): Task {
  return {
    id,
    wbs,
    department: "企劃",
    title,
    type,
    assignee,
    startDate,
    finishDate,
    duration: getDuration(startDate, finishDate),
    rm,
    progress,
  };
}

function getDuration(startDate: string, finishDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const finish = new Date(`${finishDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
    return 0;
  }
  return Math.max(1, Math.round((finish.getTime() - start.getTime()) / DAY_MS) + 1);
}

function getHolidayDateSet(holidays: HolidayRange[]) {
  const dates = new Set<string>();
  holidays.forEach((holiday) => {
    const start = new Date(`${holiday.startDate}T00:00:00`);
    const end = new Date(`${holiday.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return;
    }
    for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
      dates.add(formatIso(current));
    }
  });
  return dates;
}

function getWorkdayDuration(startDate: string, finishDate: string, holidayDates: Set<string>) {
  const start = new Date(`${startDate}T00:00:00`);
  const finish = new Date(`${finishDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || finish < start) {
    return 0;
  }
  let duration = 0;
  for (let current = new Date(start); current <= finish; current = addDays(current, 1)) {
    const day = current.getDay();
    if (day !== 0 && day !== 6 && !holidayDates.has(formatIso(current))) {
      duration += 1;
    }
  }
  return duration;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(epics: Epic[]) {
  const dates = epics.flatMap((epic) => [
    epic.startDate,
    epic.finishDate,
    ...epic.tasks.flatMap((task) => [task.startDate, task.finishDate]),
  ]);
  const validDates = dates
    .map((date) => new Date(`${date}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()));
  const min = validDates.length ? new Date(Math.min(...validDates.map((date) => date.getTime()))) : new Date();
  const max = validDates.length ? new Date(Math.max(...validDates.map((date) => date.getTime()))) : addDays(min, 30);
  return {
    start: addDays(min, -3),
    end: addDays(max, 7),
  };
}

function getGanttRange(projectStartDate: string, epics: Epic[]) {
  const parsedStart = new Date(`${projectStartDate}T00:00:00`);
  const start = Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart;
  const requiredEnd = new Date("2026-12-31T00:00:00");
  const finishDates = epics.flatMap((epic) => [
    epic.finishDate,
    ...epic.tasks.map((task) => task.finishDate),
  ]);
  const validFinishDates = finishDates
    .map((date) => new Date(`${date}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()));
  const latestFinish = validFinishDates.length
    ? new Date(Math.max(...validFinishDates.map((date) => date.getTime())))
    : requiredEnd;
  const minimumEnd = requiredEnd > addDays(start, 27) ? requiredEnd : addDays(start, 27);
  const rawEnd = latestFinish > minimumEnd ? latestFinish : minimumEnd;
  return {
    start,
    end: rawEnd,
  };
}

function enumerateDays(start: Date, end: Date) {
  const days: Date[] = [];
  for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
    days.push(new Date(current));
  }
  return days;
}

function estimateTextWidth(value: string) {
  return Array.from(value).reduce((width, character) => {
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(character)) {
      return width + 15;
    }
    if (/[A-Z]/.test(character)) {
      return width + 8.5;
    }
    if (/[0-9]/.test(character)) {
      return width + 7.5;
    }
    if (character === " ") {
      return width + 4;
    }
    return width + 7;
  }, 0);
}

function columnWidth(values: Array<string | number | undefined>, min: number, max: number, extra = 24) {
  const widest = values.reduce((width, value) => {
    return Math.max(width, estimateTextWidth(String(value ?? "")));
  }, 0);
  return Math.ceil(Math.min(max, Math.max(min, widest + extra)));
}

function settingLabels(values: SettingOption[]) {
  return values.map((value) => value.label);
}

function toSelectOptions(values: string[]) {
  return values.filter(Boolean).map((value) => ({ label: value, value }));
}

function toColoredSelectOptions(values: SettingOption[]) {
  return values
    .filter((value) => value.label)
    .map((value) => ({
      label: (
        <span className="select-color-option">
          <span className="select-color-dot" style={{ backgroundColor: value.color }} />
          {value.label}
        </span>
      ),
      value: value.label,
    }));
}

function optionColor(values: SettingOption[], label: string) {
  return values.find((value) => value.label === label)?.color ?? "#94a3b8";
}

function normalizeSettingList(values: unknown, fallback: string[]) {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const normalized = values.map((value) => String(value).trim()).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
}

function normalizeColoredSettingList(values: unknown, fallback: SettingOption[]) {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const seen = new Set<string>();
  const normalized = values
    .map((value, index) => {
      if (typeof value === "string") {
        const label = value.trim();
        if (!label || seen.has(label)) {
          return null;
        }
        seen.add(label);
        return {
          id: `option-${label}-${index}`,
          label,
          color: fallback.find((item) => item.label === label)?.color ?? "#0d5bff",
        };
      }
      if (value && typeof value === "object") {
        const item = value as Partial<SettingOption> & { value?: string; name?: string };
        const label = String(item.label ?? item.value ?? item.name ?? "").trim();
        if (!label || seen.has(label)) {
          return null;
        }
        seen.add(label);
        return {
          id: String(item.id ?? `option-${label}-${index}`),
          label,
          color: String(item.color ?? fallback.find((fallbackItem) => fallbackItem.label === label)?.color ?? "#0d5bff"),
        };
      }
      return null;
    })
    .filter((value): value is SettingOption => Boolean(value));
  return normalized.length ? normalized : fallback;
}

function normalizeHolidayRanges(values: unknown, fallback: HolidayRange[]) {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const normalized = values
    .map((value, index) => {
      if (typeof value === "string") {
        const cleanDate = value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
        if (!cleanDate) {
          return null;
        }
        return {
          id: `holiday-${cleanDate}-${index}`,
          startDate: cleanDate,
          endDate: cleanDate,
          note: "",
        };
      }
      if (value && typeof value === "object") {
        const item = value as Partial<HolidayRange>;
        const startDate = String(item.startDate ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
        const endDate = String(item.endDate ?? item.startDate ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
        if (!startDate || !endDate) {
          return null;
        }
        return {
          id: String(item.id ?? `holiday-${startDate}-${index}`),
          startDate,
          endDate,
          note: String(item.note ?? ""),
        };
      }
      return null;
    })
    .filter((value): value is HolidayRange => Boolean(value));
  return normalized.length ? normalized : fallback;
}

function normalizeSettings(settings?: Partial<AppSettings>): AppSettings {
  return {
    departments: normalizeSettingList(settings?.departments, defaultSettings.departments),
    agents: normalizeSettingList(settings?.agents, defaultSettings.agents),
    holidays: normalizeHolidayRanges(settings?.holidays, defaultSettings.holidays),
    types: normalizeColoredSettingList(settings?.types, defaultSettings.types),
    statuses: normalizeColoredSettingList(settings?.statuses, defaultSettings.statuses),
  };
}

function weekLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function dayLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function weekday(date: Date) {
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function normalizeTask(task: Task): Task {
  const rawTaskType = task.type.trim();
  const taskType = rawTaskType.toLowerCase() === "done" ? "完成" : rawTaskType === "待確認" ? "待辦" : task.type;
  return {
    ...task,
    department: task.department || "企劃",
    type: taskType,
    duration: getDuration(task.startDate, task.finishDate),
    progress: Math.min(100, Math.max(0, Number(task.progress) || 0)),
  };
}

function getEpicProgress(tasks: Task[]) {
  if (!tasks.length) {
    return 0;
  }
  const doneTasks = tasks.filter(isCompletedTask).length;
  return Math.round((doneTasks / tasks.length) * 100);
}

function isCompletedTask(task: Task) {
  const value = task.type.trim().toLowerCase();
  return value === "done" || task.type.trim() === "完成";
}

function getProjectProgress(epics: Epic[]) {
  const tasks = epics.flatMap((epic) => epic.tasks);
  if (!tasks.length) {
    return 0;
  }
  return Math.round((tasks.filter(isCompletedTask).length / tasks.length) * 100);
}

function normalizeEpic(epic: Epic): Epic {
  const tasks = epic.tasks.map(normalizeTask);
  return {
    ...epic,
    department: epic.department || "PM",
    tasks,
    duration: getDuration(epic.startDate, epic.finishDate),
    progress: getEpicProgress(tasks),
  };
}

function blankTask(index: number, epicWbs: string): Task {
  return row(
    `task-${Date.now()}-${index}`,
    `${epicWbs}.${index}`,
    "新任務",
    "待辦",
    "Simon",
    defaultProject.startDate,
    defaultProject.startDate,
    "",
    0,
  );
}

function blankEpic(nextIndex: number): Epic {
  const wbs = String(nextIndex);
  return {
    id: `epic-${Date.now()}`,
    wbs,
    department: "PM",
    priority: String(nextIndex),
    title: "新增 EPIC",
    type: "全新開發",
    assignee: "Simon",
    startDate: defaultProject.startDate,
    finishDate: formatIso(addDays(new Date(`${defaultProject.startDate}T00:00:00`), 14)),
    duration: 15,
    rm: "",
    progress: 0,
    tasks: [blankTask(1, wbs)],
  };
}

export default function Home() {
  const [project, setProject] = useState<ProjectMeta>(defaultProject);
  const [epics, setEpics] = useState<Epic[]>(sampleEpics);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [activePage, setActivePage] = useState<"planner" | "settings">("planner");
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [collapsedEpicIds, setCollapsedEpicIds] = useState<Set<string>>(new Set());
  const [draggingEpicId, setDraggingEpicId] = useState<string | null>(null);
  const [draggingTask, setDraggingTask] = useState<{ epicId: string; taskId: string } | null>(null);
  const [taskDropTarget, setTaskDropTarget] = useState<{ epicId: string; taskId: string; position: "before" | "after" } | null>(null);
  const [pinnedTaskColumns, setPinnedTaskColumns] = useState<Set<TaskColumnKey>>(() => new Set(["task"]));
  const [epicMainWidth, setEpicMainWidth] = useState(760);
  const [hasLoaded, setHasLoaded] = useState(false);
  const syncingGanttScrollRef = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { project?: ProjectMeta; epics?: Epic[]; settings?: Partial<AppSettings> };
        setProject(parsed.project ?? defaultProject);
        setEpics((parsed.epics ?? sampleEpics).map(normalizeEpic));
        setSettings(normalizeSettings(parsed.settings));
      } catch {
        setEpics(sampleEpics);
        setSettings(defaultSettings);
      }
    }
    const savedPinnedColumns = window.localStorage.getItem(PINNED_TASK_COLUMNS_KEY);
    if (savedPinnedColumns) {
      try {
        const parsedPinnedColumns = JSON.parse(savedPinnedColumns) as string[];
        const validPinnedColumns = parsedPinnedColumns.filter((key): key is TaskColumnKey =>
          taskColumnDefinitions.some((column) => column.key === key),
        );
        setPinnedTaskColumns(new Set(validPinnedColumns));
      } catch {
        setPinnedTaskColumns(new Set(["task"]));
      }
    }
    const savedEpicMainWidth = Number(window.localStorage.getItem(EPIC_MAIN_WIDTH_KEY));
    if (Number.isFinite(savedEpicMainWidth)) {
      setEpicMainWidth(Math.min(MAX_EPIC_MAIN_WIDTH, Math.max(MIN_EPIC_MAIN_WIDTH, savedEpicMainWidth)));
    }
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, epics, settings }));
      window.localStorage.setItem(PINNED_TASK_COLUMNS_KEY, JSON.stringify(Array.from(pinnedTaskColumns)));
      window.localStorage.setItem(EPIC_MAIN_WIDTH_KEY, String(epicMainWidth));
    }
  }, [epicMainWidth, epics, hasLoaded, pinnedTaskColumns, project, settings]);

  const editingEpic = epics.find((epic) => epic.id === editingEpicId) ?? null;
  const typeLabels = useMemo(() => settingLabels(settings.types), [settings.types]);
  const statusLabels = useMemo(() => settingLabels(settings.statuses), [settings.statuses]);
  const typeSelectOptions = useMemo(() => toColoredSelectOptions(settings.types), [settings.types]);
  const statusSelectOptions = useMemo(() => toColoredSelectOptions(settings.statuses), [settings.statuses]);
  const departmentSelectOptions = useMemo(() => toSelectOptions(settings.departments), [settings.departments]);
  const assigneeSelectOptions = useMemo(() => toSelectOptions(settings.agents), [settings.agents]);
  const holidayDates = useMemo(() => getHolidayDateSet(settings.holidays), [settings.holidays]);
  const projectProgress = useMemo(() => getProjectProgress(epics), [epics]);
  const tableRows = useMemo<PlannerTableRow[]>(
    () =>
      epics.flatMap((epic) => {
        const epicRow = {
          key: epic.id,
          rowKind: "epic" as const,
          epicId: epic.id,
          item: epic,
          priority: epic.priority,
        };
        if (collapsedEpicIds.has(epic.id)) {
          return [epicRow];
        }
        return [
          epicRow,
          {
            key: `${epic.id}-section`,
            rowKind: "section" as const,
            epicId: epic.id,
            department: "部門",
            project: "項目",
          },
          ...epic.tasks.map((task) => ({
            key: task.id,
            rowKind: "task" as const,
            epicId: epic.id,
            item: task,
          })),
        ];
      }),
    [collapsedEpicIds, epics],
  );
  const { start, end } = useMemo(() => getGanttRange(project.startDate, epics), [epics, project.startDate]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);
  const weeks = useMemo(() => days.filter((day) => day.getDay() === 1), [days]);
  const ganttWeeks = useMemo(() => {
    const segments: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) {
      segments.push(days.slice(index, index + 7));
    }
    return segments;
  }, [days]);
  const tableWidths = useMemo(() => {
    const rowsWithItems = tableRows.filter((row) => row.item);
    const textRows = tableRows.map((row) => row.item);
    const widths = {
      wbs: columnWidth(["WBS", ...rowsWithItems.map((row) => row.item?.wbs)], 64, 92, 24),
      priority: columnWidth(
        ["Priority", ...tableRows.map((row) => (row.rowKind === "task" ? row.item?.department : row.priority ?? row.department))],
        96,
        120,
        34,
      ),
      description: columnWidth(
        ["Epic/Task description", ...tableRows.map((row) => row.item?.title ?? row.project)],
        300,
        520,
        46,
      ),
      type: columnWidth(["Type", ...typeLabels, ...textRows.map((item) => item?.type)], 104, 180, 34),
      assignee: columnWidth(["Assignee", ...settings.agents, ...textRows.map((item) => item?.assignee)], 128, 220, 48),
      startDate: columnWidth(["Start date", ...textRows.map((item) => item?.startDate.slice(2))], 104, 118, 24),
      finishDate: columnWidth(["Finish date", ...textRows.map((item) => item?.finishDate.slice(2))], 104, 118, 24),
      duration: columnWidth(["Duration", ...textRows.map((item) => item?.duration)], 76, 96, 18),
      rm: columnWidth(["RM", ...textRows.map((item) => item?.rm)], 110, 220, 24),
    };
    return {
      ...widths,
      total: Object.values(widths).reduce((total, width) => total + width, 0),
    };
  }, [settings.agents, tableRows, typeLabels]);
  const tableColumns = useMemo<TableProps<PlannerTableRow>["columns"]>(
    () => [
      {
        title: "",
        width: 48,
        className: "toggle-cell",
        render: (_, row) => {
          if (row.rowKind !== "epic" || !row.item) {
            return "";
          }
          const isCollapsed = collapsedEpicIds.has(row.epicId);
          return (
            <Button
              aria-label={isCollapsed ? "展開 Tasks" : "收合 Tasks"}
              icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
              onClick={() => toggleEpic(row.epicId)}
              size="small"
              type="text"
            />
          );
        },
      },
      {
        title: "WBS",
        width: tableWidths.wbs,
        render: (_, row) => row.item?.wbs ?? "",
      },
      {
        title: "Priority",
        width: tableWidths.priority,
        className: "department-cell",
        render: (_, row) => {
          if (row.rowKind === "task" && row.item) {
            return (
              <Select
                aria-label={`${row.item.wbs} 部門`}
                className="cell-control"
                options={departmentSelectOptions}
                popupMatchSelectWidth={false}
                value={row.item.department}
                variant="borderless"
                onChange={(value) => updateTask(row.epicId, row.item!.id, { department: value })}
              />
            );
          }
          return row.priority ?? row.department ?? "";
        },
      },
      {
        title: "Epic/Task description",
        width: tableWidths.description,
        className: "description-cell",
        render: (_, row) => {
          if (row.rowKind === "section") {
            return row.project;
          }
          if (row.rowKind === "epic" && row.item) {
            return (
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditingEpicId(row.epicId)}>
                {row.item.title}
              </Button>
            );
          }
          if (row.rowKind === "task" && row.item) {
            return (
              <Input
                aria-label={`${row.item.wbs} 任務名稱`}
                className="cell-control"
                value={row.item.title}
                variant="borderless"
                onChange={(event) => updateTask(row.epicId, row.item!.id, { title: event.target.value })}
              />
            );
          }
          return "";
        },
      },
      {
        title: "Type",
        width: tableWidths.type,
        render: (_, row) => {
          if (!row.item) {
            return "";
          }
          return (
            <Select
              aria-label={`${row.item.wbs} Type`}
              className="cell-control colored-select"
              options={typeSelectOptions}
              popupMatchSelectWidth={false}
              style={{ "--setting-color": optionColor(settings.types, row.item.type) } as React.CSSProperties}
              value={row.item.type}
              variant="borderless"
              onChange={(value) =>
                row.rowKind === "epic"
                  ? updateEpic(row.epicId, { type: value })
                  : updateTask(row.epicId, row.item!.id, { type: value })
              }
            />
          );
        },
      },
      {
        title: "Assignee",
        width: tableWidths.assignee,
        className: "assignee-cell",
        render: (_, row) => {
          if (!row.item) {
            return "";
          }
          return (
            <Select
              aria-label={`${row.item.wbs} Assignee`}
              className="cell-control"
              options={assigneeSelectOptions}
              popupMatchSelectWidth={false}
              value={row.item.assignee}
              variant="borderless"
              onChange={(value) =>
                row.rowKind === "epic"
                  ? updateEpic(row.epicId, { assignee: value })
                  : updateTask(row.epicId, row.item!.id, { assignee: value })
              }
            />
          );
        },
      },
      {
        title: "Start date",
        width: tableWidths.startDate,
        render: (_, row) => {
          if (!row.item) {
            return "";
          }
          return (
            <DatePicker
              allowClear={false}
              aria-label={`${row.item.wbs} 開始日期`}
              className="cell-control cell-date"
              format="YY-MM-DD"
              inputReadOnly
              suffixIcon={null}
              value={dayjs(row.item.startDate)}
              variant="borderless"
              onChange={(date) => {
                const nextDate = date ? date.format("YYYY-MM-DD") : row.item!.startDate;
                if (row.rowKind === "epic") {
                  updateEpic(row.epicId, { startDate: nextDate });
                } else {
                  updateTask(row.epicId, row.item!.id, { startDate: nextDate });
                }
              }}
            />
          );
        },
      },
      {
        title: "Finish date",
        width: tableWidths.finishDate,
        render: (_, row) => {
          if (!row.item) {
            return "";
          }
          return (
            <DatePicker
              allowClear={false}
              aria-label={`${row.item.wbs} 結束日期`}
              className="cell-control cell-date"
              format="YY-MM-DD"
              inputReadOnly
              suffixIcon={null}
              value={dayjs(row.item.finishDate)}
              variant="borderless"
              onChange={(date) => {
                const nextDate = date ? date.format("YYYY-MM-DD") : row.item!.finishDate;
                if (row.rowKind === "epic") {
                  updateEpic(row.epicId, { finishDate: nextDate });
                } else {
                  updateTask(row.epicId, row.item!.id, { finishDate: nextDate });
                }
              }}
            />
          );
        },
      },
      {
        title: "Duration",
        width: tableWidths.duration,
        render: (_, row) => row.item?.duration ?? "",
      },
      {
        title: "RM",
        width: tableWidths.rm,
        render: (_, row) => row.item?.rm ?? "",
      },
    ],
    [collapsedEpicIds, tableWidths],
  );

  function toggleEpic(epicId: string) {
    setCollapsedEpicIds((current) => {
      const next = new Set(current);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  }

  function updateEpic(epicId: string, patch: Partial<Epic>) {
    setEpics((current) =>
      current.map((epic) => (epic.id === epicId ? normalizeEpic({ ...epic, ...patch }) : epic)),
    );
  }

  function updateTask(epicId: string, taskId: string, patch: Partial<Task>) {
    setEpics((current) =>
      current.map((epic) =>
        epic.id === epicId
          ? normalizeEpic({
              ...epic,
              tasks: epic.tasks.map((task) => (task.id === taskId ? normalizeTask({ ...task, ...patch }) : task)),
            })
          : epic,
      ),
    );
  }

  function reorderEpic(sourceEpicId: string, targetEpicId: string) {
    if (sourceEpicId === targetEpicId) {
      return;
    }
    setEpics((current) => {
      const sourceIndex = current.findIndex((epic) => epic.id === sourceEpicId);
      const targetIndex = current.findIndex((epic) => epic.id === targetEpicId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }
      const next = [...current];
      const [movingEpic] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movingEpic);
      return next;
    });
  }

  function renumberTasks(tasks: Task[], epicWbs: string) {
    return tasks.map((task, index) => ({ ...task, wbs: `${epicWbs}.${index + 1}` }));
  }

  function reorderTask(epicId: string, sourceTaskId: string, targetTaskId: string, position: "before" | "after" = "before") {
    if (sourceTaskId === targetTaskId) {
      return;
    }
    setEpics((current) =>
      current.map((epic) => {
        if (epic.id !== epicId) {
          return epic;
        }
        const sourceIndex = epic.tasks.findIndex((task) => task.id === sourceTaskId);
        const targetIndex = epic.tasks.findIndex((task) => task.id === targetTaskId);
        if (sourceIndex < 0 || targetIndex < 0) {
          return epic;
        }
        const nextTasks = [...epic.tasks];
        const [movingTask] = nextTasks.splice(sourceIndex, 1);
        const adjustedTargetIndex = nextTasks.findIndex((task) => task.id === targetTaskId);
        if (adjustedTargetIndex < 0) {
          return epic;
        }
        const insertIndex = position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
        nextTasks.splice(insertIndex, 0, movingTask);
        return normalizeEpic({ ...epic, tasks: renumberTasks(nextTasks, epic.wbs) });
      }),
    );
  }

  function updateTaskDropTarget(event: React.DragEvent<HTMLElement>, epicId: string, taskId: string) {
    if (!draggingTask || draggingTask.epicId !== epicId || draggingTask.taskId === taskId) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY - rect.top > rect.height / 2 ? "after" : "before";
    setTaskDropTarget({ epicId, taskId, position });
  }

  function addEpic() {
    const baseEpic = blankEpic(epics.length + 1);
    const startDate = project.startDate;
    const finishDate = formatIso(addDays(new Date(`${startDate}T00:00:00`), 14));
    const epic = {
      ...baseEpic,
      assignee: settings.agents[0] ?? "Simon",
      department: settings.departments[0] ?? "PM",
      startDate,
      finishDate,
      type: typeLabels[0] ?? "全新開發",
      tasks: baseEpic.tasks.map((task) => ({ ...task, assignee: settings.agents[0] ?? "Simon", startDate, finishDate: startDate })),
    };
    setEpics((current) => [...current, epic]);
    setCollapsedEpicIds((current) => {
      const next = new Set(current);
      next.delete(epic.id);
      return next;
    });
    setEditingEpicId(epic.id);
  }

  function deleteEpic(epicId: string) {
    const epic = epics.find((item) => item.id === epicId);
    Modal.confirm({
      title: "刪除 EPIC",
      content: `確定要刪除「${epic?.title ?? "此 EPIC"}」嗎？此操作會一併刪除底下 Tasks。`,
      okText: "刪除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        setEpics((current) => current.filter((item) => item.id !== epicId));
        setEditingEpicId((current) => (current === epicId ? null : current));
      },
    });
  }

  function updateSettingsList(key: "departments" | "agents", values: string[]) {
    setSettings((current) => ({ ...current, [key]: values }));
  }

  function updateColoredSettingsList(key: "types" | "statuses", values: SettingOption[]) {
    setSettings((current) => ({ ...current, [key]: values }));
  }

  function addHoliday() {
    const today = formatIso(new Date());
    setSettings((current) => ({
      ...current,
      holidays: [
        ...current.holidays,
        { id: `holiday-${Date.now()}`, startDate: today, endDate: today, note: "新增假日" },
      ],
    }));
  }

  function updateHolidays(holidays: HolidayRange[]) {
    setSettings((current) => ({ ...current, holidays }));
  }

  function addTask(epicId: string) {
    setEpics((current) =>
      current.map((epic) =>
        epic.id === epicId
          ? normalizeEpic({
              ...epic,
              tasks: [
                ...epic.tasks,
                {
                  ...blankTask(epic.tasks.length + 1, epic.wbs),
                  assignee: settings.agents[0] ?? "Simon",
                  department: settings.departments[0] ?? "企劃",
                  type: statusLabels[0] ?? "待辦",
                },
              ],
            })
          : epic,
      ),
    );
  }

  function deleteTask(epicId: string, taskId: string) {
    setEpics((current) =>
      current.map((epic) =>
        epic.id === epicId
          ? normalizeEpic({ ...epic, tasks: renumberTasks(epic.tasks.filter((task) => task.id !== taskId), epic.wbs) })
          : epic,
      ),
    );
  }

  function togglePinnedTaskColumn(key: TaskColumnKey) {
    setPinnedTaskColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function getPinnedTaskColumnStyle(key: TaskColumnKey): React.CSSProperties {
    if (!pinnedTaskColumns.has(key)) {
      return {};
    }
    const left = taskColumnDefinitions.reduce((offset, column) => {
      if (column.key === key) {
        return offset;
      }
      return pinnedTaskColumns.has(column.key) ? offset + column.width + 8 : offset;
    }, 10);
    return { left };
  }

  function getOffset(date: string) {
    return Math.max(
      0,
      Math.round((new Date(`${date}T00:00:00`).getTime() - start.getTime()) / DAY_MS),
    );
  }

  function syncGanttScroll(epicId: string, source: HTMLDivElement) {
    if (syncingGanttScrollRef.current) {
      return;
    }
    syncingGanttScrollRef.current = true;
    document.querySelectorAll<HTMLDivElement>(`[data-gantt-group="${epicId}"]`).forEach((panel) => {
      if (panel !== source) {
        panel.scrollLeft = source.scrollLeft;
      }
    });
    window.requestAnimationFrame(() => {
      syncingGanttScrollRef.current = false;
    });
  }

  function startEpicPaneResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = epicMainWidth;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth + moveEvent.clientX - startX;
      setEpicMainWidth(Math.min(MAX_EPIC_MAIN_WIDTH, Math.max(MIN_EPIC_MAIN_WIDTH, nextWidth)));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function renderGanttRow(item: Task, rowClassName = "") {
    const itemStart = new Date(`${item.startDate}T00:00:00`);
    const itemFinish = new Date(`${item.finishDate}T00:00:00`);
    const rawOffset = Math.round((itemStart.getTime() - start.getTime()) / DAY_MS);
    const rawFinishOffset = Math.round((itemFinish.getTime() - start.getTime()) / DAY_MS);
    const columnStart = Math.min(days.length, Math.max(0, rawOffset)) + 1;
    const columnEnd = Math.min(days.length, Math.max(columnStart, rawFinishOffset + 1));
    const span = Math.max(1, columnEnd - columnStart + 1);

    return (
      <div className={`gantt-board-row ${rowClassName}`} key={`${item.id}-gantt`}>
        <span
          className="gantt-board-bar"
          style={
            {
              gridColumn: `${columnStart} / span ${span}`,
              "--progress": `${item.progress}%`,
            } as React.CSSProperties
          }
          title={`${item.wbs} ${item.title}: ${item.startDate} - ${item.finishDate}`}
        />
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: "#0d5bff",
          fontFamily: 'Arial, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
        },
        components: {
          Button: {
            controlHeight: 38,
          },
          Modal: {
            borderRadiusLG: 8,
          },
        },
      }}
    >
      <main className="backend-shell">
        <Layout className="backend-layout">
          <Layout.Sider className="backend-sider" width={216}>
            <div className="backend-brand">
              <ProjectOutlined />
              <span>RSG project</span>
            </div>
            <Menu
              mode="inline"
              selectedKeys={[activePage]}
              onClick={({ key }) => setActivePage(key as "planner" | "settings")}
              items={[
                { key: "planner", icon: <TableOutlined />, label: "專案計畫" },
                { key: "settings", icon: <SettingOutlined />, label: "設定" },
              ]}
            />
          </Layout.Sider>
          <Layout.Content className="backend-content">
            <header className="topbar topbar-end">
              <Space size={18}>
                <BellOutlined className="topbar-icon" />
                <Avatar size={38} icon={<UserOutlined />} />
                <Typography.Text className="topbar-user">瑪琳·索索</Typography.Text>
              </Space>
            </header>
            {activePage === "planner" ? (
              <>
                <section className="project-header" aria-label="專案資訊">
                  <div className="project-title">
                    <Input
                      aria-label="專案名稱"
                      className="project-name-input"
                      value={project.projectName}
                      variant="borderless"
                      onChange={(event) => setProject({ ...project, projectName: event.target.value })}
                    />
                  </div>
                  <Field label="Project type">
                    <Input
                      value={project.projectType}
                      onChange={(event) => setProject({ ...project, projectType: event.target.value })}
                    />
                  </Field>
                  <Field label="Start date">
                    <DatePicker
                      value={dayjs(project.startDate)}
                      onChange={(date) => setProject({ ...project, startDate: date ? date.format("YYYY-MM-DD") : project.startDate })}
                      suffixIcon={<CalendarOutlined />}
                      allowClear={false}
                      inputReadOnly
                    />
                  </Field>
                  <Field label="完成度">
                    <div className="project-progress">
                      <Progress percent={projectProgress} size="small" />
                    </div>
                  </Field>
                  <Button type="primary" icon={<PlusOutlined />} onClick={addEpic}>
                    新增 EPIC
                  </Button>
                </section>

                <section className="project-board" aria-label="Epic 與 Task 專案列表">
                  <div className="epic-list">
                    {epics.map((epic) => {
                      const isCollapsed = collapsedEpicIds.has(epic.id);
                      return (
                        <article
                          className={`epic-card ${draggingEpicId === epic.id ? "epic-card-dragging" : ""}`}
                          key={epic.id}
                          style={{ "--epic-main-width": `${epicMainWidth}px` } as React.CSSProperties}
                          onDragOver={(event) => {
                            if (draggingEpicId) {
                              event.preventDefault();
                            }
                          }}
                          onDrop={() => {
                            if (draggingEpicId) {
                              reorderEpic(draggingEpicId, epic.id);
                            }
                            setDraggingEpicId(null);
                          }}
                        >
                          <div className="epic-toggle-column">
                            <Button
                              aria-label={isCollapsed ? "展開 Tasks" : "收合 Tasks"}
                              icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
                              onClick={() => toggleEpic(epic.id)}
                              size="small"
                              type="text"
                            />
                          </div>
                          <div className="epic-card-main">
                            <div className="epic-title-row">
                              <button
                                aria-label={`拖曳 ${epic.title} 調整 Epic 順序`}
                                className="epic-drag-handle"
                                draggable
                                onDragEnd={() => setDraggingEpicId(null)}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  setDraggingEpicId(epic.id);
                                }}
                                type="button"
                              >
                                <HolderOutlined />
                              </button>
                              <Tag color="blue">EPIC {epic.wbs}</Tag>
                              <Button type="link" className="epic-title-button" icon={<EditOutlined />} onClick={() => setEditingEpicId(epic.id)}>
                                {epic.title}
                              </Button>
                              <div className="epic-title-progress" aria-label={`完成度 ${epic.progress}%`}>
                                <span>完成度</span>
                                <Progress percent={epic.progress} size="small" />
                              </div>
                              <Button danger type="text" icon={<DeleteOutlined />} onClick={() => deleteEpic(epic.id)} aria-label={`刪除 ${epic.title}`} />
                            </div>

                            <div className="epic-fields">
                              <Field label="Type">
                                <Select
                                  className="colored-select"
                                  options={typeSelectOptions}
                                  style={{ "--setting-color": optionColor(settings.types, epic.type) } as React.CSSProperties}
                                  value={epic.type}
                                  onChange={(value) => updateEpic(epic.id, { type: value })}
                                />
                              </Field>
                              <Field label="Agent">
                                <Select
                                  options={assigneeSelectOptions}
                                  value={epic.assignee}
                                  onChange={(value) => updateEpic(epic.id, { assignee: value })}
                                />
                              </Field>
                              <Field label="Start">
                                <DatePicker
                                  allowClear={false}
                                  inputReadOnly
                                  value={dayjs(epic.startDate)}
                                  onChange={(date) => updateEpic(epic.id, { startDate: date ? date.format("YYYY-MM-DD") : epic.startDate })}
                                />
                              </Field>
                              <Field label="Finish">
                                <DatePicker
                                  allowClear={false}
                                  inputReadOnly
                                  value={dayjs(epic.finishDate)}
                                  onChange={(date) => updateEpic(epic.id, { finishDate: date ? date.format("YYYY-MM-DD") : epic.finishDate })}
                                />
                              </Field>
                            </div>
                          </div>

                          <button
                            aria-label="調整資料區與甘特圖寬度"
                            className="epic-pane-resizer"
                            onPointerDown={startEpicPaneResize}
                            type="button"
                          />

                          <div
                            className="epic-gantt-panel"
                            data-gantt-group={epic.id}
                            onScroll={(event) => syncGanttScroll(epic.id, event.currentTarget)}
                            style={
                              {
                                "--gantt-days": days.length,
                              } as React.CSSProperties
                            }
                          >
                            <div className="gantt-scroll">
                              <div className="gantt-week-header">
                                {ganttWeeks.map((week, index) => (
                                  <span key={week[0].toISOString()} style={{ gridColumn: `${index * 7 + 1} / span ${week.length}` }}>
                                    WK {index + 1}
                                  </span>
                                ))}
                              </div>
                              <div className="gantt-date-header">
                                {days.map((day) => (
                                  <span key={day.toISOString()}>{dayLabel(day)}</span>
                                ))}
                              </div>
                              <div className="gantt-weekday-header">
                                {days.map((day) => (
                                  <span key={day.toISOString()}>{weekday(day)}</span>
                                ))}
                              </div>
                              {renderGanttRow(epic, "epic-gantt-row")}
                            </div>
                          </div>

                          {!isCollapsed ? (
                            <>
                            <div className="task-list">
                              <div className="task-list-header">
                                <span>Tasks</span>
                                <Button size="small" icon={<PlusOutlined />} onClick={() => addTask(epic.id)}>
                                  新增 Task
                                </Button>
                              </div>
                              <div className="task-columns-header">
                                <span />
                                {taskColumnDefinitions.map((column) => {
                                  const isPinned = pinnedTaskColumns.has(column.key);
                                  return (
                                    <span
                                      className={`task-header-cell ${isPinned ? "task-cell-pinned" : ""}`}
                                      key={column.key}
                                      style={getPinnedTaskColumnStyle(column.key)}
                                    >
                                      <button
                                        aria-label={`${isPinned ? "取消釘選" : "釘選"} ${column.label} 欄位`}
                                        className={`task-pin-button ${isPinned ? "task-pin-button-active" : ""}`}
                                        onClick={() => togglePinnedTaskColumn(column.key)}
                                        type="button"
                                      >
                                        <PushpinOutlined />
                                      </button>
                                      {column.label}
                                    </span>
                                  );
                                })}
                                <span />
                              </div>
                              {epic.tasks.map((task) => {
                                const isDraggingTask = draggingTask?.taskId === task.id;
                                const isTaskDropTarget = taskDropTarget?.epicId === epic.id && taskDropTarget.taskId === task.id;
                                return (
                                  <div
                                    className={`task-item ${isDraggingTask ? "task-item-dragging" : ""} ${
                                      isTaskDropTarget ? `task-item-drop-${taskDropTarget.position}` : ""
                                    }`}
                                    key={task.id}
                                    onDragLeave={(event) => {
                                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                        setTaskDropTarget((current) =>
                                          current?.epicId === epic.id && current.taskId === task.id ? null : current,
                                        );
                                      }
                                    }}
                                    onDragOver={(event) => updateTaskDropTarget(event, epic.id, task.id)}
                                    onDrop={() => {
                                      if (draggingTask?.epicId === epic.id && taskDropTarget?.taskId === task.id) {
                                        reorderTask(epic.id, draggingTask.taskId, task.id, taskDropTarget.position);
                                      }
                                      setDraggingTask(null);
                                      setTaskDropTarget(null);
                                    }}
                                  >
                                    <button
                                      aria-label={`拖曳 ${task.title} 調整順序`}
                                      className="task-drag-handle"
                                      draggable
                                      onDragEnd={() => {
                                        setDraggingTask(null);
                                        setTaskDropTarget(null);
                                      }}
                                      onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed = "move";
                                        event.dataTransfer.setData("text/plain", task.id);
                                        setDraggingTask({ epicId: epic.id, taskId: task.id });
                                      }}
                                      type="button"
                                    >
                                      <HolderOutlined />
                                    </button>
                                    <span
                                      className={`task-wbs ${pinnedTaskColumns.has("wbs") ? "task-cell-pinned" : ""}`}
                                      style={getPinnedTaskColumnStyle("wbs")}
                                    >
                                      {task.wbs}
                                    </span>
                                    <Input
                                      className={`task-title-input ${pinnedTaskColumns.has("task") ? "task-cell-pinned" : ""}`}
                                      style={getPinnedTaskColumnStyle("task")}
                                      value={task.title}
                                      variant="borderless"
                                      onChange={(event) => updateTask(epic.id, task.id, { title: event.target.value })}
                                    />
                                    <Select
                                      className={`task-field ${pinnedTaskColumns.has("department") ? "task-cell-pinned" : ""}`}
                                      options={departmentSelectOptions}
                                      style={getPinnedTaskColumnStyle("department")}
                                      value={task.department}
                                      onChange={(value) => updateTask(epic.id, task.id, { department: value })}
                                    />
                                    <Select
                                      className={`task-field colored-select ${pinnedTaskColumns.has("status") ? "task-cell-pinned" : ""}`}
                                      options={statusSelectOptions}
                                      style={
                                        {
                                          ...getPinnedTaskColumnStyle("status"),
                                          "--setting-color": optionColor(settings.statuses, task.type),
                                        } as React.CSSProperties
                                      }
                                      value={task.type}
                                      onChange={(value) => updateTask(epic.id, task.id, { type: value })}
                                    />
                                    <Select
                                      className={`task-field ${pinnedTaskColumns.has("agent") ? "task-cell-pinned" : ""}`}
                                      options={assigneeSelectOptions}
                                      style={getPinnedTaskColumnStyle("agent")}
                                      value={task.assignee}
                                      onChange={(value) => updateTask(epic.id, task.id, { assignee: value })}
                                    />
                                    <DatePicker
                                      allowClear={false}
                                      className={`task-date-field ${pinnedTaskColumns.has("start") ? "task-cell-pinned" : ""}`}
                                      format="YYYY-MM-DD"
                                      inputReadOnly
                                      style={getPinnedTaskColumnStyle("start")}
                                      value={dayjs(task.startDate)}
                                      onChange={(date) => updateTask(epic.id, task.id, { startDate: date ? date.format("YYYY-MM-DD") : task.startDate })}
                                    />
                                    <DatePicker
                                      allowClear={false}
                                      className={`task-date-field ${pinnedTaskColumns.has("finish") ? "task-cell-pinned" : ""}`}
                                      format="YYYY-MM-DD"
                                      inputReadOnly
                                      style={getPinnedTaskColumnStyle("finish")}
                                      value={dayjs(task.finishDate)}
                                      onChange={(date) => updateTask(epic.id, task.id, { finishDate: date ? date.format("YYYY-MM-DD") : task.finishDate })}
                                    />
                                    <span
                                      className={`task-workdays ${pinnedTaskColumns.has("workdays") ? "task-cell-pinned" : ""}`}
                                      style={getPinnedTaskColumnStyle("workdays")}
                                    >
                                      {getWorkdayDuration(task.startDate, task.finishDate, holidayDates)}
                                    </span>
                                    <Button danger type="text" icon={<DeleteOutlined />} onClick={() => deleteTask(epic.id, task.id)} aria-label={`刪除 ${task.title}`} />
                                  </div>
                                );
                              })}
                            </div>
                            <div
                              className="task-gantt-panel"
                              data-gantt-group={epic.id}
                              onScroll={(event) => syncGanttScroll(epic.id, event.currentTarget)}
                              style={
                                {
                                  "--gantt-days": days.length,
                                } as React.CSSProperties
                              }
                            >
                              <div className="task-gantt-offset" />
                              <div className="gantt-scroll task-gantt-rows">{epic.tasks.map((task) => renderGanttRow(task))}</div>
                            </div>
                            </>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : (
              <section className="settings-page" aria-label="設定">
                <div className="settings-header">
                  <div>
                    <Typography.Title level={3}>設定</Typography.Title>
                    <Typography.Text type="secondary">管理專案計畫表使用的下拉選項與假日資料。</Typography.Text>
                  </div>
                </div>
                <div className="settings-grid">
                  <EditableOptionCard
                    title="部門設定"
                    values={settings.departments}
                    onChange={(values) => updateSettingsList("departments", values)}
                  />
                  <EditableOptionCard
                    title="Agent設定"
                    values={settings.agents}
                    onChange={(values) => updateSettingsList("agents", values)}
                  />
                  <HolidaySettingsCard
                    values={settings.holidays}
                    onAdd={addHoliday}
                    onChange={updateHolidays}
                  />
                  <ColoredOptionCard
                    title="Type設定"
                    values={settings.types}
                    onChange={(values) => updateColoredSettingsList("types", values)}
                  />
                  <ColoredOptionCard
                    title="狀態設定"
                    values={settings.statuses}
                    onChange={(values) => updateColoredSettingsList("statuses", values)}
                  />
                </div>
              </section>
            )}
          </Layout.Content>
        </Layout>

      <Modal
        className="epic-modal"
        footer={null}
        onCancel={() => setEditingEpicId(null)}
        open={Boolean(editingEpic)}
        title={null}
        width={1180}
        destroyOnHidden
      >
        {editingEpic ? (
          <>
            <div className="modal-header">
              <div>
                <Tag color="blue">EPIC {editingEpic.wbs}</Tag>
                <Typography.Title level={3}>{editingEpic.title}</Typography.Title>
              </div>
              <Button danger icon={<DeleteOutlined />} onClick={() => deleteEpic(editingEpic.id)} aria-label={`刪除 ${editingEpic.title}`} />
            </div>

            <div className="form-grid">
              <Field label="Epic 標題">
                <Input
                  value={editingEpic.title}
                  onChange={(event) => updateEpic(editingEpic.id, { title: event.target.value })}
                />
              </Field>
              <Field label="Type">
                <Select
                  className="colored-select"
                  options={typeSelectOptions}
                  style={{ "--setting-color": optionColor(settings.types, editingEpic.type) } as React.CSSProperties}
                  value={editingEpic.type}
                  onChange={(value) => updateEpic(editingEpic.id, { type: value })}
                />
              </Field>
              <Field label="Assignee">
                <Select
                  options={assigneeSelectOptions}
                  value={editingEpic.assignee}
                  onChange={(value) => updateEpic(editingEpic.id, { assignee: value })}
                />
              </Field>
              <Field label="Start date">
                <DatePicker
                  allowClear={false}
                  inputReadOnly
                  value={dayjs(editingEpic.startDate)}
                  onChange={(date) => updateEpic(editingEpic.id, { startDate: date ? date.format("YYYY-MM-DD") : editingEpic.startDate })}
                />
              </Field>
              <Field label="Finish date">
                <DatePicker
                  allowClear={false}
                  inputReadOnly
                  value={dayjs(editingEpic.finishDate)}
                  onChange={(date) =>
                    updateEpic(editingEpic.id, { finishDate: date ? date.format("YYYY-MM-DD") : editingEpic.finishDate })
                  }
                />
              </Field>
            </div>

            <div className="task-toolbar">
              <Typography.Title level={4}>Tasks</Typography.Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => addTask(editingEpic.id)}>
                新增 Task
              </Button>
            </div>

            <div className="task-editor">
              {editingEpic.tasks.map((task) => (
                <div className="task-card" key={task.id}>
                  <Input
                    className="task-title"
                    value={task.title}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { title: event.target.value })}
                    aria-label={`${task.wbs} 任務名稱`}
                  />
                  <Select
                    className="colored-select"
                    options={statusSelectOptions}
                    style={{ "--setting-color": optionColor(settings.statuses, task.type) } as React.CSSProperties}
                    value={task.type}
                    onChange={(value) => updateTask(editingEpic.id, task.id, { type: value })}
                  />
                  <Select
                    options={assigneeSelectOptions}
                    value={task.assignee}
                    onChange={(value) => updateTask(editingEpic.id, task.id, { assignee: value })}
                  />
                  <DatePicker
                    allowClear={false}
                    inputReadOnly
                    value={dayjs(task.startDate)}
                    onChange={(date) => updateTask(editingEpic.id, task.id, { startDate: date ? date.format("YYYY-MM-DD") : task.startDate })}
                    aria-label={`${task.wbs} 開始日期`}
                  />
                  <DatePicker
                    allowClear={false}
                    inputReadOnly
                    value={dayjs(task.finishDate)}
                    onChange={(date) =>
                      updateTask(editingEpic.id, task.id, { finishDate: date ? date.format("YYYY-MM-DD") : task.finishDate })
                    }
                    aria-label={`${task.wbs} 結束日期`}
                  />
                  <span className="task-workdays">{getWorkdayDuration(task.startDate, task.finishDate, holidayDates)} 天</span>
                  <Input
                    value={task.rm}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { rm: event.target.value })}
                    placeholder="RM / JIRA"
                    aria-label={`${task.wbs} RM`}
                  />
                  <Button danger icon={<DeleteOutlined />} onClick={() => deleteTask(editingEpic.id, task.id)} aria-label={`刪除 ${task.title}`} />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Modal>
      </main>
    </ConfigProvider>
  );
}

function EditableOptionCard({
  title,
  values,
  onChange,
}: {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  function updateValue(index: number, value: string) {
    onChange(values.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function deleteValue(index: number) {
    onChange(values.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <Card
      className="settings-card"
      title={title}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onChange([...values, "新增項目"])}>
          新增
        </Button>
      }
    >
      <div className="settings-list">
        {values.map((value, index) => (
          <Space.Compact className="settings-row" key={`${title}-${index}`}>
            <Input value={value} onChange={(event) => updateValue(index, event.target.value)} />
            <Button danger icon={<DeleteOutlined />} onClick={() => deleteValue(index)} aria-label={`刪除 ${value}`} />
          </Space.Compact>
        ))}
      </div>
    </Card>
  );
}

function ColoredOptionCard({
  title,
  values,
  onChange,
}: {
  title: string;
  values: SettingOption[];
  onChange: (values: SettingOption[]) => void;
}) {
  function updateValue(index: number, patch: Partial<SettingOption>) {
    onChange(values.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function deleteValue(index: number) {
    onChange(values.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <Card
      className="settings-card"
      title={title}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() =>
            onChange([
              ...values,
              { id: `option-${Date.now()}`, label: "新增項目", color: "#0d5bff" },
            ])
          }
        >
          新增
        </Button>
      }
    >
      <div className="settings-list">
        {values.map((value, index) => (
          <div className="settings-row colored-settings-row" key={value.id}>
            <ColorPicker
              value={value.color}
              onChange={(_, hex) => updateValue(index, { color: hex })}
              presets={[
                {
                  label: "常用",
                  colors: ["#0d5bff", "#16a34a", "#f59e0b", "#f97316", "#7c3aed", "#06b6d4", "#ef4444", "#94a3b8"],
                },
              ]}
            />
            <Input value={value.label} onChange={(event) => updateValue(index, { label: event.target.value })} />
            <Button danger icon={<DeleteOutlined />} onClick={() => deleteValue(index)} aria-label={`刪除 ${value.label}`} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function HolidaySettingsCard({
  values,
  onAdd,
  onChange,
}: {
  values: HolidayRange[];
  onAdd: () => void;
  onChange: (values: HolidayRange[]) => void;
}) {
  function updateValue(index: number, patch: Partial<HolidayRange>) {
    onChange(values.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function deleteValue(index: number) {
    onChange(values.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <Card
      className="settings-card"
      title="國定假日設定"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          新增
        </Button>
      }
    >
      <div className="settings-list">
        {values.map((value, index) => (
          <div className="holiday-row" key={value.id}>
            <DatePicker.RangePicker
              allowClear={false}
              inputReadOnly
              value={[dayjs(value.startDate), dayjs(value.endDate)]}
              onChange={(dates) => {
                if (!dates?.[0] || !dates?.[1]) {
                  return;
                }
                updateValue(index, {
                  startDate: dates[0].format("YYYY-MM-DD"),
                  endDate: dates[1].format("YYYY-MM-DD"),
                });
              }}
            />
            <Input
              value={value.note}
              placeholder="備註"
              onChange={(event) => updateValue(index, { note: event.target.value })}
            />
            <Button danger icon={<DeleteOutlined />} onClick={() => deleteValue(index)} aria-label={`刪除 ${value.note || value.startDate}`} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}
