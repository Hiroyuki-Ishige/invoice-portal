# Invoice Portal (請求書作成ポータル)

請求書の作成・発行・管理ポータル。**capex-budget-control を原型に作った骨格**
(2026-11-16)。macOS Tahoe デザイン、Next.js 16 + Dataverse + Azure AD (MSAL)。

## 状態: 原型 (prototype)

動くもの: サインイン (MSAL) / 登録ユーザーの判定 / ロール権限表 / User Management /
Role Permissions / Setup (User Profile テーブルのみ) / ヘッダー・サイドレール / ダーク
モード / 招待メール。
**未実装 (プレースホルダー)**: `/invoices`, `/customers`。請求書・取引先・明細の
Dataverse テーブルは未設計 - テーブルは Admin > Setup からだけ作る。

## Tech Stack

Next.js 16.2.9 (App Router) · React 19.2.4 · Tailwind 4 · Microsoft Dataverse ·
Azure AD / MSAL.js · Lucide · SWR · isomorphic-dompurify · jsPDF + autotable / ExcelJS
(請求書 PDF・Excel 用に残してある。使うまでは `await import()` のみ)。
`src/proxy.ts` が `/api/*` の前で Dataverse を呼ぶ (未登録は 403)。

## 新しい環境で最初にやること

1. **Azure AD に Invoice Portal 用アプリを新規登録** - CAPEX のクライアント ID は流用しない。
   リダイレクト URI は **SPA**、`{NEXT_PUBLIC_APP_URL}/auth/callback`。
2. `.env.example` を `.env.local` にコピーして埋める (`.env*` は git 管理外)。
3. Dataverse の接続先を決める。**CAPEX と同じ環境を共有するなら `hi_userprofiles` が
   すでにある** - 別環境なら Admin > Setup > User Profile table を実行。
4. `npm install && npm run dev`。

## 原型から持ち越したもの (整理の候補)

- **`hi_` プレフィックス・`hi_userprofiles`・`hi_appsettings`** をそのまま使う。
  請求書用の新テーブルも `hi_` に揃えるか、別プレフィックスにするか決める。
- **Ringi preview (試用メンバー機能)**: `lib/auth/ringi-preview`, `lib/settings/ringi-preview`,
  `hooks/useRingiPreview`, `PreviewChip`, User Management のスイッチ。名前は元のまま、
  対象エリアは `invoices`。不要なら一式削除 (`require-signed-in.ts` の `ringiPreviewGate` も)。
- **ロール**: `admin / faadmin / user ...` (`lib/types/user-profile.ts`) は CAPEX のまま。
  請求書の業務に合わせて見直す。`SUPER_ADMIN_EMAILS` も要確認。
- **メール**: 件名プレフィックス `[CAPEX Budget]` / `[Fm Ringi system]` (`lib/notify/send-mail.ts`)、
  招待・登録依頼メールの文言に CAPEX が残る。
- **`.claude/rules/`**: CAPEX 時代の文書。認証・Dataverse・レスポンシブ・アニメーションの
  規則は生きているが、画面例 (Budget table など) は読み替える。ブランド色 (HOYA Blue
  `#0057BC` / Cyan `#00A3DE` / Cool Grey `#B0B5B5` / Warm Black `#2D2A28`) は閉じた集合。
- 元プロジェクトの 54 の "Rules that bite" は `capex-budget-control/CLAUDE.md` にある。
  認証・Dataverse 書き込み・日本語入力 (IME)・390px スマホ幅などは、そのまま当てはまる。

## 開発

```bash
npm run dev | npm run build | npm run lint | npx tsc --noEmit
```

- テストフレームワークなし。ロジックは使い捨て `.mts` で確かめて消す。
- 作業はブランチで、完了したら `main` にマージ。
- 金額は `formatAmount()` (`lib/utils/format`) - `toLocaleString()` は必ず `"en-US"` 付き。
- **返信は日本語で**。
