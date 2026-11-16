/**
 * Sanitising what somebody wrote in the rich-text editor.
 *
 * One function, because the same HTML is rendered in the app *and* mailed out
 * of the tenant, and the two must not disagree about what survives. It used to
 * be three separate `DOMPurify.sanitize(html, SANITIZE_CONFIG)` calls.
 *
 * ### Why `style` is allowed at all, and only just
 *
 * The highlight button runs `document.execCommand("hiliteColor")`, and there is
 * no legacy tag for a background colour - every browser emits
 * `<span style="background-color: rgb(254, 240, 138)">`. `style` was not in
 * `ALLOWED_ATTR`, so every highlight was silently deleted on the way out: the
 * sender highlighted a line, pressed Send, and the recipient got plain text.
 * Text colour survived only because `foreColor` still emits `<font color>`.
 *
 * Allowing `style` wholesale is not the fix. A style attribute can position an
 * element over the rest of a page, load a remote URL, or (in mail clients that
 * still parse it) do worse. So the attribute is kept and its *contents* are
 * filtered: two properties, colour values only. Anything else is dropped, and a
 * declaration list that ends up empty takes the attribute with it.
 */

import DOMPurify from "isomorphic-dompurify";

// Relative, not `@/...`: `manual-mail.ts` imports this and is checked by
// throwaway scripts that cannot resolve the path alias.
import { SANITIZE_CONFIG } from "../constants/editor";

/**
 * The image sources a message body may carry, and nothing else.
 *
 * Two, and both are inert:
 *
 * - **`data:image/...;base64,`** - a screenshot pasted into the composer, shown
 *   in the editor and in the drafted message. `image/svg+xml` is deliberately
 *   absent: an SVG is a document that can carry script, and "it is an image" is
 *   exactly the assumption that makes it dangerous.
 * - **`cid:`** - what a `data:` image becomes on the way out. Outlook and most
 *   clients refuse to render a data URI in a received message, so an inline
 *   picture travels as an attachment the body refers to by content id.
 *
 * Policed by the hook below rather than by widening `ALLOWED_URI_REGEXP`: that
 * regexp guards every URI attribute there is, and `href` has no business
 * accepting a data URI.
 */
const INLINE_IMAGE_SRC =
  /^(?:data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+|cid:[a-z0-9._@+-]+)$/i;

/** The only declarations a typed message may carry. */
const ALLOWED_STYLE_PROPERTIES = new Set(["background-color", "color"]);

/**
 * A colour, and nothing that merely contains one.
 *
 * Anchored on both ends, so `url(javascript:…)`, `expression(…)`, a second
 * declaration smuggled in with a `;`, and CSS comments all fail. Named colours
 * are letters only - `yellow`, `transparent`.
 */
const COLOUR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d\s.,%]+\)|[a-z]{3,20})$/i;

/**
 * Keep the colour declarations, drop everything else. Returns "" for nothing
 * left, which is the signal to drop the attribute rather than emit `style=""`.
 */
export function filterStyleAttribute(value: string): string {
  return value
    .split(";")
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      if (colon < 0) return null;

      const property = declaration.slice(0, colon).trim().toLowerCase();
      const colour = declaration.slice(colon + 1).trim();

      if (!ALLOWED_STYLE_PROPERTIES.has(property)) return null;
      if (!COLOUR_VALUE.test(colour)) return null;

      return `${property}: ${colour}`;
    })
    .filter((declaration): declaration is string => declaration !== null)
    .join("; ");
}

/**
 * Registered once for the process. DOMPurify hooks live on the instance, not on
 * a call, which is the reason every caller goes through `sanitizeRichText()`
 * below: a bare `DOMPurify.sanitize()` elsewhere would silently inherit this.
 */
let hookInstalled = false;

function installStyleHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;

  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    /* `src` is admitted as URI-safe (see the config below) so that an inline
       picture is not deleted the way `<font color>` and `target` were - and
       that is only safe because it is checked here, by value, on an `img` and
       nowhere else. */
    if (data.attrName === "src") {
      const source = data.attrValue.trim();
      if (node.nodeName !== "IMG" || !INLINE_IMAGE_SRC.test(source)) {
        data.keepAttr = false;
        return;
      }
      /* Normalised, not merely accepted. The test above is case-insensitive
         because browsers are, but everything downstream reads this value with a
         lower-case pattern - `extractInlineImages` would leave a
         `DATA:IMAGE/PNG` picture as a data URI in a sent message (an empty box
         in Outlook) and `inlineImageBytes` would count it as nothing. One
         spelling leaves here, so the two cannot disagree. */
      data.attrValue = source.replace(/^[^,]*,/, (prefix) => prefix.toLowerCase());
      return;
    }

    if (data.attrName !== "style") return;

    const kept = filterStyleAttribute(data.attrValue);
    if (!kept) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = kept;
  });

  /**
   * A link that opens a new tab opens `_blank`, with `noopener noreferrer`.
   *
   * ### Rule 16, a third time
   *
   * `target` and `rel` have been on `ALLOWED_ATTR` since the config was
   * written, and **neither has ever survived a single sanitise.** DOMPurify
   * treats an attribute it does not consider URI-safe as one that must also
   * match `ALLOWED_URI_REGEXP` - ours is `^https?://` - and `_blank` is not a
   * URL. Exactly what happened to `<font color>`, in the same file, for the
   * same reason.
   *
   * So `RichTextEditor` has been building `<a target="_blank"
   * rel="noopener noreferrer">` (see its link dialog) and storing `<a href>`.
   * Every link anyone has ever put in a ringi navigates the current tab -
   * away from a half-completed 5-step form. Nobody reported it as a bug
   * because the editor shows the live DOM, where the attribute is right there.
   *
   * Both are URI-safe now, so the allowlist means what it says, and this hook
   * is what makes that safe to do: the value is **forced**, not validated.
   * `target` becomes `_blank` whatever it said - otherwise permitting the
   * attribute would permit naming a frame - and `rel` is overwritten, so there
   * is no spelling a sender can supply that survives. `noreferrer` as well as
   * `noopener`: the destination has no business learning which application URL
   * somebody was reading when they clicked, and this HTML is also mailed, where
   * what an old client implies about `_blank` is not worth reasoning about.
   */
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.hasAttribute?.("target")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    // An image whose source was just refused is not an image: it is a broken
    // icon in the middle of somebody's message, saying nothing about why.
    if (node.nodeName === "IMG" && !node.getAttribute?.("src")) {
      node.remove?.();
    }
  });
}

/**
 * The config above, plus the one attribute the hook then polices.
 *
 * `ADD_URI_SAFE_ATTR: ["color"]` is not decoration. DOMPurify requires any
 * attribute it does not consider URI-safe to *match* `ALLOWED_URI_REGEXP`,
 * which here is `^https?://` - so `<font color="#ef4444">` failed the test and
 * was dropped, and the text-colour button had been silently doing nothing on
 * the way out for as long as the config has existed. It looked like it worked
 * because the editor shows the live DOM, not the sanitised value. `style`
 * survives only because DOMPurify already treats it as URI-safe, which is
 * exactly why its contents need the hook above.
 */
const RICH_TEXT_CONFIG = {
  ...SANITIZE_CONFIG,
  ALLOWED_ATTR: [...SANITIZE_CONFIG.ALLOWED_ATTR, "style"],
  // `target` and `rel` join `color` for the same reason and with the same
  // consequence if they are left out: listed in ALLOWED_ATTR, silently dropped
  // in practice. Safe to admit only because the hook above forces both values -
  // see the note there.
  ADD_URI_SAFE_ATTR: ["color", "target", "rel"],
};

/**
 * The same, plus pictures - for the one place a picture belongs in a body.
 *
 * Opt-in rather than always-on. This HTML is stored in Dataverse columns as
 * well as mailed, and a ringi description that quietly accepts a pasted
 * screenshot is a Memo field holding a megabyte of base64. The email composer
 * asks for it; nothing else does.
 *
 * `src`, `alt` and `width` all have to be URI-safe for the same reason `color`
 * and `target` did - see the note above. `width` is a number and `alt` is text,
 * so admitting them costs nothing; `src` is admitted only because the hook
 * checks its value against `INLINE_IMAGE_SRC`.
 */
const RICH_TEXT_IMAGE_CONFIG = {
  ...RICH_TEXT_CONFIG,
  ALLOWED_TAGS: [...SANITIZE_CONFIG.ALLOWED_TAGS, "img"],
  ALLOWED_ATTR: [...RICH_TEXT_CONFIG.ALLOWED_ATTR, "src", "alt", "width"],
  ADD_URI_SAFE_ATTR: [...RICH_TEXT_CONFIG.ADD_URI_SAFE_ATTR, "src", "alt", "width"],
};

export interface SanitizeRichTextOptions {
  /** Keep `<img>` with an inline or `cid:` source. Off everywhere but the mail composer. */
  allowInlineImages?: boolean;
}

/** Sanitise HTML that came out of `RichTextEditor`. */
export function sanitizeRichText(
  html: string,
  options: SanitizeRichTextOptions = {}
): string {
  installStyleHook();
  return DOMPurify.sanitize(
    html,
    options.allowInlineImages ? RICH_TEXT_IMAGE_CONFIG : RICH_TEXT_CONFIG
  );
}
