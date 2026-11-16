/**
 * Files hung on a hand-written message - a screenshot of the quotation, the
 * spec page somebody is asking about.
 *
 * The rules live here rather than in the dialog because every one of them is
 * invisible from the screen: a file silently dropped, a total that quietly
 * exceeds what Graph will accept, a name that arrives back looking like markup.
 * Dependency-free on purpose, so a throwaway script can drive them - the
 * encoding itself needs a browser and stays in the composer.
 *
 * ### Why the ceiling is not 4 MB
 *
 * `/me/sendMail` takes the whole message in one request and refuses a body over
 * **4 MB**. Attachments travel as base64, which is **4 bytes for every 3** - so
 * 3 MB of files is already 4 MB on the wire before the HTML, the subject and
 * the recipients are counted. The cap below is stated in the bytes the sender
 * actually picks, with the inflation and the rest of the message allowed for.
 *
 * Anything larger is a different mechanism entirely (a draft plus
 * `createUploadSession`), not a bigger number here - so the dialog says so
 * rather than failing at Send.
 */

/** What Graph is given per file. `contentBytes` is base64 with no data: prefix. */
export interface GraphFileAttachment {
  "@odata.type": "#microsoft.graph.fileAttachment";
  name: string;
  contentType: string;
  contentBytes: string;
  /** A picture the body shows, rather than a file listed under it. */
  isInline?: boolean;
  /** What `<img src="cid:...">` in the body points at. Inline images only. */
  contentId?: string;
}

/** One file the sender has picked, read and ready to send. */
export interface PickedAttachment {
  name: string;
  contentType: string;
  /** Bytes as picked, **before** base64 - what the cap is stated in. */
  size: number;
  contentBytes: string;
}

/**
 * One `<img>` tag. Quoted values are matched whole - serialising an attribute
 * escapes `"` but not `>` - and the three alternatives start differently, so
 * it cannot backtrack its way into trouble on a long base64 value.
 */
export const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

/** Graph's ceiling on one `sendMail` request. */
const GRAPH_MESSAGE_LIMIT_BYTES = 4 * 1024 * 1024;
/** Base64 costs a third on top. */
const BASE64_RATIO = 4 / 3;
/** Left for the HTML body, the subject, the recipients and the JSON around them. */
const MESSAGE_OVERHEAD_BYTES = 384 * 1024;

/**
 * How much a sender may attach to one message, in the bytes they see.
 *
 * ~2.7 MB. Derived rather than typed, so the reasoning above cannot drift from
 * the number the dialog prints.
 */
export const MAX_ATTACHMENT_BYTES = Math.floor(
  (GRAPH_MESSAGE_LIMIT_BYTES - MESSAGE_OVERHEAD_BYTES) / BASE64_RATIO
);

/**
 * What may be attached: pictures and PDFs.
 *
 * Not a security control - this sends from the person's own mailbox, and
 * anything refused here can be sent from Outlook in ten seconds. It is a
 * statement of what the feature is for. An executable arriving from "the ringi
 * system" is the one thing worth never doing by accident.
 */
export const ACCEPTED_ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

/** For the file input's `accept`, so the picker offers the right things first. */
export const ATTACHMENT_ACCEPT_ATTR = ".png,.jpg,.jpeg,.gif,.webp,.heic,.pdf,image/*,application/pdf";

/** The same list as a `Map`, so a key from outside cannot reach a prototype. */
const ACCEPTED_TYPE_BY_EXTENSION = new Map<string, string>(
  Object.entries(ACCEPTED_ATTACHMENT_TYPES)
);

/**
 * The content type to send this file as, or null if it is not one we attach.
 *
 * The **extension decides**, not `file.type`: a browser reports an empty type
 * for a file dragged from some applications, and Windows has been known to
 * report `application/octet-stream` for a PNG. Falling back the other way -
 * trusting a declared type over the name - would let `report.exe` through on a
 * claim of being an image.
 */
