import { ReactNode } from "react";

/**
 * MD Brand Colors:
 * - HOYA Blue: #0057BC (Primary)
 * - Cool Grey: #B0B5B5 (Secondary)
 * - Warm Black: #2D2A28 (Text)
 */

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

export function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <div
      className={`
        bg-white dark:bg-[#1a1918]
        border border-[#B0B5B5]/20 dark:border-[#B0B5B5]/10
        rounded-xl
        shadow-sm
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export default GlassCard;
