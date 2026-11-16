"use client";

import Link from "next/link";
import { FileText, Building2, Settings } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { CopyrightNotice } from "@/components/ui/CopyrightNotice";
import { GlassCard } from "@/components/ui/GlassCard";
import { adminDestinationsFor } from "@/components/admin/destinations";
import { useAuth } from "@/components/providers/AuthProvider";
import { useEffectivePermissions } from "@/hooks/useRolePermissions";
import { levelFor } from "@/lib/auth/permissions";

/**
 * Home (prototype). One card per screen the signed-in role may open - the same
 * role table the menu reads (rule 5). Replace the cards as screens are built.
 */
export default function DashboardPage() {
  const { role } = useAuth();
  const permissions = useEffectivePermissions();
  const open = (areaId: string) => levelFor(permissions, role, areaId) !== "none";
  const admin = adminDestinationsFor(role, permissions);

  const cards = [
    { show: open("invoices"), href: "/invoices", icon: FileText, title: "Invoices", text: "請求書の作成・発行・管理" },
    { show: open("customers"), href: "/customers", icon: Building2, title: "Customers", text: "取引先マスタ" },
  ].filter((card) => card.show);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#2D2A28]">
      <Header />
      <main className="flex-1 py-8 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-[#2D2A28] dark:text-white">Invoice Portal</h1>
          <p className="text-base md:text-lg text-[#B0B5B5] mt-2 mb-6">請求書作成ポータル</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {cards.map(({ href, icon: Icon, title, text }) => (
              <Link key={href} href={href}>
                <GlassCard className="p-5 transition-all duration-300 ease-in-out hover:shadow-xl">
                  <Icon className="w-6 h-6 text-[#0057BC] dark:text-[#00A3DE] mb-3" />
                  <p className="font-semibold text-[#2D2A28] dark:text-white">{title}</p>
                  <p className="text-sm text-[#B0B5B5] mt-1">{text}</p>
                </GlassCard>
              </Link>
            ))}
          </div>

          {admin.length > 0 && (
            <>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-[#2D2A28] dark:text-white mt-8 mb-3">
                <Settings className="w-5 h-5" /> Admin
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {admin.map(({ href, icon: Icon, label, description }) => (
                  <Link key={href} href={href}>
                    <GlassCard className="p-4 transition-all duration-300 ease-in-out hover:shadow-xl">
                      <Icon className="w-5 h-5 text-[#0057BC] dark:text-[#00A3DE] mb-2" />
                      <p className="font-semibold text-[#2D2A28] dark:text-white">{label}</p>
                      <p className="text-sm text-[#B0B5B5] mt-1">{description}</p>
                    </GlassCard>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <CopyrightNotice />
    </div>
  );
}
