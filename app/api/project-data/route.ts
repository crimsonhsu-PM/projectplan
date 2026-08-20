import { env } from "cloudflare:workers";
import {
  loadProjectData,
  parseProjectDataRequest,
  requireProjectDatabase,
  saveProjectData,
  type ProjectDatabase,
} from "@/lib/project-data-store";

export async function GET() {
  const result = await loadProjectData(requireProjectDatabase(env.DB as ProjectDatabase | undefined));
  return Response.json(result.body, { status: result.status });
}

export async function PUT(request: Request) {
  const data = await parseProjectDataRequest(request);
  const result = await saveProjectData(requireProjectDatabase(env.DB as ProjectDatabase | undefined), data);
  return Response.json(result);
}
