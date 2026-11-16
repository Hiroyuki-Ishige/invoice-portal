/**
 * Rich Text Editor Constants
 *
 * Centralized configuration for the RichTextEditor component
 */

/** Text color options for the color picker */
export const TEXT_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Red", value: "#ef4444" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#22c55e" },
  { name: "Orange", value: "#f97316" },
  { name: "Purple", value: "#a855f7" },
] as const;

/** Highlight color options for the highlight picker */
export const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
] as const;

/** DOMPurify configuration for sanitizing HTML */
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "b",
    "i",
    "u",
    "strong",
    "em",
    "span",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "a",
    "font",
    "div",
  ] as string[],
  ALLOWED_ATTR: ["href", "target", "rel", "color"] as string[], // "style" removed for security
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^https?:\/\//i, // Only allow http/https URLs
};

/** Type definitions */
export interface ColorOption {
  readonly name: string;
  readonly value: string;
}

export type TextColor = (typeof TEXT_COLORS)[number];
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
