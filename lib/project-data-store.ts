import type { StoredProjectData } from "./planner-types";

const STORE_ID = "default";

export type D1ResultRow = { data: string; updatedAt: string };

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface ProjectDatabase {
  prepare(sql: string): D1StatementLike;
}

export type LoadProjectDataResult = {
  body: { data: StoredProjectData | null; updatedAt: string | null; error?: "stored_data_invalid" };
  status: 200 | 500;
};

export function requireProjectDatabase(database: ProjectDatabase | undefined): ProjectDatabase {
  if (!database) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return database;
}

export function parseProjectDataRequest(request: Request) {
  return request.json();
}

export async function ensureProjectStore(database: ProjectDatabase) {
  await database.prepare(
    `CREATE TABLE IF NOT EXISTS project_store (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

export async function loadProjectData(database: ProjectDatabase): Promise<LoadProjectDataResult> {
  await ensureProjectStore(database);
  const row = await database
    .prepare("SELECT data, updated_at AS updatedAt FROM project_store WHERE id = ?")
    .bind(STORE_ID)
    .first<D1ResultRow>();

  if (!row) return { body: { data: null, updatedAt: null }, status: 200 };

  try {
    return {
      body: { data: JSON.parse(row.data) as StoredProjectData, updatedAt: row.updatedAt },
      status: 200,
    };
  } catch {
    return {
      body: { data: null, updatedAt: row.updatedAt, error: "stored_data_invalid" },
      status: 500,
    };
  }
}

export async function saveProjectData(
  database: ProjectDatabase,
  data: unknown,
  now: () => Date = () => new Date(),
) {
  await ensureProjectStore(database);
  const updatedAt = now().toISOString();
  await database
    .prepare(
      `INSERT INTO project_store (id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .bind(STORE_ID, JSON.stringify(data), updatedAt)
    .run();
  return { ok: true as const, updatedAt };
}
