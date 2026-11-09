# RSG Project Plan｜維護交接

## 系統用途

管理遊戲專案的 Epic、工作項目、日期與人力安排，並以每日甘特圖呈現進度。使用者可匯入、編輯、排序及匯出資料；線上資料存於 D1。

## 技術架構與資料夾

TypeScript、React、Vinext／Cloudflare Worker、Ant Design、Dayjs、Drizzle ORM、Cloudflare D1。`app/page.tsx` 是主要介面；`app/api/project-data/route.ts` 提供讀寫；`lib/planner-domain.ts` 是日期、進度、人力、匯入匯出規則；`lib/project-data-store.ts` 是資料保存；`db/schema.ts` 定義 D1 表；`worker/` 是 Worker 入口；`tests/unit` 與 `tests/e2e` 是測試；`.openai/hosting.json` 是 Sites 綁定。

## 從 clone 到畫面

```bash
git clone https://github.com/crimsonhsu-PM/projectplan.git
cd projectplan
pnpm install
pnpm dev
```

瀏覽終端顯示的本機網址；本機 D1 模擬由 Vite 設定。`db:generate` 只在 Schema 變更後使用。本專案無示範登入帳號。

## 測試

`pnpm test`／`pnpm test:unit` 執行 Vitest（`planner-domain`、資料保存）；`pnpm test:e2e` 執行 Playwright（主要流程、匯入及失敗處理）。`pnpm typecheck`、`pnpm lint`、`pnpm build` 為檢查；`pnpm test:all` 串接完整流程。端對端測試啟動方式另見 `docs/e2e-testing.md`。

## 部署與搬遷

線上 Demo：https://rsg-project-plan.lazyer1016.chatgpt.site ，OpenAI Sites 第 61 版對應 GitHub 上原 main commit；本次將既有修正分支合入 main 後文件 commit 較線上新。Sites 的發布須原 Site 編輯／發布權，GitHub push 不自動上線。Claude 沒有 Sites 工具時，改用 Cloudflare Workers + D1：建立 D1、部署 Worker、設定 `DB` 綁定、對照 `vite.config.ts`／`worker/index.ts` 與 `.openai/hosting.json` 搬移，並替換 Sites 專屬建置整合；需 Cloudflare 帳號、Workers 與 D1 權限。GitHub Pages 無法執行 `/api/project-data` 與 D1；如搬往一般 Node 主機，需重寫 D1 存取層或提供相容服務。

## 資料模型與業務規則

`project_store` 表只有 `id`、`data`（整份專案 JSON）與 `updated_at`；目前以 `id=default` 保存一份資料，Epic／工作項目等細節在 JSON 結構，見 `lib/planner-types.ts`。日期、工作日、進度、排序、匯入匯出規則在 `lib/planner-domain.ts`；API 保存與讀取在 `lib/project-data-store.ts`。

## 示範資料與已知事項

沒有獨立示範帳號或自動重置端點。清空線上資料需有 D1 管理權，刪除 `project_store` 中 `id=default` 的資料；此動作會清除現有排程，先備份。API 目前以同一筆 `default` 儲存，沒有多租戶隔離；搬遷到獨立公開環境前須評估存取控制。Sites 專屬登入輔助檔 `app/chatgpt-auth.ts` 存在，但目前主要資料 API 未使用它。
