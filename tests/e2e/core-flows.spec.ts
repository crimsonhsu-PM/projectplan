import { expect, test } from "@playwright/test";
import { projectDataFixture } from "../fixtures/project";
import { mockProjectApi } from "./project-api";

test("loads fixture data and persists edits after reload", async ({ page }) => {
  const api = await mockProjectApi(page, projectDataFixture());
  await page.goto("/");
  await expect(page.getByText("已儲存").filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("專案名稱")).toHaveValue("E2E 專案");

  await page.getByLabel("專案名稱").fill("已更新專案");
  await page.getByLabel("展開 Tasks").click();
  await page.getByLabel("1.1 任務名稱").fill("已更新 Task A");
  await expect(page.getByText("已儲存").filter({ visible: true })).toBeVisible({ timeout: 5_000 });
  expect(api.getPutCount()).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByLabel("專案名稱")).toHaveValue("已更新專案");
  await page.getByLabel("展開 Tasks").click();
  await expect(page.getByLabel("1.1 任務名稱")).toHaveValue("已更新 Task A");
});

test("reorders tasks with drag and drop and keeps the order after reload", async ({ page }) => {
  await mockProjectApi(page, projectDataFixture());
  await page.goto("/");
  await page.getByLabel("展開 Tasks").click();

  await page.getByLabel("拖曳 Task B 調整順序").dragTo(page.getByTestId("task-task-1"), {
    targetPosition: { x: 20, y: 2 },
  });
  await expect(page.getByTestId("task-task-2")).toHaveAttribute("data-testid", "task-task-2");
  await expect(page.getByTestId("task-task-2").getByLabel("1.1 任務名稱")).toHaveValue("Task B");
  await expect(page.getByText("已儲存").filter({ visible: true })).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await page.getByLabel("展開 Tasks").click();
  await expect(page.getByTestId("task-task-2").getByLabel("1.1 任務名稱")).toHaveValue("Task B");
});

test("adds tasks and confirms or cancels epic deletion", async ({ page }) => {
  await mockProjectApi(page, projectDataFixture());
  await page.goto("/");
  await page.getByLabel("新增 EPIC").click();
  const modal = page.locator(".epic-modal");
  await modal.getByLabel("Epic 標題").fill("新增測試 EPIC");
  const taskNames = modal.getByRole("textbox", { name: /任務名稱/ });
  await expect(taskNames).toHaveCount(1);
  await modal.getByRole("button", { name: "新增 Task" }).click();
  await expect(taskNames).toHaveCount(2);
  await expect(modal.getByRole("textbox", { name: "2.2 任務名稱", exact: true })).toHaveValue("新任務");

  await modal.getByLabel("刪除 新增測試 EPIC").click();
  const confirmation = page.getByRole("dialog", { name: "刪除 EPIC", exact: true });
  await confirmation.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(modal.getByLabel("Epic 標題")).toHaveValue("新增測試 EPIC");

  await modal.getByLabel("刪除 新增測試 EPIC").click();
  await confirmation.getByRole("button", { name: /^刪\s*除$/ }).click();
  await expect(modal).not.toBeVisible();
});

test("switches manpower views and filters project data", async ({ page }) => {
  await mockProjectApi(page, projectDataFixture());
  await page.goto("/");
  await page.getByRole("tab", { name: "專案人力" }).click();
  await expect(page.getByRole("heading", { name: "專案人力" })).toBeVisible();
  await expect(page.getByText("4 工作天")).toBeVisible();

  await page.getByRole("tab", { name: "人員時程" }).click();
  await expect(page.getByRole("heading", { name: "人員時程" })).toBeVisible();
  await expect(page.getByText("2 位人員")).toBeVisible();
  await page.getByLabel("隱藏機台專案").click();
  await expect(page.getByText("此標籤目前沒有已指派的人員 Task")).toBeVisible();
});
