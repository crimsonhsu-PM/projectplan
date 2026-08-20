import { expect, test } from "@playwright/test";
import { projectDataFixture } from "../fixtures/project";
import { mockProjectApi } from "./project-api";

const validCsv = [
  "類型,標籤,WBS,Priority,Epic/Task,Type/狀態,部門,Agent,Start,Finish,RM/JIRA",
  "EPIC,線上,8,1,匯入專案,全新開發,PM,Alice,2026-07-01,2026-07-31,",
  "TASK,線上,8.1,,匯入任務,待辦,QA,Bob,2026-07-01,2026-07-02,",
].join("\n");

test("imports valid CSV in append mode", async ({ page }) => {
  await mockProjectApi(page, projectDataFixture());
  await page.goto("/");
  await page.getByLabel("匯入 Excel").click();
  await page.getByLabel("選擇匯入檔案").setInputFiles({ name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv) });
  await expect(page.getByText("解析完成，可確認匯入。")).toBeVisible();
  await expect(page.getByText("Epic：1")).toBeVisible();
  await page.getByRole("button", { name: "確認匯入" }).click();
  await page.getByRole("tab", { name: /線上/ }).click();
  await expect(page.getByText("匯入專案")).toBeVisible();
});

test("replaces data and reports malformed files", async ({ page }) => {
  await mockProjectApi(page, projectDataFixture());
  await page.goto("/");
  await page.getByLabel("匯入 Excel").click();
  await page.locator(".import-mode-select").click();
  await page.getByText("覆蓋匯入", { exact: true }).click();
  await page.getByLabel("選擇匯入檔案").setInputFiles({ name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv) });
  await page.getByRole("button", { name: "確認匯入" }).click();
  await page.getByRole("tab", { name: /機台/ }).click();
  await expect(page.getByText("測試專案")).not.toBeVisible();

  await page.getByLabel("匯入 Excel").click();
  await page.getByLabel("選擇匯入檔案").setInputFiles({ name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from("WRONG,,,沒有資料") });
  await expect(page.getByText(/類型需為 EPIC 或 TASK/)).toBeVisible();
  await expect(page.getByRole("button", { name: "確認匯入" })).toBeDisabled();
});

test("falls back locally when loading fails", async ({ page }) => {
  await mockProjectApi(page, null, { failLoad: true });
  await page.goto("/");
  await expect(page.getByText("使用本機備援")).toBeVisible();
  await expect(page.getByLabel("專案名稱")).toHaveValue("2026下半開發項目");
});

test("shows save failure without losing the local edit", async ({ page }) => {
  await mockProjectApi(page, projectDataFixture(), { failSave: true });
  await page.goto("/");
  await page.getByLabel("專案名稱").fill("本機修改");
  await expect(page.getByText("儲存失敗")).toBeVisible({ timeout: 5_000 });
  await page.reload();
  await expect(page.getByLabel("專案名稱")).toHaveValue("E2E 專案");
});
