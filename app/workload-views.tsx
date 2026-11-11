"use client";

import { useMemo, useState } from "react";
import { Button, Table, Tag, Tooltip, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { TableProps } from "antd";
import type { DepartmentCapacity, OpenTask, PersonWorkload } from "@/lib/workload";
import type { Task } from "@/lib/planner-types";

function shortDate(iso: string) {
  return iso.slice(5).replace("-", "/");
}

function loadLevel(count: number) {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count === 2) return "2";
  return "3";
}

// 人員總表：誰手上多少、哪天開始有空
export function WorkloadOverview({
  workloads,
  weekStarts,
  todayIso,
  departments,
  onPick,
}: {
  workloads: PersonWorkload[];
  departments: string[];
  weekStarts: string[];
  todayIso: string;
  onPick: (name: string) => void;
}) {
  const columns: TableProps<PersonWorkload>["columns"] = [
    {
      title: "負責人",
      key: "name",
      width: 150,
      fixed: "left",
      render: (_, person) => (
        <div className="workload-person">
          <Button className="workload-name" size="small" type="link" onClick={() => onPick(person.name)}>
            {person.name}
          </Button>
          {person.department ? <Tag>{person.department}</Tag> : null}
        </div>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "手上未完成",
      dataIndex: "openCount",
      key: "openCount",
      align: "right",
      width: 96,
      render: (value: number) => `${value} 件`,
      sorter: (a, b) => a.openCount - b.openCount,
    },
    {
      title: "逾期",
      dataIndex: "overdueCount",
      key: "overdueCount",
      align: "right",
      width: 72,
      render: (value: number) => (value ? <strong className="workload-overdue">{value} 件</strong> : <span className="workload-muted">—</span>),
      sorter: (a, b) => a.overdueCount - b.overdueCount,
    },
    {
      title: (
        <Tooltip title="每格一週，數字＝那一週同時進行的未完成工作數">
          <span>未來 {weekStarts.length} 週負載</span>
        </Tooltip>
      ),
      key: "weeklyLoad",
      width: 44 * weekStarts.length + 16,
      render: (_, person) => (
        <div className="workload-heat" style={{ gridTemplateColumns: `repeat(${weekStarts.length}, 40px)` }}>
          {person.weeklyLoad.map((count, index) => (
            <Tooltip key={weekStarts[index]} title={`${shortDate(weekStarts[index])} 那週：${count} 件同時進行`}>
              <span className={`workload-cell workload-level-${loadLevel(count)}`}>{count || ""}</span>
            </Tooltip>
          ))}
        </div>
      ),
    },
    {
      title: "最早可接新工作",
      dataIndex: "availableFrom",
      key: "availableFrom",
      width: 130,
      defaultSortOrder: "ascend",
      sorter: (a, b) => a.availableFrom.localeCompare(b.availableFrom),
      render: (value: string, person) => (
        <div className="workload-available">
          <span className={value <= todayIso ? "workload-free" : ""}>{value <= todayIso ? "現在就有空" : value}</span>
          {person.overdueCount ? <small className="workload-overdue">先處理逾期</small> : null}
        </div>
      ),
    },
  ];

  // 依部門分組，可展開／收起；部門順序照系統設定
  const groups = useMemo(() => {
    const map = new Map<string, PersonWorkload[]>();
    workloads.forEach((person) => {
      const key = person.department || "未設定部門";
      map.set(key, [...(map.get(key) ?? []), person]);
    });
    const order = (name: string) => {
      const index = departments.indexOf(name);
      return index < 0 ? departments.length : index;
    };
    return Array.from(map.entries())
      .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
      .map(([department, people]) => ({
        department,
        people,
        open: people.reduce((total, person) => total + person.openCount, 0),
        overdue: people.reduce((total, person) => total + person.overdueCount, 0),
        freeNow: people.filter((person) => person.availableFrom <= todayIso).length,
        earliest: people.map((person) => person.availableFrom).sort()[0] ?? "",
      }));
  }, [departments, todayIso, workloads]);
  // 記錄收起的部門，預設全部展開
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());

  return (
    <section className="workload-overview" aria-label="人員總表">
      <div className="workload-heading">
        <Typography.Title level={4}>人員總表</Typography.Title>
        <div className="workload-legend" aria-hidden="true">
          <span>週負載</span>
          <span className="workload-cell workload-level-1">1</span>
          <span className="workload-cell workload-level-2">2</span>
          <span className="workload-cell workload-level-3">3+</span>
          <span className="workload-week-labels">
            {weekStarts.length ? `${shortDate(weekStarts[0])} 起每週一格` : ""}
          </span>
        </div>
      </div>
      <div className="workload-group-actions">
        <Button size="small" onClick={() => setClosedGroups(new Set())}>
          全部展開
        </Button>
        <Button size="small" onClick={() => setClosedGroups(new Set(groups.map((group) => group.department)))}>
          全部收起
        </Button>
      </div>
      {groups.length ? (
        groups.map((group) => {
          const isOpen = !closedGroups.has(group.department);
          return (
            <section className="workload-department" key={group.department}>
              <button
                aria-expanded={isOpen}
                className="workload-department-head"
                type="button"
                onClick={() =>
                  setClosedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group.department)) next.delete(group.department);
                    else next.add(group.department);
                    return next;
                  })
                }
              >
                {isOpen ? <DownOutlined /> : <RightOutlined />}
                <strong>{group.department}</strong>
                <span className="workload-muted">{group.people.length} 人</span>
                <span>手上未完成 {group.open} 件</span>
                {group.overdue ? <span className="workload-overdue">逾期 {group.overdue} 件</span> : null}
                <span className="workload-department-free">
                  {group.freeNow ? `現在有空 ${group.freeNow} 人` : `最快 ${group.earliest} 有空`}
                </span>
              </button>
              {isOpen ? (
                <Table<PersonWorkload>
                  className="workload-table"
                  columns={columns}
                  dataSource={group.people}
                  rowKey="name"
                  size="small"
                  pagination={false}
                  scroll={{ x: 560 + 44 * weekStarts.length }}
                  expandable={{
                    rowExpandable: (person) => person.openTasks.length > 0,
                    expandedRowRender: (person) => <PersonTasks person={person} />,
                  }}
                />
              ) : null}
            </section>
          );
        })
      ) : (
        <Typography.Text type="secondary">沒有符合篩選的人員</Typography.Text>
      )}
    </section>
  );
}

