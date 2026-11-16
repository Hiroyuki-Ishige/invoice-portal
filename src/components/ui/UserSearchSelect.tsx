"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, X, Loader2, Plus } from "lucide-react";
import { isImeComposing } from "@/lib/utils/ime";

/** Space the results list keeps from the edge of the window. */
const VIEWPORT_MARGIN = 8;
/** Below this, opening downwards is not worth it - flip above the input. */
const MIN_MENU_HEIGHT = 180;
/** Long enough to show every result the search returns without filling the screen. */
const MAX_MENU_HEIGHT = 360;

export interface Office365User {
  id: string;
  displayName: string;
  mail?: string | null;
  email?: string;
  userPrincipalName?: string;
  jobTitle?: string | null;
  department?: string | null;
  givenName?: string | null;
  surname?: string | null;
}

interface UserSearchSelectProps {
  selectedUser: Office365User | null;
  onSelect: (user: Office365User | null) => void;
  getAccessToken: () => Promise<string | null>;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean; // Smaller height for inline use
  /**
   * Show the name alone in the selected-user box, with no second line.
   *
   * For callers that already print the title and email **beside** the box. The
   * second line inside it was then the same fact twice, in a narrower space, so
   * it was the copy that got truncated - "Divisional President, Me..." next to a
   * full one. Only affects what is shown once somebody is picked; the results
   * list still carries the title, which is how you tell two people apart while
   * choosing.
   */
  nameOnly?: boolean;
  /**
   * What the box is **for**, said by its icon.
   *
   * A magnifier says "search"; under a stage that already has somebody on it,
   * this control is not a search box that happens to add people, it is the way
   * to add another - and `"plus"` is the mark every list in every app uses for
   * that. The search still works identically; only the affordance changes.
   */
  leadIcon?: "search" | "plus";
  /**
   * **Offer the ✕ that clears the person** (default true).
   *
   * False where taking somebody off has its own control that asks first and
   * saves - Step 2's PIC of SCM card, whose bin is "Remove and save"
   * (2026-11-09). There the ✕ was a second way to remove a PIC: no question,
   * nothing saved, the row left empty - the quiet path beside the careful one.
   */
  clearable?: boolean;
}

