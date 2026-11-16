"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * **"Hide header"** - the app header, the Read-only banner above it and a
 * screen's filter rows folded away to give the table the height, with a slim
 * strip left behind holding "Show header".
 *
 * Written for For IIR (2026-09-27) and lifted here when Meeting in MD asked for
 * the same (2026-09-29): two screens and `AreaGate`'s banner read one store, so
 * the banner cannot stay up while the header it sits on is gone (rule 20).
 *
 * The screens that offer it, by path, each with the key this browser keeps the
 * choice under. A `Map`, never an object: the key is a pathname (rule 4).
 * For IIR's key is the one it has always used, so a choice already remembered
 * there survives the move.
 */
const HEADER_HIDDEN_KEYS = new Map<string, string>([
  ["/summary/for-iir", "for-iir:header-hidden"],
  ["/summary/by-theme", "by-theme:header-hidden"],
]);

const CHANGE_EVENT = "header-hidden:change";

/* Storage can throw (a private window, blocked site data): then the choice
   still works for this visit, from memory, and is not remembered. */
const inMemory = new Map<string, boolean>();

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return inMemory.get(key) ?? false;
  }
}

function write(key: string, hidden: boolean): void {
  inMemory.set(key, hidden);
  try {
    window.localStorage.setItem(key, hidden ? "1" : "0");
  } catch {
    /* not remembered */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Whether the current screen's header is hidden, and the toggle. `hidden` is
 * always false on a screen that does not offer it (and `toggle` does nothing),
 * so `AreaGate` can ask on every page. The server's answer is "shown", so the
 * server render and the first client render agree (rule 43).
 */
export function useHeaderHidden(): { hidden: boolean; toggle: () => void } {
  const key = HEADER_HIDDEN_KEYS.get(usePathname() ?? "");
  const hidden = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : false),
    () => false
  );
  const toggle = () => {
    if (key) write(key, !hidden);
  };
  return { hidden, toggle };
}
