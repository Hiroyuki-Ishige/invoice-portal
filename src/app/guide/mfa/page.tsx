import Link from "next/link";
import { MFA_ILLUSTRATIONS } from "@/components/guide/MfaIllustrations";

/**
 * Setting up Microsoft 365 sign-in (MFA) with the Microsoft Authenticator app - English and Japanese,
 * with pictures. **Open to everybody, signed in or not**: it is the page the invitation mail links
 * to, and the person reading it cannot sign in yet. It carries no data and no secret.
 *
 * The one place this app has Japanese on a screen, because it was asked for (2026-11-23): the guide
 * is for people who are about to meet a Microsoft sign-in in their own language. The language is the
 * `?lang=` in the address, so the mail can link to either, and the page is static HTML.
 *
 * Written from Microsoft's published flow for work or school accounts; the screens a company's
 * settings show can differ a little (a company may allow other methods). The pictures are drawn,
 * not screenshots, for that reason.
 */

type Lang = "en" | "ja";

interface Step {
  title: string;
  body: string[];
}

interface Copy {
  heading: string;
  lead: string;
  needTitle: string;
  need: string[];
  steps: Step[];
  laterTitle: string;
  later: string;
  helpTitle: string;
  help: string[];
  note: string;
  back: string;
}

const COPY: Record<Lang, Copy> = {
  en: {
    heading: "Setting up Microsoft 365 sign-in (MFA)",
    lead:
      "Invoice Portal uses your usual Microsoft 365 account. The first time you sign in, Microsoft asks for a second check (multi-factor authentication, MFA) with the Microsoft Authenticator app on your phone. It takes about five minutes and you only do it once.",
    needTitle: "Before you start",
    need: [
      "Your smartphone (iPhone or Android) with an internet connection.",
      "Your computer, signed out of Invoice Portal, with this page open beside it.",
      "If you already use Microsoft Authenticator for your work account, skip to step 6.",
    ],
    steps: [
      {
        title: "Start the sign-in on your computer",
        body: [
          "Open Invoice Portal and sign in with your work Microsoft 365 account.",
          "If you see More information required, press Next. If you do not, open https://aka.ms/mysecurityinfo, sign in, choose Add sign-in method and then Authenticator app.",
        ],
      },
      {
        title: "Install Microsoft Authenticator on your phone",
        body: [
          "Open the App Store (iPhone) or Google Play (Android), search for Microsoft Authenticator, and install it.",
          "On the computer, press Next at Start by getting the app.",
        ],
      },
      {
        title: "Add your work account in the app",
        body: [
          "Open the app. Allow notifications when asked - you need them to approve sign-ins.",
          "Press the + button (or Add account), choose Work or school account, then Scan a QR code. Allow the camera if asked.",
          "On the computer, press Next at Set up your account.",
        ],
      },
      {
        title: "Scan the QR code",
        body: [
          "Point the phone camera at the QR code on the computer screen. The account is added to the app.",
          "On the computer, press Next.",
        ],
      },
      {
        title: "Approve the test sign-in",
        body: [
          "The computer shows a two-digit number. The phone shows a notification - open it and type that number, then press Yes. You may be asked for your phone's Face ID, fingerprint or passcode.",
          "When the computer says Notification approved, press Next, then Done.",
        ],
      },
      {
        title: "From now on",
        body: [
          "Each time you sign in to Invoice Portal, the computer shows a number. Open the notification on your phone, enter the number, press Yes.",
          "If you did not try to sign in, press No, it's not me, and tell the IT help desk.",
        ],
      },
    ],
    laterTitle: "Changing your phone",
    later:
      "Set up the new phone before you give up the old one: sign in at https://aka.ms/mysecurityinfo, add the Authenticator app again, and delete the old entry.",
    helpTitle: "If something does not work",
    help: [
      "No notification arrives: check that notifications are allowed for Microsoft Authenticator, and that the phone is online.",
      "The QR code will not scan: hold the phone steady, brighten the screen, or choose Enter code manually in the app.",
      "The screens look different from the pictures: follow the words on your screen. A company's settings can change the wording.",
      "You are locked out, or have a new phone and no access to the old one: contact your IT help desk. Only they can reset the sign-in methods.",
    ],
    note: "The pictures are simplified drawings, not screenshots.",
    back: "Open Invoice Portal",
  },
  ja: {
    heading: "Microsoft 365 サインイン（MFA）の設定方法",
    lead:
      "Invoice Portal は、普段お使いの Microsoft 365 アカウントでサインインします。初めてサインインするときに、スマートフォンの Microsoft Authenticator アプリで 2 つ目の確認（多要素認証、MFA）を求められます。所要時間は 5 分ほどで、設定は 1 回だけです。",
    needTitle: "始める前に",
    need: [
      "インターネットに接続したスマートフォン（iPhone または Android）。",
      "Invoice Portal からサインアウトした状態のパソコン。このページを横に開いておくと便利です。",
      "すでに会社のアカウントで Microsoft Authenticator を使っている場合は、手順 6 へ進んでください。",
    ],
    steps: [
      {
        title: "パソコンでサインインを始める",
        body: [
          "Invoice Portal を開き、会社の Microsoft 365 アカウントでサインインします。",
          "「詳細情報が必要」（More information required）と出たら「次へ」（Next）を押します。出ない場合は https://aka.ms/mysecurityinfo を開いてサインインし、「サインイン方法の追加」から「Authenticator アプリ」を選びます。",
        ],
      },
      {
        title: "スマートフォンに Microsoft Authenticator を入れる",
        body: [
          "App Store（iPhone）または Google Play（Android）で「Microsoft Authenticator」を検索して、インストールします。",
          "パソコンでは、「まずアプリを取得します」（Start by getting the app）の画面で「次へ」を押します。",
        ],
      },
      {
        title: "アプリに会社のアカウントを追加する",
        body: [
          "アプリを開きます。通知の許可を聞かれたら許可してください。サインインの承認に必要です。",
          "「＋」ボタン（または「アカウントを追加」）を押し、「職場または学校アカウント」を選び、「QR コードをスキャン」を押します。カメラの許可を聞かれたら許可します。",
          "パソコンでは、「アカウントのセットアップ」（Set up your account）の画面で「次へ」を押します。",
        ],
      },
      {
        title: "QR コードを読み取る",
        body: [
          "パソコンの画面に出ている QR コードに、スマートフォンのカメラを向けます。アプリにアカウントが追加されます。",
          "パソコンで「次へ」を押します。",
        ],
      },
      {
        title: "テストのサインインを承認する",
        body: [
          "パソコンに 2 桁の数字が表示されます。スマートフォンに届いた通知を開いてその数字を入力し、「はい」（Yes）を押します。スマートフォンの顔認証・指紋・パスコードを求められることがあります。",
          "パソコンに「通知が承認されました」（Notification approved）と出たら、「次へ」、続けて「完了」を押します。",
        ],
      },
      {
        title: "次回からのサインイン",
        body: [
          "Invoice Portal にサインインするたびに、パソコンに数字が表示されます。スマートフォンの通知を開いて、その数字を入力し、「はい」を押します。",
          "自分がサインインしていないのに通知が来たときは、「いいえ、自分ではありません」を押して、IT ヘルプデスクに連絡してください。",
        ],
      },
    ],
    laterTitle: "スマートフォンを替えるとき",
    later:
      "古いスマートフォンを手放す前に、新しいスマートフォンを設定してください。https://aka.ms/mysecurityinfo にサインインして Authenticator アプリを追加し、古い登録を削除します。",
    helpTitle: "うまくいかないとき",
    help: [
      "通知が届かない: Microsoft Authenticator の通知が許可されているか、スマートフォンがオンラインかを確認してください。",
      "QR コードが読み取れない: スマートフォンを動かさずに構え、画面を明るくします。アプリの「コードを手動で入力」も使えます。",
      "画面が絵と違う: 画面の言葉に従ってください。会社の設定で、表示が少し変わることがあります。",
      "サインインできなくなった、または古いスマートフォンが使えないまま機種変更した: IT ヘルプデスクに連絡してください。サインイン方法のリセットは、IT 部門だけができます。",
    ],
    note: "図は簡略化した絵で、実際の画面のスクリーンショットではありません。",
    back: "Invoice Portal を開く",
  },
};

