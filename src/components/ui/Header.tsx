"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogIn, LogOut, Moon, Sun, ChevronDown } from "lucide-react";
import { useRingiPreview } from "@/hooks/useRingiPreview";
import { PreviewChip } from "@/components/ui/PreviewChip";
import { areaForPath, levelFor } from "@/lib/auth/permissions";
import { useEffectivePermissions } from "@/hooks/useRolePermissions";
import { NavChildLink, isNavGroup, screenNameFor, useNavMenu } from "@/components/ui/nav-menu";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { useAuth } from "@/components/providers/AuthProvider";
import { signInHref } from "@/lib/auth/return-path";
import { useState, useEffect, useMemo } from "react";
import { AppName } from "@/components/ui/AppName";

/**
 * MD Brand Colors:
 * - HOYA Blue: #0057BC (Primary)
 * - Cyan Blue: #00A3DE (Accent)
 * - Cool Grey: #B0B5B5 (Secondary)
 * - Warm Black: #2D2A28 (Text)
 * - White: #FFFFFF (Background)
 */


export function Header() {
  const pathname = usePathname();
  const { user, logout, isAuthenticated, isLoading, role: userRole, userProfile } = useAuth();

  // Get user display name and first initial
  const displayName = userProfile?.displayName || user?.userMetadata?.displayName || user?.email?.split("@")[0] || "User";
  const firstInitial = displayName.charAt(0).toUpperCase();

  /* The one menu (`nav-menu`): the side rail draws it on a desktop, this header
     on a phone. The ringi is marked for a Ringi preview trial member. */
  const permissions = useEffectivePermissions();
  const { enabled: ringiInPreview } = useRingiPreview();
  const previewChip = (href: string) =>
    ringiInPreview && areaForPath(href)?.id === "invoices" ? <PreviewChip /> : null;
  const menuItems = useNavMenu();

  /* What to call the page in the chrome - the same list the menu draws, and
     **declared after it**: `tsc` does not see a `const` read above its own
     declaration from inside a closure, and the failure is total (rule 31). */
  const screenName = useMemo(() => screenNameFor(pathname, menuItems), [pathname, menuItems]);

  const [isDark, setIsDark] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  /**
   * The class is the source of truth - `globals.css` binds Tailwind's `dark:`
   * variant to it - and localStorage is what makes the choice survive a reload.
   * Without the write, the inline script in layout.tsx falls back to the OS
   * setting on the next page and silently undoes what was just clicked.
   */
  const toggleDarkMode = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Blocked storage costs the preference on the next load, not this click.
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        {/* Blue gradient top border */}
        <div className="h-1 bg-gradient-to-r from-[#0057BC] via-[#00A3DE] to-[#0057BC]" />
        <div className="flex items-center justify-between h-14 md:h-16 px-3 md:px-6">
          {/* Left: Logo and Nav */}
          <div className="flex items-center gap-2 md:gap-6">
            {/* Mobile menu button - only show when authenticated */}
            {isAuthenticated && (
              <button
                className="p-1.5 md:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg md:hidden"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <Menu className="w-5 h-5 md:w-6 md:h-6 text-slate-700 dark:text-slate-300" />
              </button>
            )}

            {/* Logo. The desktop menu is the side rail (`SideRail`), beside the page. */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Signed out, nothing stands before the name - the "CB" badge that
                  did was removed (asked for, 2026-09-27). */}
              {/* The app's name (`AppName`) - short enough for every width. */}
              <Link href="/dashboard" className="hover:opacity-80 transition-opacity shrink-0">
                <AppName className="text-base md:text-lg font-semibold text-slate-900 dark:text-white" />
              </Link>

              {/* **Where you are, after the brand and a hairline.**
                  A rule rather than a chip or a slash: a box would be a third
                  control in a row of two, and a slash reads as a path when this
                  is one name. The lighter weight and colour say it is a caption
                  of the brand beside it, not a second title - the screen's own
                  heading is a few pixels below and stays the loud one.
                  Hidden below `sm`, where the brand itself is already trimmed
                  to its name alone for room. */}
              {screenName && (
                <div className="hidden sm:flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden
                    className="h-4 w-px bg-slate-300 dark:bg-slate-600 shrink-0"
                  />
                  <span className="text-base font-medium text-slate-500 dark:text-slate-400 truncate">
                    {screenName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: User menu */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 md:p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="w-5 h-5 md:w-6 md:h-6" /> : <Moon className="w-5 h-5 md:w-6 md:h-6" />}
            </button>

            {isAuthenticated && user ? (
              <>
                {/* User info with avatar and role badge */}
                <div className="hidden sm:flex items-center gap-2.5">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-[#0057BC] flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">{firstInitial}</span>
                  </div>
                  {/* Name */}
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {displayName}
                  </span>
                  {/* Role badge. Three roles exist, and this used to print two:
                      anything that was not admin read "User", so an F&A-Admin -
                      who holds the IIR approval right - was shown as an ordinary
                      user while the admin list beside it said F&A. A badge that
                      contradicts the screen that grants the role is worse than
                      no badge, which is why this is now the same component that
                      list uses. */}
                  <RoleBadge role={userRole} />
                </div>

                {/* Sign Out button */}
                <button
                  onClick={logout}
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors hidden md:block"
                >
                  Sign Out
                </button>

                {/* Mobile logout icon */}
                <button
                  onClick={logout}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg md:hidden"
                  aria-label="Sign out"
                >
                  <LogOut className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
              </>
            ) : isLoading ? null : (
              /* Sign In button - **only once it is known nobody is signed in.**
                 It was drawn disabled while loading, which put a Sign In in the
                 header of every page a signed-in person opened, and of the
                 landing page the sign-in callback passes through (see
                 `carriesAuthResponse`).

                 **It goes to `/sign-in`, it does not start one here.**
                 `login()` returns only when the redirect did *not* happen, and
                 this button discarded that answer - so a refused sign-in left
                 an enabled button that did nothing, which is how it was
                 reported. The sign-in screen owns the watchdog and the wording
                 for every one of those cases (`signInHref`, rule 5). */
              <button
                onClick={() => {
                  window.location.href = signInHref(
                    window.location.pathname + window.location.search
                  );
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#0057BC] hover:bg-[#004494] text-white rounded-lg font-medium transition-colors"
                aria-label="Sign in with Office 365"
              >
                <LogIn className="w-5 h-5" />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation - only show when authenticated */}
        {isAuthenticated && isMobileMenuOpen && (
          <nav className="md:hidden px-4 pb-4 space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2 bg-slate-50 dark:bg-slate-800">
            {menuItems.map((item) => {
              if (isNavGroup(item)) {
                const isExpanded = expandedGroup === item.label;
                const isChildActive = item.children.some(
                  (child) => pathname === child.href || pathname.startsWith(child.href + "/")
                );
                return (
                  <div key={item.label}>
                    <button
                      onClick={() => setExpandedGroup(isExpanded ? null : item.label)}
                      className={`
                        flex items-center justify-between w-full px-4 py-3 rounded-lg text-base font-medium transition-colors
                        ${isChildActive
                          ? "bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#0057BC]/20 dark:text-[#00A3DE]"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <span className={isChildActive ? "text-[#0057BC] dark:text-[#00A3DE]" : "text-slate-500 dark:text-slate-400"}>
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {/* No height cap, for the reason on the sidebar group below:
                        `max-h-96` was "tall enough for the longest group" until
                        the Admin group outgrew it. A 0fr -> 1fr grid row reaches
                        the content's real height; `inert` keeps a closed group's
                        links out of the tab order. */}
                    <div
                      inert={!isExpanded}
                      className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="min-h-0 overflow-hidden">
                      <div className="ml-4 mt-1 space-y-1">
                        {item.children.map((child) => (
                          <NavChildLink
                            key={child.href}
                            child={child}
                            siblings={item.children}
                            pathname={pathname}
                            onNavigate={() => {
                              setIsMobileMenuOpen(false);
                              setExpandedGroup(null);
                            }}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                            activeClassName="bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#0057BC]/20 dark:text-[#00A3DE]"
                            idleClassName="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                          />
                        ))}
                      </div>
                      </div>
                    </div>
                  </div>
                );
              }
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors
                    ${isActive
                      ? "bg-[#0057BC]/10 text-[#0057BC] dark:bg-[#0057BC]/20 dark:text-[#00A3DE]"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }
                  `}
                >
                  <span className={isActive ? "text-[#0057BC] dark:text-[#00A3DE]" : "text-slate-500 dark:text-slate-400"}>
                    {item.icon}
                  </span>
                  {item.label}
                  {previewChip(item.href)}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
    </>
  );
}

export default Header;
