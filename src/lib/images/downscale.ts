"use client";

/**
 * Shrinking a pasted picture until it fits a byte budget.
 *
 * Needed because one screen stores its pictures rather than sending them: the
 * supplier-selection reason is a Dataverse Memo column, and a screenshot pasted
 * at full size is several times the whole column (see
 * `lib/approval/reason-images.ts`). The mail composer does **not** use this -
 * there the picture goes to Graph as an attachment and keeps every pixel.
 *
 * Browser-only, on purpose: `canvas` is the encoder, so this cannot be checked
 * by a throwaway script the way the arithmetic next door can. Everything it
 * decides is therefore kept dull and ordered - a fixed ladder of widths and
 * qualities, tried largest first, first fit wins.
 */

/**
 * Tried in order, largest first. A quotation table is unreadable much below 800.
 *
 * 1600 leads because a screenshot of a table is mostly flat colour and often
 * fits at full width - and when it does, that is the version worth keeping.
 * Falling back a rung costs one more encode and nothing else.
 */
const WIDTHS = [1600, 1200, 1000, 800] as const;
/**
 * Quality per width, high first. Below ~0.6 the ringing around small text is
 * what makes a pasted quotation hard to read, so the ladder drops the *width*
 * rather than going lower - a smaller sharp picture beats a large mushy one.
 */
const QUALITIES = [0.92, 0.85, 0.78, 0.7, 0.62] as const;

/**
 * WebP where the browser can encode it, JPEG where it cannot.
 *
 * Worth the branch: at the same byte budget WebP is roughly a quality step and
 * a half better than JPEG on screenshots - or the same quality in about 30%
 * fewer bytes, which against a fixed column budget means a wider, sharper
 * picture. Both are allowed sources in `sanitizeRichText`.
 *
 * Detected rather than assumed: a browser that cannot encode a type **silently
 * returns PNG** from `toDataURL`, and a PNG screenshot is several times the
 * budget - so an undetected fallback would not fail loudly, it would just
 * always land on the smallest rung and look worse than JPEG would have.
 */
function encoderType(): "image/webp" | "image/jpeg" {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  return probe.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";
}

export interface ShrunkImage {
  /** `data:image/webp;base64,...` (or jpeg) - what goes in the field. */
  src: string;
  /** The `width` attribute to draw it at, in CSS pixels. */
  width: number;
  /** Bytes after re-encoding, for the message that says what was stored. */
  bytes: number;
}

/** Base64 characters back to bytes, padding allowed for. */
function bytesOfBase64(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, (base64.length * 3) / 4 - padding);
}

/**
 * Re-encode until it fits, or give up and say so.
 *
 * Returns `null` when even the smallest step is over budget - the caller says
 * so rather than storing something that will fail the save. A picture is never
 * enlarged: a 300px diagram is stored at 300px, not blown up to 1200.
 */
export async function shrinkImageToBudget(
  file: File,
  maxBytes: number
): Promise<ShrunkImage | null> {
  const source = await loadImage(file);
  const format = encoderType();
  const naturalWidth = source.naturalWidth || WIDTHS[0];
  const naturalHeight = source.naturalHeight || Math.round(naturalWidth * 0.75);

  /* Never upscale, and never encode the same width twice: a 900px screenshot
     clamps the top two rungs to 900, and without this it would be encoded at
     every quality three times over before the ladder reached a width that is
     actually smaller. Ten encodes of a large canvas is a visible pause. */
  const ladder = [...new Set(WIDTHS.map((width) => Math.min(width, naturalWidth)))];

  for (const targetWidth of ladder) {
    const targetHeight = Math.max(
      1,
      Math.round((naturalHeight / naturalWidth) * targetWidth)
    );

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // White underneath: a PNG screenshot with transparency turns black on a
    // JPEG, and a black rectangle where a quotation was is worse than nothing.
    // Harmless under WebP, which keeps the alpha it is given.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(source, 0, 0, targetWidth, targetHeight);

    for (const quality of QUALITIES) {
      const dataUrl = canvas.toDataURL(format, quality);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const bytes = bytesOfBase64(base64);
      if (bytes <= maxBytes) {
        return { src: dataUrl, width: targetWidth, bytes: Math.round(bytes) };
      }
    }
  }

  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The picture could not be read."));
    reader.onload = () => {
      const picture = new Image();
      picture.onerror = () => reject(new Error("The picture could not be read."));
      picture.onload = () => resolve(picture);
      picture.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.readAsDataURL(file);
  });
}