export function attachmentTypeOf(fileName: string): string | null {
  const extension = fileName.trim().toLowerCase().split(".").pop() || "";
  /* A `Map`, because the key is the tail of a **file name** (rule 4): on a plain
     object, `ACCEPTED_ATTACHMENT_TYPES["constructor"]` is the `Object` function,
     which is truthy - so `?? null` never fires and `payload.constructor` passes
     the "picture or PDF" screen with a function where its content type should
     be. The bytes were never the risk; the screen quietly saying yes was. */
  return ACCEPTED_TYPE_BY_EXTENSION.get(extension) ?? null;
}

/** Bytes as a person reads them - "1.4 MB", "18 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What is already attached, in bytes. */
export function attachedBytes(chosen: readonly { size: number }[]): number {
  return chosen.reduce((total, file) => total + file.size, 0);
}

/**
 * May this file be attached, on top of what is already there?
 *
 * Answered **before** the file is read, so an oversized picture is refused with
 * a number in the sentence rather than accepted, encoded, and then rejected by
 * Graph at Send with a 400 that means nothing to the sender (rule 10).
 *
 * The same file twice is refused too. A drag that lands on the drop zone and
 * the button both firing is not a thing a sender does on purpose, and the
 * second copy is charged against a budget they are watching.
 */
export function screenAttachment(
  file: { name: string; size: number },
  chosen: readonly { name: string; size: number }[]
): { contentType: string } | { problem: string } {
  const name = file.name.trim();
  if (!name) return { problem: "That file has no name, so it cannot be attached." };

  const contentType = attachmentTypeOf(name);
  if (!contentType) {
    return {
      problem: `${name} is not a picture or a PDF. Send that one from Outlook if it is intended.`,
    };
  }
  if (file.size <= 0) {
    return { problem: `${name} is empty.` };
  }
  if (chosen.some((entry) => entry.name === name && entry.size === file.size)) {
    return { problem: `${name} is already attached.` };
  }

  const remaining = MAX_ATTACHMENT_BYTES - attachedBytes(chosen);
  if (file.size > remaining) {
    return {
      problem:
        `${name} is ${formatBytes(file.size)}, and only ${formatBytes(Math.max(remaining, 0))} ` +
        `of the ${formatBytes(MAX_ATTACHMENT_BYTES)} a message can carry is left. ` +
        "Send a bigger file from Outlook, or attach a smaller picture.",
    };
  }

  return { contentType };
}

/** The picked files, as Graph wants them. */
export function toGraphAttachments(
  chosen: readonly PickedAttachment[]
): GraphFileAttachment[] {
  return chosen.map((file) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: file.name,
    contentType: file.contentType,
    contentBytes: file.contentBytes,
  }));
}


/**
 * Pictures pasted into the message, on their way out.
 *
 * A `data:` URI is how a pasted screenshot is *shown* - in the editor, and in
 * the draft the sender is looking at. It is not how one is *sent*: Outlook, and
 * most clients, refuse to render a data URI in a received message, so a picture
 * left as one arrives as an empty box. What works everywhere is the older
 * arrangement - the picture travels as an attachment marked inline, and the
 * body points at it by content id.
 *
 * So this is the conversion, done once at send: every `data:` image becomes
 * `cid:ringi-image-N` and comes back as an attachment beside the files.
 *
 * Runs on **sanitised** HTML (`buildManualMessage` sanitises first), which is
 * what makes a regex acceptable here: the only `data:image/...` left by then is
 * one `sanitizeRichText` has already vouched for - no SVG, no script, no
 * remote source.
 */
