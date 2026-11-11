"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, DatePicker, Input, InputNumber, Modal, Popover, Segmented, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import { CalendarOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { AgentOption, Epic, TestBooking, TestMachine } from "@/lib/planner-types";
import {
  BOOKING_ROUNDS,
  BOOKING_STATUSES,
  IPC_OPTIONS,
  MACHINE_KINDS,
  bookingWarnings,
  findConflicts,
  nextRoundBooking,
  pushBookings,
} from "@/lib/test-machines";
import { formatIso } from "@/lib/planner-domain";

type Zoom = "day" | "week" | "month";

const STATUS_COLOR: Record<TestBooking["status"], string> = {
  待佈署: "#94a3b8",
  測試中: "#0d5bff",
  完成: "#16a34a",
  取消: "#cbd5e1",
};

const KIND_LABEL: Record<string, string> = {
  實體機台: "實體機台（最終測試）",
  桌機: "桌機（規則測試）",
  開發用機: "開發用機（備案，借用需確認）",
};

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function blankBooking(machineId: string, todayIso: string): TestBooking {
  return {
    id: newId("booking"),
    machineId,
    epicIds: [],
    round: "R1",
    item: "",
    versionSet: "",
    qa: "",
    startDate: todayIso,
    finishDate: todayIso,
    status: "待佈署",
    taskRef: "",
    note: "",
  };
}

