# Cloudflare 部署筆記

## Pages 專案

使用 Cloudflare Dashboard 操作：

1. 進入 **Workers & Pages**。
2. 點選 **Create application**。
3. 選擇 **Pages**。
4. 連接這個 GitHub repository。
5. 使用以下 build 設定：
   - Framework preset：**None**
   - Build command：留空
   - Build output directory：`/`
6. 部署專案。

靜態地圖與 `functions/` API routes 會一起部署成同一個 Cloudflare Pages 專案。

## D1 資料庫

使用 Cloudflare Dashboard 操作：

1. 進入 **Workers & Pages**。
2. 打開 **D1 SQL Database**。
3. 點選 **Create database**。
4. 命名為 `ntu-light-map`。
5. 將 database ID 複製到 `wrangler.toml` 的 `database_id`。

接著把 D1 綁定到 Pages 專案：

1. 打開 Pages 專案。
2. 進入 **Settings**。
3. 打開 **Bindings**。
4. 新增 **D1 database binding**。
5. Binding name 設為 `DB`。
6. 選擇 `ntu-light-map` 資料庫。
7. 儲存並重新部署。

資料庫建立後，執行 production migration：

```sh
npm run d1:migrate:remote
```

Cloudflare Dashboard 可以建立與綁定 D1，但 repo 內的 migration 檔仍需要用 Wrangler 套用。

## Email 驗證變數

系統會寄一次性驗證碼到 `@ntu.edu.tw` 信箱。寄件帳號是：

```text
light-map@ntusa.ntu.edu.tw
```

在 Pages 專案中：

1. 進入 **Settings**。
2. 打開 **Variables and Secrets**。
3. 新增以下 production variables：

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=light-map@ntusa.ntu.edu.tw
SMTP_FROM=light-map@ntusa.ntu.edu.tw
```

4. 新增以下 production secret，並啟用 **Encrypt**：

```text
HASH_SALT=<random secret>
SMTP_PASS=<app password>
```

可以用以下指令產生 `HASH_SALT`：

```sh
openssl rand -base64 32
```

不要把 `HASH_SALT` 或 app password commit 進 Git。`HASH_SALT` 會用來雜湊 reporter email、session token、驗證碼與 IP。後端會把缺少 `HASH_SALT` 視為部署設定錯誤，直接回傳 `server_misconfigured`。

## 後台管理員

後台使用既有 NTU email session，再用 `ADMIN_EMAILS` 白名單判斷管理員。請在 Pages 專案的
**Settings** → **Variables and Secrets** 新增 production variable：

```text
ADMIN_EMAILS=admin1@ntu.edu.tw,admin2@ntu.edu.tw
```

多個 email 可以用逗號、空白或換行分隔。管理員登入後，左側導覽會出現「後台管理」，可以檢視事件列表並刪除事件。刪除會把事件狀態改成 `hidden`，不會從 D1 硬刪資料。

## 本機開發

Wrangler Pages Functions 會從 `.dev.vars` 讀取本機 bindings。先從範例檔建立：

```sh
cp .dev.vars.example .dev.vars
```

本機測試時，`.dev.vars.example` 預設啟用 `ALLOW_DEV_AUTH=true`，並設定
`DEV_EMAIL_CODE=123456` 與 `DEV_USER_EMAIL=admin@ntu.edu.tw`，所以可以不寄真實 email 也能完成驗證流程並看到後台入口。

接著執行：

```sh
npm run d1:migrate:local
npm run dev:auth
```

一次只跑一個 dev server。`npm run dev` 和 `npm run dev:auth` 都使用 port `8788`，同時啟動會出現 `Address already in use`。

`npm run dev` 會啟動 Cloudflare Pages Functions。本機若只用一般靜態伺服器，會看到
`Cannot GET /api/protected/session`，因為一般靜態伺服器不會執行 `functions/`。

Production 不要啟用 `ALLOW_DEV_AUTH`。