export function extractInlineImages(html: string): {
  html: string;
  attachments: GraphFileAttachment[];
} {
  const attachments: GraphFileAttachment[] = [];
  /* Inside an `<img>` only: the same text typed into the body as words would
     otherwise become an attachment too (review, 2026-10-19). */
  const converted = html.replace(IMG_TAG, (tag) =>
    tag.replace(
      /src="data:image\/(png|jpeg|gif|webp);base64,([a-zA-Z0-9+/=\s]+)"/,
      (_whole, subtype: string, base64: string) => {
        const index = attachments.length + 1;
        const contentId = `ringi-image-${index}`;
        attachments.push({
          "@odata.type": "#microsoft.graph.fileAttachment",
          // Named, because a mail client lists inline attachments too and
          // "ATT00001" tells the reader nothing about what they are looking at.
          name: `pasted-image-${index}.${subtype === "jpeg" ? "jpg" : subtype}`,
          contentType: `image/${subtype}`,
          // Whitespace is legal inside base64 in a data URI and illegal in
          // Graph's contentBytes - a wrapped line here is a picture that arrives
          // corrupt, or not at all.
          contentBytes: base64.replace(/\s+/g, ""),
          isInline: true,
          contentId,
        });
        return `src="cid:${contentId}"`;
      }
    )
  );

  return { html: converted, attachments };
}

/**
 * Whether a body and its inline pictures go in one `sendMail` request -
 * base64 characters are what travels, so they are counted as they are.
 */
export function fitsOneMessage(
  html: string,
  attachments: readonly GraphFileAttachment[]
): boolean {
  const chars = attachments.reduce((total, file) => total + file.contentBytes.length, html.length);
  return chars <= GRAPH_MESSAGE_LIMIT_BYTES - MESSAGE_OVERHEAD_BYTES;
}

/** What stands where a picture could not be mailed - one sentence for every reason (rule 10). */
export const PICTURE_LEFT_OUT_HTML =
  `<span style="font-size:12px;color:#64748b">[A pasted picture is too large to mail - ` +
  `it is on the application.]</span>`;

/**
 * **As many pictures as fit, from the top.** Over Graph's cap, the last
 * picture in the body goes first and the next one after it, until the rest
 * fit - each replaced by the sentence saying where it is (rule 10).
 *
 * Not all of them at once (review, 2026-10-19): with the description, the
 * specification, the reason and the purchasing history all able to carry
 * pictures, one large screenshot at the bottom used to cost every picture in
 * the message. The body runs in reading order, so the ones kept are the ones
 * nearest the top.
 */
export function fitWithinOneMessage(
  html: string,
  attachments: readonly GraphFileAttachment[]
): { html: string; attachments: GraphFileAttachment[]; leftOut: number } {
  const kept = [...attachments];
  const dropped = new Set<string>();
  while (kept.length > 0 && !fitsOneMessage(html, kept)) {
    const last = kept.pop();
    if (last?.contentId) dropped.add(last.contentId);
  }
  if (dropped.size === 0) return { html, attachments: kept, leftOut: 0 };
  const trimmed = html.replace(IMG_TAG, (tag) => {
    const id = /\bsrc="cid:([^"]+)"/.exec(tag)?.[1];
    return id && dropped.has(id) ? PICTURE_LEFT_OUT_HTML : tag;
  });
  /* The html only shrinks as pictures go, so the loop above, which measured
     the full body, never keeps more than fit. */
  return { html: trimmed, attachments: kept, leftOut: dropped.size };
}

/**
 * What the pictures inside a message body come to, in the bytes the cap is
 * stated in.
 *
 * Inline pictures and attached files share one budget because Graph counts one
 * request: a screenshot pasted into the text costs exactly what the same
 * screenshot attached would.
 */
export function inlineImageBytes(html: string): number {
  let total = 0;
  for (const match of html.matchAll(/src="data:image\/[a-z]+;base64,([a-zA-Z0-9+/=\s]+)"/g)) {
    const base64 = match[1].replace(/\s+/g, "");
    // Base64 is 4 characters for every 3 bytes, less whatever the padding stands in for.
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    total += Math.max(0, (base64.length * 3) / 4 - padding);
  }
  return Math.round(total);
}