export function TestMachineView({
  machines,
  bookings,
  epics,
  agents,
  days,
  zoom,
  todayIso,
  holidayDates,
  header,
  ganttPanelStyle,
  onChangeBookings,
  onSyncTaskDates,
}: {
  machines: TestMachine[];
  bookings: TestBooking[];
  epics: Epic[];
  agents: AgentOption[];
  days: Date[];
  zoom: Zoom;
  todayIso: string;
  holidayDates: Set<string>;
  header: React.ReactNode;
  ganttPanelStyle: React.CSSProperties;
  onChangeBookings: (next: TestBooking[]) => void;
  onSyncTaskDates: (taskRef: string, startDate: string, finishDate: string) => void;
}) {
  const [mode, setMode] = useState<"gantt" | "list">("gantt");
  const [editing, setEditing] = useState<{ booking: TestBooking; isNew: boolean } | null>(null);
  const [push, setPush] = useState<{ machineId: string; from: string; workdays: number } | null>(null);
  const conflicts = useMemo(() => findConflicts(bookings), [bookings]);
  const epicById = useMemo(() => new Map(epics.map((epic) => [epic.id, epic])), [epics]);
  const machineById = useMemo(() => new Map(machines.map((machine) => [machine.id, machine])), [machines]);
  const rangeStart = days[0] ? formatIso(days[0]) : todayIso;
  const rangeEnd = days.length ? formatIso(days[days.length - 1]) : todayIso;
  const testingNow = bookings.filter((booking) => booking.status === "測試中").length;

  const gameLabel = (booking: TestBooking) =>
    booking.epicIds.map((id) => epicById.get(id)?.title ?? "（已刪除）").join("、") || "未指定遊戲";

  function save(booking: TestBooking) {
    const exists = bookings.some((item) => item.id === booking.id);
    onChangeBookings(exists ? bookings.map((item) => (item.id === booking.id ? booking : item)) : [...bookings, booking]);
    if (booking.taskRef) onSyncTaskDates(booking.taskRef, booking.startDate, booking.finishDate);
  }

  function remove(id: string) {
    onChangeBookings(bookings.filter((item) => item.id !== id));
  }

  function applyPush() {
    if (!push || !push.workdays) return;
    const result = pushBookings(bookings, push.machineId, push.from, push.workdays, holidayDates);
    onChangeBookings(result.bookings);
    result.moved.forEach((item) => item.taskRef && onSyncTaskDates(item.taskRef, item.startDate, item.finishDate));
    setPush(null);
  }

  const pushPreview = push ? pushBookings(bookings, push.machineId, push.from, push.workdays || 0, holidayDates).moved : [];

  function barColumns(booking: TestBooking) {
    const start = Math.max(0, days.findIndex((day) => formatIso(day) >= booking.startDate));
    const lastIndex = days.findIndex((day) => formatIso(day) > booking.finishDate);
    const end = lastIndex < 0 ? days.length : lastIndex;
    return { gridColumn: `${start + 1} / span ${Math.max(1, end - start)}` };
  }

  const visible = (booking: TestBooking) => booking.finishDate >= rangeStart && booking.startDate <= rangeEnd;

  const listColumns: TableProps<TestBooking>["columns"] = [
    {
      title: "日期",
      key: "date",
      width: 170,
      defaultSortOrder: "ascend",
      sorter: (a, b) => a.startDate.localeCompare(b.startDate),
      render: (_, item) => `${item.startDate} → ${item.finishDate.slice(5)}`,
    },
    {
      title: "測試機",
      key: "machine",
      width: 130,
      render: (_, item) => {
        const machine = machineById.get(item.machineId);
        return (
          <span>
            {machine?.name ?? "（已移除）"} {machine?.ipc ? <Tag>{machine.ipc}</Tag> : null}
          </span>
        );
      },
    },
    { title: "遊戲", key: "games", width: 200, render: (_, item) => gameLabel(item) },
    { title: "輪次", dataIndex: "round", key: "round", width: 90 },
    { title: "測試項目", dataIndex: "item", key: "item", width: 150 },
    { title: "版本集", dataIndex: "versionSet", key: "versionSet", width: 110 },
    { title: "QA", dataIndex: "qa", key: "qa", width: 80 },
    {
      title: "狀態",
      key: "status",
      width: 120,
      render: (_, item) => (
        <span>
          <Tag color={STATUS_COLOR[item.status]}>{item.status}</Tag>
          {conflicts.has(item.id) ? <Tag color="red">撞期</Tag> : null}
        </span>
      ),
    },
  ];

  const groups = MACHINE_KINDS.map((kind) => ({ kind, machines: machines.filter((machine) => machine.kind === kind) })).filter(
    (group) => group.machines.length,
  );

  return (
    <>
      {header}
      <section className="tm-toolbar" aria-label="測試機排程工具列">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ booking: blankBooking(machines[0]?.id ?? "", todayIso), isNew: true })}>
          新增預約
        </Button>
        <Segmented
          aria-label="檢視方式"
          options={[
            { label: "時程圖", value: "gantt" },
            { label: "清單", value: "list" },
          ]}
          value={mode}
          onChange={(value) => setMode(value as "gantt" | "list")}
        />
        <span className="tm-summary">
          測試中 {testingNow} 筆
          {conflicts.size ? (
            <Tag color="red" icon={<WarningOutlined />}>
              撞期 {conflicts.size} 筆
            </Tag>
          ) : (
            <Tag color="green">沒有撞期</Tag>
          )}
        </span>
      </section>

      {mode === "list" ? (
        <section className="tm-list">
          <Table<TestBooking>
            columns={listColumns}
            dataSource={bookings}
            rowKey="id"
            size="small"
            pagination={{ defaultPageSize: 30 }}
            scroll={{ x: 1050 }}
            locale={{ emptyText: "還沒有測試預約" }}
            onRow={(item) => ({ onClick: () => setEditing({ booking: item, isNew: false }) })}
          />
        </section>
      ) : (
        <section className="tm-board" aria-label="測試機時程圖">
          <div className="tm-names">
            <div className="tm-names-header" />
            {groups.map((group) => (
              <div key={group.kind}>
                <div className={`tm-group tm-group-${group.kind === "開發用機" ? "dev" : "normal"}`}>{KIND_LABEL[group.kind]}</div>
                {group.machines.map((machine) => (
                  <div className="tm-name" key={machine.id}>
                    <div>
                      <strong>{machine.name}</strong>
                      {machine.ipc ? <Tag>{machine.ipc}</Tag> : null}
                      {machine.status === "維修中" ? <Tag color="orange">維修中</Tag> : null}
                    </div>
                    <span className="tm-name-actions">
                      <Tooltip title="在這台新增預約">
                        <Button
                          aria-label={`在${machine.name}新增預約`}
                          icon={<PlusOutlined />}
                          size="small"
                          type="text"
                          onClick={() => setEditing({ booking: blankBooking(machine.id, todayIso), isNew: true })}
                        />
                      </Tooltip>
                      <Popover
                        open={push?.machineId === machine.id}
                        onOpenChange={(open) => setPush(open ? { machineId: machine.id, from: todayIso, workdays: 1 } : null)}
                        trigger="click"
                        title={`插單：${machine.name} 後面的預約往後推`}
                        content={
                          push?.machineId === machine.id ? (
                            <div className="tm-push">
                              <div className="tm-field">
                                從
                                <DatePicker
                                  aria-label="從哪天起"
                                  allowClear={false}
                                  value={dayjs(push.from)}
                                  onChange={(date) => date && setPush({ ...push, from: date.format("YYYY-MM-DD") })}
                                />
                                起
                              </div>
                              <div className="tm-field">
                                往後推
                                <InputNumber aria-label="往後推幾個工作天" min={1} max={60} value={push.workdays} onChange={(value) => setPush({ ...push, workdays: Number(value) || 1 })} />
                                個工作天
                              </div>
                              <div className="tm-push-preview">
                                {pushPreview.length
                                  ? `會移動：${pushPreview.map((item) => `${gameLabel(item)} ${item.round}`).join("、")}`
                                  : "這天之後沒有要移動的預約"}
                              </div>
                              <Button type="primary" disabled={!pushPreview.length} onClick={applyPush}>
                                確定往後推
                              </Button>
                            </div>
                          ) : null
                        }
                      >
                        <Button size="small" type="text">
                          插單
                        </Button>
                      </Popover>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="tm-gantt" style={ganttPanelStyle}>
            <div className="gantt-scroll">
              <TmHeader days={days} zoom={zoom} />
              {groups.map((group) => (
                <div key={group.kind}>
                  <div className="tm-group-spacer" />
                  {group.machines.map((machine) => (
                    <div className="gantt-board-row tm-row" key={machine.id}>
                      {bookings
                        .filter((booking) => booking.machineId === machine.id && visible(booking))
                        .map((booking) => (
                          <button
                            className={`tm-bar ${conflicts.has(booking.id) ? "tm-bar-conflict" : ""} tm-bar-${booking.status}`}
                            key={booking.id}
                            style={{ ...barColumns(booking), "--tm-color": STATUS_COLOR[booking.status] } as React.CSSProperties}
                            title={`${gameLabel(booking)}｜${booking.round}｜${booking.startDate} ~ ${booking.finishDate}｜${booking.status}${conflicts.has(booking.id) ? "｜撞期" : ""}`}
                            type="button"
                            onClick={() => setEditing({ booking, isNew: false })}
                          >
                            {gameLabel(booking)} {booking.round}
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              ))}
              <TmToday days={days} todayIso={todayIso} />
            </div>
          </div>
        </section>
      )}

      {editing ? (
        <BookingEditor
          agents={agents}
          bookings={bookings}
          epics={epics}
          initial={editing.booking}
          isNew={editing.isNew}
          machines={machines}
          onCancel={() => setEditing(null)}
          onDelete={(id) => {
            remove(id);
            setEditing(null);
          }}
          onNextRound={(booking) => {
            const next = nextRoundBooking(booking, holidayDates, newId("booking"));
            onChangeBookings([...bookings.filter((item) => item.id !== booking.id), booking]);
            if (booking.taskRef) onSyncTaskDates(booking.taskRef, booking.startDate, booking.finishDate);
            setEditing({ booking: next, isNew: true });
          }}
          onSave={(booking) => {
            save(booking);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function TmHeader({ days, zoom }: { days: Date[]; zoom: Zoom }) {
  const label = (day: Date) => `${String(day.getMonth() + 1).padStart(2, "0")}/${String(day.getDate()).padStart(2, "0")}`;
  if (zoom === "month") {
    const months: Array<{ key: string; label: string; start: number; span: number }> = [];
    days.forEach((day, index) => {
      const key = `${day.getFullYear()}-${day.getMonth()}`;
      const last = months.at(-1);
      if (last?.key === key) last.span += 1;
      else months.push({ key, label: `${day.getFullYear()}/${String(day.getMonth() + 1).padStart(2, "0")}`, start: index, span: 1 });
    });
    return (
      <div className="gantt-week-header tm-header">
        {months.map((month) => (
          <span key={month.key} style={{ gridColumn: `${month.start + 1} / span ${month.span}` }}>
            {month.span >= 8 ? month.label : ""}
          </span>
        ))}
      </div>
    );
  }
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return (
    <>
      <div className="gantt-week-header tm-header">
        {weeks.map((week, index) => (
          <span key={week[0].toISOString()} style={{ gridColumn: `${index * 7 + 1} / span ${week.length}` }}>
            {zoom === "day" ? `WK ${index + 1}` : label(week[0])}
            {zoom === "day" ? <small>{label(week[0])}</small> : null}
          </span>
        ))}
      </div>
      {zoom === "day" ? (
        <div className="gantt-date-header">
          {days.map((day) => (
            <span key={day.toISOString()}>{label(day)}</span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function TmToday({ days, todayIso }: { days: Date[]; todayIso: string }) {
  const index = days.findIndex((day) => formatIso(day) === todayIso);
  if (index < 0) return null;
  return <span aria-hidden="true" className="gantt-today-line" style={{ left: `calc(var(--gantt-cell) * ${index} + var(--gantt-cell) / 2)` }} />;
}

function BookingEditor({
  initial,
  isNew,
  machines,
  bookings,
  epics,
  agents,
  onSave,
  onCancel,
  onDelete,
  onNextRound,
}: {
  initial: TestBooking;
  isNew: boolean;
  machines: TestMachine[];
  bookings: TestBooking[];
  epics: Epic[];
  agents: AgentOption[];
  onSave: (booking: TestBooking) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onNextRound: (booking: TestBooking) => void;
}) {
  const [draft, setDraft] = useState<TestBooking>(initial);
  const set = (patch: Partial<TestBooking>) => setDraft((current) => ({ ...current, ...patch }));
  const warnings = bookingWarnings(draft, machines);
  const overlapping = bookings.filter(
    (item) =>
      item.id !== draft.id &&
      item.machineId === draft.machineId &&
      item.status !== "取消" &&
      draft.status !== "取消" &&
      item.startDate <= draft.finishDate &&
      draft.startDate <= item.finishDate,
  );
  const epicById = new Map(epics.map((epic) => [epic.id, epic]));
  const taskOptions = draft.epicIds.flatMap((epicId) => {
    const epic = epicById.get(epicId);
    return (epic?.tasks ?? []).map((task) => ({ label: `${task.wbs} ${task.title}`, value: `${epicId}/${task.id}` }));
  });
  const qaFirst = [...agents].sort((a, b) => Number(b.department === "QA") - Number(a.department === "QA"));

  return (
    <Modal
      open
      title={isNew ? "新增測試預約" : "編輯測試預約"}
      width={640}
      onCancel={onCancel}
      footer={
        <div className="tm-editor-footer">
          <span>
            {!isNew ? (
              <Button danger onClick={() => Modal.confirm({ title: "刪除這筆預約？", okText: "刪除", okButtonProps: { danger: true }, cancelText: "取消", onOk: () => onDelete(draft.id) })}>
                刪除
              </Button>
            ) : null}
            {!isNew ? (
              <Tooltip title="出測有問題要再測：複製成下一輪，接在這輪結束後">
                <Button onClick={() => onNextRound({ ...draft, status: draft.status === "測試中" ? "完成" : draft.status })}>開下一輪</Button>
              </Tooltip>
            ) : null}
          </span>
          <span>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" disabled={!draft.machineId} onClick={() => onSave(draft)}>
              儲存
            </Button>
          </span>
        </div>
      }
    >
      <div className="tm-editor">
        <div className="tm-field">
          <span>測試機</span>
          <Select
            aria-label="測試機"value={draft.machineId || undefined}
            options={MACHINE_KINDS.map((kind) => ({
              label: KIND_LABEL[kind],
              options: machines
                .filter((machine) => machine.kind === kind)
                .map((machine) => ({
                  label: `${machine.name}${machine.ipc ? `（${machine.ipc}）` : ""}${machine.status === "維修中" ? "｜維修中" : ""}`,
                  value: machine.id,
                })),
            })).filter((group) => group.options.length)}
            onChange={(value) => set({ machineId: value })}
          />
        </div>
        <div className="tm-field">
          <span>遊戲（同一版本集可選多款）</span>
          <Select
            aria-label="遊戲（同一版本集可選多款）"mode="multiple"
            optionFilterProp="label"
            placeholder="選擇 Epic"
            value={draft.epicIds}
            options={epics.map((epic) => ({ label: `EPIC ${epic.wbs} ${epic.title}`, value: epic.id }))}
            onChange={(value) => set({ epicIds: value })}
          />
        </div>
        <div className="tm-editor-row">
          <div className="tm-field">
            <span>輪次</span>
            <Select aria-label="輪次" value={draft.round} options={BOOKING_ROUNDS.map((round) => ({ label: round, value: round }))} onChange={(value) => set({ round: value })} />
          </div>
          <div className="tm-field">
            <span>狀態</span>
            <Select
              aria-label="狀態"value={draft.status}
              options={BOOKING_STATUSES.map((status) => ({ label: status, value: status }))}
              onChange={(value) => set({ status: value })}
            />
          </div>
          <div className="tm-field">
            <span>QA</span>
            <Select
              aria-label="QA"allowClear
              showSearch
              value={draft.qa || undefined}
              options={qaFirst.map((agent) => ({ label: `${agent.name}（${agent.department}）`, value: agent.name }))}
              onChange={(value) => set({ qa: value ?? "" })}
            />
          </div>
        </div>
        <div className="tm-field">
          <span>日期</span>
          <DatePicker.RangePicker
            aria-label="日期"allowClear={false}
            suffixIcon={<CalendarOutlined />}
            value={[dayjs(draft.startDate), dayjs(draft.finishDate)]}
            onChange={(dates) => dates?.[0] && dates?.[1] && set({ startDate: dates[0].format("YYYY-MM-DD"), finishDate: dates[1].format("YYYY-MM-DD") })}
          />
        </div>
        <div className="tm-editor-row">
          <div className="tm-field">
            <span>測試項目</span>
            <Input aria-label="測試項目" value={draft.item} placeholder="例如：general test＋pay＋overview" onChange={(event) => set({ item: event.target.value })} />
          </div>
          <div className="tm-field">
            <span>版本集</span>
            <Input aria-label="版本集" value={draft.versionSet} placeholder="例如：VS-2026-11A" onChange={(event) => set({ versionSet: event.target.value })} />
          </div>
        </div>
        <div className="tm-field">
          <span>連結工作項目（儲存時把日期同步過去）</span>
          <Select
            aria-label="連結工作項目（儲存時把日期同步過去）"allowClear
            showSearch
            optionFilterProp="label"
            placeholder={draft.epicIds.length ? "選擇 QA 進測等工作項目" : "先選遊戲"}
            value={draft.taskRef || undefined}
            options={taskOptions}
            onChange={(value) => {
              const [epicId, taskId] = String(value ?? "").split("/");
              const task = epicById.get(epicId)?.tasks.find((item) => item.id === taskId);
              set({ taskRef: value ?? "", ...(isNew && task ? { startDate: task.startDate, finishDate: task.finishDate } : {}) });
            }}
          />
        </div>
        <div className="tm-field">
          <span>備註</span>
          <Input.TextArea autoSize={{ minRows: 2 }} value={draft.note} onChange={(event) => set({ note: event.target.value })} />
        </div>
        {warnings.map((warning) => (
          <Alert key={warning} type="warning" showIcon message={warning} />
        ))}
        {overlapping.length ? (
          <Alert
            type="error"
            showIcon
            message={`和這台機器的其他預約撞期：${overlapping
              .map((item) => `${item.epicIds.map((id) => epicById.get(id)?.title ?? "").join("、") || "未指定"} ${item.round}（${item.startDate.slice(5)}～${item.finishDate.slice(5)}）`)
              .join("；")}`}
          />
        ) : null}
        <Typography.Text type="secondary">撞期仍可儲存，時程圖上會以紅框標示。</Typography.Text>
      </div>
    </Modal>
  );
}

export function TestMachineSettingsCard({
  machines,
  onChange,
}: {
  machines: TestMachine[];
  onChange: (next: TestMachine[]) => void;
}) {
  const update = (id: string, patch: Partial<TestMachine>) => onChange(machines.map((machine) => (machine.id === id ? { ...machine, ...patch } : machine)));
  const columns: TableProps<TestMachine>["columns"] = [
    { title: "名稱", key: "name", width: 140, render: (_, item) => <Input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} /> },
    {
      title: "種類",
      key: "kind",
      width: 120,
      render: (_, item) => (
        <Select value={item.kind} options={MACHINE_KINDS.map((kind) => ({ label: kind, value: kind }))} onChange={(value) => update(item.id, { kind: value })} />
      ),
    },
    {
      title: "IPC",
      key: "ipc",
      width: 120,
      render: (_, item) =>
        item.kind === "實體機台" ? (
          <Select allowClear placeholder="選擇 IPC" style={{ width: "100%" }} value={item.ipc || undefined} options={IPC_OPTIONS.map((ipc) => ({ label: ipc, value: ipc }))} onChange={(value) => update(item.id, { ipc: value ?? "" })} />
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    { title: "樓層", key: "floor", width: 80, render: (_, item) => <Input value={item.floor} onChange={(event) => update(item.id, { floor: event.target.value })} /> },
    { title: "主機", key: "host", width: 110, render: (_, item) => <Input value={item.host} onChange={(event) => update(item.id, { host: event.target.value })} /> },
    { title: "紙鈔機", key: "bill", width: 110, render: (_, item) => <Input value={item.billAcceptor} onChange={(event) => update(item.id, { billAcceptor: event.target.value })} /> },
    {
      title: "狀態",
      key: "status",
      width: 100,
      render: (_, item) => (
        <Select value={item.status} options={["可用", "維修中"].map((status) => ({ label: status, value: status }))} onChange={(value) => update(item.id, { status: value as TestMachine["status"] })} />
      ),
    },
    {
      title: "",
      key: "remove",
      width: 60,
      render: (_, item) => (
        <Button danger type="text" onClick={() => onChange(machines.filter((machine) => machine.id !== item.id))}>
          移除
        </Button>
      ),
    },
  ];
  return (
    <Card
      className="settings-card tm-settings"
      title="測試機"
      extra={
        <Button
          icon={<PlusOutlined />}
          onClick={() =>
            onChange([
              ...machines,
              { id: newId("machine"), name: `新測試機 ${machines.length + 1}`, kind: "桌機", ipc: "", floor: "", host: "", billAcceptor: "", status: "可用" },
            ])
          }
        >
          新增測試機
        </Button>
      }
    >
      <Typography.Text type="secondary">實體機台做最終測試；桌機可先測遊戲規則；開發用機是工程師的，排程很緊時才借用。</Typography.Text>
      <Table<TestMachine> columns={columns} dataSource={machines} pagination={false} rowKey="id" size="small" scroll={{ x: 860 }} />
    </Card>
  );
}
