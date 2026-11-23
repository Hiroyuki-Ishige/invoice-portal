/**
 * Simplified pictures for the MFA guide (`/guide/mfa`).
 *
 * Drawn, not screenshots: Microsoft's own pages change their look without notice, and a picture of
 * last year's screen is worse than a plain one. They show **where to look and what to press**, with
 * the words kept short and in English (the words Microsoft shows depend on the person's language).
 * Brand colours and neutral greys only (CLAUDE.md rule 33).
 */

const BLUE = "#0057BC";
const CYAN = "#00A3DE";
const GREY = "#B0B5B5";
const BLACK = "#2D2A28";
const SOFT = "#F1F4F7";
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 320 180"
      className="w-full h-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
      fontFamily={FONT}
    >
      {children}
    </svg>
  );
}

/** A computer screen: x/y/w/h of the display area. */
function Pc({ x = 20, y = 14, w = 280, h = 134, children }: { x?: number; y?: number; w?: number; h?: number; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#fff" stroke={GREY} strokeWidth={2} />
      <rect x={x} y={y} width={w} height={14} rx={8} fill={SOFT} />
      <circle cx={x + 10} cy={y + 7} r={2.5} fill={GREY} />
      <circle cx={x + 19} cy={y + 7} r={2.5} fill={GREY} />
      <rect x={x + w / 2 - 28} y={y + h} width={56} height={6} rx={3} fill={GREY} />
      {children}
    </g>
  );
}

/** A phone: x/y of its top-left; the screen is 74 x 124 inside. */
function Phone({ x, y = 28, children }: { x: number; y?: number; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={82} height={140} rx={12} fill="#fff" stroke={BLACK} strokeWidth={2.5} />
      <rect x={x + 30} y={y + 5} width={22} height={4} rx={2} fill={GREY} />
      {children}
    </g>
  );
}

function Button({ x, y, w, label, filled = true }: { x: number; y: number; w: number; label: string; filled?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={18} rx={9} fill={filled ? BLUE : "#fff"} stroke={BLUE} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 12.5} textAnchor="middle" fontSize={9} fontWeight={600} fill={filled ? "#fff" : BLUE}>
        {label}
      </text>
    </g>
  );
}

function Lines({ x, y, widths }: { x: number; y: number; widths: number[] }) {
  return (
    <g>
      {widths.map((w, i) => (
        <rect key={i} x={x} y={y + i * 9} width={w} height={4} rx={2} fill="#dfe6ee" />
      ))}
    </g>
  );
}

/** The app's icon: a blue rounded square with a check - not Microsoft's logo, which is theirs. */
function AppIcon({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.22} fill={BLUE} />
      <path
        d={`M${x + size * 0.28} ${y + size * 0.52} l${size * 0.15} ${size * 0.15} l${size * 0.3} ${-size * 0.34}`}
        fill="none"
        stroke="#fff"
        strokeWidth={size * 0.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** A square of dots standing in for a QR code. Fixed pattern - nothing here is scannable. */
function QrGlyph({ x, y, size }: { x: number; y: number; size: number }) {
  const n = 11;
  const cell = size / n;
  const cells: React.ReactNode[] = [];
  const finder = (cx: number, cy: number) => cx < 3 && cy < 3;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const inFinder = finder(i, j) || finder(n - 1 - i, j) || finder(i, n - 1 - j);
      const on = inFinder || (i * 7 + j * 13 + i * j) % 3 === 0;
      if (on) cells.push(<rect key={`${i}-${j}`} x={x + i * cell} y={y + j * cell} width={cell - 0.6} height={cell - 0.6} fill={BLACK} />);
    }
  }
  return <g>{cells}</g>;
}

/** 1 - the computer asks for more information. */
export function PcPrompt() {
  return (
    <Frame label="A computer screen titled More information required, with a Next button">
      <Pc>
        <text x={160} y={52} textAnchor="middle" fontSize={13} fontWeight={700} fill={BLACK}>
          More information required
        </text>
        <Lines x={70} y={64} widths={[180, 150]} />
        <Button x={118} y={100} w={84} label="Next" />
        <path d="M205 120 l-12 -10" stroke={CYAN} strokeWidth={3} strokeLinecap="round" />
        <circle cx={209} cy={123} r={5} fill={CYAN} />
      </Pc>
    </Frame>
  );
}

/** 2 - install the app on the phone. */
export function PhoneStore() {
  return (
    <Frame label="A phone showing the Microsoft Authenticator app in the app store, with a Get button">
      <Phone x={119}>
        <AppIcon x={146} y={52} size={28} />
        <text x={160} y={96} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={BLACK}>
          Authenticator
        </text>
        <text x={160} y={107} textAnchor="middle" fontSize={7} fill={GREY}>
          Microsoft
        </text>
        <Button x={135} y={118} w={50} label="GET" />
        <Lines x={133} y={146} widths={[54, 40]} />
      </Phone>
      <text x={40} y={92} fontSize={11} fontWeight={600} fill={BLUE}>App Store</text>
      <text x={40} y={108} fontSize={11} fontWeight={600} fill={BLUE}>Google Play</text>
    </Frame>
  );
}

