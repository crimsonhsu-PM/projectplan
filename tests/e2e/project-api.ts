import type { Page } from "@playwright/test";
import type { StoredProjectData } from "../../lib/planner-types";

export async function mockProjectApi(
  page: Page,
  initialData: StoredProjectData | null,
  options: { failLoad?: boolean; failSave?: boolean } = {},
) {
  let data = structuredClone(initialData);
  let putCount = 0;

  await page.route("**/api/project-data", async (route) => {
    if (route.request().method() === "GET") {
      if (options.failLoad) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "offline" }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data, updatedAt: "2026-08-20T00:00:00.000Z" }),
      });
      return;
    }

    if (route.request().method() === "PUT") {
      putCount += 1;
      if (options.failSave) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "save_failed" }) });
        return;
      }
      data = route.request().postDataJSON() as StoredProjectData;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, updatedAt: "2026-08-20T00:00:01.000Z" }) });
      return;
    }

    await route.fallback();
  });

  return {
    getData: () => data,
    getPutCount: () => putCount,
  };
}
