"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  ColorPicker,
  ConfigProvider,
  DatePicker,
  Dropdown,
  Input,
  Layout,
  Menu,
  Modal,
  Popover,
  Progress,
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
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  ProjectOutlined,
  RightOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
  TableOutlined,
  UploadOutlined,
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
  category: EpicCategory;
  starred?: boolean;
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

type AgentOption = {
  id: string;
  name: string;
  department: string;
};

type AppSettings = {
  departments: string[];
  agents: AgentOption[];
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

type ImportMode = "append" | "replace";

type ImportedRow = {
  kind: string;
  category: string;
  wbs: string;
  priority: string;
  title: string;
  type: string;
  department: string;
  assignee: string;
  startDate: string;
  finishDate: string;
  rm: string;
  rowNumber: number;
};

type ImportPreview = {
  epics: Epic[];
  errors: string[];
};

type StoredProjectData = {
  project?: ProjectMeta;
  epics?: Epic[];
  settings?: Partial<AppSettings>;
};

type SyncStatus = "loading" | "saved" | "saving" | "offline" | "error";
type PlannerView = "schedule" | "manpower" | "people";

type ManpowerTaskSummary = {
  key: string;
  wbs: string;
  title: string;
  status: string;
  completed: boolean;
  startDate: string;
  finishDate: string;
  workdays: number;
};

type ManpowerAgentSummary = {
  key: string;
  name: string;
  completedTaskCount: number;
  taskCount: number;
  workdays: number;
  tasks: ManpowerTaskSummary[];
};

type ManpowerDepartmentSummary = {
  key: string;
  name: string;
  taskCount: number;
  workdays: number;
  agents: ManpowerAgentSummary[];
};

type ProjectManpowerSummary = {
  key: string;
  wbs: string;
  category: EpicCategory;
  title: string;
  startDate: string;
  finishDate: string;
  taskCount: number;
  peopleCount: number;
  workdays: number;
  departments: ManpowerDepartmentSummary[];
};

type PersonnelProjectSummary = {
  key: string;
  wbs: string;
  category: EpicCategory;
  title: string;
  startDate: string;
  finishDate: string;
  taskCount: number;
  completedTaskCount: number;
  tasks: ManpowerTaskSummary[];
};

type PersonnelScheduleSummary = {
  key: string;
  name: string;
  departments: string[];
  projectCount: number;
  taskCount: number;
  projects: PersonnelProjectSummary[];
};

const epicCategoryOptions = ["機台", "線上"] as const;
type EpicCategory = (typeof epicCategoryOptions)[number];
const STORAGE_KEY = "rsg-project-plan-v2";
const VISIBLE_TASK_COLUMNS_KEY = "rsg-project-plan-visible-task-columns-v1";
const EPIC_MAIN_WIDTH_KEY = "rsg-project-plan-epic-main-width-v1";
const ALL_FILTER_VALUE = "__all__";
const MIN_EPIC_MAIN_WIDTH = 760;
const MAX_EPIC_MAIN_WIDTH = 1100;
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

function buildProjectManpowerSummary(epic: Epic, holidayDates: Set<string>): ProjectManpowerSummary {
  const departmentMap = new Map<string, Map<string, ManpowerAgentSummary>>();
  let startDate = "";
  let finishDate = "";

  epic.tasks.forEach((task) => {
    if (!startDate || task.startDate < startDate) {
      startDate = task.startDate;
    }
    if (!finishDate || task.finishDate > finishDate) {
      finishDate = task.finishDate;
    }

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
      tasks: [
        ...current.tasks,
        {
          key: task.id,
          wbs: task.wbs,
          title: task.title,
          status: task.type.trim() || "未設定",
          completed: isCompletedTask(task),
          startDate: task.startDate,
          finishDate: task.finishDate,
          workdays,
        },
      ],
    });
    departmentMap.set(department, agents);
  });

  const departments = Array.from(departmentMap.entries()).map(([name, agentMap]) => {
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
  }).sort((left, right) => right.workdays - left.workdays || left.name.localeCompare(right.name));

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

