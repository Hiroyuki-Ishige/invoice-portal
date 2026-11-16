"use client";

import { Header } from "@/components/ui/Header";

/** Placeholder - the screen is not built yet (rule 10: say so on the screen). */
export default function Page() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-8 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Customers</h1>
          <p className="text-base text-[#B0B5B5] mt-2">取引先マスタはここに作ります。（未実装）</p>
        </div>
      </main>
    </div>
  );
}