export const metadata = { title: "Microsoft 365 sign-in (MFA) guide - Invoice Portal" };

export default async function MfaGuidePage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const { lang: raw } = await searchParams;
  const lang: Lang = (Array.isArray(raw) ? raw[0] : raw) === "ja" ? "ja" : "en";
  const copy = COPY[lang];

  const tab = (value: Lang, label: string) => (
    <Link
      href={value === "en" ? "/guide/mfa" : `/guide/mfa?lang=${value}`}
      aria-current={lang === value ? "page" : undefined}
      lang={value}
      className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-colors duration-300 ease-in-out ${
        lang === value
          ? "bg-white text-[#0057BC] border-white"
          : "bg-transparent text-white border-white/50 hover:border-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div lang={lang} className="min-h-screen bg-white dark:bg-[#2D2A28]">
      <header className="bg-[#0057BC] text-white">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <span className="font-bold tracking-wide">Invoice Portal</span>
          <div className="flex items-center gap-2">
            {tab("en", "English")}
            {tab("ja", "日本語")}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 md:py-10 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">{copy.heading}</h1>
          <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300">{copy.lead}</p>
        </div>

        <section className="rounded-xl border border-[#0057BC]/30 bg-[#0057BC]/5 dark:border-[#00A3DE]/40 dark:bg-[#00A3DE]/10 p-4 md:p-5">
          <h2 className="font-semibold text-[#0057BC] dark:text-[#00A3DE]">{copy.needTitle}</h2>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm md:text-base text-slate-700 dark:text-slate-200">
            {copy.need.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <ol className="space-y-6">
          {copy.steps.map((step, index) => {
            const Picture = MFA_ILLUSTRATIONS[index];
            return (
              <li key={step.title} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 md:p-5">
                <h2 className="flex items-start gap-3 text-lg font-semibold text-[#2D2A28] dark:text-white">
                  <span
                    aria-hidden
                    className="shrink-0 w-8 h-8 rounded-full bg-[#0057BC] dark:bg-[#00A3DE] text-white flex items-center justify-center text-sm font-bold"
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step.title}</span>
                </h2>
                <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
                  <div className="space-y-2 text-sm md:text-base text-slate-600 dark:text-slate-300">
                    {step.body.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <Picture />
                </div>
              </li>
            );
          })}
        </ol>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[#2D2A28] dark:text-white">{copy.laterTitle}</h2>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300">{copy.later}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[#2D2A28] dark:text-white">{copy.helpTitle}</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm md:text-base text-slate-600 dark:text-slate-300">
            {copy.help.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-slate-500 dark:text-slate-400">{copy.note}</p>
        <Link
          href="/"
          className="inline-flex items-center px-6 py-3 rounded-full bg-[#0057BC] text-white font-semibold hover:bg-[#004494] transition-colors duration-300 ease-in-out"
        >
          {copy.back}
        </Link>
      </main>
    </div>
  );
}
