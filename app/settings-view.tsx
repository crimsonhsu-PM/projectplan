"use client";

import { useMemo, useState } from "react";
import { Button, ColorPicker, DatePicker, Empty, Input, Popconfirm, Segmented, Select, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { AgentOption, AppSettings, Epic, HolidayRange, SettingOption, TestMachine } from "@/lib/planner-types";
import { TestMachineSettingsCard } from "./test-machine-view";

type Section = "people" | "options" | "machines" | "holidays";

export type SettingsActions = {
  renameDepartment: (from: string, to: string) => void;
  addDepartment: (name: string) => void;
  deleteDepartment: (name: string) => void;
  updateAgents: (agents: AgentOption[]) => void;
  renameAgent: (id: string, to: string) => void;
  updateOptions: (key: "types" | "statuses", values: SettingOption[]) => void;
  renameOption: (key: "types" | "statuses", from: string, to: string) => void;
  updateHolidays: (holidays: HolidayRange[]) => void;
  updateMachines: (machines: TestMachine[]) => void;
};

// 失焦或按 Enter 才送出，避免每打一個字就改到所有工作項目
function CommitInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  // 以 key 重設：外部值改了就重新掛載成新的預設值
  return (
    <Input
      aria-label={ariaLabel}
      defaultValue={value}
      key={value}
      placeholder={placeholder}
      onBlur={(event) => {
        const next = event.target.value.trim();
        if (next && next !== value) onCommit(next);
        else event.target.value = value;
      }}
      onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
    />
  );
}