function buildPersonnelScheduleSummaries(epics: Epic[], holidayDates: Set<string>): PersonnelScheduleSummary[] {
  const people = new Map<
    string,
    {
      key: string;
      name: string;
      departments: Set<string>;
      projects: Map<string, PersonnelProjectSummary>;
    }
  >();

  epics.forEach((epic) => {
    epic.tasks.forEach((task) => {
      const name = task.assignee.trim() || "未指派";
      const person = people.get(name) ?? {
        key: `person-${name}`,
        name,
        departments: new Set<string>(),
        projects: new Map<string, PersonnelProjectSummary>(),
      };
      person.departments.add(task.department.trim() || "未設定部門");

      const currentProject = person.projects.get(epic.id) ?? {
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
        ...currentProject,
        startDate: task.startDate < currentProject.startDate ? task.startDate : currentProject.startDate,
        finishDate: task.finishDate > currentProject.finishDate ? task.finishDate : currentProject.finishDate,
        taskCount: currentProject.taskCount + 1,
        completedTaskCount: currentProject.completedTaskCount + (isCompletedTask(task) ? 1 : 0),
        tasks: [
          ...currentProject.tasks,
          {
            key: task.id,
            wbs: task.wbs,
            title: task.title,
            status: task.type.trim() || "未設定",
            completed: isCompletedTask(task),
            startDate: task.startDate,
            finishDate: task.finishDate,
            workdays: getWorkdayDuration(task.startDate, task.finishDate, holidayDates),
          },
        ],
      });
      people.set(name, person);
    });
  });

  return Array.from(people.values())
    .map((person) => {
      const projects = Array.from(person.projects.values()).sort(
        (left, right) => {
          const leftProgress = left.taskCount ? left.completedTaskCount / left.taskCount : 0;
          const rightProgress = right.taskCount ? right.completedTaskCount / right.taskCount : 0;
          const leftCompleted = leftProgress === 1;
          const rightCompleted = rightProgress === 1;
          if (leftCompleted !== rightCompleted) {
            return Number(leftCompleted) - Number(rightCompleted);
          }
          const categoryDifference =
            epicCategoryOptions.indexOf(left.category) - epicCategoryOptions.indexOf(right.category);
          return (
            categoryDifference ||
            rightProgress - leftProgress ||
            left.startDate.localeCompare(right.startDate) ||
            left.title.localeCompare(right.title)
          );
        },
      );
      return {
        key: person.key,
        name: person.name,
        departments: Array.from(person.departments).sort((left, right) => left.localeCompare(right)),
        projectCount: projects.length,
        taskCount: projects.reduce((total, project) => total + project.taskCount, 0),
        projects,
      };
    })
    .sort(
      (left, right) => {
        const departmentDifference = (left.departments[0] ?? "未設定部門").localeCompare(
          right.departments[0] ?? "未設定部門",
          "zh-Hant",
        );
        return (
          departmentDifference ||
          right.projectCount - left.projectCount ||
          right.taskCount - left.taskCount ||
          left.name.localeCompare(right.name)
        );
      },
    );
}

