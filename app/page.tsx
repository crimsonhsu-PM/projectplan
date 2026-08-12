"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  wbs: string;
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

const STORAGE_KEY = "rsg-project-plan-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const typeOptions = ["全新開發", "優化", "移植開發", "Done", "QA進測前", "待確認"];
const assignees = ["Simon", "PM", "Clara", "Anna", "Della", "shock", "GMS", "Will"];

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
  {
    id: "epic-25",
    wbs: "25",
    priority: "2",
    title: "新增熒幕UI 彈出Bet level 看板功能",
    type: "優化",
    assignee: "PM",
    startDate: "2026-03-20",
    finishDate: "2026-03-27",
    duration: 8,
    rm: "RCM-232 / RCM-277",
    progress: 60,
    tasks: [
      row("task-25-1", "25.1", "help頁面新增全部操作按鈕說明", "優化", "PM", "2026-03-20", "2026-03-23", "RCM-286", 100),
      row("task-25-2", "25.2", "betlv denom 流程調整", "優化", "Simon", "2026-03-20", "2026-03-27", "RCM-232", 40),
      row("task-25-3", "25.3", "部署到 dev 並請相關人員確認", "QA進測前", "PM", "2026-03-24", "2026-03-27", "RCM-277", 40),
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
  return date.toISOString().slice(0, 10);
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
    duration: getDuration(task.startDate, task.finishDate),
    progress: Math.min(100, Math.max(0, Number(task.progress) || 0)),
  };
}

