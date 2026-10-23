# 年度客房預算｜GitHub Pages 匿名預覽 2.1.0

本分支只包含匿名假資料的靜態網站。無須帳密、API 或資料庫；沒有正式館名、帳號、原始工作簿、密碼或金鑰。請勿輸入真實財務資料。

## 本版內容

- 編列步驟條下方顯示館別、年度、來源、版本、台北儲存時間及切換版本。
- 依各館/聯訂/財務的匿名操作情境，在同一瀏覽器分頁保存上次工作位置。重新進入可接續；已提交唯讀，刪除版本回到選擇步驟。
- 本站儲存時間由瀏覽器產生，資料放在 sessionStorage，不是正式後端保存，也不跨裝置同步。舊假資料沒有儲存時間時顯示「尚無儲存紀錄」。
- 保留收入、房晚、Excel 本機匯入、財務比較、206 科目損益、七表匯出、列印及年度預算比較。
- 帳號選單可重設假資料。CSP 禁止 API/外部連線；Excel 只在瀏覽器處理。

## 建置與測試

Node.js 24，前端目錄執行：

```bash
npm ci
npm run build:demo
npm run test:demo
```

正式輸出為 dist-demo/index.html、assets/、.nojekyll，使用相對資產路徑，可部署在 /hpw_ARB/。

pages-demo 僅含匿名來源、測試與建置流程；gh-pages 僅含靜態輸出。其他正式專案程式及設定不隨本分支發布。可在 Settings → Pages 選 gh-pages / (root)，或使用已提供的 GitHub Actions 流程。

預覽網址：https://hpw6thistle.github.io/hpw_ARB/ 。實際部署與更新完成時間，以 GitHub Pages 部署結果及網站實際顯示的 v2.1.0 為準。