function escapeSpreadsheetCell(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function spreadsheetRow(cells: unknown[]) {
  return `<tr>${cells.map((cell) => `<td>${escapeSpreadsheetCell(cell)}</td>`).join("")}</tr>`;
}

function exportProjectExcel(project: ProjectMeta, epics: Epic[], holidayDates: Set<string>) {
  const rows = [
    spreadsheetRow(["專案名稱", project.projectName]),
    spreadsheetRow(["Project type", project.projectType]),
    spreadsheetRow(["Start date", project.startDate]),
    spreadsheetRow([]),
    spreadsheetRow(["類型", "標籤", "WBS", "Priority", "Epic/Task", "Type/狀態", "部門", "Agent", "Start", "Finish", "工作天數", "完成度", "RM/JIRA"]),
    ...epics.flatMap((epic) => [
      spreadsheetRow([
        "EPIC",
        epic.category,
        epic.wbs,
        epic.priority,
        epic.title,
        epic.type,
        epic.department,
        epic.assignee,
        epic.startDate,
        epic.finishDate,
        getWorkdayDuration(epic.startDate, epic.finishDate, holidayDates),
        `${getEpicProgress(epic.tasks)}%`,
        epic.rm,
      ]),
      ...epic.tasks.map((task) =>
        spreadsheetRow([
          "TASK",
          epic.category,
          task.wbs,
          "",
          task.title,
          task.type,
          task.department,
          task.assignee,
          task.startDate,
          task.finishDate,
          getWorkdayDuration(task.startDate, task.finishDate, holidayDates),
          "",
          task.rm,
        ]),
      ),
    ]),
  ];
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table>${rows.join("")}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.projectName || "project-plan"}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadImportTemplate() {
  const rows = [
    spreadsheetRow(["類型", "標籤", "WBS", "Priority", "Epic/Task", "Type/狀態", "部門", "Agent", "Start", "Finish", "RM/JIRA"]),
    spreadsheetRow(["EPIC", "機台", "24", "1", "新遊戲開發 - 決戰賽特2", "全新開發", "PM", "Simon", "2026-05-05", "2026-07-15", ""]),
    spreadsheetRow(["TASK", "機台", "24.1", "", "企劃規格書", "完成", "企劃", "Simon", "2026-05-05", "2026-05-20", ""]),
    spreadsheetRow(["TASK", "機台", "24.2", "", "overview", "完成", "企劃", "Simon", "2026-05-05", "2026-05-20", ""]),
  ];
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table>${rows.join("")}</table></body></html>`;
  downloadTextFile("RSG匯入範例.xls", html, "application/vnd.ms-excel;charset=utf-8");
}

function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseImportedDate(value: string) {
  const text = value.trim();
  if (!text) {
    return "";
  }
  const normalized = text.replace(/\//g, "-").replace(/\./g, "-");
  const match = normalized.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = match[1].length === 2 ? `20${match[1]}` : match[1];
    const date = new Date(Number(year), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(date.getTime())) {
      return formatIso(date);
    }
  }
  const fallback = dayjs(normalized);
  return fallback.isValid() ? fallback.format("YYYY-MM-DD") : "";
}

function parseDelimitedRows(text: string) {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      cell = "";
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }
  return rows;
}

function parseHtmlTableRows(text: string) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return Array.from(doc.querySelectorAll("tr"))
    .map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? ""))
    .filter((row) => row.some(Boolean));
}

function parseSpreadsheetText(text: string) {
  if (/<table[\s>]/i.test(text)) {
    return parseHtmlTableRows(text);
  }
  return parseDelimitedRows(text);
}

function decodeSpreadsheetBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  const sample = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset = sample.match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1];
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // Unsupported labels fall back to UTF-8 below.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function headerColumnIndex(headers: string[], aliases: string[], fallback: number) {
  const index = headers.findIndex((header) => aliases.some((alias) => header.toLowerCase() === alias.toLowerCase()));
  return index >= 0 ? index : fallback;
}

function mapImportedRows(rows: string[][]): ImportedRow[] {
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.toLowerCase() === "wbs"));
  const headers = headerIndex >= 0 ? rows[headerIndex].map((cell) => cell.trim()) : [];
  const hasCategoryColumn = headers.some((header) => ["標籤", "tag", "category"].includes(header.toLowerCase()));
  const offset = hasCategoryColumn ? 1 : 0;
  const indexes = {
    kind: headerColumnIndex(headers, ["類型", "kind"], 0),
    category: headerColumnIndex(headers, ["標籤", "tag", "category"], -1),
    wbs: headerColumnIndex(headers, ["wbs"], 1 + offset),
    priority: headerColumnIndex(headers, ["priority"], 2 + offset),
    title: headerColumnIndex(headers, ["epic/task", "epic/task description", "task", "title"], 3 + offset),
    type: headerColumnIndex(headers, ["type/狀態", "type", "狀態", "status"], 4 + offset),
    department: headerColumnIndex(headers, ["部門", "department"], 5 + offset),
    assignee: headerColumnIndex(headers, ["agent", "assignee"], 6 + offset),
    startDate: headerColumnIndex(headers, ["start", "start date"], 7 + offset),
    finishDate: headerColumnIndex(headers, ["finish", "finish date"], 8 + offset),
    rm: headerColumnIndex(headers, ["rm/jira", "rm", "jira"], 9 + offset),
  };
  const dataRows = rows.slice(headerIndex >= 0 ? headerIndex + 1 : 0);
  return dataRows
    .map((row, index) => ({
      kind: row[indexes.kind]?.trim().toUpperCase() ?? "",
      category: indexes.category >= 0 ? row[indexes.category]?.trim() ?? "" : "",
      wbs: row[indexes.wbs]?.trim() ?? "",
      priority: row[indexes.priority]?.trim() ?? "",
      title: row[indexes.title]?.trim() ?? "",
      type: row[indexes.type]?.trim() ?? "",
      department: row[indexes.department]?.trim() ?? "",
      assignee: row[indexes.assignee]?.trim() ?? "",
      startDate: parseImportedDate(row[indexes.startDate] ?? ""),
      finishDate: parseImportedDate(row[indexes.finishDate] ?? ""),
      rm: row[indexes.rm]?.trim() ?? "",
      rowNumber: (headerIndex >= 0 ? headerIndex + 2 : 1) + index,
    }))
    .filter((row) => row.kind || row.wbs || row.title);
}

function renumberTasks(tasks: Task[], epicWbs: string) {
  return tasks.map((task, index) => ({ ...task, wbs: `${epicWbs}.${index + 1}` }));
}

function buildImportPreview(rows: ImportedRow[], settings: AppSettings): ImportPreview {
  const errors: string[] = [];
  const epicMap = new Map<string, Epic>();
  const orderedEpics: Epic[] = [];

  if (!rows.length) {
    return { epics: [], errors: ["找不到可匯入的資料，請確認檔案包含表格標題與 EPIC / TASK 資料列"] };
  }

  rows.forEach((row) => {
    if (row.kind !== "EPIC" && row.kind !== "TASK") {
      errors.push(`第 ${row.rowNumber} 列：類型需為 EPIC 或 TASK`);
      return;
    }
    if (!row.wbs) {
      errors.push(`第 ${row.rowNumber} 列：WBS 必填`);
      return;
    }
    if (!row.title) {
      errors.push(`第 ${row.rowNumber} 列：Epic/Task 必填`);
      return;
    }
    if (!row.startDate || !row.finishDate) {
      errors.push(`第 ${row.rowNumber} 列：Start / Finish 日期格式不正確`);
      return;
    }

    if (row.kind === "EPIC") {
      const epic: Epic = normalizeEpic({
        id: `import-epic-${Date.now()}-${orderedEpics.length}`,
        wbs: row.wbs,
        priority: row.priority || String(orderedEpics.length + 1),
        category: normalizeEpicCategory(row.category),
        title: row.title,
        type: row.type || settings.types[0]?.label || "全新開發",
        department: row.department || "PM",
        assignee: row.assignee || agentNames(settings.agents)[0] || "Simon",
        startDate: row.startDate,
        finishDate: row.finishDate,
        duration: getDuration(row.startDate, row.finishDate),
        rm: row.rm,
        progress: 0,
        tasks: [],
      });
      epicMap.set(row.wbs, epic);
      orderedEpics.push(epic);
      return;
    }

    const epicWbs = row.wbs.includes(".") ? row.wbs.split(".")[0] : row.wbs;
    const epic = epicMap.get(epicWbs);
    if (!epic) {
      errors.push(`第 ${row.rowNumber} 列：找不到 WBS ${epicWbs} 的 EPIC`);
      return;
    }
    epic.tasks.push(
      normalizeTask({
        id: `import-task-${Date.now()}-${row.rowNumber}`,
        wbs: row.wbs,
        title: row.title,
        type: row.type || settings.statuses[0]?.label || "待辦",
        department: row.department || settings.departments[0] || "企劃",
        assignee: row.assignee || agentNames(settings.agents)[0] || "Simon",
        startDate: row.startDate,
        finishDate: row.finishDate,
        duration: getDuration(row.startDate, row.finishDate),
        rm: row.rm,
        progress: 0,
      }),
    );
  });

  return {
    epics: orderedEpics.map((epic) => normalizeEpic({ ...epic, tasks: renumberTasks(epic.tasks, epic.wbs) })),
    errors,
  };
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

function agentNames(agents: AgentOption[]) {
  return agents.map((agent) => agent.name).filter(Boolean);
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

function normalizeAgentList(values: unknown, fallback: AgentOption[], departments = defaultSettings.departments) {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const seen = new Set<string>();
  const normalized = values
    .map((value, index) => {
      if (typeof value === "string") {
        const [maybeDepartment, maybeName] = value.includes("|") ? value.split("|").map((item) => item.trim()) : ["", value.trim()];
        const name = maybeName || maybeDepartment;
        if (!name || seen.has(name)) {
          return null;
        }
        seen.add(name);
        const fallbackAgent = fallback.find((agent) => agent.name === name);
        return {
          id: fallbackAgent?.id ?? `agent-${name}-${index}`,
          name,
          department: maybeName ? maybeDepartment : fallbackAgent?.department ?? departments[0] ?? "企劃",
        };
      }
      if (value && typeof value === "object") {
        const item = value as Partial<AgentOption> & { label?: string; value?: string };
        const name = String(item.name ?? item.label ?? item.value ?? "").trim();
        if (!name || seen.has(name)) {
          return null;
        }
        seen.add(name);
        const fallbackAgent = fallback.find((agent) => agent.name === name);
        return {
          id: String(item.id ?? fallbackAgent?.id ?? `agent-${name}-${index}`),
          name,
          department: String(item.department ?? fallbackAgent?.department ?? departments[0] ?? "企劃").trim(),
        };
      }
      return null;
    })
    .filter((value): value is AgentOption => Boolean(value));
  return normalized.length ? normalized : fallback;
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
  const departments = normalizeSettingList(settings?.departments, defaultSettings.departments);
  return {
    departments,
    agents: normalizeAgentList(settings?.agents, defaultSettings.agents, departments),
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

function normalizeEpicCategory(value: unknown): EpicCategory {
  return epicCategoryOptions.includes(value as EpicCategory) ? (value as EpicCategory) : "機台";
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

function normalizeEpic(epic: Epic): Epic {
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
  const [activePlannerView, setActivePlannerView] = useState<PlannerView>("schedule");
  const [activeEpicCategory, setActiveEpicCategory] = useState<EpicCategory>("機台");
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

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    function applyStoredData(data: StoredProjectData) {
      const nextEpics = (data.epics ?? sampleEpics).map(normalizeEpic);
      setProject(data.project ?? defaultProject);
      setEpics(nextEpics);
      setCollapsedEpicIds(new Set(nextEpics.map((epic) => epic.id)));
      setSettings(normalizeSettings(data.settings));
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
  const filteredEpics = useMemo(
    () =>
      epics.flatMap((epic) => {
        const hasDepartmentFilter = Boolean(departmentFilter && departmentFilter !== ALL_FILTER_VALUE);
        const hasAgentFilter = Boolean(agentFilter && agentFilter !== ALL_FILTER_VALUE);
        if (!hasDepartmentFilter && !hasAgentFilter) {
          return [epic];
        }
        const tasks = epic.tasks.filter(
          (task) =>
            (!hasDepartmentFilter || task.department.trim() === departmentFilter) &&
            (!hasAgentFilter || task.assignee.trim() === agentFilter),
        );
        return tasks.length ? [{ ...epic, tasks }] : [];
      }),
    [agentFilter, departmentFilter, epics],
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
  const visibleTaskColumnDefinitions = useMemo(
    () => taskColumnDefinitions.filter((column) => visibleTaskColumns.has(column.key)),
    [visibleTaskColumns],
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
  const { start, end } = useMemo(() => getGanttRange(project.startDate, visibleEpics), [project.startDate, visibleEpics]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);
  const personnelRange = useMemo(
    () => getGanttRange(project.startDate, personnelEpics),
    [personnelEpics, project.startDate],
  );
  const personnelDays = useMemo(
    () => enumerateDays(personnelRange.start, personnelRange.end),
    [personnelRange],
  );
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
      assignee: assigneeNames[0] ?? "Simon",
      category: activeEpicCategory,
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
    setEpics((current) => (importMode === "replace" ? importPreview.epics : [...current, ...importPreview.epics]).map(normalizeEpic));
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

  if (!isHydrated) {
    return (
      <main className="app-loading" aria-label="系統載入中">
        <span>資料載入中</span>
      </main>
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
          </Layout.Sider>
          <Layout.Content className="backend-content">
            <header className="topbar topbar-end">
              <Typography.Text className={`sync-status sync-status-${syncStatus}`}>
                {syncStatus === "loading"
                  ? "資料載入中"
                  : syncStatus === "saving"
                    ? "儲存中"
                    : syncStatus === "saved"
                      ? "已儲存"
                      : syncStatus === "offline"
                        ? "使用本機備援"
                        : "儲存失敗"}
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

                {activePlannerView === "schedule" ? (
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
                  <Field label="Start date">
                    <DatePicker
                      value={dayjs(project.startDate)}
                      onChange={(date) => setProject({ ...project, startDate: date ? date.format("YYYY-MM-DD") : project.startDate })}
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
                  <Button icon={<DownloadOutlined />} onClick={() => exportProjectExcel(project, epics, holidayDates)} aria-label="匯出 Excel">
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
                        <Field label="Start date">
                          <DatePicker
                            aria-label="人員時程 Start date"
                            value={dayjs(project.startDate)}
                            onChange={(date) =>
                              setProject({
                                ...project,
                                startDate: date ? date.format("YYYY-MM-DD") : project.startDate,
                              })
                            }
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
                </div>

                {activePlannerView === "schedule" ? (
                  <section className="project-board" aria-label="Epic 與 Task 專案列表">
                  <div className="epic-list">
                    {visibleEpics.map((epic) => {
                      const isCollapsed = collapsedEpicIds.has(epic.id);
                      return (
                        <article
                          className={`epic-card ${draggingEpicId === epic.id ? "epic-card-dragging" : ""}`}
                          key={epic.id}
                          style={{ "--epic-main-width": `${epicMainWidth}px` } as React.CSSProperties}
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
                              <Field label="標籤">
                                <Select
                                  options={epicCategorySelectOptions}
                                  value={epic.category}
                                  onChange={(value) => updateEpic(epic.id, { category: normalizeEpicCategory(value) })}
                                />
                              </Field>
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
                              <Field label="Start / Finish">
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
                                <Space size={8}>
                                  <Dropdown
                                    trigger={["click"]}
                                    dropdownRender={() => (
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
                                    className={`task-item ${isDraggingTask ? "task-item-dragging" : ""} ${
                                      isTaskDropTarget ? `task-item-drop-${taskDropTarget.position}` : ""
                                    }`}
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
                                    {visibleTaskColumns.has("wbs") ? (
                                      <span className="task-wbs">
                                        {task.wbs}
                                      </span>
                                    ) : null}
                                    {visibleTaskColumns.has("task") ? (
                                      <Input
                                        className="task-title-input"
                                        value={task.title}
                                        variant="borderless"
                                        onChange={(event) => updateTask(epic.id, task.id, { title: event.target.value })}
                                      />
                                    ) : null}
                                    {visibleTaskColumns.has("department") ? (
                                      <Select
                                        className="task-field"
                                        options={departmentSelectOptions}
                                        value={task.department}
                                        onChange={(value) => updateTask(epic.id, task.id, { department: value })}
                                      />
                                    ) : null}
                                    {visibleTaskColumns.has("status") ? (
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
                                    {visibleTaskColumns.has("agent") ? (
                                      <Select
                                        className="task-field"
                                        options={assigneeSelectOptions}
                                        value={task.assignee}
                                        onChange={(value) => updateTask(epic.id, task.id, { assignee: value })}
                                      />
                                    ) : null}
                                    {visibleTaskColumns.has("start") && visibleTaskColumns.has("finish") ? (
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
                                        {visibleTaskColumns.has("start") ? (
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
                                        {visibleTaskColumns.has("finish") ? (
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
                                    {visibleTaskColumns.has("workdays") ? (
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
                ) : activePlannerView === "manpower" ? (
                  <ProjectManpowerView summaries={manpowerSummaries} />
                ) : (
                  <PersonnelScheduleView days={personnelDays} summaries={personnelScheduleSummaries} />
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
              <Field label="Start / Finish">
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
    </ConfigProvider>
  );
}

function PersonnelScheduleView({
  days,
  summaries,
}: {
  days: Date[];
  summaries: PersonnelScheduleSummary[];
}) {
  const rangeStart = days[0]?.getTime() ?? 0;
  const ganttWeeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    ganttWeeks.push(days.slice(index, index + 7));
  }

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
              style={{ "--gantt-days": days.length } as React.CSSProperties}
            >
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