export function SettingsView({ settings, epics, actions }: { settings: AppSettings; epics: Epic[]; actions: SettingsActions }) {
  const [section, setSection] = useState<Section>("people");
  const sections: Array<{ key: Section; label: string; count: number }> = [
    { key: "people", label: "人員與部門", count: settings.agents.length },
    { key: "options", label: "類型與狀態", count: settings.types.length + settings.statuses.length },
    { key: "machines", label: "測試機", count: settings.testMachines.length },
    { key: "holidays", label: "假日", count: settings.holidays.length },
  ];
  return (
    <section className="settings-page settings-v2" aria-label="系統設定">
      <div className="settings-header">
        <div>
          <Typography.Title level={3}>系統設定</Typography.Title>
          <Typography.Text type="secondary">修改會自動儲存；改名會一併更新已使用的工作項目。</Typography.Text>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="設定項目">
          {sections.map((item) => (
            <button
              aria-current={section === item.key ? "page" : undefined}
              className={`settings-nav-item ${section === item.key ? "is-active" : ""}`}
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
            >
              <span>{item.label}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          {section === "people" ? <PeopleSection actions={actions} epics={epics} settings={settings} /> : null}
          {section === "options" ? <OptionsSection actions={actions} epics={epics} settings={settings} /> : null}
          {section === "machines" ? <TestMachineSettingsCard machines={settings.testMachines} onChange={actions.updateMachines} /> : null}
          {section === "holidays" ? <HolidaySection actions={actions} holidays={settings.holidays} /> : null}
        </div>
      </div>
    </section>
  );
}

function PeopleSection({ settings, epics, actions }: { settings: AppSettings; epics: Epic[]; actions: SettingsActions }) {
  const [activeDepartment, setActiveDepartment] = useState<string>(settings.departments[0] ?? "");
  const [keyword, setKeyword] = useState("");
  const [newDepartment, setNewDepartment] = useState("");

  const peopleCount = useMemo(() => {
    const counts = new Map<string, number>();
    settings.agents.forEach((agent) => counts.set(agent.department, (counts.get(agent.department) ?? 0) + 1));
    return counts;
  }, [settings.agents]);
  const taskUsage = useMemo(() => {
    const counts = new Map<string, number>();
    epics.forEach((epic) => epic.tasks.forEach((task) => counts.set(task.department, (counts.get(task.department) ?? 0) + 1)));
    return counts;
  }, [epics]);
  const assigned = useMemo(() => {
    const counts = new Map<string, number>();
    epics.forEach((epic) => epic.tasks.forEach((task) => counts.set(task.assignee, (counts.get(task.assignee) ?? 0) + 1)));
    return counts;
  }, [epics]);

  const searching = keyword.trim().length > 0;
  const people = settings.agents.filter((agent) =>
    searching ? agent.name.toLowerCase().includes(keyword.trim().toLowerCase()) : agent.department === activeDepartment,
  );
  const departmentOptions = settings.departments.map((department) => ({ label: department, value: department }));

  function addPerson() {
    actions.updateAgents([...settings.agents, { id: `agent-${Date.now()}`, department: activeDepartment, name: `新成員 ${settings.agents.length + 1}` }]);
  }

  return (
    <div className="settings-two-col">
      <div className="settings-box">
        <div className="settings-box-head">
          <strong>部門</strong>
          <span className="settings-muted">{settings.departments.length} 個</span>
        </div>
        <div className="department-list">
          {settings.departments.map((department) => {
            const used = (peopleCount.get(department) ?? 0) + (taskUsage.get(department) ?? 0);
            return (
              <div
                className={`department-item ${!searching && department === activeDepartment ? "is-active" : ""}`}
                key={department}
              >
                <button className="department-pick" type="button" onClick={() => { setKeyword(""); setActiveDepartment(department); }}>
                  {department}
                </button>
                <span className="settings-muted">{peopleCount.get(department) ?? 0} 人</span>
                {used ? (
                  <Tooltip title={`還有 ${peopleCount.get(department) ?? 0} 人、${taskUsage.get(department) ?? 0} 筆工作使用中，不能刪除`}>
                    <Button aria-label={`無法刪除 ${department}`} disabled icon={<DeleteOutlined />} size="small" type="text" />
                  </Tooltip>
                ) : (
                  <Popconfirm title={`刪除「${department}」？`} okText="刪除" cancelText="取消" onConfirm={() => actions.deleteDepartment(department)}>
                    <Button aria-label={`刪除 ${department}`} danger icon={<DeleteOutlined />} size="small" type="text" />
                  </Popconfirm>
                )}
              </div>
            );
          })}
        </div>
        <div className="settings-add-row">
          <Input
            aria-label="新部門名稱"
            placeholder="新部門名稱"
            value={newDepartment}
            onChange={(event) => setNewDepartment(event.target.value)}
            onPressEnter={() => {
              if (newDepartment.trim()) {
                actions.addDepartment(newDepartment.trim());
                setActiveDepartment(newDepartment.trim());
                setNewDepartment("");
              }
            }}
          />
          <Button
            disabled={!newDepartment.trim() || settings.departments.includes(newDepartment.trim())}
            icon={<PlusOutlined />}
            onClick={() => {
              actions.addDepartment(newDepartment.trim());
              setActiveDepartment(newDepartment.trim());
              setNewDepartment("");
            }}
          >
            新增
          </Button>
        </div>
      </div>

      <div className="settings-box">
        <div className="settings-box-head">
          {searching ? (
            <strong>搜尋結果</strong>
          ) : (
            <span className="department-title">
              <CommitInput
                ariaLabel="部門名稱"
                value={activeDepartment}
                onCommit={(next) => {
                  actions.renameDepartment(activeDepartment, next);
                  setActiveDepartment(next);
                }}
              />
            </span>
          )}
          <Input
            allowClear
            aria-label="搜尋人員"
            className="settings-search"
            placeholder="搜尋人員"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          {!searching ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={addPerson}>
              新增人員
            </Button>
          ) : null}
        </div>
        {people.length ? (
          <div className="people-table" role="table" aria-label="人員">
            <div className="people-row people-row-head" role="row">
              <span role="columnheader">姓名</span>
              <span role="columnheader">部門</span>
              <span role="columnheader">負責工作</span>
              <span />
            </div>
            {people.map((agent) => {
              const count = assigned.get(agent.name) ?? 0;
              return (
                <div className="people-row" key={agent.id} role="row">
                  <CommitInput ariaLabel={`${agent.name} 姓名`} value={agent.name} onCommit={(next) => actions.renameAgent(agent.id, next)} />
                  <Select
                    aria-label={`${agent.name} 部門`}
                    options={departmentOptions}
                    value={agent.department || undefined}
                    onChange={(department) =>
                      actions.updateAgents(settings.agents.map((item) => (item.id === agent.id ? { ...item, department } : item)))
                    }
                  />
                  <span className="settings-muted">{count ? `${count} 筆` : "—"}</span>
                  <Popconfirm
                    title={`移除「${agent.name}」？`}
                    description={count ? `他負責的 ${count} 筆工作會保留原本的名字。` : undefined}
                    okText="移除"
                    cancelText="取消"
                    onConfirm={() => actions.updateAgents(settings.agents.filter((item) => item.id !== agent.id))}
                  >
                    <Button aria-label={`移除 ${agent.name}`} danger icon={<DeleteOutlined />} size="small" type="text" />
                  </Popconfirm>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty description={searching ? "找不到符合的人員" : "這個部門還沒有人員"} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
}

function OptionsSection({ settings, epics, actions }: { settings: AppSettings; epics: Epic[]; actions: SettingsActions }) {
  const usage = useMemo(() => {
    const types = new Map<string, number>();
    const statuses = new Map<string, number>();
    epics.forEach((epic) => {
      types.set(epic.type, (types.get(epic.type) ?? 0) + 1);
      epic.tasks.forEach((task) => statuses.set(task.type, (statuses.get(task.type) ?? 0) + 1));
    });
    return { types, statuses };
  }, [epics]);

  const block = (key: "types" | "statuses", title: string, hint: string, unit: string) => {
    const values = settings[key];
    const counts = usage[key];
    return (
      <div className="settings-box">
        <div className="settings-box-head">
          <div>
            <strong>{title}</strong>
            <div className="settings-muted">{hint}</div>
          </div>
          <Button
            icon={<PlusOutlined />}
            onClick={() => actions.updateOptions(key, [...values, { id: `option-${Date.now()}`, label: `新${title.slice(0, 2)} ${values.length + 1}`, color: "#0d5bff" }])}
          >
            新增
          </Button>
        </div>
        <div className="option-list">
          {values.map((option) => {
            const count = counts.get(option.label) ?? 0;
            return (
              <div className="option-row" key={option.id}>
                <ColorPicker
                  aria-label={`${option.label} 顏色`}
                  size="small"
                  value={option.color}
                  onChange={(_, hex) => actions.updateOptions(key, values.map((item) => (item.id === option.id ? { ...item, color: hex } : item)))}
                />
                <CommitInput ariaLabel={`${option.label} 名稱`} value={option.label} onCommit={(next) => actions.renameOption(key, option.label, next)} />
                <span className="settings-muted">{count ? `${count} ${unit}` : "未使用"}</span>
                {count ? (
                  <Tooltip title={`還有 ${count} ${unit}使用中，不能刪除`}>
                    <Button aria-label={`無法刪除 ${option.label}`} disabled icon={<DeleteOutlined />} size="small" type="text" />
                  </Tooltip>
                ) : (
                  <Popconfirm title={`刪除「${option.label}」？`} okText="刪除" cancelText="取消" onConfirm={() => actions.updateOptions(key, values.filter((item) => item.id !== option.id))}>
                    <Button aria-label={`刪除 ${option.label}`} danger icon={<DeleteOutlined />} size="small" type="text" />
                  </Popconfirm>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="settings-two-col settings-two-col-even">
      {block("types", "Epic 類型", "例如全新開發、優化、移植開發", "個 Epic")}
      {block("statuses", "工作狀態", "工作項目的進度；「完成」會算進完成度", "筆工作")}
    </div>
  );
}

function HolidaySection({ holidays, actions }: { holidays: HolidayRange[]; actions: SettingsActions }) {
  const years = useMemo(() => {
    const set = new Set(holidays.map((holiday) => holiday.startDate.slice(0, 4)).filter(Boolean));
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort();
  }, [holidays]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const list = holidays
    .filter((holiday) => (holiday.startDate ? holiday.startDate.startsWith(year) : true))
    .sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
  const update = (id: string, patch: Partial<HolidayRange>) => actions.updateHolidays(holidays.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <div className="settings-box">
      <div className="settings-box-head">
        <div>
          <strong>假日</strong>
          <div className="settings-muted">計算工作天時會扣掉這些日期（週末本來就不算）</div>
        </div>
        <Segmented aria-label="年份" options={years} value={year} onChange={(value) => setYear(String(value))} />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            const date = `${year}-01-01`;
            actions.updateHolidays([...holidays, { id: `holiday-${Date.now()}`, startDate: date, endDate: date, note: "" }]);
          }}
        >
          新增假日
        </Button>
      </div>
      {list.length ? (
        <div className="holiday-table">
          {list.map((holiday) => {
            const days = holiday.startDate && holiday.endDate ? dayjs(holiday.endDate).diff(dayjs(holiday.startDate), "day") + 1 : 0;
            return (
              <div className="holiday-line" key={holiday.id}>
                <DatePicker.RangePicker
                  allowClear={false}
                  inputReadOnly
                  value={holiday.startDate && holiday.endDate ? [dayjs(holiday.startDate), dayjs(holiday.endDate)] : null}
                  onChange={(dates) => dates?.[0] && dates?.[1] && update(holiday.id, { startDate: dates[0].format("YYYY-MM-DD"), endDate: dates[1].format("YYYY-MM-DD") })}
                />
                <Tag>{days ? `${days} 天` : "未設定"}</Tag>
                <Input aria-label="假日說明" placeholder="說明，例如：端午節" value={holiday.note} onChange={(event) => update(holiday.id, { note: event.target.value })} />
                <Popconfirm title="刪除這個假日？" okText="刪除" cancelText="取消" onConfirm={() => actions.updateHolidays(holidays.filter((item) => item.id !== holiday.id))}>
                  <Button aria-label={`刪除 ${holiday.note || holiday.startDate}`} danger icon={<DeleteOutlined />} size="small" type="text" />
                </Popconfirm>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty description={`${year} 年還沒有假日`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  );
}
