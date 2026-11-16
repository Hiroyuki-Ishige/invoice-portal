"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { carriesAuthResponse, signInHref } from "@/lib/auth/return-path";
import {
  DollarSign,
  Factory,
  Cog,
  TrendingUp,
  BarChart3,
  LogIn,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { CopyrightNotice } from "@/components/ui/CopyrightNotice";
import { AppName } from "@/components/ui/AppName";
import { BusyRing } from "@/components/ui/Loading";
import { useAuth } from "@/components/providers/AuthProvider";

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
              請求書を、{" "}
              <span className="text-[#0057BC]">
                かんたんに作成
              </span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-[#B0B5B5] mb-8 md:mb-12 max-w-3xl mx-auto leading-relaxed px-2">
              請求書の作成・発行・管理をひとつの画面で。取引先、明細、金額計算まで、チーム全員で使えるポータルです。
            </p>

            {/* Simple Animation - Three Icons */}
            <div className="flex items-center justify-center gap-3 sm:gap-6 md:gap-10 mb-6 md:mb-8 py-4 md:py-8">
              {/* Factory Icon */}
              <div className="animate-hero-float w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-[#0057BC]/10 rounded-xl md:rounded-2xl flex items-center justify-center">
                <Factory className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#0057BC]" />
              </div>

              {/* Arrow */}
              <div className="w-4 sm:w-8 md:w-12 h-0.5 bg-gradient-to-r from-[#0057BC] to-[#00A3DE]" />

              {/* Gear Icon */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-[#00A3DE]/10 rounded-xl md:rounded-2xl flex items-center justify-center">
                <Cog className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#00A3DE] animate-spin" style={{ animationDuration: '10s' }} />
              </div>

              {/* Arrow */}
              <div className="w-4 sm:w-8 md:w-12 h-0.5 bg-gradient-to-r from-[#00A3DE] to-[#0057BC]" />

              {/* Chart Icon */}
              <div className="animate-hero-float-delayed w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-[#0057BC]/10 rounded-xl md:rounded-2xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#0057BC]" />
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
              <FeaturePill icon={<Factory className="w-4 h-4" />} text="取引先" />
              <FeaturePill icon={<DollarSign className="w-4 h-4" />} text="請求書作成" />
              <FeaturePill icon={<BarChart3 className="w-4 h-4" />} text="発行状況の管理" />
              <FeaturePill icon={<TrendingUp className="w-4 h-4" />} text="集計・レポート" />
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
