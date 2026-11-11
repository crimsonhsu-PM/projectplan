export const epicCategoryOptions = ["機台", "線上"] as const;

export type EpicCategory = (typeof epicCategoryOptions)[number];

export type Task = {
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

export type Epic = Task & {
  priority: string;
  category: EpicCategory;
  starred?: boolean;
  sheetId?: string;
  tasks: Task[];
};

export type ProjectMeta = {
  projectType: string;
  projectName: string;
  startDate: string;
  wk: string;
};

export type HolidayRange = {
  id: string;
  startDate: string;
  endDate: string;
  note: string;
};

export type SettingOption = {
  id: string;
  label: string;
  color: string;
};

export type AgentOption = {
  id: string;
  name: string;
  department: string;
};

export type SheetOption = {
  id: string;
  name: string;
  startDate?: string; // 甘特圖從哪天開始顯示
};

export type TestMachineKind = "實體機台" | "桌機" | "開發用機";

export type TestMachine = {
  id: string;
  name: string;
  kind: TestMachineKind;
  ipc: string; // 實體機台的 IPC：艾訊、Quixant
  floor: string;
  host: string;
  billAcceptor: string;
  status: "可用" | "維修中";
};

export type TestBooking = {
  id: string;
  machineId: string;
  epicIds: string[]; // 這次部署的遊戲（同一版本集可多款）
  round: string; // 規則測試、R1–R4、Prod、合併測試、升級測試、開發
  item: string; // 測試項目
  versionSet: string;
  qa: string;
  startDate: string;
  finishDate: string;
  status: "待佈署" | "測試中" | "完成" | "取消";
  taskRef: string; // 連結的工作項目：epicId/taskId
  note: string;
};

export type AppSettings = {
  sheets: SheetOption[];
  testMachines: TestMachine[];
  testBookings: TestBooking[];
  departments: string[];
  agents: AgentOption[];
  holidays: HolidayRange[];
  types: SettingOption[];
  statuses: SettingOption[];
};

export type ImportedRow = {
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

export type ImportPreview = {
  epics: Epic[];
  errors: string[];
};

export type StoredProjectData = {
  project?: ProjectMeta;
  epics?: Epic[];
  settings?: Partial<AppSettings>;
};

export type ManpowerTaskSummary = {
  key: string;
  wbs: string;
  title: string;
  status: string;
  completed: boolean;
  startDate: string;
  finishDate: string;
  workdays: number;
};

export type ManpowerAgentSummary = {
  key: string;
  name: string;
  completedTaskCount: number;
  taskCount: number;
  workdays: number;
  tasks: ManpowerTaskSummary[];
};

export type ManpowerDepartmentSummary = {
  key: string;
  name: string;
  taskCount: number;
  workdays: number;
  agents: ManpowerAgentSummary[];
};

export type ProjectManpowerSummary = {
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

export type PersonnelProjectSummary = {
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

export type PersonnelScheduleSummary = {
  key: string;
  name: string;
  departments: string[];
  projectCount: number;
  taskCount: number;
  projects: PersonnelProjectSummary[];
};
