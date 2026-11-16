import { ReactNode } from "react";

/**
 * MD Brand Colors:
 * - HOYA Blue: #0057BC (Primary)
 * - Cyan Blue: #00A3DE (Accent)
 * - Cool Grey: #B0B5B5 (Secondary)
 * - Warm Black: #2D2A28 (Text)
 */

type BadgeVariant = "ordinary" | "extra" | "default" | "success" | "warning" | "error";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  ordinary: "bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#0057BC]/20 dark:text-[#00A3DE]",
  extra: "bg-[#00A3DE]/10 text-[#00A3DE] dark:bg-[#00A3DE]/20 dark:text-[#00A3DE]",
  default: "bg-[#B0B5B5]/20 text-[#2D2A28] dark:bg-[#B0B5B5]/10 dark:text-white",
  success: "bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#00A3DE]/15 dark:text-[#00A3DE]",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center
        px-3 py-1
        text-sm font-medium
        rounded-full
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

export default Badge;
