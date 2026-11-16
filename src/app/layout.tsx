import type { Metadata } from "next";
import { APP_NAME, APP_TAGLINE } from "@/components/ui/AppName";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AreaGate } from "@/components/auth/AreaGate";
import { SideRailFrame } from "@/components/ui/SideRail";
import { AccountGate } from "@/components/auth/AccountGate";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} - ${APP_TAGLINE}`,
  description: "Create and manage invoices",
};

/**
 * Applies the theme before the browser paints.
 *
 * It has to be inline and it has to run here. Setting the class from a React
 * effect happens after first paint, so a dark-mode user gets a white flash on
 * every page load - and on this app that white is a full-screen one.
 *
 * A stored choice wins; with nothing stored it follows the operating system, so
 * the behaviour before the toggle worked is what a first visit still gets.
 * Wrapped in try/catch because localStorage throws outright when cookies are
 * blocked, and a theme is not worth a blank page.
 */
const THEME_INIT = `
try {
  var stored = localStorage.getItem("theme");
  var dark = stored ? stored === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className={`${spaceGrotesk.className} min-h-full flex flex-col`}>
        <AuthProvider>
          {/*
            The assistant sits in the layout, not in a page. A layout preserves
            state across navigations and a page does not, so this is what lets
            somebody ask a question, click through to the report it was about,
            and still have the answer on screen.
          */}
          
            {/*
              Inside AssistantProvider because the gate's own screen is a page
              like any other, and outside nothing else: an account this app has
              no record of gets the sentence, not the chatbot and not a menu.
            */}
            <AccountGate>
              {/* The role permission table, applied to whichever screen is
                  open (`components/auth/AreaGate`). */}
              <SideRailFrame>
                <AreaGate>{children}</AreaGate>
              </SideRailFrame>
            </AccountGate>
          
        </AuthProvider>
      </body>
    </html>
  );
}
