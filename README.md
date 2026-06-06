# glowbacklog

glowbacklog 是一個 lite iPhone-first PWA，用來把現場靈感快速收進本機，再用最少摩擦交給 AI 或存成檔案。

核心路徑：

```text
建立一個 post / 打開既有 post
  -> 追加照片 / 文字 / 錄音 comment
  -> AI-ready Markdown 聚合整串 thread
  -> 背景準備標準 ZIP package
  -> 右上角亮燈提示尚未備份
  -> 使用者需要時再點匯出 / 備份
```

## 1. MVP 目標

- 不申請 Google Drive、iCloud、OpenAI 或其他第三方 API key。
- 不做帳號、不做後端、不做雲端同步。
- 先驗證 iPhone PWA 是否足夠完成「收集、整理、取出去用」。
- 每一筆 capture 都必須能離開 app：複製、Share Sheet、或下載 fallback。
- 一個 capture 是 post/thread；每次新增的照片、文字、錄音都是 comment。

## 2. 快速啟動

需求：

- Node.js 18+，用來跑測試。
- Python 3，內建靜態 server。

執行：

```bash
npm run dev
```

打開：

```text
http://localhost:4173
```

測試：

```bash
npm run test:all
```

## 2.1 GitHub Pages

這個 repo 已經包含 GitHub Pages workflow：

- `.github/workflows/pages.yml`

推到 GitHub 的 `main` 分支後，會用 GitHub Actions 直接部署整個 static PWA。

建議 repo 名稱：

```text
glowbacklog
```

部署完成後，iPhone 請用 `Safari` 開啟 GitHub Pages 的 `https` 網址，再用分享按鈕 `加入主畫面` 安裝。

## 3. 操作流程

### 3.1 文字

1. 點首頁底部 `文字`。
2. 輸入內容。
3. 點 `儲存 note.md`。
4. 直接進入該筆 detail。
5. 顯示 toast：`已保存在本機，右上角可備份`。

### 3.2 拍照

1. 點中間相機按鈕。
2. iPhone Safari 會開啟相機或照片選擇器。
3. 第一張照片建立 capture draft。
4. 可選 `立即錄音補充`、`再拍一張`、或 `完成`。

### 3.3 多圖

1. 第一張照片後點 `再拍一張`。
2. 後續照片會合併在同一筆 capture 下。
3. 首頁只顯示一筆 capture，detail 顯示所有 photos。

### 3.4 錄音

1. 點底部 `錄音`。
2. 允許麥克風權限。
3. 停止錄音後保存成 audio capture。
4. v1 不做轉錄，Markdown 會保留 transcript placeholder。

### 3.5 延伸記錄

1. 從首頁打開既有 capture。
2. 在 detail 點 `＋文字`、`＋照片`、或 `＋錄音`。
3. 新資料會追加成 comment，不會建立另一筆孤立記錄。
4. AI-ready Markdown 會把整串 Discussion Thread 聚合成同一個 post。
5. 每次追加後右上角備份燈會閃，背景會準備標準 `.zip` package。

## 4. iPhone PWA 注意事項

- 錄音需要 HTTPS 或符合瀏覽器安全條件的環境。
- `capture="environment"` 是瀏覽器提示，不保證每次都直接開後鏡頭。
- `navigator.share()` 必須由使用者點擊觸發，不能背景自動存到「檔案」。
- PWA 可以背景準備 ZIP Blob，但真正寫出到 Files / iCloud Drive 仍必須由使用者點擊 Share Sheet。
- IndexedDB 是本機資料庫，不等於雲端備份；重要內容要引導使用者匯出。
- iOS 可能在儲存壓力下清理瀏覽器資料，所以 v1 的產品語言必須誠實顯示「已保存在本機」而不是「已備份」。

## 5. 程式結構

```text
index.html
manifest.webmanifest
service-worker.js
assets/icon.svg
src/
  app.js
  styles/app.css
  core/
    actions.js
    db.js
    export.js
    format.js
    markdown.js
    media.js
    schema.js
    storage.js
    zip.js
tests/
  core.test.js
  static.test.js
```

## 6. 目前不做

- 背景錄音。
- 自動靜默寫入 iPhone「檔案」。
- Google Drive 或 iCloud API sync。
- AI 轉錄。
- OCR。
- 全文搜尋。
- 多裝置同步。

這些不是放棄，而是保留到確認 v1 capture loop 真的成立後再加。

## 7. 驗收定義

v1 可以交付時必須同時滿足：

- `npm run test:all` 全部通過。
- 本機 browser 可以完成文字 capture、保存、detail、Markdown preview。
- 既有 capture 可以追加文字 comment，並在 Markdown Discussion Thread 中出現。
- 匯出檔案使用 `YYYY-MM-DD_HHmm-title.zip` 標準命名。
- PWA manifest 與 service worker 正常存在。
- 任何地方都不暗示本機保存等於雲端備份。
