# Admin マニュアル: ユーザーの追加とロールの仕組み

Invoice Portal の Admin 向け。**ユーザーを使えるようにするには、2 か所の登録が要る。**
Dataverse の権限 (Entra グループ方式) と、アプリのロール (Admin / F&A Admin / User)。
片方だけでは使えない。

## 1. 仕組み (2 層)

| 層 | 何を決めるか | どこで設定するか |
|---|---|---|
| Dataverse のセキュリティロール | Dataverse のテーブルを読める / 書けるか | Power Platform 管理センター (Entra グループ → Dataverse チーム → ロール) |
| アプリのロール (`hi_role`) | アプリで何ができるか (請求書の作成・取消、管理画面) | アプリの Admin > Users |

アプリは **サインインした本人の権限** で Dataverse を呼ぶ。そのためアプリのロールが Admin でも、
Dataverse の権限が足りなければ書き込みは 403 で止まる。

### Entra グループ方式で登録している内容 (2026-11-23 設定)

環境 `MD-MGD-env3-PAYG` (Business unit `md-mgd-env3-payg`)。

| Entra グループ | Dataverse チーム | チームに付けたロール | 入れる人 |
|---|---|---|---|
| `Invoice Portal Editors` | `Invoice Portal Editors` (Team type: Microsoft Entra ID Security Group、Membership type: Members) | `Invoice Portal Editor` + `Basic User` | アプリで **Admin / F&A Admin** にする人 |
| `Invoice Portal Readers` | `Invoice Portal Readers` (同上) | `Invoice Portal Reader` + `Basic User` | アプリで **User** にする人 |

**Dataverse のロールの中身** (Organization レベル):

| テーブル | Editor | Reader |
|---|---|---|
| `hi_invoice` / `hi_invoiceline` / `hi_invoicesequence` | Read, Create, Write, Append, Append To | Read |
| `hi_invoicecustomer` / `hi_invoiceuserprofile` | 上に加えて Delete | Read |
| Currency (`transactioncurrency`) | Read | Read |

人の出入りは **Entra のグループのメンバーを足し引きするだけ**。Dataverse 側の作業は要らない。

**同じ人を Editors と Readers の両方に入れない。** 権限は合算されるので、Reader の意味がなくなる。

## 2. ユーザーを追加する手順

### 手順 1: Entra のグループに入れる

1. https://entra.microsoft.com > **Entra ID > Groups > All groups**。
2. 次のグループを開く。
   - アプリで Admin / F&A Admin にする人 → `Invoice Portal Editors`
   - アプリで User にする人 → `Invoice Portal Readers`
3. **Members > + Add members** で人を検索して追加し、**Select**。

グループの編集には Groups Administrator 以上の権限が要る。なければ IT 管理者に依頼する。

### 手順 2: Dataverse の環境に現れるのを待つ

追加した人が最初にアクセスした時点で、環境のユーザーになる。反映には数分かかることがある。
確認するときは、管理センターの **Settings > Users + permissions > Users** にその人が出ているか見る。

### 手順 3: アプリに登録する (Admin > Users)

1. Admin でサインインし、**Admin > Users** を開く。
2. **Invite New User** で人を検索して選ぶ (名前かメールアドレス。2 つの検索欄のどちらでもよい)。
3. ロールのカード (Admin / F&A Admin / User) を選ぶ。**手順 1 のグループと合わせる。**
4. 先に **Preview Invitation** で、本人に届く招待メールの見た目を確かめられる (何も送られない)。
5. ボタンを選ぶ。
   - **Register & Send Invitation**: 登録して、招待メールを送る。
   - **Register**: 登録だけ。メールは送らない。あとで All Users の **Send App Link** で送れる (行の **Preview** でメールの見た目も確かめられる)。
   - メールが送れなかったときは、画面に理由が出る。登録は済んでいるので、**Send App Link** で送り直す。

招待メールには、MFA (Microsoft Authenticator) の設定手順への、英語・日本語のリンクが付く。
ページは `/guide/mfa` (英語) と `/guide/mfa?lang=ja` (日本語)。サインイン前でも開ける。

### User が見られる会社 (請求書の範囲)

**User は、割り当てられた会社の請求書だけを見られる。** Admin と F&A Admin は全社を見られる。

- 登録のとき: ロールで **User** を選ぶと、「Companies this user may see」に会社のチェック一覧が出る。見せる会社に印を付ける。
- あとから変える: All Users の User の行にある **Companies (N)** を押し、印を付け直して Save。
- 1 社も選ばない User は、請求書が 1 件も見えない。
- 完了通知メール (Send mails) には Invoice Portal へのリンクが付く。宛先の人が見られるようにするには、
  その人を **User として登録し、その会社に印を付けておく** (Mail Notifications の宛先とは別の設定)。
- これは **アプリが画面と API で行う制限**。Dataverse の `Invoice Portal Reader` ロールは、Dataverse を直接呼べる人には
  全社の請求書を読める。会社ごとに完全に分けるには、Dataverse 側のビジネスユニットや所有チームでの制限が別に要る。

### 手順 4: 動作を確かめる

本人にサインインしてもらう (権限が反映されないときは、一度サインアウトして入り直す)。

| 確認 | Admin / F&A Admin | User |
|---|---|---|
| ダッシュボードと請求書一覧が見える | 見える | 見える |
| 請求書を発行して保存する | できる | 403 になる (正常) |

## 3. ロールの変更・停止・削除

| やりたいこと | 方法 |
|---|---|
| ロールを変える | Admin > Users の All Users で、その人の行のロールを選び直す。**あわせて Entra のグループも付け替える** (Editors ↔ Readers)。 |
| 一時的に使えなくする | All Users で **Deactivate** (戻すときは Activate)。 |
| アプリから外す | All Users で **Delete**。Entra のグループからも外す。 |
| 退職・異動 | Entra のグループから外す (Dataverse の権限が消える)。アプリ側も Deactivate か Delete。 |

アプリのロールが **Admin / F&A Admin だけが請求書を作成・取消できる**。User は閲覧のみ。
管理画面ごとの可否は **Admin > Role Permissions** で決まる。

## 4. うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| サインインはできるが、データが何も出ない | Dataverse の権限がない。グループに入っているか、チームに `Basic User` と Invoice Portal のロールが付いているか確認する。 |
| 画面に 403 と権限名が出る | その名前のテーブルの権限が足りない。`Invoice Portal Editor` / `Reader` の該当テーブルを確認する。 |
| アプリで「登録されていない」と出る | 手順 3 (Admin > Users) が済んでいない。 |
| Admin なのに保存が 403 | Entra で Readers に入っている、またはどのグループにも入っていない。Editors に入れる。 |
| グループに入れたのに権限が付かない | 反映待ち (数分)。サインアウトして入り直す。環境の Users に出ているか確認する。 |

## 5. 設定を作り直すとき (参考)

- ロールの作成: 管理センター > 環境 > Settings > Users + permissions > **Security roles > New role**。
  「Include App Opener privileges」は外す。Currency の Read を忘れない。
- チームの作成: 同じ場所の **Teams > Create team**。Team type は **Microsoft Entra ID Security Group**、
  Group name は上の Entra グループ、Membership type は **Members**。
- Dataverse のテーブル作成・列の追加は、アプリの **Admin > Setup** のボタン (Create table / Update) で行う。
  押せるのは System Customizer 以上の人。
