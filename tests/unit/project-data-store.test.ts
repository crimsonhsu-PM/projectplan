import { describe, expect, it } from "vitest";
import {
  loadProjectData,
  parseProjectDataRequest,
  requireProjectDatabase,
  saveProjectData,
  type D1StatementLike,
  type ProjectDatabase,
} from "../../lib/project-data-store";

class FakeStatement implements D1StatementLike {
  values: unknown[] = [];
  constructor(private readonly database: FakeDatabase, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; this.database.bindings.push(values); return this; }
  async first<T>() { if (this.database.failure) throw this.database.failure; return this.database.row as T | null; }
  async run() { if (this.database.failure) throw this.database.failure; this.database.runs.push(this.sql); return {}; }
}

class FakeDatabase implements ProjectDatabase {
  statements: string[] = [];
  bindings: unknown[][] = [];
  runs: string[] = [];
  row: { data: string; updatedAt: string } | null = null;
  failure: Error | null = null;
  prepare(sql: string) { this.statements.push(sql); return new FakeStatement(this, sql); }
}

describe("project data store", () => {
  it("requires the D1 binding", () => {
    expect(() => requireProjectDatabase(undefined)).toThrow("D1 binding `DB` is unavailable");
  });

  it("returns an empty response when no row exists", async () => {
    const result = await loadProjectData(new FakeDatabase());
    expect(result).toEqual({ body: { data: null, updatedAt: null }, status: 200 });
  });

  it("parses a valid stored project", async () => {
    const database = new FakeDatabase();
    database.row = { data: JSON.stringify({ project: { projectName: "A" } }), updatedAt: "2026-01-01T00:00:00.000Z" };
    const result = await loadProjectData(database);
    expect(result.status).toBe(200);
    expect(result.body.data?.project?.projectName).toBe("A");
    expect(database.bindings).toContainEqual(["default"]);
  });

  it("returns the existing 500 contract for invalid stored JSON", async () => {
    const database = new FakeDatabase();
    database.row = { data: "{broken", updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(await loadProjectData(database)).toEqual({
      body: { data: null, updatedAt: "2026-01-01T00:00:00.000Z", error: "stored_data_invalid" },
      status: 500,
    });
  });

  it("upserts serialized data with an injected timestamp", async () => {
    const database = new FakeDatabase();
    const result = await saveProjectData(database, { project: { projectName: "A" } }, () => new Date("2026-08-20T01:02:03.000Z"));
    expect(result).toEqual({ ok: true, updatedAt: "2026-08-20T01:02:03.000Z" });
    expect(database.bindings.at(-1)).toEqual(["default", '{"project":{"projectName":"A"}}', "2026-08-20T01:02:03.000Z"]);
    expect(database.statements.at(-1)).toContain("ON CONFLICT(id) DO UPDATE");
  });

  it("uses the current time when no clock is injected", async () => {
    const database = new FakeDatabase();
    const result = await saveProjectData(database, null);
    expect(Number.isNaN(Date.parse(result.updatedAt))).toBe(false);
  });

  it("propagates database failures", async () => {
    const database = new FakeDatabase();
    database.failure = new Error("database unavailable");
    await expect(loadProjectData(database)).rejects.toThrow("database unavailable");
  });

  it("rejects malformed request JSON before a database write", async () => {
    const request = new Request("http://localhost/api/project-data", { method: "PUT", body: "{broken", headers: { "content-type": "application/json" } });
    await expect(parseProjectDataRequest(request)).rejects.toThrow();
  });
});
