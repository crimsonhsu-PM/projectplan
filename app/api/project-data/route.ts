import { env } from "cloudflare:workers";

const STORE_ID = "default";

async function ensureProjectStore() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  await env.DB
    .prepare(
      `CREATE TABLE IF NOT EXISTS project_store (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run();
}

export async function GET() {
  await ensureProjectStore();
  const row = await env.DB
    .prepare("SELECT data, updated_at AS updatedAt FROM project_store WHERE id = ?")
    .bind(STORE_ID)
    .first<{ data: string; updatedAt: string }>();

  if (!row) {
    return Response.json({ data: null, updatedAt: null });
  }

  try {
    return Response.json({ data: JSON.parse(row.data), updatedAt: row.updatedAt });
  } catch {
    return Response.json({ data: null, updatedAt: row.updatedAt, error: "stored_data_invalid" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  await ensureProjectStore();
  const data = await request.json();
  const updatedAt = new Date().toISOString();

  await env.DB
    .prepare(
      `INSERT INTO project_store (id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .bind(STORE_ID, JSON.stringify(data), updatedAt)
    .run();

  return Response.json({ ok: true, updatedAt });
}
