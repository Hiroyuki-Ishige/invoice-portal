import { useEffect, RefObject, useCallback } from "react";

/**
 * Hook to detect clicks outside of a referenced element
 *
 * @param ref - React ref to the element to monitor
 * @param handler - Callback function to execute when clicking outside
 * @param enabled - Optional flag to enable/disable the listener (default: true)
 *
 * @example
 * ```tsx
 * const dropdownRef = useRef<HTMLDivElement>(null);
 * useClickOutside(dropdownRef, () => setIsOpen(false));
 * ```
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled: boolean = true
): void {
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (ref.current && !ref.current.contains(target)) {
        handler();
      }
    },
    [ref, handler]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("mousedown", handleClickOutside, {
      passive: true,
    });
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside, enabled]);
}

export default useClickOutside;
