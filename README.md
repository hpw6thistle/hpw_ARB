# GitHub Pages 匿名互動展示 v1.6.1

展示版不需要 FastAPI、資料庫、登入帳密或外部服務。12 個館別名稱與數據均由程式重新產生，沒有使用上傳的財務工作簿、正式館名、員工資料或部署秘密。

可體驗預算草稿、房晚／AHR／REV、提交唯讀、Excel 108 列範本下載／本機匯入、財務比較與獨立來源快照。介面醒目標示「展示版」；沒有正式核定效力。

修改只保存在 sessionStorage 的專用展示鍵，不同步到別人或其他裝置；瀏覽器可能保留／還原分頁工作階段，請用「重設示範資料」明確清除。請勿輸入真實資料。Excel 只在瀏覽器解析，不上傳；CSP 禁止 API／外部連線。

## 本機建置與測試

需要 Node.js >=22.12（建議 24）。

```bash
cd frontend
npm ci
npm run build:demo
npm run preview:demo
```

輸出為 frontend/dist-demo/index.html、assets 與 .nojekyll。相對資產路徑支援 GitHub 專案子路徑。

```bash
# frontend 目錄；需要 Chromium
npm run test:demo
# 有系統 Chromium 時，可設定 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
```

測試包括六條瀏覽器流程與兩項財務運算測試，使用純靜態伺服器的 /hpw_ARB/ 子路徑。正常 production build 與原本後端工作流程仍可使用。

## 此儲存庫的分支用途

- pages-demo：僅匿名前端原始碼、展示測試與 Pages Actions，不包含正式後端、工作簿、DB、秘密或原始專案歷史。
- gh-pages：僅建置好的 index.html、assets、.nojekyll，可直接從分支發布。
- main：不因這次展示發布被替換或自動公開。

## 最少設定的發布方式

有儲存庫管理權限，且方案允許該儲存庫使用 Pages 時：

1. 開啟儲存庫 Settings → Pages。
2. Build and deployment → Source 選 Deploy from a branch。
3. Branch 選 gh-pages，資料夾選 /(root)，按 Save。
4. 等 GitHub 的 Pages build/deployment 完成，從設定頁的 Visit site 開啟。
5. 目前儲存庫的預期網址為 https://hpw6thistle.github.io/hpw_ARB/；在 GitHub 確認成功前，不將它當成已上線。

如果 GitHub Free 對目前私有儲存庫不提供 Pages，請另建只放匿名展示檔的公開儲存庫，例如 hpw-budget-demo；不要為此公開含正式資料的其他專案。

最簡單的網頁操作：解壓「GitHub_Pages_靜態網站_v1.6.1.zip」，將 index.html、整個 assets 資料夾與 .nojekyll 上傳到新公開庫的根目錄，提交至 main，再於 Pages 選 main / (root)。不要只上傳 ZIP，也不要多包一層資料夾。網址會是 https://你的帳號.github.io/新儲存庫名稱/。

## 可持續更新的 Actions 方式

使用匿名原始碼分支／原始碼 ZIP 時，可將 Pages 的 Source 改成 GitHub Actions；.github/workflows/pages-demo.yml 會在 main 或 pages-demo 的相關檔案更新時安裝、建置、執行展示測試，再部署。需要 GitHub Pages 已啟用及 github-pages 環境允許該發布分支；首次設定可能需要管理員操作。

configure-pages 的自動啟用功能需要額外的管理權限 token，不能假設一般 GITHUB_TOKEN 能替管理員開啟 Pages。因此此專案不要求將 PAT 或其他秘密放入展示版。

## 驗證與限制

- 本機已用 GitHub 專案子路徑驗證，不依賴 API／資料庫。
- 只有前端互動示範，不是多人共同編列、可信登入或正式財務核定系統。
- 實際 GitHub 發布狀態，以 Pages 設定頁、部署結果及公開網址實測為準；Git 推送成功不等於 Pages 已啟用。
