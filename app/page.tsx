"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  ColorPicker,
  ConfigProvider,
  DatePicker,
  Drawer,
  Dropdown,
  Input,
  Layout,
  Menu,
  Modal,
  Popover,
  Progress,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tabs,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import {
  CalendarOutlined,
  FolderOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  HolderOutlined,
  MenuOutlined,
  MobileOutlined,
  PlusOutlined,
  ProjectOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
  TableOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { saveFile } from "@/lib/save-file";
import { isUnassigned } from "@/lib/auto-assign";
import dayjs from "dayjs";
import {
  addDays,
  agentNames,
  buildImportPreview,
  buildPersonnelScheduleSummaries,
  buildProjectExportHtml,
  buildProjectManpowerSummary,
  decodeSpreadsheetBuffer,
  formatIso,
  getDuration,
  getHolidayDateSet,
  getWorkdayDuration,
  mapImportedRows,
  normalizeEpic,
  normalizeEpicCategory,
  normalizeSettings,
  isEpicInSheet,
  normalizeTask,
  parseSpreadsheetText,
  renumberTasks,
  reorderTasks,
  settingLabels,
  spreadsheetRow,
} from "@/lib/planner-domain";
import {
  epicCategoryOptions,
  type AgentOption,
  type AppSettings,
  type Epic,
  type EpicCategory,
  type HolidayRange,
  type ImportPreview,
  type ManpowerDepartmentSummary,
  type ManpowerTaskSummary,
  type PersonnelProjectSummary,
  type PersonnelScheduleSummary,
  type ProjectManpowerSummary,
  type ProjectMeta,
  type SettingOption,
  type StoredProjectData,
  type Task,
} from "@/lib/planner-types";

type PlannerTableRow = {
  key: string;
  rowKind: "epic" | "section" | "task";
  epicId: string;
  item?: Task;
  priority?: string;
  department?: string;
  project?: string;
};

type LayoutMode = "auto" | "desktop" | "mobile";

type ImportMode = "append" | "replace";

type SyncStatus = "loading" | "saved" | "saving" | "offline" | "error";
type PlannerView = "schedule" | "manpower" | "people";

const syncStatusLabels: Record<SyncStatus, string> = {
  loading: "資料載入中",
  saving: "儲存中",
  saved: "已儲存",
  offline: "未連線，修改先存在本機",
  error: "儲存失敗",
};
const STORAGE_KEY = "rsg-project-plan-v2";
const VISIBLE_TASK_COLUMNS_KEY = "rsg-project-plan-visible-task-columns-v1";
const ACTIVE_SHEET_KEY = "rsg-project-plan-active-sheet-v1";
const ALL_SHEETS = "__all__";
const NO_SHEET = "__none__";
const LAYOUT_MODE_KEY = "rsg-project-plan-layout-mode-v1";
const EPIC_MAIN_WIDTH_KEY = "rsg-project-plan-epic-main-width-v1";
const ALL_FILTER_VALUE = "__all__";
const MIN_EPIC_MAIN_WIDTH = 760;
const MAX_EPIC_MAIN_WIDTH = 1100;
const DAY_MS = 24 * 60 * 60 * 1000;

const taskColumnDefinitions = [
  { key: "wbs", label: "WBS", width: 48 },
  { key: "task", label: "工作項目", width: 220 },
  { key: "department", label: "部門", width: 92 },
  { key: "status", label: "狀態", width: 108 },
  { key: "agent", label: "負責人", width: 108 },
  { key: "start", label: "開始", width: 128 },
  { key: "finish", label: "結束", width: 128 },
  { key: "workdays", label: "工作天數", width: 72 },
] as const;

type TaskColumnKey = (typeof taskColumnDefinitions)[number]["key"];

const defaultSettings: AppSettings = {
  sheets: [],
  departments: ["企劃", "前端", "後端", "QA", "PM"],
  agents: [
    { id: "agent-simon", name: "Simon", department: "企劃" },
    { id: "agent-pm", name: "PM", department: "PM" },
    { id: "agent-clara", name: "Clara", department: "企劃" },
    { id: "agent-anna", name: "Anna", department: "企劃" },
    { id: "agent-della", name: "Della", department: "企劃" },
    { id: "agent-shock", name: "shock", department: "企劃" },
    { id: "agent-gms", name: "GMS", department: "企劃" },
    { id: "agent-will", name: "Will", department: "企劃" },
  ],
  holidays: [
    { id: "holiday-2026-01-01", startDate: "2026-01-01", endDate: "2026-01-01", note: "元旦｜開國紀念日" },
    { id: "holiday-2026-02-16", startDate: "2026-02-16", endDate: "2026-02-16", note: "除夕｜春節連假開始" },
    { id: "holiday-2026-02-17", startDate: "2026-02-17", endDate: "2026-02-17", note: "春節｜初一" },
    { id: "holiday-2026-02-18", startDate: "2026-02-18", endDate: "2026-02-18", note: "春節｜初二" },
    { id: "holiday-2026-02-19", startDate: "2026-02-19", endDate: "2026-02-19", note: "春節｜初三" },
    { id: "holiday-2026-02-20", startDate: "2026-02-20", endDate: "2026-02-20", note: "春節補假｜初四（調整放假）" },
    { id: "holiday-2026-02-23", startDate: "2026-02-23", endDate: "2026-02-23", note: "春節補假｜初五（補初一落在週二）" },
    { id: "holiday-2026-02-27", startDate: "2026-02-27", endDate: "2026-02-27", note: "228 調整放假｜形成 4 天連假" },
    { id: "holiday-2026-02-28", startDate: "2026-02-28", endDate: "2026-02-28", note: "和平紀念日｜週六" },
    { id: "holiday-2026-04-03", startDate: "2026-04-03", endDate: "2026-04-03", note: "兒童節｜提前放假（與清明併休）" },
    { id: "holiday-2026-04-04", startDate: "2026-04-04", endDate: "2026-04-04", note: "清明節｜週六" },
    { id: "holiday-2026-04-05", startDate: "2026-04-05", endDate: "2026-04-05", note: "清明節｜週六" },
    { id: "holiday-2026-04-06", startDate: "2026-04-06", endDate: "2026-04-06", note: "清明補假｜週一補假" },
    { id: "holiday-2026-06-19", startDate: "2026-06-19", endDate: "2026-06-19", note: "端午節｜農曆五月初五" },
    { id: "holiday-2026-09-25", startDate: "2026-09-25", endDate: "2026-09-25", note: "中秋節｜農曆八月十五" },
    { id: "holiday-2026-10-10", startDate: "2026-10-10", endDate: "2026-10-10", note: "國慶日｜週六" },
    { id: "holiday-2026-10-12", startDate: "2026-10-12", endDate: "2026-10-12", note: "國慶補假｜週一補假" },
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
    category: "機台",
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

function exportProjectExcel(project: ProjectMeta, epics: Epic[], holidayDates: Set<string>) {
  const html = buildProjectExportHtml(
    project.projectName,
    project.projectType,
    project.startDate,
    epics,
    holidayDates,
  );
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  saveFile(`${project.projectName || "project-plan"}.xls`, blob);
}

function downloadImportTemplate() {
  const rows = [
    spreadsheetRow(["類型", "標籤", "WBS", "Priority", "Epic/Task", "Type/狀態", "部門", "Agent", "Start", "Finish", "RM/JIRA"]),
    spreadsheetRow(["EPIC", "機台", "24", "1", "新遊戲開發 - 決戰賽特2", "全新開發", "PM", "Simon", "2026-05-05", "2026-07-15", ""]),
    spreadsheetRow(["TASK", "機台", "24.1", "", "企劃規格書", "完成", "企劃", "Simon", "2026-05-05", "2026-05-20", ""]),
    spreadsheetRow(["TASK", "機台", "24.2", "", "overview", "完成", "企劃", "Simon", "2026-05-05", "2026-05-20", ""]),
  ];
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table>${rows.join("")}</table></body></html>`;
  downloadTextFile("匯入範例.xls", html, "application/vnd.ms-excel;charset=utf-8");
}

function downloadTextFile(fileName: string, content: string, type: string) {
  saveFile(fileName, new Blob([content], { type }));
}

type GanttZoom = "day" | "week" | "month";
type QuickFilter = "all" | "overdue" | "unassigned";
const GANTT_ZOOM_KEY = "project-plan-gantt-zoom-v1";
const COMPACT_EPICS_KEY = "project-plan-compact-epics-v1";
const GANTT_CELL: Record<GanttZoom, number> = { day: 34, week: 12, month: 4 };
const DONE_STATUS = "完成";
const COMPACT_EPIC_MAIN_WIDTH = 600;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = typeof window === "undefined" ? null : window.localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

function isTaskDone(task: Task) {
  return task.progress >= 100 || task.type.trim() === DONE_STATUS;
}

// 結束日已過、還沒完成 → 逾期
function isTaskOverdue(task: Task, todayIso: string) {
  return !isTaskDone(task) && Boolean(task.finishDate) && task.finishDate < todayIso;
}

function ganttPanelStyle(dayCount: number, zoom: GanttZoom) {
  const cell = GANTT_CELL[zoom];
  return {
    "--gantt-days": dayCount,
    "--gantt-cell-size": `${cell}px`,
    "--gantt-line": `${zoom === "day" ? cell : cell * 7}px`,
  } as React.CSSProperties;
}

function GanttHeader({ days, zoom }: { days: Date[]; zoom: GanttZoom }) {
  if (zoom === "month") {
    const months: Array<{ key: string; label: string; start: number; span: number }> = [];
    days.forEach((day, index) => {
      const key = `${day.getFullYear()}-${day.getMonth()}`;
      const last = months.at(-1);
      if (last?.key === key) {
        last.span += 1;
      } else {
        months.push({ key, label: `${day.getFullYear()}/${String(day.getMonth() + 1).padStart(2, "0")}`, start: index, span: 1 });
      }
    });
    return (
      <div className="gantt-week-header">
        {months.map((month) => (
          <span key={month.key} style={{ gridColumn: `${month.start + 1} / span ${month.span}` }} title={month.label}>
            {month.span >= 8 ? month.label : ""}
          </span>
        ))}
      </div>
    );
  }
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return (
    <>
      <div className="gantt-week-header">
        {weeks.map((week, index) => (
          <span key={week[0].toISOString()} style={{ gridColumn: `${index * 7 + 1} / span ${week.length}` }}>
            WK {index + 1}
            <small>{dayLabel(week[0])}</small>
          </span>
        ))}
      </div>
      {zoom === "day" ? (
        <>
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
        </>
      ) : null}
    </>
  );
}

function TodayLine({ days, todayIso }: { days: Date[]; todayIso: string }) {
  const index = days.findIndex((day) => formatIso(day) === todayIso);
  if (index < 0) return null;
  return (
    <span
      aria-hidden="true"
      className="gantt-today-line"
      style={{ left: `calc(var(--gantt-cell) * ${index} + var(--gantt-cell) / 2)` }}
    />
  );
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
  const widest = values.reduce<number>((width, value) => {
    return Math.max(width, estimateTextWidth(String(value ?? "")));
  }, 0);
  return Math.ceil(Math.min(max, Math.max(min, widest + extra)));
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

function getManpowerTaskStatusColor(task: ManpowerTaskSummary) {
  if (task.completed) {
    return "success";
  }

  switch (task.status.trim().toLowerCase()) {
    case "進行中":
    case "in progress":
      return "processing";
    case "擱置":
    case "blocked":
      return "warning";
    case "待辦":
    case "todo":
      return "default";
    default:
      return "blue";
  }
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
    category: "機台",
    starred: false,
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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto");
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [activePlannerView, setActivePlannerView] = useState<PlannerView>("schedule");
  const [activeEpicCategory, setActiveEpicCategory] = useState<EpicCategory>("機台");
  const [activeSheetId, setActiveSheetIdState] = useState<string>(() => {
    try {
      return typeof window === "undefined" ? ALL_SHEETS : window.localStorage.getItem(ACTIVE_SHEET_KEY) ?? ALL_SHEETS;
    } catch {
      return ALL_SHEETS;
    }
  });
  const [ganttZoom, setGanttZoomState] = useState<GanttZoom>(() => readStored(GANTT_ZOOM_KEY, ["day", "week", "month"] as const, "day"));
  const [compactEpics, setCompactEpicsState] = useState<boolean>(() => readStored(COMPACT_EPICS_KEY, ["1", "0"] as const, "0") === "1");
  const [searchText, setSearchText] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const todayIso = formatIso(new Date());
  const [sheetDialog, setSheetDialog] = useState<{ mode: "add" | "rename"; id?: string; name: string } | null>(null);
  const [visiblePersonnelCategories, setVisiblePersonnelCategories] = useState<EpicCategory[]>(
    () => [...epicCategoryOptions],
  );
  const [departmentFilter, setDepartmentFilter] = useState<string>();
  const [agentFilter, setAgentFilter] = useState<string>();
  const [showCompletedProjects, setShowCompletedProjects] = useState(true);
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [collapsedEpicIds, setCollapsedEpicIds] = useState<Set<string>>(new Set());
  const [draggingEpicId, setDraggingEpicId] = useState<string | null>(null);
  const [draggingTask, setDraggingTask] = useState<{ epicId: string; taskId: string } | null>(null);
  const [taskDropTarget, setTaskDropTarget] = useState<{ epicId: string; taskId: string; position: "before" | "after" } | null>(null);
  const [visibleTaskColumns, setVisibleTaskColumns] = useState<Set<TaskColumnKey>>(() => new Set(taskColumnDefinitions.map((column) => column.key)));
  const [epicMainWidth, setEpicMainWidth] = useState(760);
  const [ganttHoverLine, setGanttHoverLine] = useState<{ epicId: string; x: number } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [isImportDragging, setIsImportDragging] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const syncingGanttScrollRef = useRef(false);
  const hasLoadedRemoteRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateViewport = () => setIsNarrowViewport(mediaQuery.matches);
    const savedLayoutMode = window.localStorage.getItem(LAYOUT_MODE_KEY);

    updateViewport();
    if (savedLayoutMode === "desktop" || savedLayoutMode === "mobile") {
      setLayoutMode(savedLayoutMode);
    }
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    function applyStoredData(data: StoredProjectData) {
      const nextEpics = (data.epics ?? sampleEpics).map(normalizeEpic);
      setProject(data.project ?? defaultProject);
      setEpics(nextEpics);
      setCollapsedEpicIds(new Set(nextEpics.map((epic) => epic.id)));
      setSettings(normalizeSettings(data.settings, defaultSettings));
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        applyStoredData(JSON.parse(saved) as StoredProjectData);
      } catch {
        setEpics(sampleEpics);
        setSettings(defaultSettings);
      }
    }
    const savedVisibleColumns = window.localStorage.getItem(VISIBLE_TASK_COLUMNS_KEY);
    if (savedVisibleColumns) {
      try {
        const parsedVisibleColumns = JSON.parse(savedVisibleColumns) as string[];
        const validVisibleColumns = parsedVisibleColumns.filter((key): key is TaskColumnKey =>
          taskColumnDefinitions.some((column) => column.key === key),
        );
        if (validVisibleColumns.length) {
          setVisibleTaskColumns(new Set(validVisibleColumns));
        }
      } catch {
        setVisibleTaskColumns(new Set(taskColumnDefinitions.map((column) => column.key)));
      }
    }
    const savedEpicMainWidth = Number(window.localStorage.getItem(EPIC_MAIN_WIDTH_KEY));
    if (Number.isFinite(savedEpicMainWidth)) {
      setEpicMainWidth(Math.min(MAX_EPIC_MAIN_WIDTH, Math.max(MIN_EPIC_MAIN_WIDTH, savedEpicMainWidth)));
    }

    let isMounted = true;
    fetch("/api/project-data", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("load_failed");
        }
        return (await response.json()) as { data: StoredProjectData | null };
      })
      .then(({ data }) => {
        if (!isMounted) {
          return;
        }
        if (data) {
          applyStoredData(data);
        }
        hasLoadedRemoteRef.current = true;
        setSyncStatus("saved");
      })
      .catch(() => {
        if (isMounted) {
          setSyncStatus("offline");
        }
      })
      .finally(() => {
        if (isMounted) {
          setHasLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      const payload = { project, epics, settings };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      window.localStorage.setItem(VISIBLE_TASK_COLUMNS_KEY, JSON.stringify(Array.from(visibleTaskColumns)));
      window.localStorage.setItem(EPIC_MAIN_WIDTH_KEY, String(epicMainWidth));
      // A failed read must not overwrite remote data with the local fallback.
      // Keep edits local until a reload successfully reads the remote store.
      if (!hasLoadedRemoteRef.current) {
        return;
      }
      setSyncStatus("saving");
      const controller = new AbortController();
      const timer = window.setTimeout(() => {
        fetch("/api/project-data", {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
          signal: controller.signal,
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("save_failed");
            }
            setSyncStatus("saved");
          })
          .catch((error) => {
            if (error.name !== "AbortError") {
              setSyncStatus("error");
            }
          });
      }, 700);

      return () => {
        controller.abort();
        window.clearTimeout(timer);
      };
    }
  }, [epicMainWidth, epics, hasLoaded, project, settings, visibleTaskColumns]);

  const editingEpic = epics.find((epic) => epic.id === editingEpicId) ?? null;
  const typeLabels = useMemo(() => settingLabels(settings.types), [settings.types]);
  const statusLabels = useMemo(() => settingLabels(settings.statuses), [settings.statuses]);
  const typeSelectOptions = useMemo(() => toColoredSelectOptions(settings.types), [settings.types]);
  const statusSelectOptions = useMemo(() => toColoredSelectOptions(settings.statuses), [settings.statuses]);
  const departmentSelectOptions = useMemo(() => toSelectOptions(settings.departments), [settings.departments]);
  const assigneeNames = useMemo(() => agentNames(settings.agents), [settings.agents]);
  const assigneeSelectOptions = useMemo(() => toSelectOptions(assigneeNames), [assigneeNames]);
  const epicCategorySelectOptions = useMemo(() => toSelectOptions([...epicCategoryOptions]), []);
  const filterDepartmentOptions = useMemo(
    () =>
      [
        { label: "全部部門", value: ALL_FILTER_VALUE },
        ...toSelectOptions(
          Array.from(
            new Set([
              ...settings.departments,
              ...epics.flatMap((epic) => epic.tasks.map((task) => task.department.trim()).filter(Boolean)),
            ]),
          ).sort((left, right) => left.localeCompare(right)),
        ),
      ],
    [epics, settings.departments],
  );
  const filterAgentOptions = useMemo(
    () =>
      [
        { label: "全部人員", value: ALL_FILTER_VALUE },
        ...toSelectOptions(
          Array.from(
            new Set([
              ...assigneeNames,
              ...epics.flatMap((epic) => epic.tasks.map((task) => task.assignee.trim()).filter(Boolean)),
            ]),
          ).sort((left, right) => left.localeCompare(right)),
        ),
      ],
    [assigneeNames, epics],
  );
  const sheetNameById = useMemo(() => new Map(settings.sheets.map((sheet) => [sheet.id, sheet.name])), [settings.sheets]);
  const currentSheetId = settings.sheets.some((sheet) => sheet.id === activeSheetId) ? activeSheetId : ALL_SHEETS;
  const currentSheet = settings.sheets.find((sheet) => sheet.id === currentSheetId);
  // 分頁有自己的名稱與甘特圖起始日；「全部」用專案本身的設定。
  const viewProject: ProjectMeta = currentSheet
    ? { ...project, projectName: currentSheet.name, startDate: currentSheet.startDate || project.startDate }
    : project;
  function updateViewProject(patch: Partial<Pick<ProjectMeta, "projectName" | "startDate">>) {
    if (!currentSheet) {
      setProject((current) => ({ ...current, ...patch }));
      return;
    }
    setSettings((current) => ({
      ...current,
      sheets: current.sheets.map((sheet) =>
        sheet.id === currentSheet.id
          ? { ...sheet, name: patch.projectName ?? sheet.name, startDate: patch.startDate ?? sheet.startDate }
          : sheet,
      ),
    }));
  }
  const filteredEpics = useMemo(
    () =>
      epics.flatMap((epic) => {
        if (currentSheet && !isEpicInSheet(epic, currentSheet, settings.sheets)) {
          return [];
        }
        const hasDepartmentFilter = Boolean(departmentFilter && departmentFilter !== ALL_FILTER_VALUE);
        const hasAgentFilter = Boolean(agentFilter && agentFilter !== ALL_FILTER_VALUE);
        const keyword = searchText.trim().toLowerCase();
        if (!hasDepartmentFilter && !hasAgentFilter && quickFilter === "all" && !keyword) {
          return [epic];
        }
        const epicMatchesKeyword = Boolean(keyword) && `${epic.wbs} ${epic.title}`.toLowerCase().includes(keyword);
        const tasks = epic.tasks.filter(
          (task) =>
            (!hasDepartmentFilter || task.department.trim() === departmentFilter) &&
            (!hasAgentFilter || task.assignee.trim() === agentFilter) &&
            (quickFilter !== "overdue" || isTaskOverdue(task, todayIso)) &&
            (quickFilter !== "unassigned" || isUnassigned(task.assignee)) &&
            (!keyword || epicMatchesKeyword || `${task.wbs} ${task.title}`.toLowerCase().includes(keyword)),
        );
        const keepEmptyEpic = epicMatchesKeyword && !hasDepartmentFilter && !hasAgentFilter && quickFilter === "all";
        return tasks.length || keepEmptyEpic ? [{ ...epic, tasks }] : [];
      }),
    [agentFilter, currentSheet, departmentFilter, epics, quickFilter, searchText, settings.sheets, todayIso],
  );
  const projectFilteredEpics = useMemo(
    () =>
      showCompletedProjects
        ? filteredEpics
        : filteredEpics.filter((epic) => epic.progress < 100),
    [filteredEpics, showCompletedProjects],
  );
  const visibleEpics = useMemo(
    () =>
      projectFilteredEpics
        .filter((epic) => normalizeEpicCategory(epic.category) === activeEpicCategory)
        .sort((left, right) => Number(Boolean(right.starred)) - Number(Boolean(left.starred))),
    [activeEpicCategory, projectFilteredEpics],
  );
  const holidayDates = useMemo(() => getHolidayDateSet(settings.holidays), [settings.holidays]);
  const manpowerSummaries = useMemo(
    () => visibleEpics.map((epic) => buildProjectManpowerSummary(epic, holidayDates)),
    [holidayDates, visibleEpics],
  );
  const personnelEpics = useMemo(
    () =>
      filteredEpics.filter((epic) =>
        visiblePersonnelCategories.includes(normalizeEpicCategory(epic.category)),
      ),
    [filteredEpics, visiblePersonnelCategories],
  );
  const personnelScheduleSummaries = useMemo(
    () => {
      const summaries = buildPersonnelScheduleSummaries(personnelEpics, holidayDates);
      if (showCompletedProjects) {
        return summaries;
      }
      return summaries
        .map((person) => {
          const projects = person.projects.filter(
            (project) => project.completedTaskCount < project.taskCount,
          );
          return {
            ...person,
            projectCount: projects.length,
            taskCount: projects.reduce((total, project) => total + project.taskCount, 0),
            projects,
          };
        })
        .filter((person) => person.projects.length > 0);
    },
    [holidayDates, personnelEpics, showCompletedProjects],
  );
  // 精簡欄位時只留 WBS、工作項目、狀態、負責人，讓甘特圖有更多寬度。
  const shownTaskColumns = useMemo(() => {
    if (!compactEpics) return visibleTaskColumns;
    const compact = new Set<TaskColumnKey>(["wbs", "task", "status", "agent"]);
    return new Set(Array.from(visibleTaskColumns).filter((key) => compact.has(key)));
  }, [compactEpics, visibleTaskColumns]);
  const visibleTaskColumnDefinitions = useMemo(
    () => taskColumnDefinitions.filter((column) => shownTaskColumns.has(column.key)),
    [shownTaskColumns],
  );
  const tableRows = useMemo<PlannerTableRow[]>(
    () =>
      visibleEpics.flatMap((epic) => {
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
    [collapsedEpicIds, visibleEpics],
  );
  const { start, end } = useMemo(() => getGanttRange(viewProject.startDate, visibleEpics), [viewProject.startDate, visibleEpics]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);
  const personnelRange = useMemo(
    () => getGanttRange(viewProject.startDate, personnelEpics),
    [personnelEpics, viewProject.startDate],
  );
  const personnelDays = useMemo(
    () => enumerateDays(personnelRange.start, personnelRange.end),
    [personnelRange],
  );
  const weeks = useMemo(() => days.filter((day) => day.getDay() === 1), [days]);
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
      assignee: columnWidth(["Assignee", ...assigneeNames, ...textRows.map((item) => item?.assignee)], 128, 220, 48),
      startDate: columnWidth(["Start date", ...textRows.map((item) => item?.startDate.slice(2))], 104, 118, 24),
      finishDate: columnWidth(["Finish date", ...textRows.map((item) => item?.finishDate.slice(2))], 104, 118, 24),
      duration: columnWidth(["Duration", ...textRows.map((item) => item?.duration)], 76, 96, 18),
      rm: columnWidth(["RM", ...textRows.map((item) => item?.rm)], 110, 220, 24),
    };
    return {
      ...widths,
      total: Object.values(widths).reduce((total, width) => total + width, 0),
    };
  }, [assigneeNames, tableRows, typeLabels]);
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

  function reorderTask(epicId: string, sourceTaskId: string, targetTaskId: string, position: "before" | "after" = "before") {
    if (sourceTaskId === targetTaskId) {
      return;
    }
    setEpics((current) =>
      current.map((epic) => {
        if (epic.id !== epicId) {
          return epic;
        }
        const tasks = reorderTasks(epic.tasks, sourceTaskId, targetTaskId, epic.wbs, position);
        return tasks === epic.tasks ? epic : normalizeEpic({ ...epic, tasks });
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

  function setGanttZoom(zoom: GanttZoom) {
    setGanttZoomState(zoom);
    writeStored(GANTT_ZOOM_KEY, zoom);
  }

  function setCompactEpics(value: boolean) {
    setCompactEpicsState(value);
    writeStored(COMPACT_EPICS_KEY, value ? "1" : "0");
  }

  function scrollGanttToToday() {
    const panels = document.querySelectorAll<HTMLElement>(".epic-gantt-panel, .task-gantt-panel, .people-schedule-gantt");
    panels.forEach((panel) => {
      const line = panel.querySelector<HTMLElement>(".gantt-today-line");
      if (line) {
        panel.scrollLeft = Math.max(0, line.offsetLeft - 120);
      }
    });
  }

  function setActiveSheetId(id: string) {
    setActiveSheetIdState(id);
    try {
      window.localStorage.setItem(ACTIVE_SHEET_KEY, id);
    } catch {
      // storage unavailable
    }
  }

  function saveSheetDialog() {
    if (!sheetDialog) return;
    const name = sheetDialog.name.trim();
    if (!name) return;
    if (sheetDialog.mode === "add") {
      const id = `sheet-${Date.now()}`;
      const startDate = formatIso(new Date());
      setSettings((current) => ({ ...current, sheets: [...current.sheets, { id, name, startDate }] }));
      setActiveSheetId(id);
    } else if (sheetDialog.id) {
      setSettings((current) => ({
        ...current,
        sheets: current.sheets.map((sheet) => (sheet.id === sheetDialog.id ? { ...sheet, name } : sheet)),
      }));
    }
    setSheetDialog(null);
  }

  function removeSheet(sheetId: string) {
    const sheet = settings.sheets.find((item) => item.id === sheetId);
    if (!sheet) return;
    const count = epics.filter((epic) => epic.sheetId === sheetId).length;
    Modal.confirm({
      title: `刪除分頁「${sheet.name}」？`,
      content: count ? `分頁裡的 ${count} 個 Epic 不會被刪除，會移回「全部」裡、不屬於任何分頁。` : "這個分頁沒有 Epic。",
      okText: "刪除分頁",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        setSettings((current) => ({ ...current, sheets: current.sheets.filter((item) => item.id !== sheetId) }));
        setEpics((current) => current.map((epic) => (epic.sheetId === sheetId ? { ...epic, sheetId: undefined } : epic)));
        if (currentSheetId === sheetId) setActiveSheetId(ALL_SHEETS);
      },
    });
  }

  function addEpic() {
    const baseEpic = blankEpic(epics.length + 1);
    const startDate = viewProject.startDate;
    const finishDate = formatIso(addDays(new Date(`${startDate}T00:00:00`), 14));
    const epic = {
      ...baseEpic,
      assignee: assigneeNames[0] ?? "Simon",
      category: activeEpicCategory,
      sheetId: currentSheetId === ALL_SHEETS ? undefined : currentSheetId,
      department: settings.departments[0] ?? "PM",
      startDate,
      finishDate,
      type: typeLabels[0] ?? "全新開發",
      tasks: baseEpic.tasks.map((task) => ({ ...task, assignee: assigneeNames[0] ?? "Simon", startDate, finishDate: startDate })),
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

  function updateSettingsList(key: "departments", values: string[]) {
    setSettings((current) => ({ ...current, [key]: values }));
  }

  function updateAgents(agents: AgentOption[]) {
    setSettings((current) => ({ ...current, agents }));
  }

  function updateColoredSettingsList(key: "types" | "statuses", values: SettingOption[]) {
    setSettings((current) => ({ ...current, [key]: values }));
  }

  function addHoliday() {
    setSettings((current) => ({
      ...current,
      holidays: [
        ...current.holidays,
        { id: `holiday-${Date.now()}`, startDate: "", endDate: "", note: "" },
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
                  assignee: assigneeNames[0] ?? "Simon",
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

  function toggleVisibleTaskColumn(key: TaskColumnKey) {
    setVisibleTaskColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size === 1) {
          return next;
        }
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function getTaskGridStyle(): React.CSSProperties {
    const columnWidths = visibleTaskColumnDefinitions.map((column) => `${column.width}px`).join(" ");
    const minWidth = visibleTaskColumnDefinitions.reduce((total, column) => total + column.width, 28 + 32 + 8 * (visibleTaskColumnDefinitions.length + 1));
    return {
      gridTemplateColumns: `28px ${columnWidths} 32px`,
      minWidth,
    };
  }

  function resetImportState() {
    setImportPreview(null);
    setImportFileName("");
    setIsImportDragging(false);
    setImportMode("append");
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  }

  function closeImportModal() {
    setIsImportModalOpen(false);
    resetImportState();
  }

  async function readImportCandidate(file: File) {
    const text = decodeSpreadsheetBuffer(await file.arrayBuffer());
    return buildImportPreview(mapImportedRows(parseSpreadsheetText(text)), settings);
  }

  async function importFile(file: File) {
    setImportFileName(file.name);
    try {
      setImportPreview(await readImportCandidate(file));
    } catch {
      setImportPreview({ epics: [], errors: ["檔案讀取失敗，請重新選擇檔案"] });
    }
  }

  function confirmImport() {
    if (!importPreview?.epics.length) {
      return;
    }
    const importedEpics =
      currentSheetId === ALL_SHEETS ? importPreview.epics : importPreview.epics.map((epic) => ({ ...epic, sheetId: currentSheetId }));
    setEpics((current) => (importMode === "replace" ? importedEpics : [...current, ...importedEpics]).map(normalizeEpic));
    closeImportModal();
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

  function updateGanttHoverLine(epicId: string, event: React.MouseEvent<HTMLDivElement>) {
    const card = event.currentTarget.closest<HTMLElement>(".epic-card");
    if (!card) {
      return;
    }
    const cardRect = card.getBoundingClientRect();
    setGanttHoverLine({ epicId, x: event.clientX - cardRect.left });
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
          className={`gantt-board-bar ${isTaskOverdue(item, todayIso) ? "gantt-board-bar-overdue" : ""}`}
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

  if (!isHydrated) {
    return (
      <main className="app-loading" aria-label="系統載入中">
        <span>資料載入中</span>
      </main>
    );
  }

  const resolvedLayout = layoutMode === "auto"
    ? (isNarrowViewport ? "mobile" : "desktop")
    : layoutMode;

  function toggleLayoutMode() {
    const nextLayoutMode = resolvedLayout === "mobile" ? "desktop" : "mobile";
    setLayoutMode(nextLayoutMode);
    setIsMobileNavOpen(false);
    window.localStorage.setItem(LAYOUT_MODE_KEY, nextLayoutMode);
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
      <div className={`layout-viewport layout-${layoutMode}`}>
      <main className="backend-shell">
        <Layout className="backend-layout">
          <Layout.Sider className="backend-sider" width={216}>
            <div className="backend-brand">
              <ProjectOutlined />
              <span>Project Demo</span>
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
            <div className="desktop-layout-toggle">
              <Button block icon={<MobileOutlined />} onClick={toggleLayoutMode}>
                切換手機版
              </Button>
            </div>
          </Layout.Sider>
          <header className="mobile-app-header">
            <div className="mobile-app-bar">
              <div className="mobile-brand">
                <Button
                  aria-label="開啟主選單"
                  className="mobile-menu-button"
                  icon={<MenuOutlined />}
                  onClick={() => setIsMobileNavOpen(true)}
                  type="text"
                />
                <ProjectOutlined />
                <span>Project Demo</span>
              </div>
              <div className="mobile-app-actions">
                <Typography.Text className={`sync-status sync-status-${syncStatus}`}>
                  {syncStatusLabels[syncStatus]}
                </Typography.Text>
                <Button
                  aria-label="切換桌機版"
                  className="mobile-layout-toggle"
                  icon={<DesktopOutlined />}
                  onClick={toggleLayoutMode}
                  title="切換桌機版"
                  type="text"
                />
              </div>
            </div>
          </header>
          <Drawer
            className="mobile-nav-drawer"
            onClose={() => setIsMobileNavOpen(false)}
            open={isMobileNavOpen}
            placement="left"
            rootClassName="mobile-nav-drawer-root"
            size={288}
            title={
              <div className="mobile-drawer-brand">
                <ProjectOutlined />
                <span>Project Demo</span>
              </div>
            }
          >
            <nav className="mobile-drawer-nav" aria-label="主要導覽">
              <button
                className={`mobile-drawer-nav-item ${activePage === "planner" ? "is-active" : ""}`}
                type="button"
                aria-current={activePage === "planner" ? "page" : undefined}
                onClick={() => {
                  setActivePage("planner");
                  setIsMobileNavOpen(false);
                }}
              >
                <TableOutlined />
                <span>專案計畫</span>
                <RightOutlined className="mobile-drawer-nav-arrow" />
              </button>
              <button
                className={`mobile-drawer-nav-item ${activePage === "settings" ? "is-active" : ""}`}
                type="button"
                aria-current={activePage === "settings" ? "page" : undefined}
                onClick={() => {
                  setActivePage("settings");
                  setIsMobileNavOpen(false);
                }}
              >
                <SettingOutlined />
                <span>設定</span>
                <RightOutlined className="mobile-drawer-nav-arrow" />
              </button>
            </nav>
          </Drawer>
          <Layout.Content className="backend-content">
            <header className="topbar topbar-end">
              <Typography.Text className={`sync-status sync-status-${syncStatus}`}>
                {syncStatusLabels[syncStatus]}
              </Typography.Text>
            </header>
            {activePage === "planner" ? (
              <>
                <Tabs
                  activeKey={activePlannerView}
                  className="project-view-tabs"
                  items={[
                    { key: "schedule", label: "專案時程" },
                    { key: "manpower", label: "專案人力" },
                    { key: "people", label: "人員時程" },
                  ]}
                  onChange={(key) => setActivePlannerView(key as PlannerView)}
                />

                <div className="sheet-tabs-row" aria-label="專案分頁">
                  <Tabs
                    activeKey={currentSheetId}
                    className="sheet-tabs"
                    hideAdd={false}
                    items={[
                      { key: ALL_SHEETS, label: `全部（${epics.length}）`, closable: false },
                      ...settings.sheets.map((sheet) => ({
                        key: sheet.id,
                        closable: true,
                        label: (
                          <span
                            title="雙擊重新命名"
                            onDoubleClick={() => setSheetDialog({ mode: "rename", id: sheet.id, name: sheet.name })}
                          >
                            {sheet.name}（{epics.filter((epic) => isEpicInSheet(epic, sheet, settings.sheets)).length}）
                          </span>
                        ),
                      })),
                    ]}
                    size="small"
                    type="editable-card"
                    onChange={setActiveSheetId}
                    onEdit={(targetKey, action) => {
                      if (action === "add") setSheetDialog({ mode: "add", name: "" });
                      else if (typeof targetKey === "string") removeSheet(targetKey);
                    }}
                  />
                  {currentSheetId !== ALL_SHEETS ? (
                    <Button
                      icon={<EditOutlined />}
                      size="small"
                      type="text"
                      aria-label="重新命名分頁"
                      onClick={() => {
                        const sheet = settings.sheets.find((item) => item.id === currentSheetId);
                        if (sheet) setSheetDialog({ mode: "rename", id: sheet.id, name: sheet.name });
                      }}
                    >
                      重新命名
                    </Button>
                  ) : null}
                </div>

                {activePlannerView === "schedule" ? (
                  <section className="project-header" aria-label="專案資訊">
                  <div className="project-title">
                    <Input
                      aria-label="專案名稱"
                      className="project-name-input"
                      value={viewProject.projectName}
                      variant="borderless"
                      onChange={(event) => updateViewProject({ projectName: event.target.value })}
                    />
                  </div>
                  <Field label="甘特圖起始日">
                    <DatePicker
                      value={dayjs(viewProject.startDate)}
                      onChange={(date) => date && updateViewProject({ startDate: date.format("YYYY-MM-DD") })}
                      suffixIcon={<CalendarOutlined />}
                      allowClear={false}
                      inputReadOnly
                    />
                  </Field>
                  <Button type="primary" icon={<PlusOutlined />} onClick={addEpic} aria-label="新增 EPIC">
                    EPIC
                  </Button>
                  <Button icon={<UploadOutlined />} onClick={() => setIsImportModalOpen(true)} aria-label="匯入 Excel">
                    匯入
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={() =>
                      exportProjectExcel(
                        viewProject,
                        currentSheet ? epics.filter((epic) => isEpicInSheet(epic, currentSheet, settings.sheets)) : epics,
                        holidayDates,
                      )
                    } aria-label="匯出 Excel">
                    匯出
                  </Button>
                  </section>
                ) : activePlannerView === "manpower" ? (
                  <section className="manpower-header" aria-label="專案人力說明">
                    <div>
                      <Typography.Title level={3}>專案人力</Typography.Title>
                      <Typography.Text type="secondary">
                        以 EPIC 為專案彙總部門與 Agent；投入工作天依 Task 有效工作天數計算。
                      </Typography.Text>
                    </div>
                    <div className="manpower-header-summary">
                      <span>{visibleEpics.length} 個專案</span>
                      <span>{manpowerSummaries.reduce((total, item) => total + item.workdays, 0).toLocaleString()} 工作天</span>
                    </div>
                  </section>
                ) : (
                  <section className="manpower-header" aria-label="人員時程說明">
                    <div>
                      <Typography.Title level={3}>人員時程</Typography.Title>
                      <Typography.Text type="secondary">
                        以 Agent 為主要維度；每個專案期間取該人員負責 Tasks 的最早開始日與最晚結束日。
                      </Typography.Text>
                    </div>
                    <div className="people-header-actions">
                      <div className="manpower-header-summary">
                        <span>{personnelScheduleSummaries.length} 位人員</span>
                        <span>
                          {personnelScheduleSummaries.reduce((total, person) => total + person.projectCount, 0)} 個專案指派
                        </span>
                      </div>
                      <div className="people-start-date">
                        <Field label="甘特圖起始日">
                          <DatePicker
                            aria-label="人員時程 甘特圖起始日"
                            value={dayjs(viewProject.startDate)}
                            onChange={(date) => date && updateViewProject({ startDate: date.format("YYYY-MM-DD") })}
                            suffixIcon={<CalendarOutlined />}
                            allowClear={false}
                            inputReadOnly
                          />
                        </Field>
                      </div>
                    </div>
                  </section>
                )}

                <div className="epic-filter-bar" aria-label="專案篩選">
                  {activePlannerView === "people" ? (
                    <div className="people-category-summary" aria-label="人員時程專案類別">
                      {epicCategoryOptions.map((category) => {
                        const isActive = visiblePersonnelCategories.includes(category);
                        const count = filteredEpics.filter(
                          (epic) => normalizeEpicCategory(epic.category) === category,
                        ).length;
                        return (
                          <Button
                            aria-label={`${isActive ? "隱藏" : "顯示"}${category}專案`}
                            aria-pressed={isActive}
                            className={`people-category-toggle people-category-toggle-${category === "機台" ? "machine" : "online"}`}
                            data-active={isActive}
                            key={category}
                            onClick={() =>
                              setVisiblePersonnelCategories((current) => {
                                if (current.includes(category)) {
                                  return current.filter((item) => item !== category);
                                }
                                return epicCategoryOptions.filter(
                                  (item) => item === category || current.includes(item),
                                );
                              })
                            }
                            size="small"
                          >
                            {category}（{count}）
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <Tabs
                      activeKey={activeEpicCategory}
                      className="epic-category-tabs"
                      items={epicCategoryOptions.map((category) => ({
                        key: category,
                        label: `${category} (${filteredEpics.filter((epic) => normalizeEpicCategory(epic.category) === category).length})`,
                      }))}
                      onChange={(key) => setActiveEpicCategory(normalizeEpicCategory(key))}
                    />
                  )}
                  <div className="epic-filter-controls">
                    <Select
                      allowClear
                      aria-label="篩選部門"
                      options={filterDepartmentOptions}
                      optionFilterProp="label"
                      placeholder="全部部門"
                      showSearch
                      value={departmentFilter}
                      onChange={setDepartmentFilter}
                    />
                    <Select
                      allowClear
                      aria-label="篩選人員名稱"
                      options={filterAgentOptions}
                      optionFilterProp="label"
                      placeholder="全部人員"
                      showSearch
                      value={agentFilter}
                      onChange={setAgentFilter}
                    />
                    <label className="completed-project-toggle">
                      <Switch
                        aria-label="顯示完成度 100% 專案"
                        checked={showCompletedProjects}
                        onChange={setShowCompletedProjects}
                      />
                      <span>顯示完成度 100% 專案</span>
                    </label>
                  </div>
                  <div className="epic-toolbar">
                    <Input
                      allowClear
                      aria-label="搜尋 Epic 或工作項目"
                      className="epic-search"
                      placeholder="搜尋 Epic／工作項目"
                      prefix={<SearchOutlined />}
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                    <Segmented
                      aria-label="快速篩選"
                      options={[
                        { label: "全部", value: "all" },
                        { label: "只看逾期", value: "overdue" },
                        { label: "只看未指派", value: "unassigned" },
                      ]}
                      value={quickFilter}
                      onChange={(value) => setQuickFilter(value as QuickFilter)}
                    />
                    {activePlannerView !== "manpower" ? (
                      <>
                        <Segmented
                          aria-label="甘特圖縮放"
                          options={[
                            { label: "日", value: "day" },
                            { label: "週", value: "week" },
                            { label: "月", value: "month" },
                          ]}
                          value={ganttZoom}
                          onChange={(value) => setGanttZoom(value as GanttZoom)}
                        />
                        <Button icon={<CalendarOutlined />} onClick={scrollGanttToToday}>
                          今天
                        </Button>
                      </>
                    ) : null}
                    {activePlannerView === "schedule" ? (
                      <label className="completed-project-toggle">
                        <Switch aria-label="精簡欄位" checked={compactEpics} onChange={setCompactEpics} />
                        <span>精簡欄位，甘特圖放大</span>
                      </label>
                    ) : null}
                  </div>
                </div>

                {activePlannerView === "schedule" ? (
                  <section className="project-board" aria-label="Epic 與 Task 專案列表">
                  <div className="epic-list">
                    {visibleEpics.map((epic) => {
                      const isCollapsed = collapsedEpicIds.has(epic.id);
                      return (
                        <article
                          className={`epic-card ${compactEpics ? "epic-card-compact" : ""} ${draggingEpicId === epic.id ? "epic-card-dragging" : ""}`}
                          key={epic.id}
                          style={{ "--epic-main-width": `${compactEpics ? COMPACT_EPIC_MAIN_WIDTH : epicMainWidth}px` } as React.CSSProperties}
                          onMouseLeave={() => setGanttHoverLine((current) => (current?.epicId === epic.id ? null : current))}
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
                          {ganttHoverLine?.epicId === epic.id ? (
                            <div className="gantt-hover-line" style={{ left: ganttHoverLine.x }} />
                          ) : null}
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
                              <Button
                                aria-label={epic.starred ? `取消標記 ${epic.title}` : `星號標記 ${epic.title}`}
                                aria-pressed={Boolean(epic.starred)}
                                className={`epic-star-button ${epic.starred ? "epic-star-button-active" : ""}`}
                                icon={epic.starred ? <StarFilled /> : <StarOutlined />}
                                onClick={() => updateEpic(epic.id, { starred: !epic.starred })}
                                size="small"
                                type="text"
                              />
                              <Tag color="blue">EPIC {epic.wbs}</Tag>
                              <Tag color={epic.category === "機台" ? "geekblue" : "cyan"}>{epic.category}</Tag>
                              {!currentSheet ? (
                              <Dropdown
                                trigger={["click"]}
                                menu={{
                                  selectable: true,
                                  selectedKeys: [epic.sheetId && sheetNameById.has(epic.sheetId) ? epic.sheetId : NO_SHEET],
                                  items: [
                                    ...settings.sheets.map((sheet) => ({ key: sheet.id, label: sheet.name })),
                                    { type: "divider" as const },
                                    { key: NO_SHEET, label: "不分頁" },
                                  ],
                                  onClick: ({ key }) => updateEpic(epic.id, { sheetId: key === NO_SHEET ? undefined : key }),
                                }}
                              >
                                <Tag
                                  aria-label={`分頁：${sheetNameById.get(epic.sheetId ?? "") ?? "不分頁"}，點擊可移到其他分頁`}
                                  className={`epic-sheet-tag ${epic.sheetId && sheetNameById.has(epic.sheetId) ? "" : "epic-sheet-tag-none"}`}
                                  color={epic.sheetId && sheetNameById.has(epic.sheetId) ? "purple" : "default"}
                                  icon={<FolderOutlined />}
                                  role="button"
                                  tabIndex={0}
                                  title="點擊移到其他分頁"
                                >
                                  {sheetNameById.get(epic.sheetId ?? "") ?? "不分頁"}
                                </Tag>
                              </Dropdown>
                              ) : null}
                              <Button type="link" className="epic-title-button" icon={<EditOutlined />} onClick={() => setEditingEpicId(epic.id)}>
                                {epic.title}
                              </Button>
                              {(() => {
                                const overdue = epic.tasks.filter((task) => isTaskOverdue(task, todayIso)).length;
                                const unassigned = epic.tasks.filter((task) => !isTaskDone(task) && isUnassigned(task.assignee)).length;
                                return (
                                  <>
                                    {overdue ? <Tag className="epic-alert-tag" color="red">逾期 {overdue}</Tag> : null}
                                    {unassigned ? <Tag className="epic-alert-tag" color="gold">未指派 {unassigned}</Tag> : null}
                                  </>
                                );
                              })()}
                              <div className="epic-title-progress" aria-label={`完成度 ${epic.progress}%`}>
                                <span>完成度</span>
                                <Progress percent={epic.progress} size="small" />
                              </div>
                              <Button danger type="text" icon={<DeleteOutlined />} onClick={() => deleteEpic(epic.id)} aria-label={`刪除 ${epic.title}`} />
                            </div>

                            <div className="epic-fields">
                              <Field label="標籤">
                                <Select
                                  options={epicCategorySelectOptions}
                                  value={epic.category}
                                  onChange={(value) => updateEpic(epic.id, { category: normalizeEpicCategory(value) })}
                                />
                              </Field>
                              <Field label="類型">
                                <Select
                                  className="colored-select"
                                  options={typeSelectOptions}
                                  style={{ "--setting-color": optionColor(settings.types, epic.type) } as React.CSSProperties}
                                  value={epic.type}
                                  onChange={(value) => updateEpic(epic.id, { type: value })}
                                />
                              </Field>
                              <Field label="負責人">
                                <Select
                                  options={assigneeSelectOptions}
                                  value={epic.assignee}
                                  onChange={(value) => updateEpic(epic.id, { assignee: value })}
                                />
                              </Field>
                              <Field label="開始／結束">
                                <DatePicker.RangePicker
                                  allowClear={false}
                                  className="epic-range-field"
                                  format="YYYY-MM-DD"
                                  inputReadOnly
                                  value={[dayjs(epic.startDate), dayjs(epic.finishDate)]}
                                  onChange={(dates) => {
                                    if (!dates?.[0] || !dates?.[1]) {
                                      return;
                                    }
                                    updateEpic(epic.id, {
                                      startDate: dates[0].format("YYYY-MM-DD"),
                                      finishDate: dates[1].format("YYYY-MM-DD"),
                                    });
                                  }}
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
                            onMouseMove={(event) => updateGanttHoverLine(epic.id, event)}
                            onScroll={(event) => syncGanttScroll(epic.id, event.currentTarget)}
                            style={ganttPanelStyle(days.length, ganttZoom)}
                          >
                            <div className="gantt-scroll">
                              <GanttHeader days={days} zoom={ganttZoom} />
                              {renderGanttRow(epic, "epic-gantt-row")}
                              <TodayLine days={days} todayIso={todayIso} />
                            </div>
                          </div>

                          {!isCollapsed ? (
                            <>
                            <div className="task-list">
                              <div className="task-list-header">
                                <span>工作項目</span>
                                <Space size={8}>
                                  <Dropdown
                                    trigger={["click"]}
                                    popupRender={() => (
                                      <div className="task-column-dropdown">
                                        <strong>顯示欄位</strong>
                                        {taskColumnDefinitions.map((column) => (
                                          <Checkbox
                                            checked={visibleTaskColumns.has(column.key)}
                                            disabled={visibleTaskColumns.size === 1 && visibleTaskColumns.has(column.key)}
                                            key={column.key}
                                            onChange={() => toggleVisibleTaskColumn(column.key)}
                                          >
                                            {column.label}
                                          </Checkbox>
                                        ))}
                                      </div>
                                    )}
                                  >
                                    <Button size="small">欄位</Button>
                                  </Dropdown>
                                  <Button size="small" icon={<PlusOutlined />} onClick={() => addTask(epic.id)}>
                                    新增 Task
                                  </Button>
                                </Space>
                              </div>
                              <div className="task-columns-header" style={getTaskGridStyle()}>
                                <span />
                                {visibleTaskColumnDefinitions.map((column) => (
                                  <span className="task-header-cell" key={column.key}>
                                    {column.label}
                                  </span>
                                ))}
                                <span />
                              </div>
                              {epic.tasks.map((task) => {
                                const isDraggingTask = draggingTask?.taskId === task.id;
                                const isTaskDropTarget = taskDropTarget?.epicId === epic.id && taskDropTarget.taskId === task.id;
                                return (
                                  <div
                                    className={`task-item ${isTaskOverdue(task, todayIso) ? "task-item-overdue" : ""} ${isDraggingTask ? "task-item-dragging" : ""} ${
                                      isTaskDropTarget ? `task-item-drop-${taskDropTarget.position}` : ""
                                    }`}
                                    data-testid={`task-${task.id}`}
                                    key={task.id}
                                    style={getTaskGridStyle()}
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
                                    {shownTaskColumns.has("wbs") ? (
                                      <span className="task-wbs">
                                        {task.wbs}
                                      </span>
                                    ) : null}
                                    {shownTaskColumns.has("task") ? (
                                      <Input
                                        aria-label={`${task.wbs} 任務名稱`}
                                        className="task-title-input"
                                        value={task.title}
                                        variant="borderless"
                                        onChange={(event) => updateTask(epic.id, task.id, { title: event.target.value })}
                                      />
                                    ) : null}
                                    {shownTaskColumns.has("department") ? (
                                      <Select
                                        className="task-field"
                                        options={departmentSelectOptions}
                                        value={task.department}
                                        onChange={(value) => updateTask(epic.id, task.id, { department: value })}
                                      />
                                    ) : null}
                                    {shownTaskColumns.has("status") ? (
                                      <Select
                                        className="task-field colored-select"
                                        options={statusSelectOptions}
                                        style={
                                          {
                                            "--setting-color": optionColor(settings.statuses, task.type),
                                          } as React.CSSProperties
                                        }
                                        value={task.type}
                                        onChange={(value) => updateTask(epic.id, task.id, { type: value })}
                                      />
                                    ) : null}
                                    {shownTaskColumns.has("agent") ? (
                                      <Select
                                        className="task-field"
                                        options={assigneeSelectOptions}
                                        value={task.assignee}
                                        onChange={(value) => updateTask(epic.id, task.id, { assignee: value })}
                                      />
                                    ) : null}
                                    {shownTaskColumns.has("start") && shownTaskColumns.has("finish") ? (
                                      <DatePicker.RangePicker
                                        allowClear={false}
                                        className="task-range-field"
                                        format="YYYY-MM-DD"
                                        inputReadOnly
                                        style={{ gridColumn: "span 2" }}
                                        value={[dayjs(task.startDate), dayjs(task.finishDate)]}
                                        onChange={(dates) => {
                                          if (!dates?.[0] || !dates?.[1]) {
                                            return;
                                          }
                                          updateTask(epic.id, task.id, {
                                            startDate: dates[0].format("YYYY-MM-DD"),
                                            finishDate: dates[1].format("YYYY-MM-DD"),
                                          });
                                        }}
                                      />
                                    ) : (
                                      <>
                                        {shownTaskColumns.has("start") ? (
                                          <DatePicker
                                            allowClear={false}
                                            className="task-date-field"
                                            format="YYYY-MM-DD"
                                            inputReadOnly
                                            value={dayjs(task.startDate)}
                                            onChange={(date) =>
                                              updateTask(epic.id, task.id, { startDate: date ? date.format("YYYY-MM-DD") : task.startDate })
                                            }
                                          />
                                        ) : null}
                                        {shownTaskColumns.has("finish") ? (
                                          <DatePicker
                                            allowClear={false}
                                            className="task-date-field"
                                            format="YYYY-MM-DD"
                                            inputReadOnly
                                            value={dayjs(task.finishDate)}
                                            onChange={(date) =>
                                              updateTask(epic.id, task.id, { finishDate: date ? date.format("YYYY-MM-DD") : task.finishDate })
                                            }
                                          />
                                        ) : null}
                                      </>
                                    )}
                                    {shownTaskColumns.has("workdays") ? (
                                      <span className="task-workdays">
                                        {getWorkdayDuration(task.startDate, task.finishDate, holidayDates)}
                                      </span>
                                    ) : null}
                                    <Button danger type="text" icon={<DeleteOutlined />} onClick={() => deleteTask(epic.id, task.id)} aria-label={`刪除 ${task.title}`} />
                                  </div>
                                );
                              })}
                            </div>
                            <div
                              className="task-gantt-panel"
                              data-gantt-group={epic.id}
                              onMouseMove={(event) => updateGanttHoverLine(epic.id, event)}
                              onScroll={(event) => syncGanttScroll(epic.id, event.currentTarget)}
                              style={ganttPanelStyle(days.length, ganttZoom)}
                            >
                              <div className="task-gantt-offset" />
                              <div className="gantt-scroll task-gantt-rows">
                                {epic.tasks.map((task) => renderGanttRow(task))}
                                <TodayLine days={days} todayIso={todayIso} />
                              </div>
                            </div>
                            </>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  </section>
                ) : activePlannerView === "manpower" ? (
                  <ProjectManpowerView summaries={manpowerSummaries} />
                ) : (
                  <PersonnelScheduleView days={personnelDays} summaries={personnelScheduleSummaries} todayIso={todayIso} zoom={ganttZoom} />
                )}
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
                  <AgentSettingsCard
                    departments={settings.departments}
                    values={settings.agents}
                    onChange={updateAgents}
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
        cancelText="取消"
        okButtonProps={{ disabled: !sheetDialog?.name.trim() }}
        okText={sheetDialog?.mode === "add" ? "新增" : "儲存"}
        open={Boolean(sheetDialog)}
        title={sheetDialog?.mode === "add" ? "新增分頁" : "重新命名分頁"}
        onCancel={() => setSheetDialog(null)}
        onOk={saveSheetDialog}
      >
        <Input
          aria-label="分頁名稱"
          placeholder="例如：2026 上半年開發項目"
          value={sheetDialog?.name ?? ""}
          onChange={(event) => setSheetDialog((current) => (current ? { ...current, name: event.target.value } : current))}
          onPressEnter={saveSheetDialog}
        />
      </Modal>
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
                <Tag color={editingEpic.category === "機台" ? "geekblue" : "cyan"}>{editingEpic.category}</Tag>
                <Typography.Title level={3}>{editingEpic.title}</Typography.Title>
              </div>
              <Button danger icon={<DeleteOutlined />} onClick={() => deleteEpic(editingEpic.id)} aria-label={`刪除 ${editingEpic.title}`} />
            </div>

            <div className="form-grid">
              <Field label="Epic 標題">
                <Input
                  aria-label="Epic 標題"
                  value={editingEpic.title}
                  onChange={(event) => updateEpic(editingEpic.id, { title: event.target.value })}
                />
              </Field>
              <Field label="標籤">
                <Select
                  options={epicCategorySelectOptions}
                  value={editingEpic.category}
                  onChange={(value) => updateEpic(editingEpic.id, { category: normalizeEpicCategory(value) })}
                />
              </Field>
              <Field label="分頁">
                <Select
                  allowClear
                  aria-label="Epic 分頁"
                  options={settings.sheets.map((sheet) => ({ label: sheet.name, value: sheet.id }))}
                  placeholder="不分頁"
                  value={editingEpic.sheetId}
                  onChange={(value) => updateEpic(editingEpic.id, { sheetId: value || undefined })}
                />
              </Field>
              <Field label="類型">
                <Select
                  className="colored-select"
                  options={typeSelectOptions}
                  style={{ "--setting-color": optionColor(settings.types, editingEpic.type) } as React.CSSProperties}
                  value={editingEpic.type}
                  onChange={(value) => updateEpic(editingEpic.id, { type: value })}
                />
              </Field>
              <Field label="負責人">
                <Select
                  options={assigneeSelectOptions}
                  value={editingEpic.assignee}
                  onChange={(value) => updateEpic(editingEpic.id, { assignee: value })}
                />
              </Field>
              <Field label="開始／結束">
                <DatePicker.RangePicker
                  allowClear={false}
                  className="epic-range-field"
                  format="YYYY-MM-DD"
                  inputReadOnly
                  value={[dayjs(editingEpic.startDate), dayjs(editingEpic.finishDate)]}
                  onChange={(dates) => {
                    if (!dates?.[0] || !dates?.[1]) {
                      return;
                    }
                    updateEpic(editingEpic.id, {
                      startDate: dates[0].format("YYYY-MM-DD"),
                      finishDate: dates[1].format("YYYY-MM-DD"),
                    });
                  }}
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
                  <DatePicker.RangePicker
                    allowClear={false}
                    className="task-card-range-field"
                    format="YYYY-MM-DD"
                    inputReadOnly
                    value={[dayjs(task.startDate), dayjs(task.finishDate)]}
                    onChange={(dates) => {
                      if (!dates?.[0] || !dates?.[1]) {
                        return;
                      }
                      updateTask(editingEpic.id, task.id, {
                        startDate: dates[0].format("YYYY-MM-DD"),
                        finishDate: dates[1].format("YYYY-MM-DD"),
                      });
                    }}
                    aria-label={`${task.wbs} 日期區間`}
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
      <Modal
        title="匯入 Excel"
        open={isImportModalOpen}
        width={720}
        okText="確認匯入"
        cancelText="取消"
        okButtonProps={{ disabled: !importPreview?.epics.length || Boolean(importPreview?.errors.length) }}
        onCancel={closeImportModal}
        onOk={confirmImport}
      >
        <div className="import-modal">
          <div className="import-actions">
            <Button icon={<DownloadOutlined />} onClick={downloadImportTemplate}>
              下載匯入範例
            </Button>
            <Select
              className="import-mode-select"
              options={[
                { label: "追加匯入", value: "append" },
                { label: "覆蓋匯入", value: "replace" },
              ]}
              value={importMode}
              onChange={setImportMode}
            />
          </div>
          <button
            className={`import-dropzone ${isImportDragging ? "import-dropzone-active" : ""}`}
            type="button"
            onClick={() => importInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsImportDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsImportDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsImportDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsImportDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) {
                importFile(file);
              }
            }}
          >
            <UploadOutlined />
            <strong>拖曳 Excel 到此處，或點擊選擇檔案</strong>
            <span>支援匯入範例格式、CSV、TSV 與 HTML XLS</span>
          </button>
          <input
            aria-label="選擇匯入檔案"
            accept=".xls,.xlsx,.csv,.tsv,.html,.htm"
            className="import-file-input"
            ref={importInputRef}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                importFile(file);
              }
            }}
          />
          {importPreview ? (
            <div className="import-preview">
              <div className="import-preview-summary">
                <span>檔案：{importFileName || "-"}</span>
                <span>Epic：{importPreview.epics.length}</span>
                <span>Task：{importPreview.epics.reduce((total, epic) => total + epic.tasks.length, 0)}</span>
              </div>
              {importPreview.errors.length ? (
                <div className="import-errors">
                  {importPreview.errors.map((error) => (
                    <span key={error}>{error}</span>
                  ))}
                </div>
              ) : (
                <div className="import-ready">解析完成，可確認匯入。</div>
              )}
            </div>
          ) : null}
        </div>
      </Modal>
      </main>
      </div>
    </ConfigProvider>
  );
}

function PersonnelScheduleView({
  days,
  summaries,
  zoom,
  todayIso,
}: {
  days: Date[];
  summaries: PersonnelScheduleSummary[];
  zoom: GanttZoom;
  todayIso: string;
}) {
  const rangeStart = days[0]?.getTime() ?? 0;

  function projectBarStyle(project: PersonnelProjectSummary) {
    const itemStart = new Date(`${project.startDate}T00:00:00`);
    const itemFinish = new Date(`${project.finishDate}T00:00:00`);
    const rawOffset = Math.round((itemStart.getTime() - rangeStart) / DAY_MS);
    const rawFinishOffset = Math.round((itemFinish.getTime() - rangeStart) / DAY_MS);
    const columnStart = Math.min(days.length, Math.max(0, rawOffset)) + 1;
    const columnEnd = Math.min(days.length, Math.max(columnStart, rawFinishOffset + 1));
    const span = Math.max(1, columnEnd - columnStart + 1);
    const progress = project.taskCount
      ? Math.round((project.completedTaskCount / project.taskCount) * 100)
      : 0;
    return {
      gridColumn: `${columnStart} / span ${span}`,
      "--progress": `${progress}%`,
    } as React.CSSProperties;
  }

  if (!summaries.length) {
    return (
      <section className="people-schedule-page" aria-label="人員時程列表">
        <div className="people-schedule-empty">此標籤目前沒有已指派的人員 Task</div>
      </section>
    );
  }

  return (
    <section className="people-schedule-page" aria-label="人員時程列表">
      {summaries.map((person) => (
        <article className="people-schedule-card" key={person.key}>
          <div className="people-schedule-details">
            <div className="people-schedule-person">
              <div>
                <Typography.Title level={4}>{person.name}</Typography.Title>
                <Space size={[4, 4]} wrap>
                  {person.departments.map((department) => (
                    <Tag key={`${person.key}-${department}`}>{department}</Tag>
                  ))}
                </Space>
              </div>
              <div className="people-schedule-person-stats">
                <span>{person.projectCount} 個專案</span>
                <span>{person.taskCount} 項 Tasks</span>
              </div>
            </div>
            <div className="people-project-list">
              {person.projects.map((project) => {
                const progress = project.taskCount
                  ? Math.round((project.completedTaskCount / project.taskCount) * 100)
                  : 0;
                return (
                  <Popover
                    content={
                      <div className="manpower-task-popover">
                        {project.tasks.map((task) => (
                          <div className="manpower-task-popover-row" key={task.key}>
                            <Tag color="blue">{task.wbs}</Tag>
                            <div>
                              <div className="manpower-task-popover-title">
                                <strong>{task.title}</strong>
                                <Tag color={getManpowerTaskStatusColor(task)}>{task.status}</Tag>
                              </div>
                              <small>
                                {task.startDate} → {task.finishDate} · {task.workdays} 天
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    }
                    key={project.key}
                    mouseEnterDelay={0.12}
                    mouseLeaveDelay={0.08}
                    placement="topLeft"
                    title={`${person.name}｜${project.title} 負責的 Tasks（完成 ${project.completedTaskCount}/${project.taskCount}）`}
                    trigger={["hover", "focus"]}
                  >
                    <div
                      aria-label={`${person.name}，${project.title}，${project.taskCount} 項 Tasks，完成度 ${progress}%，滑鼠移入查看負責 Tasks`}
                      className="people-project-row"
                      tabIndex={0}
                    >
                      <div className="people-project-title">
                        <span>
                          <Tag color="blue">EPIC {project.wbs}</Tag>
                          <Tag color={project.category === "機台" ? "geekblue" : "cyan"}>{project.category}</Tag>
                        </span>
                        <strong>{project.title}</strong>
                      </div>
                      <div className="people-project-meta">
                        <span>{project.startDate} → {project.finishDate}</span>
                        <small>{project.taskCount} 項 Tasks · 完成 {progress}%</small>
                      </div>
                    </div>
                  </Popover>
                );
              })}
            </div>
          </div>

          <div className="people-schedule-gantt-panel">
            <div
              className="gantt-scroll people-schedule-gantt"
              style={ganttPanelStyle(days.length, zoom)}
            >
              <GanttHeader days={days} zoom={zoom} />
              <TodayLine days={days} todayIso={todayIso} />
              <div className="people-schedule-gantt-rows">
                {person.projects.map((project) => (
                  <div className="gantt-board-row" key={`${project.key}-gantt`}>
                    <span
                      className="gantt-board-bar"
                      style={projectBarStyle(project)}
                      title={`${person.name}｜${project.title}｜${project.startDate} - ${project.finishDate}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function ProjectManpowerView({ summaries }: { summaries: ProjectManpowerSummary[] }) {
  const columns: TableProps<ProjectManpowerSummary>["columns"] = [
    {
      title: "專案",
      dataIndex: "title",
      key: "title",
      width: 170,
      render: (_, item) => (
        <div className="manpower-project-cell">
          <div>
            <Tag color="blue">EPIC {item.wbs}</Tag>
            <Tag color={item.category === "機台" ? "geekblue" : "cyan"}>{item.category}</Tag>
          </div>
          <strong>{item.title}</strong>
        </div>
      ),
    },
    {
      title: "Task 期間",
      key: "period",
      width: 170,
      render: (_, item) =>
        item.startDate && item.finishDate ? (
          <div className="manpower-period">
            <span>{item.startDate}</span>
            <span>→</span>
            <span>{item.finishDate}</span>
          </div>
        ) : (
          <Typography.Text type="secondary">尚無 Task</Typography.Text>
        ),
    },
    {
      title: "投入部門",
      key: "departments",
      width: 130,
      render: (_, item) => (
        <Space size={[4, 6]} wrap>
          {item.departments.map((department) => (
            <Tag key={department.key}>{department.name}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "人力",
      dataIndex: "peopleCount",
      key: "peopleCount",
      align: "right",
      width: 65,
      render: (value: number) => `${value} 人`,
    },
    {
      title: "Tasks",
      dataIndex: "taskCount",
      key: "taskCount",
      align: "right",
      width: 65,
      render: (value: number) => `${value} 項`,
    },
    {
      title: "投入工作天",
      dataIndex: "workdays",
      key: "workdays",
      align: "right",
      width: 105,
      render: (value: number) => <strong className="manpower-workdays">{value.toLocaleString()} 天</strong>,
    },
  ];

  return (
    <section className="manpower-page" aria-label="專案人力列表">
      <Table<ProjectManpowerSummary>
        className="manpower-table"
        columns={columns}
        dataSource={summaries}
        locale={{ emptyText: "此標籤目前沒有專案" }}
        pagination={{ defaultPageSize: 30, pageSizeOptions: [30, 50, 100], showSizeChanger: true }}
        expandable={{
          rowExpandable: (item) => item.departments.length > 0,
          expandedRowRender: (item) => <ProjectManpowerDetails departments={item.departments} />,
        }}
        scroll={{ x: 760 }}
        tableLayout="fixed"
      />
    </section>
  );
}

function ProjectManpowerDetails({ departments }: { departments: ManpowerDepartmentSummary[] }) {
  const columns: TableProps<ManpowerDepartmentSummary>["columns"] = [
    {
      title: "部門",
      dataIndex: "name",
      key: "name",
      width: 160,
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "投入人力與工作天",
      key: "agents",
      render: (_, department) => (
        <div className="manpower-agent-list">
          {department.agents.map((agent) => {
            const completionRate = agent.taskCount
              ? Math.round((agent.completedTaskCount / agent.taskCount) * 100)
              : 0;
            return (
              <Popover
              content={
                <div className="manpower-task-popover">
                  {agent.tasks.map((task) => (
                    <div className="manpower-task-popover-row" key={task.key}>
                      <Tag color="blue">{task.wbs}</Tag>
                      <div>
                        <div className="manpower-task-popover-title">
                          <strong>{task.title}</strong>
                          <Tag color={getManpowerTaskStatusColor(task)}>{task.status}</Tag>
                        </div>
                        <small>
                          {task.startDate} → {task.finishDate} · {task.workdays} 天
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              }
              key={agent.key}
              mouseEnterDelay={0.12}
              mouseLeaveDelay={0.08}
              placement="topLeft"
              title={`${agent.name} 負責的 Tasks（完成 ${agent.completedTaskCount}/${agent.taskCount}）`}
              trigger={["hover", "focus"]}
            >
              <span
                aria-label={`${agent.name}，${agent.workdays} 工作天，Task 完成度 ${completionRate}%，滑鼠移入查看負責 Tasks`}
                className="manpower-agent"
                tabIndex={0}
              >
                <strong>{agent.name}</strong>
                <small>{agent.workdays.toLocaleString()} 天</small>
                <span
                  aria-label={`已完成 ${agent.completedTaskCount} 項，共 ${agent.taskCount} 項，完成度 ${completionRate}%`}
                  className="manpower-agent-progress"
                  title={`${agent.completedTaskCount}/${agent.taskCount} = ${completionRate}%`}
                >
                  <Progress percent={completionRate} showInfo={false} size="small" />
                  <small>{completionRate}%</small>
                </span>
              </span>
            </Popover>
            );
          })}
        </div>
      ),
    },
    {
      title: "人力",
      key: "peopleCount",
      align: "right",
      width: 90,
      render: (_, department) => `${department.agents.length} 人`,
    },
    {
      title: "Tasks",
      dataIndex: "taskCount",
      key: "taskCount",
      align: "right",
      width: 100,
      render: (value: number) => `${value} 項`,
    },
    {
      title: "工作天",
      dataIndex: "workdays",
      key: "workdays",
      align: "right",
      width: 110,
      render: (value: number) => `${value.toLocaleString()} 天`,
    },
  ];

  return (
    <Table<ManpowerDepartmentSummary>
      className="manpower-detail-table"
      columns={columns}
      dataSource={departments}
      pagination={false}
      rowKey="key"
      size="small"
      tableLayout="fixed"
    />
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onChange([...values, ""])}>
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
              { id: `option-${Date.now()}`, label: "", color: "#0d5bff" },
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

function AgentSettingsCard({
  values,
  departments,
  onChange,
}: {
  values: AgentOption[];
  departments: string[];
  onChange: (values: AgentOption[]) => void;
}) {
  function updateValue(index: number, value: Partial<AgentOption>) {
    onChange(values.map((item, itemIndex) => (itemIndex === index ? { ...item, ...value } : item)));
  }

  function deleteValue(index: number) {
    onChange(values.filter((_, itemIndex) => itemIndex !== index));
  }

  const departmentOptions = toSelectOptions(departments);

  return (
    <Card
      className="settings-card"
      title="Agent設定"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() =>
            onChange([
              ...values,
              { id: `agent-${Date.now()}`, department: "", name: "" },
            ])
          }
        >
          新增
        </Button>
      }
    >
      <div className="settings-list">
        {values.map((value, index) => (
          <div className="settings-row agent-settings-row" key={value.id || `agent-${index}`}>
            <Select
              aria-label={`${value.name || "Agent"} 部門`}
              className="agent-department-select"
              options={departmentOptions}
              value={value.department || undefined}
              onChange={(department) => updateValue(index, { department })}
            />
            <Input
              aria-label="Agent 名稱"
              value={value.name}
              onChange={(event) => updateValue(index, { name: event.target.value })}
            />
            <Button danger icon={<DeleteOutlined />} onClick={() => deleteValue(index)} aria-label={`刪除 ${value.name}`} />
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
              value={
                value.startDate && value.endDate
                  ? [dayjs(value.startDate), dayjs(value.endDate)]
                  : null
              }
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
