"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Receipt } from "lucide-react";

const TABS = [
  { href: "/invoices", label: "Expenses", Icon: Receipt },
  { href: "/invoices/patent-rd", label: "Patent & R&D", Icon: FlaskConical },
] as const;

/**
 * Switches between the screens that issue invoices from a monthly Excel file.
 * A segmented control: the open screen is the raised white tab, in HOYA Blue.
 */
export function InvoiceTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Invoice type"
      className="inline-flex max-w-full items-center gap-1 rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 md:px-5 py-2 text-sm font-semibold whitespace-nowrap transition-all duration-300 ease-in-out ${
              active
                ? "bg-white dark:bg-slate-950 text-[#0057BC] dark:text-[#00A3DE] shadow-md ring-1 ring-[#0057BC]/15 dark:ring-[#00A3DE]/30"
                : "text-slate-600 dark:text-slate-300 hover:text-[#2D2A28] dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
