# GitHub Pages 匿名互動展示 v1.7.1

展示版不需要 FastAPI、資料庫、登入帳密或外部服務。12 個館別名稱與數據均由程式重新產生，沒有使用上傳的財務工作簿、正式館名、員工資料或部署秘密。

可體驗預算草稿、房晚／AHR／REV、提交唯讀、Excel 108 列範本下載／本機匯入、財務比較與獨立來源快照。畫面依需求暫時隱藏環境、試算與核定提示文案；此調整僅涉及呈現。

修改只保存在 sessionStorage 的專用展示鍵，不同步到別人或其他裝置；瀏覽器可能保留／還原分頁工作階段，請用帳號選單中的「重設資料」明確清除。請勿輸入真實資料。Excel 只在瀏覽器解析，不上傳；CSP 禁止 API／外部連線。

## v1.7.1 最新介面調整

- 「客房預算」固定顯示於導覽列最左側；點擊確認後返回首頁。
- 工作範圍與版本合併為單一三點選單，帳號入口仍獨立。
- 建立新草稿移至步驟條下方、靠左的 Hero 區塊；接續房晚設定及預算表，房晚設定與預算表同寬，懸停不改變標題顏色。
- 兩層表頭以整組 sticky 固定，依內容自然計算高度，不再寫死第二層的 top 偏移。
- 表格使用原生捲動，觸控保留慣性；表格內的上下捲動不串動外層頁面，程式及鍵盤捲動支援 smooth，減少動態設定仍有效。
- 月份統一 01–12，摘要採相同欄寬及等寬數字，不因月份或金額字數改變位置。
- 文案調整不改動資料、分頁儲存方式、提交狀態或財務計算。

## v1.7.0 畫面與操作（歷史記錄，位置以 v1.7.1 為準）

- 淺灰白與低彩度綠，依內容設定不同寬度，讓編列表單置中。
- 上方固定導覽列；館別、年度、編列來源和版本操作集中在左上「工作選單」，帳號入口獨立。
- 手機可點選選單，或從左側 28px 邊緣往右滑；表格內橫向捲動不觸發選單。
- 展示版進入時選取最近的草稿（沒有草稿時選最近版本）；變更館別／年度會先載入該範圍，選單保留以便繼續設定。
- 房間與不可售房晚預設收合；Excel 工具收進標題列，選檔後收起工具並呈現匯入確認。
- 白底為可輸入資料，灰底為計算或唯讀資料；REV 覆寫採勾選與細底線提示，表格使用統一細框線。
- 全年 REV、R/N、ADR、OCC、RevPAR 以數字摘要即時顯示，捲動時固定在導覽列下方，無需懸停。
- 「填寫說明」點擊展開，可供手機及鍵盤使用；選單支援焦點循環、Escape 關閉與焦點復位。
- 使用約 0.2 秒的 CSS 滑入／淡入與按鈕回饋，尊重系統減少動態效果設定。

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

測試包括十條瀏覽器流程與兩項財務運算測試，使用純靜態伺服器的 /hpw_ARB/ 子路徑。正常 production build 與原本後端工作流程仍可使用。

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

最簡單的網頁操作：解壓「GitHub_Pages_靜態網站_v1.7.1.zip」，將 index.html、整個 assets 資料夾與 .nojekyll 上傳到新公開庫的根目錄，提交至 main，再於 Pages 選 main / (root)。不要只上傳 ZIP，也不要多包一層資料夾。網址會是 https://你的帳號.github.io/新儲存庫名稱/。

## 可持續更新的 Actions 方式

使用匿名原始碼分支／原始碼 ZIP 時，可將 Pages 的 Source 改成 GitHub Actions；.github/workflows/pages-demo.yml 會在 main 或 pages-demo 的相關檔案更新時安裝、建置、執行展示測試，再部署。需要 GitHub Pages 已啟用及 github-pages 環境允許該發布分支；首次設定可能需要管理員操作。

configure-pages 的自動啟用功能需要額外的管理權限 token，不能假設一般 GITHUB_TOKEN 能替管理員開啟 Pages。因此此專案不要求將 PAT 或其他秘密放入展示版。

## 驗證與限制

- 本機已用 GitHub 專案子路徑驗證，不依賴 API／資料庫。
- 只有前端互動示範，不是多人共同編列、可信登入或正式財務核定系統。
- 實際 GitHub 發布狀態，以 Pages 設定頁、部署結果及公開網址實測為準；Git 推送成功不等於 Pages 已啟用。