// 部門容量：未來 4 週已排人天 ÷ 可用人天
export function DepartmentCapacityStrip({ capacities, weeks }: { capacities: DepartmentCapacity[]; weeks: number }) {
  if (!capacities.length) return null;
  return (
    <section className="capacity-strip" aria-label={`各部門未來 ${weeks} 週人力`}>
      <div className="capacity-title">各部門未來 {weeks} 週：已排人天 ÷ 可用人天</div>
      <div className="capacity-items">
        {capacities.map((item) => {
          const ratio = item.availableDays ? item.scheduledDays / item.availableDays : 0;
          const level = ratio >= 0.9 ? "high" : ratio >= 0.6 ? "mid" : "low";
          return (
            <Tooltip
              key={item.department}
              title={`${item.department}：${item.people} 人，已排 ${item.scheduledDays} 人天／可用 ${item.availableDays} 人天`}
            >
              <div className={`capacity-item capacity-${level}`}>
                <span className="capacity-name">{item.department}</span>
                <span className="capacity-bar">
                  <span style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                </span>
                <span className="capacity-value">{Math.round(ratio * 100)}%</span>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}

function neighbor(label: string, task: Task | undefined) {
  if (!task) return null;
  const done = task.progress >= 100 || task.type.trim() === "完成";
  return (
    <div className="workload-neighbor">
      <span className="workload-neighbor-label">{label}</span>
      <span className="workload-neighbor-wbs">{task.wbs}</span>
      <span>{task.title}</span>
      <span className="workload-muted">
        {task.assignee || "未指派"}｜{task.startDate.slice(5)} → {task.finishDate.slice(5)}｜{done ? "完成" : task.type || "未設定"}
      </span>
    </div>
  );
}

// 展開：依 Epic 分組，每筆工作附上同一個 Epic 裡的前一項、下一項，看得出前後關係
function PersonTasks({ person }: { person: PersonWorkload }) {
  const groups = new Map<string, OpenTask[]>();
  person.openTasks.forEach((item) => groups.set(item.epicId, [...(groups.get(item.epicId) ?? []), item]));
  return (
    <div className="workload-groups">
      {Array.from(groups.values()).map((items) => (
        <section className="workload-group" key={items[0].epicId}>
          <header>
            <Tag color="blue">EPIC {items[0].epicWbs}</Tag>
            <strong>{items[0].epicTitle}</strong>
          </header>
          {items
            .slice()
            .sort((a, b) => a.task.wbs.localeCompare(b.task.wbs, undefined, { numeric: true }))
            .map(({ task, overdue, prev, next }) => (
              <div className={`workload-task ${overdue ? "workload-task-overdue" : ""}`} key={task.id}>
                {neighbor("前一項", prev)}
                <div className="workload-task-main">
                  <span className="workload-neighbor-label">本項</span>
                  <span className="workload-neighbor-wbs">{task.wbs}</span>
                  <strong>{task.title}</strong>
                  <span className="workload-task-date">
                    {task.startDate.slice(5)} → {task.finishDate.slice(5)}
                  </span>
                  {overdue ? <Tag color="red">逾期</Tag> : <Tag>{task.type || "未設定"}</Tag>}
                </div>
                {neighbor("下一項", next)}
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
