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
import type { Epic, StoredProjectData } from "../lib/planner-types";

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
// Code migrations run in order after the file ones; each returns a backup to keep in backups/<name>.
const MIGRATIONS = ["games-v2", "auto-assign-v1", "sheets-v1"];
const CODE_MIGRATIONS: Record<string, (data: StoredProjectData) => Record<string, unknown>> = {
  "auto-assign-v1": (data) => {
    const result = autoAssign(data.epics ?? [], data.settings?.agents ?? []);
    data.epics = result.epics;
    return { count: result.count, originalAssignee: result.changes };
  },
  // 依備註開頭「2026 上半／下半／上半→下半延續」建立兩個分頁並分好 Epic（延續的放下半）。
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
  const metaData = meta.data() as { project?: StoredProjectData["project"]; settings?: StoredProjectData["settings"]; epicIds?: string[]; migrations?: string[] };
  appliedMigrations = Array.isArray(metaData.migrations) ? metaData.migrations : [];
  lastSaved.set(META_PATH, JSON.stringify({ project: metaData.project, settings: metaData.settings, epicIds: metaData.epicIds, migrations: appliedMigrations }));
  const snap = await db.collection("epics").limit(1000).get();
  const byId = new Map<string, Epic>();
  for (const doc of snap.docs) {
    const body = doc.data() as { epic?: Epic } | undefined;
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

type Patch = Record<string, { title?: string; rm?: string }>;

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
