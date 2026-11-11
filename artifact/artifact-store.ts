/// <reference types="vite/client" />
// Storage adapter for the Claude-artifact build.
//
// app/page.tsx talks to `/api/project-data` (GET → { data }, PUT → { ok, updatedAt }).
// On Cloudflare that is a Worker + D1. Inside a Claude artifact there is no server,
// so this module intercepts those fetch calls and answers them from the artifact's
// `db` capability instead. Layout in the db:
//   plan/meta        { project, settings, epicIds: string[], updatedAt }
//   epics/<docId>    { epic, order }        (one document per Epic; keeps each doc < 256 KiB)
// A one-time migration seeds the db from ./seed.json when plan/meta does not exist yet.

import { autoAssign } from "../lib/auto-assign";
// 含真實名稱的資料修正檔不進 git（artifact/private/，建置時有就打包進去）。
const privatePatches = import.meta.glob<{ default: Record<string, { title?: string; rm?: string }> }>("./private/*.json", { eager: true });
import type { Epic, StoredProjectData, TestBooking } from "../lib/planner-types";

type Snap = { exists: boolean; id: string; data(): Record<string, unknown> | undefined };
type DocRef = {
  get(): Promise<Snap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
};
type DB = {
  doc(path: string): DocRef;
  collection(path: string): { limit(n: number): { get(): Promise<{ docs: Snap[] }> } };
};
type ClaudeGlobal = { use(name: string): Promise<unknown> };

const API_PATH = "/api/project-data";
const META_PATH = "plan/meta";
const lastSaved = new Map<string, string>(); // db path -> JSON written/read last
let dbPromise: Promise<DB | null> | null = null;
let saveChain: Promise<unknown> = Promise.resolve();
let pending: StoredProjectData | null = null;
let appliedMigrations: string[] = [];
// One-off data migrations shipped as files next to index.html: { [itemId]: { title?, rm? } }.
// Applied once per database, by id, so edits made in the tool are kept.
type Patch = Record<string, { title?: string; rm?: string }>;

