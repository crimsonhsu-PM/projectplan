"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  ConfigProvider,
  DatePicker,
  Input,
  InputNumber,
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
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  ProjectOutlined,
  RightOutlined,
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

const typeOptions = ["全新開發", "優化", "移植開發", "Done", "QA進測前", "待確認"];
const departmentOptions = ["企劃", "前端", "後端", "QA", "PM"];
const assignees = ["Simon", "PM", "Clara", "Anna", "Della", "shock", "GMS", "Will"];
const typeSelectOptions = typeOptions.map((type) => ({ label: type, value: type }));
const departmentSelectOptions = departmentOptions.map((department) => ({ label: department, value: department }));
const assigneeSelectOptions = assignees.map((name) => ({ label: name, value: name }));

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
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [collapsedEpicIds, setCollapsedEpicIds] = useState<Set<string>>(new Set());
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { project?: ProjectMeta; epics?: Epic[] };
        setProject(parsed.project ?? defaultProject);
        setEpics((parsed.epics ?? sampleEpics).map(normalizeEpic));
      } catch {
        setEpics(sampleEpics);
      }
    }
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, epics }));
    }
  }, [epics, hasLoaded, project]);

  const editingEpic = epics.find((epic) => epic.id === editingEpicId) ?? null;
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
  const tableColumns = useMemo<TableProps<PlannerTableRow>["columns"]>(
    () => [
      {
        title: "WBS",
        width: 64,
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
        width: 72,
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
        width: 330,
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
        width: 116,
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
        width: 96,
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
        width: 104,
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
        width: 104,
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
        width: 64,
        render: (_, row) => row.item?.duration ?? "",
      },
      {
        title: "RM",
        width: 150,
        render: (_, row) => row.item?.rm ?? "",
      },
    ],
    [collapsedEpicIds],
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
    const epic = blankEpic(epics.length + 1);
    setEpics((current) => [...current, epic]);
    setCollapsedEpicIds((current) => {
      const next = new Set(current);
      next.delete(epic.id);
      return next;
    });
    setEditingEpicId(epic.id);
  }

  function addTask(epicId: string) {
    setEpics((current) =>
      current.map((epic) =>
        epic.id === epicId
          ? { ...epic, tasks: [...epic.tasks, blankTask(epic.tasks.length + 1, epic.wbs)] }
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
          borderRadius: 6,
          colorPrimary: "#1f5f9f",
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
      <main className="planner">
      <section className="project-header" aria-label="專案資訊">
        <div className="project-title">
          <Space size={8}>
            <ProjectOutlined />
            <span>RSG Project plan</span>
          </Space>
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
        <Button type="primary" icon={<PlusOutlined />} onClick={addEpic}>
          新增 EPIC
        </Button>
      </section>

      <section className="sheet" aria-label="Epic 與 Task 甘特圖">
        <div className="left-pane">
          <Table<PlannerTableRow>
            bordered
            className="planner-table"
            columns={tableColumns}
            dataSource={tableRows}
            pagination={false}
            rowClassName={(row) => `${row.rowKind}-row`}
            size="small"
            tableLayout="fixed"
          />
        </div>

        <div
          className="gantt-pane"
          style={{ "--day-count": days.length } as React.CSSProperties}
          aria-label="日視圖甘特圖"
        >
          <div className="week-row">
            {weeks.map((day) => (
              <span
                className="week-label"
                key={day.toISOString()}
                style={{ gridColumn: `${getOffset(formatIso(day)) + 1} / span 7` }}
              >
                {weekLabel(day)}
              </span>
            ))}
          </div>
          <div className="day-row">
            {days.map((day) => (
              <span key={day.toISOString()}>{dayLabel(day)}</span>
            ))}
          </div>
          <div className="weekday-row">
            {days.map((day) => (
              <span key={day.toISOString()}>{weekday(day)}</span>
            ))}
          </div>
          {tableRows.map((row) => {
            if (!row.item) {
              return <div className="gantt-line section-line" key={row.key} />;
            }
            const isEpic = row.rowKind === "epic";
            const offset = getOffset(row.item.startDate);
            const span = Math.max(1, getDuration(row.item.startDate, row.item.finishDate));
            return (
              <div className={isEpic ? "gantt-line epic-line" : "gantt-line"} key={row.key}>
                <span
                  className={isEpic ? "bar epic-bar" : "bar"}
                  style={{
                    gridColumn: `${offset + 1} / span ${span}`,
                    "--progress": `${row.item.progress}%`,
                  } as React.CSSProperties}
                  title={`${row.item.title} ${row.item.startDate} - ${row.item.finishDate}`}
                />
              </div>
            );
          })}
        </div>
      </section>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}
