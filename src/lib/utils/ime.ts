/**
 * **The Enter that finishes a Japanese conversion is not the Enter that submits.**
 *
 * Typing 現在の予算 is `げんざいの...` in a composition buffer, and the Enter that
 * accepts the conversion is delivered to `keydown` like any other Enter. Every
 * handler in this app that read `event.key === "Enter"` therefore fired **on the
 * first conversion**: the chat panel sent 「現在の」 to the model the moment the
 * word was accepted, and answered that it did not know what was being asked
 * (reported 2026-09-18, with a screenshot of exactly that).
 *
 * It is the same bug in **ten** handlers - the composer, five inline editors on
 * Summary > For IIR, the theme picker, the link dialog, the delete confirmation
 * and the ringi's scope-category editor - so it is one exported function rather
 * than ten spellings of a guard (rule 20). (It said nine until a review counted
 * them: the tenth is the one that was added last and not added to the sentence.
 * `grep -c 'isImeComposing('` is the count that cannot be wrong.) The delete confirmation is the one that matters most: it
 * asks somebody to **type a name** and deletes on Enter, and a theme name in
 * Japanese would be deleted at the first conversion.
 *
 * **Two tests, because one browser does not set the first.** The standard is
 * `KeyboardEvent.isComposing`; WebKit has long reported the composition-ending
 * key with the legacy `keyCode` 229 and `isComposing` already false, which is
 * why that check is here as well and why deleting it would leave the bug alive
 * on Safari alone - the browser half of this office (rule 4's habit: ask both,
 * believe neither on its own).
 *
 * Pure, and type-only on React, so it costs nothing at runtime (rule 19).
 */

import type { KeyboardEvent } from "react";

/**
 * Is an IME still composing this keystroke?
 *
 * `true` means the key belongs to the conversion, not to the app: return from
 * the handler and let the IME have it.
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  /* `nativeEvent` is the real `KeyboardEvent`; React's synthetic one carries
     `isComposing` only through it. */
  if (event.nativeEvent.isComposing) return true;
  return event.keyCode === 229 || event.nativeEvent.keyCode === 229;
}