// Code migrations run in order after the file ones; each returns a backup to keep in backups/<name>.
const MIGRATIONS = ["games-v2", "auto-assign-v1", "sheets-v1", "sheet-dates-v1", "sheets-home-v2", "game-first-v1", "test-bookings-demo-v1", "overdue-cleanup-v1", "demo-epics-v1"];
const CODE_MIGRATIONS: Record<string, (data: StoredProjectData) => Record<string, unknown>> = {
  // 把去識別化的遊戲名稱改回真實名稱（原本放在 migrations/games-v2.json，改為內建避免讀檔失敗）。
  "games-v2": (data) => {
    const patch = privatePatches["./private/games-v2.json"]?.default;
    if (!patch) throw new Error("games-v2 patch not bundled");
    let count = 0;
    for (const epic of data.epics ?? []) {
      for (const item of [epic, ...epic.tasks]) {
        const change = patch[item.id];
        if (change) {
          Object.assign(item, change);
          count += 1;
        }
      }
    }
    return { count };
  },
  "auto-assign-v1": (data) => {
    const result = autoAssign(data.epics ?? [], data.settings?.agents ?? []);
    data.epics = result.epics;
    return { count: result.count, originalAssignee: result.changes };
  },
  // 依備註開頭「2026 上半／下半／上半→下半延續」建立兩個分頁並分好 Epic（延續的先放下半，sheets-home-v2 再歸回上半）。
  "sheets-v1": (data) => {
    const settings = (data.settings ??= {});
    if (settings.sheets?.length) return { skipped: true };
    const first = { id: "sheet-2026-h1", name: "2026 上半年開發項目" };
    const second = { id: "sheet-2026-h2", name: "2026 下半年開發項目" };
    settings.sheets = [first, second];
    const placed: Record<string, string> = {};
    for (const epic of data.epics ?? []) {
      const rm = epic.rm ?? "";
      const sheetId = /^2026\s*上半(?!→)/.test(rm) ? first.id : /^2026\s*(下半|上半→下半)/.test(rm) ? second.id : undefined;
      if (sheetId) {
        epic.sheetId = sheetId;
        placed[epic.id] = sheetId;
      }
    }
    return { placed };
  },
  // 每個分頁有自己的甘特圖起始日：上半年用專案起始日；其他分頁用該頁（不含延續項目）最早的 Epic 開始日。
  "sheet-dates-v1": (data) => {
    const sheets = data.settings?.sheets ?? [];
    const projectStart = data.project?.startDate ?? "2026-01-02";
    const set: Record<string, string> = {};
    for (const sheet of sheets) {
      if (sheet.startDate) continue;
      const starts = (data.epics ?? [])
        .filter((epic) => epic.sheetId === sheet.id && !/延續/.test(epic.rm ?? ""))
        .map((epic) => epic.startDate)
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .sort();
      sheet.startDate = sheet.id === "sheet-2026-h1" ? projectStart : starts[0] ?? projectStart;
      set[sheet.id] = sheet.startDate;
    }
    return { set };
  },
  // 「上半→下半延續」的 Epic 歸回上半年；下半年改由 Task 日期自動顯示為延續。
  "sheets-home-v2": (data) => {
    const moved: string[] = [];
    for (const epic of data.epics ?? []) {
      if (epic.sheetId === "sheet-2026-h2" && /^2026\s*上半→下半/.test(epic.rm ?? "")) {
        epic.sheetId = "sheet-2026-h1";
        moved.push(epic.id);
      }
    }
    return { moved };
  },
  // 遊戲開發相關的 Epic 排到最上面（其餘維持原順序）；清單寫入 backups 供檢查。
  "game-first-v1": (data) => {
    const epics = data.epics ?? [];
    const isGame = (epic: Epic) =>
      /新遊戲|遊戲開發|game/i.test(epic.title) || ["全新開發", "移植開發"].includes(epic.type);
    const list = (items: Epic[]) => items.map((epic) => ({ id: epic.id, title: epic.title, type: epic.type, category: epic.category }));
    const games = epics.filter(isGame);
    const others = epics.filter((epic) => !isGame(epic));
    const originalOrder = epics.map((epic) => epic.id);
    data.epics = [...games, ...others];
    return { games: list(games), others: list(others), originalOrder };
  },
  // 測試機排程的示範資料（備註標「示範資料」，可直接刪除）；只在還沒有任何預約時加入。
  "test-bookings-demo-v1": (data) => {
    const settings = (data.settings ??= {});
    if (settings.testBookings?.length) return { skipped: true };
    const ipc: Record<string, string> = { "machine-real-1": "艾訊", "machine-real-2": "Quixant", "machine-real-3": "艾訊" };
    const machines = (settings.testMachines ?? []).map((machine) => (ipc[machine.id] && !machine.ipc ? { ...machine, ipc: ipc[machine.id] } : machine));
    if (!machines.some((machine) => machine.kind === "開發用機")) {
      machines.push({ id: "machine-dev-1", name: "開發機 A", kind: "開發用機", ipc: "", floor: "", host: "", billAcceptor: "", status: "可用" });
    }
    settings.testMachines = machines;
    const has = new Set((data.epics ?? []).map((epic) => epic.id));
    const b = (id: string, machineId: string, epicIds: string[], round: string, startDate: string, finishDate: string, status: TestBooking["status"], extra: Partial<TestBooking> = {}): TestBooking => ({
      id: `demo-${id}`,
      machineId,
      epicIds: epicIds.filter((epicId) => has.has(epicId)),
      round,
      item: round === "規則測試" ? "遊戲規則、賠率表" : "general test＋pay＋overview",
      versionSet: "",
      qa: "Lanx",
      startDate,
      finishDate,
      status,
      taskRef: "",
      note: "示範資料",
      ...extra,
    });
    settings.testBookings = [
      b("1", "machine-pc-1", ["e59"], "規則測試", "2026-10-26", "2026-10-30", "完成"),
      b("2", "machine-real-1", ["e59"], "R1", "2026-11-02", "2026-11-06", "完成"),
      b("3", "machine-real-1", ["e59"], "R2", "2026-11-09", "2026-11-13", "測試中"),
      b("4", "machine-real-1", ["e57"], "R1", "2026-11-12", "2026-11-17", "待佈署", { note: "示範資料｜和教父 R2 撞期" }),
      b("5", "machine-real-2", ["e56", "e60"], "R1", "2026-11-10", "2026-11-14", "測試中", { versionSet: "VS-2026-11A" }),
      b("6", "machine-real-2", ["e56", "e60"], "R2", "2026-11-17", "2026-11-20", "待佈署", { versionSet: "VS-2026-11A" }),
      b("7", "machine-real-3", ["e59"], "Prod", "2026-11-18", "2026-11-20", "待佈署", { versionSet: "VS-2026-11-PROD" }),
      b("8", "machine-real-3", ["e59"], "升級測試", "2026-11-23", "2026-11-24", "待佈署", { item: "開機下載更新、空機部署" }),
      b("9", "machine-pc-2", ["e61"], "規則測試", "2026-11-09", "2026-11-13", "測試中"),
      b("10", "machine-pc-3", ["e55"], "規則測試", "2026-11-16", "2026-11-20", "待佈署"),
      b("11", "machine-pc-4", ["e62"], "合併測試", "2026-12-01", "2026-12-03", "待佈署", { note: "示範資料｜故意排在桌機，看提醒" }),
      b("12", "machine-dev-1", ["e57"], "R1", "2026-11-18", "2026-11-19", "待佈署", { note: "示範資料｜實體機台排滿，向工程師借用" }),
    ];
    return { count: settings.testBookings.length };
  },
  // 逾期（結束日已過、未完成）的工作改為完成，只留結束日最近、分屬不同 Epic 的 2 筆當範例；原值備份。
  "overdue-cleanup-v1": (data) => {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const isDone = (task: Epic["tasks"][number]) => task.progress >= 100 || task.type.trim() === "完成" || task.type.trim().toLowerCase() === "done";
    const overdue = (data.epics ?? []).flatMap((epic) =>
      epic.tasks.filter((task) => !isDone(task) && task.finishDate && task.finishDate < todayIso).map((task) => ({ epic, task })),
    );
    const keep = new Set<string>();
    const keptEpics = new Set<string>();
    for (const item of [...overdue].sort((a, b) => b.task.finishDate.localeCompare(a.task.finishDate))) {
      if (keep.size >= 2) break;
      if (keptEpics.has(item.epic.id)) continue;
      keep.add(item.task.id);
      keptEpics.add(item.epic.id);
    }
    const original: Record<string, { type: string; progress: number }> = {};
    for (const { task } of overdue) {
      if (keep.has(task.id)) continue;
      original[task.id] = { type: task.type, progress: task.progress };
      task.type = "完成";
      task.progress = 100;
    }
    return { kept: [...keep], changed: Object.keys(original).length, original };
  },
  // 示範資料：4 個正在進行／即將開始的 Epic，日期以今天為基準，讓專案人力、人員時程有數據可看（備註標「示範資料」）。
  "demo-epics-v1": (data) => {
    const epics = (data.epics ??= []);
    if (epics.some((epic) => epic.id.startsWith("demo-"))) return { skipped: true };
    const pad = (value: number) => String(value).padStart(2, "0");
    const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const holidays = new Set<string>();
    for (const holiday of data.settings?.holidays ?? []) {
      for (let day = new Date(`${holiday.startDate}T00:00:00`); iso(day) <= holiday.endDate; day.setDate(day.getDate() + 1)) holidays.add(iso(day));
    }
    const isWorkday = (date: Date) => date.getDay() !== 0 && date.getDay() !== 6 && !holidays.has(iso(date));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    while (!isWorkday(today)) today.setDate(today.getDate() + 1);
    const todayIso = iso(today);
    const shift = (offset: number) => {
      const date = new Date(today);
      let remaining = Math.abs(offset);
      while (remaining > 0) {
        date.setDate(date.getDate() + Math.sign(offset));
        if (isWorkday(date)) remaining -= 1;
      }
      return iso(date);
    };
    const maxWbs = epics.reduce((max, epic) => Math.max(max, Number.parseInt(epic.wbs, 10) || 0), 0);
    type Row = [title: string, department: string, assignee: string, from: number, to: number];
    const build = (index: number, title: string, category: "機台" | "線上", type: string, owner: string, rows: Row[]): Epic => {
      const wbs = String(maxWbs + index + 1);
      const tasks = rows.map(([taskTitle, department, assignee, from, to], taskIndex) => {
        const startDate = shift(from);
        const finishDate = shift(to);
        const status = finishDate < todayIso ? "完成" : startDate <= todayIso ? "進行中" : "待辦";
        return {
          id: `demo-e${index + 1}-t${taskIndex + 1}`,
          wbs: `${wbs}.${taskIndex + 1}`,
          department,
          title: taskTitle,
          type: status,
          assignee,
          startDate,
          finishDate,
          duration: 1,
          rm: "示範資料",
          progress: status === "完成" ? 100 : 0,
        };
      });
      return {
        id: `demo-e${index + 1}`,
        wbs,
        title,
        category,
        priority: "1",
        type,
        department: "PM",
        assignee: owner,
        startDate: tasks[0].startDate,
        finishDate: tasks.reduce((latest, task) => (task.finishDate > latest ? task.finishDate : latest), tasks[0].finishDate),
        duration: 1,
        rm: "2026 下半｜示範資料",
        progress: 0,
        starred: false,
        sheetId: (data.settings?.sheets ?? []).some((sheet) => sheet.id === "sheet-2026-h2") ? "sheet-2026-h2" : undefined,
        tasks,
      };
    };
    const demo = [
      build(0, "示範｜新遊戲開發 - 星光寶石", "機台", "全新開發", "Mia", [
        ["企劃規格書", "企劃", "Ethan", -12, -7],
        ["數學模型與 RTP", "數學", "Kia", -9, -1],
        ["美術原畫與動畫", "美術", "Danna", -5, 5],
        ["前端開發（動畫＋音效＋資料）", "前端", "Olivia", -1, 12],
        ["後端 API 與遊戲參數", "後端", "Lucas", 1, 8],
        ["QA 進測 R1", "QA", "Lanx", 13, 17],
        ["上線準備與通知", "PM", "Mia", 18, 19],
      ]),
      build(1, "示範｜線上活動 - 年終福袋", "線上", "活動", "Ruby", [
        ["活動企劃與規則", "企劃", "Nora", -6, -1],
        ["活動美術素材", "美術", "Zoe", -2, 3],
        ["後端獎勵與兌換設定", "後端", "Daniel", 0, 5],
        ["前端活動頁", "前端", "Kevin", 1, 6],
        ["QA 活動測試", "QA", "Lanx", 7, 9],
      ]),
      build(2, "示範｜機台版本更新 - Q4", "機台", "優化", "Mia", [
        ["版本規劃與範疇確認", "企劃", "Chloe", -7, -3],
        ["韌體更新", "韌體", "sam", -2, 4],
        ["後端調整", "後端", "Ryan", 0, 6],
        ["前端修正", "前端", "Olivia", 3, 8],
        ["QA 升級測試", "QA", "Lanx", 9, 11],
      ]),
      build(3, "示範｜新遊戲開發 - 龍騰四海", "線上", "移植開發", "Ruby", [
        ["企劃規格與 Overview", "企劃", "Ivy", 2, 6],
        ["數學資料", "數學", "Kia", 5, 12],
        ["美術製圖", "美術", "RCG", 4, 14],
        ["前端開發", "前端", "Kevin", 10, 20],
        ["QA 進測 R1", "QA", "Lanx", 21, 24],
      ]),
    ];
    data.epics = [...demo, ...epics];
    return { added: demo.map((epic) => epic.id) };
  },
};