/** 3 - add a work or school account in the app. */
export function PhoneAddAccount() {
  return (
    <Frame label="The Authenticator app on a phone: the plus button, then Work or school account, then Scan a QR code">
      <Phone x={119}>
        <text x={160} y={52} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={BLACK}>
          Add account
        </text>
        <rect x={129} y={60} width={62} height={16} rx={5} fill={SOFT} />
        <text x={135} y={71} fontSize={6.2} fill={BLACK}>Personal account</text>
        <rect x={129} y={80} width={62} height={16} rx={5} fill="#E6EEF8" stroke={BLUE} strokeWidth={1.5} />
        <text x={135} y={91} fontSize={6.2} fontWeight={700} fill={BLUE}>Work or school</text>
        <rect x={129} y={100} width={62} height={16} rx={5} fill={SOFT} />
        <text x={135} y={111} fontSize={6.2} fill={BLACK}>Other account</text>
        <Button x={131} y={128} w={58} label="Scan QR" filled={false} />
      </Phone>
      <circle cx={262} cy={60} r={15} fill={BLUE} />
      <path d="M262 52 v16 M254 60 h16" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
    </Frame>
  );
}

/** 4 - scan the QR code on the computer with the phone. */
export function ScanQr() {
  return (
    <Frame label="A QR code on the computer screen and a phone camera scanning it">
      <Pc x={12} y={20} w={190} h={120}>
        <text x={107} y={48} textAnchor="middle" fontSize={9} fontWeight={700} fill={BLACK}>
          Scan the QR code
        </text>
        <QrGlyph x={79} y={56} size={56} />
        <Button x={72} y={118} w={70} label="Next" />
      </Pc>
      <Phone x={222} y={26}>
        <rect x={228} y={42} width={70} height={92} rx={6} fill={SOFT} />
        <path d="M238 62 v-10 h10 M288 52 h10 v10 M298 114 v10 h-10 M248 124 h-10 v-10" fill="none" stroke={CYAN} strokeWidth={2.5} strokeLinecap="round" />
        <QrGlyph x={246} y={70} size={34} />
      </Phone>
    </Frame>
  );
}

/** 5 - type the number the computer shows into the phone. */
export function MatchNumber() {
  return (
    <Frame label="The computer shows a two-digit number; the phone asks for that number and has a Yes button">
      <Pc x={12} y={20} w={190} h={120}>
        <text x={107} y={46} textAnchor="middle" fontSize={9} fontWeight={700} fill={BLACK}>
          Approve the sign-in
        </text>
        <text x={107} y={96} textAnchor="middle" fontSize={40} fontWeight={700} fill={BLUE}>
          47
        </text>
        <text x={107} y={118} textAnchor="middle" fontSize={7.5} fill={GREY}>
          Enter this number in the app
        </text>
      </Pc>
      <Phone x={222} y={26}>
        <text x={263} y={50} textAnchor="middle" fontSize={7} fontWeight={700} fill={BLACK}>
          Sign in?
        </text>
        <rect x={236} y={60} width={54} height={20} rx={5} fill="#fff" stroke={BLUE} strokeWidth={1.5} />
        <text x={263} y={74} textAnchor="middle" fontSize={11} fontWeight={700} fill={BLACK}>
          47
        </text>
        <Button x={236} y={92} w={54} label="Yes" />
        <Button x={236} y={116} w={54} label="No" filled={false} />
      </Phone>
    </Frame>
  );
}

/** 6 - done; from now on, approve on the phone when signing in. */
export function SignedIn() {
  return (
    <Frame label="Invoice Portal open on the computer after the sign-in was approved on the phone">
      <Pc x={12} y={20} w={190} h={120}>
        <rect x={12} y={34} width={190} height={22} fill={BLUE} />
        <text x={24} y={49} fontSize={10} fontWeight={700} fill="#fff">
          Invoice Portal
        </text>
        <circle cx={107} cy={92} r={18} fill="#E6EEF8" />
        <path d="M98 92 l7 7 l13 -15" fill="none" stroke={BLUE} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <text x={107} y={126} textAnchor="middle" fontSize={8} fill={GREY}>
          You are signed in
        </text>
      </Pc>
      <Phone x={222} y={26}>
        <AppIcon x={247} y={54} size={32} />
        <text x={263} y={106} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={BLACK}>
          Sign-in approved
        </text>
        <Button x={236} y={122} w={54} label="Done" />
      </Phone>
    </Frame>
  );
}

export const MFA_ILLUSTRATIONS = [PcPrompt, PhoneStore, PhoneAddAccount, ScanQr, MatchNumber, SignedIn];