function normalizeEpic(epic: Epic): Epic {
  const tasks = epic.tasks.map(normalizeTask);
  return {
    ...epic,
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
    priority: String(nextIndex),
    title: "新增 EPIC",
    type: "全新開發",
    assignee: "Simon",
    startDate: defaultProject.startDate,
    finishDate: addDays(new Date(`${defaultProject.startDate}T00:00:00`), 14).toISOString().slice(0, 10),
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
  const rows = epics.flatMap((epic) => [epic, ...epic.tasks]);
  const { start, end } = useMemo(() => getDateRange(epics), [epics]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);
  const weeks = useMemo(() => days.filter((day) => day.getDay() === 1), [days]);

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
    <main className="planner">
      <section className="project-header" aria-label="專案資訊">
        <div className="project-title">
          <span>RSG Project plan</span>
          <strong>{project.projectName}</strong>
        </div>
        <label>
          Project type
          <input
            value={project.projectType}
            onChange={(event) => setProject({ ...project, projectType: event.target.value })}
          />
        </label>
        <label>
          Start date
          <input
            type="date"
            value={project.startDate}
            onChange={(event) => setProject({ ...project, startDate: event.target.value })}
          />
        </label>
        <label>
          WK
          <input value={project.wk} onChange={(event) => setProject({ ...project, wk: event.target.value })} />
        </label>
        <button className="primary-action" type="button" onClick={addEpic}>
          + 新增 EPIC
        </button>
      </section>

      <section className="sheet" aria-label="Epic 與 Task 甘特圖">
        <div className="left-pane">
          <div className="table-grid table-head">
            <span>WBS</span>
            <span>Priority</span>
            <span>Epic/Task description</span>
            <span>Type</span>
            <span>Assignee</span>
            <span>Start date</span>
            <span>Finish date</span>
            <span>Duration</span>
            <span>RM</span>
            <span>progress</span>
          </div>
          {epics.map((epic) => (
            <div className="row-group" key={epic.id}>
              <PlannerRow
                item={epic}
                isEpic
                priority={epic.priority}
                onTitleClick={() => setEditingEpicId(epic.id)}
              />
              <div className="section-row">
                <span />
                <span>部門</span>
                <span>項目</span>
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              {epic.tasks.map((task) => (
                <PlannerRow item={task} key={task.id} />
              ))}
            </div>
          ))}
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
          {rows.map((item) => {
            const isEpic = "tasks" in item;
            const offset = getOffset(item.startDate);
            const span = Math.max(1, getDuration(item.startDate, item.finishDate));
            return (
              <div className={isEpic ? "gantt-line epic-line" : "gantt-line"} key={item.id}>
                <span
                  className={isEpic ? "bar epic-bar" : "bar"}
                  style={{
                    gridColumn: `${offset + 1} / span ${span}`,
                    "--progress": `${item.progress}%`,
                  } as React.CSSProperties}
                  title={`${item.title} ${item.startDate} - ${item.finishDate}`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {editingEpic ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingEpicId(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="編輯 Epic 與 Tasks"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span>EPIC {editingEpic.wbs}</span>
                <h2>{editingEpic.title}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditingEpicId(null)} aria-label="關閉">
                ×
              </button>
            </div>

            <div className="form-grid">
              <Field label="Epic 標題">
                <input value={editingEpic.title} onChange={(event) => updateEpic(editingEpic.id, { title: event.target.value })} />
              </Field>
              <Field label="Type">
                <select value={editingEpic.type} onChange={(event) => updateEpic(editingEpic.id, { type: event.target.value })}>
                  {typeOptions.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Assignee">
                <select
                  value={editingEpic.assignee}
                  onChange={(event) => updateEpic(editingEpic.id, { assignee: event.target.value })}
                >
                  {assignees.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  value={editingEpic.startDate}
                  onChange={(event) => updateEpic(editingEpic.id, { startDate: event.target.value })}
                />
              </Field>
              <Field label="Finish date">
                <input
                  type="date"
                  value={editingEpic.finishDate}
                  onChange={(event) => updateEpic(editingEpic.id, { finishDate: event.target.value })}
                />
              </Field>
              <Field label="Progress">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editingEpic.progress}
                  onChange={(event) => updateEpic(editingEpic.id, { progress: Number(event.target.value) })}
                />
              </Field>
            </div>

            <div className="task-toolbar">
              <h3>Tasks</h3>
              <button type="button" onClick={() => addTask(editingEpic.id)}>
                + 新增 Task
              </button>
            </div>

            <div className="task-editor">
              {editingEpic.tasks.map((task) => (
                <div className="task-card" key={task.id}>
                  <input
                    className="task-title"
                    value={task.title}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { title: event.target.value })}
                    aria-label={`${task.wbs} 任務名稱`}
                  />
                  <select value={task.type} onChange={(event) => updateTask(editingEpic.id, task.id, { type: event.target.value })}>
                    {typeOptions.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <select
                    value={task.assignee}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { assignee: event.target.value })}
                  >
                    {assignees.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={task.startDate}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { startDate: event.target.value })}
                    aria-label={`${task.wbs} 開始日期`}
                  />
                  <input
                    type="date"
                    value={task.finishDate}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { finishDate: event.target.value })}
                    aria-label={`${task.wbs} 結束日期`}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={task.progress}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { progress: Number(event.target.value) })}
                    aria-label={`${task.wbs} 進度`}
                  />
                  <input
                    value={task.rm}
                    onChange={(event) => updateTask(editingEpic.id, task.id, { rm: event.target.value })}
                    placeholder="RM / JIRA"
                    aria-label={`${task.wbs} RM`}
                  />
                  <button className="danger" type="button" onClick={() => deleteTask(editingEpic.id, task.id)}>
                    刪除
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PlannerRow({
  item,
  isEpic = false,
  priority = "",
  onTitleClick,
}: {
  item: Task;
  isEpic?: boolean;
  priority?: string;
  onTitleClick?: () => void;
}) {
  return (
    <div className={isEpic ? "table-grid data-row epic-row" : "table-grid data-row task-row"}>
      <span className="wbs">{item.wbs}</span>
      <span>{priority}</span>
      <span className="description">
        {isEpic ? (
          <button type="button" onClick={onTitleClick}>
            {item.title}
          </button>
        ) : (
          item.title
        )}
      </span>
      <span>{item.type}</span>
      <span>{item.assignee}</span>
      <span>{item.startDate.slice(2).replaceAll("-", "-")}</span>
      <span>{item.finishDate.slice(2).replaceAll("-", "-")}</span>
      <span>{item.duration}</span>
      <span>{item.rm}</span>
      <span className="progress-text">{item.progress >= 100 ? "TRUE" : `${item.progress}%`}</span>
    </div>
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