export function UserSearchSelect({
  selectedUser,
  onSelect,
  getAccessToken,
  placeholder = "Type to search users...",
  disabled = false,
  compact = false,
  nameOnly = false,
  leadIcon = "search",
  clearable = true,
}: UserSearchSelectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<Office365User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Where the results list sits. It is rendered into <body>, so its position is
  // measured from the input rather than inherited - see the portal below.
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  // Close dropdown when clicking outside. The list is not a DOM descendant of
  // the container any more, so it has to be checked separately or every click
  // on a result would count as "outside" and close the list before it lands.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
      setHighlightedIndex(-1);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /**
   * Place the list against the window, not against the card it sits in.
   *
   * The approver picker is the last row of the last card on the page, so a list
   * that always opened downwards ran off the bottom of the screen and only two
   * of fifteen results could be read. It now opens upwards when there is more
   * room there, and is only ever as tall as the space it has.
   */
  const updateMenuPosition = useCallback(() => {
    const anchor = containerRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const above = rect.top - VIEWPORT_MARGIN;
    const openUpwards = below < MIN_MENU_HEIGHT && above > below;
    const available = openUpwards ? above : below;

    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(MAX_MENU_HEIGHT, Math.max(available, 0)),
      ...(openUpwards
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  /*
   * Follow the input while the page moves. `capture` catches scrolling in any
   * ancestor, not just the window - the approval detail page scrolls a <main>.
   *
   * **Throttled to one frame.** A scroll event fires far more often than the
   * screen is painted, and each one here costs a `getBoundingClientRect()` - a
   * forced layout - plus a `setState` and the re-render that follows. Coalescing
   * to `requestAnimationFrame` means at most one of those per painted frame,
   * which is all a menu that has to look attached to its input needs. Found by
   * review, 2026-09-13; every picker in the app uses this component.
   */
  useLayoutEffect(() => {
    if (!isOpen) return;

    let frame = 0;
    const onMove = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateMenuPosition();
      });
    };

    updateMenuPosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [isOpen, updateMenuPosition]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Search users via API
  const searchUsers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setUsers([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setError("Sign in again to search users");
        setUsers([]);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=15`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Search failed (${response.status})`);
      }

      const data = await response.json();
      setUsers(data.users || []);
      setIsOpen(true);
      setHighlightedIndex(-1);
    } catch (err) {
      console.error("[UserSearch] Error:", err);
      setError(err instanceof Error ? err.message : "Search failed");
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search (300ms)
    debounceRef.current = setTimeout(() => {
      searchUsers(newValue);
    }, 300);
  };

  /* Above the key handler and in its dependencies: it closes over `onSelect`,
     so declared after and left out of the list, Enter called the `onSelect` of
     whichever render last changed the results. */
  const handleSelectUser = useCallback(
    (user: Office365User) => {
      onSelect(user);
      setSearchQuery("");
      setIsOpen(false);
      setHighlightedIndex(-1);
      setUsers([]);
    },
    [onSelect]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      /* Every key, not only Enter: during a Japanese conversion the arrows pick
         a candidate and the Enter accepts it, and here that Enter added the
         first directory match as a recipient (rule 45; the one picker the
         2026-09-18 sweep missed, found by review 2026-10-24). */
      if (isImeComposing(e)) return;
      if (!isOpen || users.length === 0) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < users.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          /* **Nothing highlighted means the first result, not nothing.**
             `highlightedIndex` starts at -1 and only moves when somebody
             presses an arrow or hovers a row, so typing a full name and
             pressing Enter - which is how a person adds a recipient - did
             nothing at all, silently, with the match sitting right there on
             screen. Reported on the Step 3 email composer, where both address
             fields looked broken; it is every picker in the app.

             The first result is what every mail client picks, and this list is
             ordered by the directory's own match. An inert Enter is the worse
             answer even when the guess is wrong: a wrong chip is visible and
             one click to remove. */
          if (users.length > 0) {
            handleSelectUser(users[highlightedIndex >= 0 ? highlightedIndex : 0]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, users, highlightedIndex, handleSelectUser]
  );

  const handleClear = () => {
    onSelect(null);
    setSearchQuery("");
    setUsers([]);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (searchQuery.length >= 2 && users.length > 0) {
      setIsOpen(true);
    }
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Get email from user object
  const getEmail = (user: Office365User) => {
    return user.email || user.mail || user.userPrincipalName || "";
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Selected User Display */}
      {selectedUser && !isOpen ? (
        <div
          /* **A person already chosen is still a box you can change.** The
             ringi form paints a brand line round anything editable
             (`.ringi-form` in globals.css), and a selector cannot find this
             one: with somebody in it the picker is a filled `<div>`, not an
             `<input>`. Stamped only when this picker was not handed
             `disabled` - the fieldset case the stylesheet handles itself. */
          {...(disabled ? {} : { "data-field-box": "" })}
          className={`flex items-center border border-slate-200 dark:border-slate-600 ${
          compact
            ? "gap-2 px-2 py-1 bg-white dark:bg-slate-800 rounded-lg"
            : "gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700 rounded-xl"
          }`}
        >
          <div className={`flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium flex-shrink-0 ${
            compact ? "w-6 h-6 text-[10px]" : "w-10 h-10 text-sm"
          }`}>
            {getInitials(selectedUser.displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-medium text-slate-900 dark:text-white truncate ${compact ? "text-sm" : ""}`}>
              {selectedUser.displayName}
            </div>
            {nameOnly ? null : compact ? (
              /* Compact mode: show job title inline */
              selectedUser.jobTitle && (
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {selectedUser.jobTitle}
                </div>
              )
            ) : (
              /* Full mode: show email and job title */
              <>
                <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                  {getEmail(selectedUser)}
                </div>
                {selectedUser.jobTitle && (
                  <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                    {selectedUser.jobTitle}
                  </div>
                )}
              </>
            )}
          </div>
          {/* Not rendered at all when it cannot clear, rather than greyed out.
              A faded X still reads as "you may clear this", and on the ringi
              route it sat beside people the viewer must not be able to remove.

              **Two ways to be disabled, and only one of them is this prop.**
              Most of this app closes a picker by wrapping the step in
              `<fieldset disabled>` and never passing `disabled` here at all -
              which natively disables this button, so the X was inert, visible,
              and pointed at (2026-09-10, Step 3's Applicant, fixed on Step 1).
              `disabled:hidden` is the half the prop cannot see: a control inside
              a disabled fieldset matches `:disabled` itself, so the mark goes
              wherever the act is refused, with nothing threaded through a
              caller (rules 21, 36). */}
          {!disabled && clearable && (
          <button
            type="button"
            onClick={handleClear}
            className={`text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors disabled:hidden ${
              compact ? "p-0.5" : "p-1.5 rounded-lg"
            }`}
            title="Clear selection"
          >
            <X className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </button>
          )}
        </div>
      ) : (
        /* Search Input */
        <div className="relative">
          {leadIcon === "plus" ? (
            <Plus
              aria-hidden="true"
              className={`absolute top-1/2 -translate-y-1/2 text-[#0057BC] dark:text-[#00A3DE] ${
                compact ? "left-2.5 w-4 h-4" : "left-4 w-5 h-5"
              }`}
            />
          ) : (
            <Search className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${
              compact ? "left-2.5 w-4 h-4" : "left-4 w-5 h-5"
            }`} />
          )}
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              compact
                ? "pl-8 pr-7 py-1.5 text-sm rounded-lg"
                : "pl-12 pr-10 py-3 rounded-xl"
            }`}
          />
          {isLoading && (
            <Loader2 className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#0057BC] animate-spin ${
              compact ? "w-4 h-4" : "w-5 h-5"
            }`} />
          )}
          {searchQuery && !isLoading ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setUsers([]);
                setIsOpen(false);
              }}
              className={`absolute top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors ${
                compact ? "right-2" : "right-4"
              }`}
            >
              <X className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            </button>
          ) : null}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">
          {error}
        </p>
      )}

      {/* Dropdown. Rendered into <body> so no card, dialog or scroll container
          on the page can clip it, and positioned from the input's own rect. */}
      {isOpen && !selectedUser && menuStyle && typeof document !== "undefined" &&
        createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[100] flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden"
        >
          {users.length === 0 ? (
            <div className={`text-center text-slate-500 dark:text-slate-400 ${compact ? "p-2 text-xs" : "p-3 text-sm"}`}>
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className={`animate-spin ${compact ? "w-3 h-3" : "w-4 h-4"}`} />
                  <span>Searching...</span>
                </div>
              ) : searchQuery.length < 2 ? (
                <p>Type at least 2 characters</p>
              ) : (
                <p>No users found</p>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {users.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelectUser(user)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full flex items-center text-left transition-colors ${
                    highlightedIndex === index
                      ? "bg-slate-100 dark:bg-slate-700"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  } ${compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2"}`}
                >
                  <div className={`flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium flex-shrink-0 ${
                    compact ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs"
                  }`}>
                    {getInitials(user.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-slate-900 dark:text-white truncate ${compact ? "text-xs" : "text-sm"}`}>
                      {user.displayName}
                    </div>
                    <div className={`text-slate-500 dark:text-slate-400 truncate ${compact ? "text-[10px]" : "text-xs"}`}>
                      {compact ? (
                        /* Compact mode: show job title only */
                        user.jobTitle || getEmail(user)
                      ) : (
                        /* Full mode: show email and job title */
                        <>
                          {getEmail(user)}
                          {user.jobTitle && ` · ${user.jobTitle}`}
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Helper text - hidden in compact mode */}
      {!compact && !selectedUser && !isOpen && !error && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          Type at least 2 characters to search
        </p>
      )}
    </div>
  );
}
