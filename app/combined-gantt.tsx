"use client";

import { useEffect, useRef } from "react";
import { Progress, Tag, Tooltip } from "antd";
import { DownOutlined, EditOutlined, RightOutlined } from "@ant-design/icons";
import type { Epic, Task } from "@/lib/planner-types";
import { formatIso } from "@/lib/planner-domain";

const DAY_MS = 24 * 60 * 60 * 1000;

function isDone(task: Task) {
  return task.progress >= 100 || task.type.trim() === "完成";
}

// 所有 Epic 共用一張甘特圖：一個日期表頭、一條捲軸、一條今天線
export function CombinedGantt({
  epics,
  days,
  todayIso,
  collapsedEpicIds,
  panelStyle,
  header,
  onToggleEpic,
  onEditEpic,
}: {
  epics: Epic[];
  days: Date[];
  todayIso: string;
  collapsedEpicIds: Set<string>;
  panelStyle: React.CSSProperties;
  header: React.ReactNode;
  onToggleEpic: (epicId: string) => void;
  onEditEpic: (epicId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const start = days[0]?.getTime() ?? 0;
  // 打開時捲到今天
  useEffect(() => {
    const panel = scrollRef.current;
    const line = panel?.querySelector<HTMLElement>(".gantt-today-line");
    const label = panel?.querySelector<HTMLElement>(".cg-label")?.offsetWidth ?? 0;
    if (panel && line) panel.scrollLeft = Math.max(0, line.offsetLeft - label - 120);
  }, [days.length, todayIso]);
  const todayIndex = days.findIndex((day) => formatIso(day) === todayIso);

  function barStyle(item: { startDate: string; finishDate: string; progress: number }) {
    const from = Math.round((new Date(`${item.startDate}T00:00:00`).getTime() - start) / DAY_MS);
    const to = Math.round((new Date(`${item.finishDate}T00:00:00`).getTime() - start) / DAY_MS);
    if (to < 0 || from > days.length - 1) return null;
    const columnStart = Math.max(0, from) + 1;
    const columnEnd = Math.min(days.length, to + 1);
    return {
      gridColumn: `${columnStart} / span ${Math.max(1, columnEnd - columnStart + 1)}`,
      "--progress": `${item.progress}%`,
    } as React.CSSProperties;
  }

  const overdue = (task: Task) => !isDone(task) && task.finishDate < todayIso;

  return (
    <section className="cg-board" aria-label="合併甘特圖" style={panelStyle}>
      <div className="cg-scroll" ref={scrollRef}>
        <div className="cg-content">
        <div className="cg-row cg-head">
          <div className="cg-label cg-label-head">
            <span>Epic／工作項目</span>
            <span>負責人</span>
          </div>
          <div className="cg-cells cg-head-cells">{header}</div>
        </div>
        {epics.map((epic) => {
          const collapsed = collapsedEpicIds.has(epic.id);
          const epicBar = barStyle(epic);
          const late = epic.tasks.filter(overdue).length;
          return (
            <div className="cg-group" key={epic.id}>
              <div className="cg-row cg-epic">
                <div className="cg-label">
                  <button
                    aria-label={collapsed ? `展開 ${epic.title}` : `收合 ${epic.title}`}
                    className="cg-toggle"
                    type="button"
                    onClick={() => onToggleEpic(epic.id)}
                  >
                    {collapsed ? <RightOutlined /> : <DownOutlined />}
                  </button>
                  <Tag className="cg-wbs" color="blue">
                    {epic.wbs}
                  </Tag>
                  <button className="cg-epic-title" title={epic.title} type="button" onClick={() => onEditEpic(epic.id)}>
                    {epic.title}
                    <EditOutlined />
                  </button>
                  {late ? <Tag color="red">逾期 {late}</Tag> : null}
                  <Tooltip title={`完成度 ${epic.progress}%`}>
                    <Progress className="cg-progress" percent={epic.progress} showInfo={false} size="small" />
                  </Tooltip>
                </div>
                <div className="cg-cells gantt-board-row epic-gantt-row">
                  {epicBar ? (
                    <span
                      className={`gantt-board-bar cg-epic-bar ${epic.progress < 100 && epic.finishDate < todayIso ? "gantt-board-bar-overdue" : ""}`}
                      style={epicBar}
                      title={`${epic.title}：${epic.startDate} ~ ${epic.finishDate}`}
                    />
                  ) : null}
                </div>
              </div>
              {!collapsed
                ? epic.tasks.map((task) => {
                    const bar = barStyle(task);
                    const done = isDone(task);
                    return (
                      <div className={`cg-row cg-task ${done ? "cg-task-done" : ""}`} key={task.id}>
                        <div className="cg-label">
                          <span className="cg-task-wbs">{task.wbs}</span>
                          <span className="cg-task-title" title={task.title}>
                            {task.title}
                          </span>
                          <span className={`cg-assignee ${overdue(task) ? "cg-late" : ""}`}>{task.assignee || "未指派"}</span>
                        </div>
                        <div className="cg-cells gantt-board-row">
                          {bar ? (
                            <span
                              className={`gantt-board-bar ${overdue(task) ? "gantt-board-bar-overdue" : ""} ${done ? "cg-bar-done" : ""}`}
                              style={bar}
                              title={`${task.wbs} ${task.title}｜${task.assignee || "未指派"}｜${task.startDate} ~ ${task.finishDate}｜${task.type}`}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}
        {todayIndex >= 0 ? (
          <span
            aria-hidden="true"
            className="gantt-today-line cg-today"
            style={{ left: `calc(var(--cg-label) + var(--gantt-cell) * ${todayIndex} + var(--gantt-cell) / 2)` }}
          />
        ) : null}
        </div>
      </div>
    </section>
  );
}