function getDb(): Promise<DB | null> {
  if (!dbPromise) {
    const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
    dbPromise = claude ? (claude.use("db") as Promise<DB | null>).catch(() => null) : Promise.resolve(null);
  }
  return dbPromise;
}

function epicDocId(epicId: string) {
  const safe = epicId.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 180);
  return safe === "." || safe === ".." ? `_${safe}` : safe;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function loadSeed(): Promise<StoredProjectData | null> {
  try {
    const response = await fetch("./seed.json", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as StoredProjectData;
  } catch {
    return null;
  }
}

async function readAll(db: DB): Promise<StoredProjectData | null> {
  const meta = await db.doc(META_PATH).get();
  if (!meta.exists) return null;
  // db snapshots are read-only: copy them so migrations and the app can change the objects.
  const metaData = structuredClone(meta.data() ?? {}) as { project?: StoredProjectData["project"]; settings?: StoredProjectData["settings"]; epicIds?: string[]; migrations?: string[] };
  appliedMigrations = Array.isArray(metaData.migrations) ? metaData.migrations : [];
  lastSaved.set(META_PATH, JSON.stringify({ project: metaData.project, settings: metaData.settings, epicIds: metaData.epicIds, migrations: appliedMigrations }));
  const snap = await db.collection("epics").limit(1000).get();
  const byId = new Map<string, Epic>();
  for (const doc of snap.docs) {
    const body = structuredClone(doc.data()) as { epic?: Epic } | undefined;
    if (!body?.epic) continue;
    byId.set(body.epic.id, body.epic);
    lastSaved.set(`epics/${doc.id}`, JSON.stringify(body.epic));
  }
  const order = metaData.epicIds ?? [];
  const epics = order.map((id) => byId.get(id)).filter((epic): epic is Epic => Boolean(epic));
  for (const [id, epic] of byId) if (!order.includes(id)) epics.push(epic);
  return { project: metaData.project, settings: metaData.settings, epics };
}

async function writeAll(db: DB, data: StoredProjectData) {
  const epics = data.epics ?? [];
  const wanted = new Set<string>();
  for (const [order, epic] of epics.entries()) {
    const path = `epics/${epicDocId(epic.id)}`;
    wanted.add(path);
    const body = JSON.stringify(epic);
    if (lastSaved.get(path) === body) continue;
    await db.doc(path).set({ epic: JSON.parse(body), order });
    lastSaved.set(path, body);
  }
  for (const path of Array.from(lastSaved.keys())) {
    if (path.startsWith("epics/") && !wanted.has(path)) {
      await db.doc(path).delete();
      lastSaved.delete(path);
    }
  }
  const metaBody = { project: data.project, settings: data.settings, epicIds: epics.map((epic) => epic.id), migrations: appliedMigrations };
  const metaJson = JSON.stringify(metaBody);
  const updatedAt = new Date().toISOString();
  if (lastSaved.get(META_PATH) !== metaJson) {
    await db.doc(META_PATH).set({ ...JSON.parse(metaJson), updatedAt });
    lastSaved.set(META_PATH, metaJson);
  }
  return updatedAt;
}


async function applyMigrations(db: DB, data: StoredProjectData) {
  const todo = MIGRATIONS.filter((name) => !appliedMigrations.includes(name));
  if (!todo.length) return data;
  for (const name of todo) {
    const codeMigration = CODE_MIGRATIONS[name];
    if (codeMigration) {
      try {
        const backup = codeMigration(data);
        try {
          await db.doc(`backups/${name}`).set({ ...backup, at: new Date().toISOString() });
        } catch {
          // viewer cannot write
        }
        appliedMigrations = [...appliedMigrations, name];
      } catch {
        // leave it for the next visit
      }
      continue;
    }
    try {
      const response = await fetch(`./migrations/${name}.json`, { cache: "no-store" });
      if (!response.ok) continue;
      const patch = (await response.json()) as Patch;
      for (const epic of data.epics ?? []) {
        for (const item of [epic, ...epic.tasks]) {
          const change = patch[item.id];
          if (change) Object.assign(item, change);
        }
      }
      appliedMigrations = [...appliedMigrations, name];
    } catch {
      // leave it for the next visit
    }
  }
  try {
    await writeAll(db, data);
  } catch {
    // viewer cannot write: show the migrated view anyway
  }
  return data;
}

async function handleGet() {
  const db = await getDb();
  if (!db) return json({ error: "storage_unavailable" }, 503);
  let data = await readAll(db);
  if (data) data = await applyMigrations(db, data);
  if (!data) {
    const seed = await loadSeed();
    if (seed) {
      appliedMigrations = [...MIGRATIONS];
      try {
        await writeAll(db, seed);
        data = seed;
      } catch {
        data = seed; // viewer cannot write: still show the seed read-only
      }
    }
  }
  return json({ data });
}

function handlePut(body: StoredProjectData) {
  pending = body;
  const run = saveChain.then(async () => {
    if (!pending) return new Date().toISOString();
    const next = pending;
    pending = null;
    const db = await getDb();
    if (!db) throw new Error("storage_unavailable");
    return writeAll(db, next);
  });
  saveChain = run.catch(() => undefined);
  return run.then(
    (updatedAt) => json({ ok: true, updatedAt }),
    () => json({ ok: false, error: "save_failed" }, 500),
  );
}

type Downloads = { save(request: { filename: string; data: Blob }): Promise<unknown> };

// The artifact frame cannot start downloads; offer files through the `downloads`
// capability. Its allowlist has no .xls, so the Excel-readable HTML table is saved
// as .html (Excel opens it, and the importer accepts .html).
function installSaveHook() {
  (window as unknown as { __rsgSaveFile?: (name: string, blob: Blob) => void }).__rsgSaveFile = (name, blob) => {
    const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
    const fileName = name.replace(/\.xls$/i, ".html");
    if (!claude) return;
    void (claude.use("downloads") as Promise<Downloads | null>)
      .then((downloads) => downloads?.save({ filename: fileName, data: blob }))
      .catch(() => undefined);
  };
}

export function installArtifactStore() {
  installSaveHook();
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
    if (path !== API_PATH) return originalFetch(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    try {
      if (method === "PUT") return await handlePut(JSON.parse(String(init?.body ?? "{}")) as StoredProjectData);
      return await handleGet();
    } catch {
      return json({ error: "storage_error" }, 500);
    }
  };
}
