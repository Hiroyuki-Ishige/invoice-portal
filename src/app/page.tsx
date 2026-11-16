"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { carriesAuthResponse, signInHref } from "@/lib/auth/return-path";
import {
  DollarSign,
  Factory,
  ArrowRight,
  FilePenLine,
  FileText,
  TrendingUp,
  BarChart3,
  LogIn,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { CopyrightNotice } from "@/components/ui/CopyrightNotice";
import { AppName } from "@/components/ui/AppName";
import { BusyRing } from "@/components/ui/Loading";
import { useAuth } from "@/components/providers/AuthProvider";

function HeroConnector({ from, to, delayed = false }: { from: string; to: string; delayed?: boolean }) {
  return (
    <div
      aria-hidden
      className="relative w-4 sm:w-8 md:w-12 h-0.5"
      style={{ backgroundImage: `linear-gradient(to right, ${from}, ${to})` }}
    >
      <ArrowRight
        className={`${delayed ? "animate-hero-travel-delayed" : "animate-hero-travel"} absolute top-1/2 left-0 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 opacity-0`}
        style={{ color: to }}
        strokeWidth={2.5}
      />
    </div>
  );
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * MD Brand Colors:
 * - HOYA Blue: #0057BC (Primary)
 * - Cyan Blue: #00A3DE (Accent)
 * - Cool Grey: #B0B5B5 (Secondary)
 * - Warm Black: #2D2A28 (Text)
 * - White: #FFFFFF (Background)
 */

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  /* Read from `location`, so the server answers `false`: the static HTML is
     the same for everybody, and the hash is never sent to it anyway. */
  const returningFromSignIn = useSyncExternalStore(
    subscribeToHash,
    () => carriesAuthResponse(window.location.hash),
    () => false
  );

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-gradient-to-b from-[#f8fafc] to-white dark:from-[#1a1918] dark:to-[#2D2A28]">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-[#2D2A28] dark:text-white mb-4 md:mb-6 leading-tight">
              Invoices,{" "}
              <span className="text-[#0057BC]">
                made simple
              </span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-[#B0B5B5] mb-8 md:mb-12 max-w-3xl mx-auto leading-relaxed px-2">
              Create, issue and manage invoices in one place - customers, line items and amounts, for the whole team.
            </p>

            {/* Create -> Invoice -> Payment. An arrow travels along each connector in
                turn (the second half a cycle behind the first), so the row reads
                as an invoice being written and then paid. */}
            <div className="flex items-center justify-center gap-3 sm:gap-6 md:gap-10 mb-6 md:mb-8 py-4 md:py-8">
              {/* Create */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-[#0057BC]/10 rounded-xl md:rounded-2xl flex items-center justify-center">
                <FilePenLine className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#0057BC]" />
              </div>

              <HeroConnector from="#0057BC" to="#00A3DE" />

              {/* The invoice */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-[#00A3DE]/10 rounded-xl md:rounded-2xl flex items-center justify-center">
                <FileText className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#00A3DE]" />
              </div>

              <HeroConnector from="#00A3DE" to="#0057BC" delayed />

              {/* Get paid */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-[#0057BC]/10 rounded-xl md:rounded-2xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#0057BC]" />
              </div>
            </div>

            {/* Large Sign In Button - Only show when not authenticated.

                **Not until it is known that nobody is signed in.** While
                `isLoading` it is laid out but `invisible` - the same height, so
                nothing below it jumps, and out of reach of a click or a Tab.
                Before 2026-10-11 it was drawn disabled at half opacity instead,
                which on the way back from Microsoft is the button somebody has
                just pressed, offered again: this page is where the callback
                lands, and it stays loading until MSAL has moved on
                (`carriesAuthResponse`). There it says what is happening. */}
            {!isAuthenticated && (
              <div className="relative mb-8 md:mb-10 px-4">
                {isLoading && returningFromSignIn && (
                  <div
                    role="status"
                    className="absolute inset-0 flex items-center justify-center gap-3 text-base md:text-lg text-slate-500 dark:text-slate-400"
                  >
                    <BusyRing size={24} />
                    <span>Signing you in...</span>
                  </div>
                )}
                <div className={isLoading ? "invisible" : undefined}>
                  <button
                    /* `/sign-in` owns starting one and saying when it did not
                       start - see `signInHref`. */
                    onClick={() => {
                      window.location.href = signInHref(
                        window.location.pathname + window.location.search
                      );
                    }}
                    className="
                      inline-flex items-center justify-center gap-2 sm:gap-3
                      px-6 sm:px-8 md:px-10 py-3.5 sm:py-4 md:py-5
                      w-full sm:w-auto
                      bg-gradient-to-r from-[#0057BC] to-[#00A3DE]
                      hover:from-[#004a9e] hover:to-[#008bc2]
                      text-white text-base sm:text-lg md:text-xl lg:text-2xl font-semibold
                      rounded-xl md:rounded-2xl
                      shadow-lg shadow-[#0057BC]/30
                      hover:shadow-xl hover:shadow-[#0057BC]/40
                      transform hover:scale-105
                      transition-all duration-300
                    "
                  >
                    <LogIn className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8" />
                    <span>Sign In to Get Started</span>
                  </button>
                  <p className="mt-3 md:mt-4 text-sm md:text-base text-[#B0B5B5]">
                    Sign in with your Office 365 account
                  </p>
                </div>
              </div>
            )}

            {/* Feature Pills */}
            <div className="flex flex-wrap justify-center gap-3">
              <FeaturePill icon={<Factory className="w-4 h-4" />} text="Customers" />
              <FeaturePill icon={<DollarSign className="w-4 h-4" />} text="Invoice creation" />
              <FeaturePill icon={<BarChart3 className="w-4 h-4" />} text="Issue tracking" />
              <FeaturePill icon={<TrendingUp className="w-4 h-4" />} text="Reports" />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 md:px-6 border-t border-[#B0B5B5]/30 bg-[#f8fafc] dark:bg-[#1a1918]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3 text-[#2D2A28] dark:text-white">
              <DollarSign className="w-7 h-7 text-[#0057BC]" />
              <AppName className="text-lg font-semibold" />
            </div>
            <div className="flex items-center gap-6">
              <Link
                href="/admin"
                className="text-base text-[#B0B5B5] hover:text-[#0057BC] transition-colors"
              >
                Admin Tools
              </Link>
              <CopyrightNotice className="text-base text-[#B0B5B5]" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeaturePill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <span className="text-[#00A3DE]">{icon}</span>
      <span className="text-sm text-[#B0B5B5]">{text}</span>
    </div>
  );
}
