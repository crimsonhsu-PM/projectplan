"use client";

import { Button, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import type { DepartmentCapacity, PersonWorkload } from "@/lib/workload";

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
  onPick,
}: {
  workloads: PersonWorkload[];
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
      <Table<PersonWorkload>
        className="workload-table"
        columns={columns}
        dataSource={workloads}
        rowKey="name"
        size="small"
        locale={{ emptyText: "沒有符合篩選的人員" }}
        pagination={false}
        scroll={{ x: 560 + 44 * weekStarts.length }}
        expandable={{
          rowExpandable: (person) => person.openTasks.length > 0,
          expandedRowRender: (person) => (
            <ul className="workload-task-list">
              {person.openTasks.map(({ epicId, epicTitle, task, overdue }) => (
                <li key={`${epicId}-${task.id}`} className={overdue ? "workload-task-overdue" : ""}>
                  <span className="workload-task-date">{task.startDate.slice(5)} → {task.finishDate.slice(5)}</span>
                  <span className="workload-task-title">{task.title}</span>
                  <span className="workload-task-epic">{epicTitle}</span>
                  {overdue ? <Tag color="red">逾期</Tag> : <Tag>{task.type || "未設定"}</Tag>}
                </li>
              ))}
            </ul>
          ),
        }}
      />
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
