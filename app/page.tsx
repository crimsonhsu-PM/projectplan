"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  ConfigProvider,
  DatePicker,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
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
  MenuOutlined,
  PlusOutlined,
  ProjectOutlined,
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

type AppSettings = {
  departments: string[];
  agents: string[];
  holidays: string[];
  types: string[];
  statuses: string[];
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
const DAY_MS = 24 * 60 * 60 * 1000;

const defaultSettings: AppSettings = {
  departments: ["企劃", "前端", "後端", "QA", "PM"],
  agents: ["Simon", "PM", "Clara", "Anna", "Della", "shock", "GMS", "Will"],
  holidays: ["2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-04-03", "2026-06-19"],
  types: ["全新開發", "優化", "移植開發", "Done", "QA進測前", "待確認"],
  statuses: ["待辦", "進行中", "完成", "擱置"],
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
      row("task-24-1", "24.1", "企劃規格書", "Done", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-2", "24.2", "overview", "Done", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-3", "24.3", "動畫清單", "Done", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-4", "24.4", "音樂清單", "Done", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-5", "24.5", "GameID、英文、中文", "Done", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-6", "24.6", "建制專案Git（遊戲Git、DII Git）", "Done", "Simon", "2026-06-16", "2026-06-16", "", 100),
      row("task-24-7", "24.7", "jira 項目", "Done", "Simon", "2026-06-16", "2026-06-16", "", 100),
      row("task-24-8", "24.8", "LED燈條表演規格", "Done", "Simon", "2026-05-05", "2026-05-20", "", 100),
      row("task-24-9", "24.9", "外包音效", "待確認", "PM", "2026-06-17", "2026-06-26", "待排程", 20),
      row("task-24-10", "24.10", "Demo會議", "Done", "Simon", "2026-06-26", "2026-06-26", "", 100),
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

function toSelectOptions(values: string[]) {
  return values.filter(Boolean).map((value) => ({ label: value, value }));
}

function normalizeSettingList(values: unknown, fallback: string[]) {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const normalized = values.map((value) => String(value).trim()).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
}

function normalizeSettings(settings?: Partial<AppSettings>): AppSettings {
  return {
    departments: normalizeSettingList(settings?.departments, defaultSettings.departments),
    agents: normalizeSettingList(settings?.agents, defaultSettings.agents),
    holidays: normalizeSettingList(settings?.holidays, defaultSettings.holidays),
    types: normalizeSettingList(settings?.types, defaultSettings.types),
    statuses: normalizeSettingList(settings?.statuses, defaultSettings.statuses),
  };
}

function weekLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function dayLabel(date: Date) {
  return String(date.getDate()).padStart(2, "0");
}

function weekday(date: Date) {
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    department: task.department || "企劃",
    duration: getDuration(task.startDate, task.finishDate),
    progress: Math.min(100, Math.max(0, Number(task.progress) || 0)),
  };
}

function normalizeEpic(epic: Epic): Epic {
  const tasks = epic.tasks.map(normalizeTask);
  return {
    ...epic,
    department: epic.department || "PM",
    tasks,
    duration: getDuration(epic.startDate, epic.finishDate),
    progress: Math.min(100, Math.max(0, Number(epic.progress) || 0)),
  };
}

function blankTask(index: number, epicWbs: string): Task {
  return row(
    `task-${Date.now()}-${index}`,
    `${epicWbs}.${index}`,
    "新任務",
    "待確認",
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
  const [hasLoaded, setHasLoaded] = useState(false);

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
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, epics, settings }));
    }
  }, [epics, hasLoaded, project, settings]);

  const editingEpic = epics.find((epic) => epic.id === editingEpicId) ?? null;
  const typeSelectOptions = useMemo(() => toSelectOptions(settings.types), [settings.types]);
  const departmentSelectOptions = useMemo(() => toSelectOptions(settings.departments), [settings.departments]);
  const assigneeSelectOptions = useMemo(() => toSelectOptions(settings.agents), [settings.agents]);
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
  const { start, end } = useMemo(() => getDateRange(epics), [epics]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);
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
      type: columnWidth(["Type", ...settings.types, ...textRows.map((item) => item?.type)], 104, 180, 34),
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
  }, [settings.agents, settings.types, tableRows]);
  const tableColumns = useMemo<TableProps<PlannerTableRow>["columns"]>(
    () => [
      {
        title: "WBS",
        width: tableWidths.wbs,
        render: (_, row) => {
          if (row.rowKind === "epic" && row.item) {
            const isCollapsed = collapsedEpicIds.has(row.epicId);
            return (
              <Space className="wbs-toggle" size={2}>
                <Button
                  aria-label={isCollapsed ? "展開 Tasks" : "收合 Tasks"}
                  icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
                  onClick={() => toggleEpic(row.epicId)}
                  size="small"
                  type="text"
                />
                <span>{row.item.wbs}</span>
              </Space>
            );
          }
          return row.item?.wbs ?? "";
        },
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
              className="cell-control"
              options={typeSelectOptions}
              popupMatchSelectWidth={false}
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
          ? {
              ...epic,
              tasks: epic.tasks.map((task) =>
                task.id === taskId ? normalizeTask({ ...task, ...patch }) : task,
              ),
            }
          : epic,
      ),
    );
  }

  function addEpic() {
    const epic = {
      ...blankEpic(epics.length + 1),
      assignee: settings.agents[0] ?? "Simon",
      department: settings.departments[0] ?? "PM",
      type: settings.types[0] ?? "全新開發",
    };
    setEpics((current) => [...current, epic]);
    setCollapsedEpicIds((current) => {
      const next = new Set(current);
      next.delete(epic.id);
      return next;
    });
    setEditingEpicId(epic.id);
  }

  function updateSettingsList(key: keyof AppSettings, values: string[]) {
    setSettings((current) => ({ ...current, [key]: values }));
  }

  function addHoliday() {
    setSettings((current) => ({ ...current, holidays: [...current.holidays, formatIso(new Date())] }));
  }

  function addTask(epicId: string) {
    setEpics((current) =>
      current.map((epic) =>
        epic.id === epicId
          ? {
              ...epic,
              tasks: [
                ...epic.tasks,
                {
                  ...blankTask(epic.tasks.length + 1, epic.wbs),
                  assignee: settings.agents[0] ?? "Simon",
                  department: settings.departments[0] ?? "企劃",
                  type: settings.types[0] ?? "待確認",
                },
              ],
            }
          : epic,
      ),
    );
  }

  function deleteTask(epicId: string, taskId: string) {
    setEpics((current) =>
      current.map((epic) =>
        epic.id === epicId ? { ...epic, tasks: epic.tasks.filter((task) => task.id !== taskId) } : epic,
      ),
    );
  }

  function getOffset(date: string) {
    return Math.max(
      0,
      Math.round((new Date(`${date}T00:00:00`).getTime() - start.getTime()) / DAY_MS),
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
            <header className="topbar">
              <Space size={12}>
                <Button type="text" icon={<MenuOutlined />} />
                <Typography.Text type="secondary">隱藏菜單</Typography.Text>
              </Space>
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
                    <Typography.Title level={3}>{project.projectName}</Typography.Title>
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
                  <Field label="WK">
                    <Input value={project.wk} onChange={(event) => setProject({ ...project, wk: event.target.value })} />
                  </Field>
                </section>

                <section className="project-board" aria-label="Epic 與 Task 專案列表">
                  <div className="board-toolbar">
                    <div>
                      <Typography.Title level={4}>Epic 工作列表</Typography.Title>
                      <Typography.Text type="secondary">以卡片管理 Epic、Task 與排程區間。</Typography.Text>
                    </div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={addEpic}>
                      新增 EPIC
                    </Button>
                  </div>

                  <div className="epic-list">
                    {epics.map((epic) => {
                      const isCollapsed = collapsedEpicIds.has(epic.id);
                      const epicLeft = (getOffset(epic.startDate) / Math.max(1, days.length)) * 100;
                      const epicWidth = (getDuration(epic.startDate, epic.finishDate) / Math.max(1, days.length)) * 100;
                      return (
                        <article className="epic-card" key={epic.id}>
                          <div className="epic-card-main">
                            <div className="epic-title-row">
                              <Button
                                aria-label={isCollapsed ? "展開 Tasks" : "收合 Tasks"}
                                icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
                                onClick={() => toggleEpic(epic.id)}
                                size="small"
                                type="text"
                              />
                              <Tag color="blue">EPIC {epic.wbs}</Tag>
                              <Button type="link" className="epic-title-button" icon={<EditOutlined />} onClick={() => setEditingEpicId(epic.id)}>
                                {epic.title}
                              </Button>
                            </div>

                            <div className="epic-fields">
                              <Field label="Type">
                                <Select
                                  options={typeSelectOptions}
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

                          <div className="epic-timeline">
                            <div className="timeline-meta">
                              <span>{epic.duration} days</span>
                              <span>{epic.progress}%</span>
                            </div>
                            <div className="timeline-track">
                              <span
                                className="timeline-bar"
                                style={{
                                  left: `${Math.min(96, epicLeft)}%`,
                                  width: `${Math.max(4, Math.min(100 - epicLeft, epicWidth))}%`,
                                  "--progress": `${epic.progress}%`,
                                } as React.CSSProperties}
                              />
                            </div>
                            <div className="timeline-dates">
                              <span>{epic.startDate}</span>
                              <span>{epic.finishDate}</span>
                            </div>
                          </div>

                          {!isCollapsed ? (
                            <div className="task-list">
                              <div className="task-list-header">
                                <span>Tasks</span>
                                <Button size="small" icon={<PlusOutlined />} onClick={() => addTask(epic.id)}>
                                  新增 Task
                                </Button>
                              </div>
                              {epic.tasks.map((task) => {
                                const taskLeft = (getOffset(task.startDate) / Math.max(1, days.length)) * 100;
                                const taskWidth = (getDuration(task.startDate, task.finishDate) / Math.max(1, days.length)) * 100;
                                return (
                                  <div className="task-item" key={task.id}>
                                    <div className="task-identity">
                                      <span className="task-wbs">{task.wbs}</span>
                                      <Input
                                        value={task.title}
                                        variant="borderless"
                                        onChange={(event) => updateTask(epic.id, task.id, { title: event.target.value })}
                                      />
                                    </div>
                                    <Select
                                      className="task-field"
                                      options={departmentSelectOptions}
                                      value={task.department}
                                      onChange={(value) => updateTask(epic.id, task.id, { department: value })}
                                    />
                                    <Select
                                      className="task-field"
                                      options={typeSelectOptions}
                                      value={task.type}
                                      onChange={(value) => updateTask(epic.id, task.id, { type: value })}
                                    />
                                    <Select
                                      className="task-field"
                                      options={assigneeSelectOptions}
                                      value={task.assignee}
                                      onChange={(value) => updateTask(epic.id, task.id, { assignee: value })}
                                    />
                                    <div className="task-mini-timeline">
                                      <span
                                        style={{
                                          left: `${Math.min(96, taskLeft)}%`,
                                          width: `${Math.max(4, Math.min(100 - taskLeft, taskWidth))}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
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
                    onChange={(values) => updateSettingsList("holidays", values)}
                  />
                  <EditableOptionCard
                    title="Type設定"
                    values={settings.types}
                    onChange={(values) => updateSettingsList("types", values)}
                  />
                  <EditableOptionCard
                    title="狀態設定"
                    values={settings.statuses}
                    onChange={(values) => updateSettingsList("statuses", values)}
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
                  options={typeSelectOptions}
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
              <Field label="Progress">
                <InputNumber
                  min="0"
                  max="100"
                  value={editingEpic.progress}
                  addonAfter="%"
                  onChange={(value) => updateEpic(editingEpic.id, { progress: Number(value) })}
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
                    options={typeSelectOptions}
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
                  <InputNumber
                    min="0"
                    max="100"
                    value={task.progress}
                    addonAfter="%"
                    onChange={(value) => updateTask(editingEpic.id, task.id, { progress: Number(value) })}
                    aria-label={`${task.wbs} 進度`}
                  />
                  <Input
                    value={task.rm}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { rm: event.target.value })}
                    placeholder="RM / JIRA"
                    aria-label={`${task.wbs} RM`}
                  />
                  <Button danger icon={<DeleteOutlined />} onClick={() => deleteTask(editingEpic.id, task.id)}>
                    刪除
                  </Button>
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
        <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...values, "新增項目"])}>
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

function HolidaySettingsCard({
  values,
  onAdd,
  onChange,
}: {
  values: string[];
  onAdd: () => void;
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
      title="國定假日設定"
      extra={
        <Button size="small" icon={<PlusOutlined />} onClick={onAdd}>
          新增
        </Button>
      }
    >
      <div className="settings-list">
        {values.map((value, index) => (
          <Space.Compact className="settings-row" key={`holiday-${index}`}>
            <DatePicker
              allowClear={false}
              inputReadOnly
              value={dayjs(value)}
              onChange={(date) => updateValue(index, date ? date.format("YYYY-MM-DD") : value)}
            />
            <Input value={value} onChange={(event) => updateValue(index, event.target.value)} />
            <Button danger icon={<DeleteOutlined />} onClick={() => deleteValue(index)} aria-label={`刪除 ${value}`} />
          </Space.Compact>
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
