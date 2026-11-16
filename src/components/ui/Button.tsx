import { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * MD Brand Colors:
 * - HOYA Blue: #0057BC (Primary)
 * - Cyan Blue: #00A3DE (Accent)
 * - Cool Grey: #B0B5B5 (Secondary)
 * - Warm Black: #2D2A28 (Text)
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

/**
 * **The fill a primary action wears** - HOYA Blue, darkening on hover, white on it.
 *
 * Exported because it is now written in nine places and this is the first
 * (rule 20). The ringi form's own Save Changes reached the same three classes
 * independently; every admin screen's Save reached `bg-slate-900
 * dark:bg-white` instead, which is `slate-*` carrying meaning - and rule 33
 * says slate is structure only. So the admin buttons were the outliers, not
 * this one, and pointing them here converges them on a look the app already
 * had rather than inventing a tenth.
 *
 * **No `dark:` variant, deliberately.** White on `#0057BC` is **6.80:1** in
 * either theme, which is AA with room. The obvious dark-mode swap is Cyan Blue,
 * and it fails: white on `#00A3DE` is **2.88:1**. Dark text on Cyan Blue does
 * pass at **4.95:1**, but a primary action that changes hue between themes is
 * two looks for one meaning, and the ringi's Approve button already refused
 * that trade for the same measured reason.
 *
 * Geometry is **not** here - padding, radius and the disabled state belong to
 * each button, which sits on a different ground (a white admin page, a blue
 * app bar). What is shared is the one decision: this is the strongest thing
 * on the screen.
 */
export const PRIMARY_ACTION_FILL = "bg-[#0057BC] hover:bg-[#004494] text-white";

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    ${PRIMARY_ACTION_FILL}
    shadow-sm hover:shadow-md
    active:scale-[0.98]
  `,
  secondary: `
    bg-white hover:bg-[#f8fafc]
    dark:bg-[#2D2A28] dark:hover:bg-[#3a3734]
    text-[#2D2A28] dark:text-white
    border border-[#B0B5B5]/50 hover:border-[#0057BC]/50
    active:scale-[0.98]
  `,
  ghost: `
    bg-transparent hover:bg-[#0057BC]/5
    dark:hover:bg-[#0057BC]/10
    text-[#2D2A28] dark:text-white
  `,
  danger: `
    bg-red-600 hover:bg-red-700
    text-white
    shadow-sm hover:shadow-md
    active:scale-[0.98]
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm gap-2",
  md: "px-5 py-2.5 text-base gap-2",
  lg: "px-6 py-3 text-lg gap-3",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center
        font-medium
        rounded-lg
        transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-[#0057BC] focus:ring-offset-2
        dark:focus:ring-offset-[#2D2A28]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

export default Button;
