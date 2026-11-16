/**
 * Attachment size limit, shared by the upload route and the UI that offers it.
 *
 * Kept in one place because the two must agree: a browser that lets a file
 * through only for the server to refuse it wastes the whole upload, and a
 * browser stricter than the server refuses files that would have worked.
 *
 * NEXT_PUBLIC_ so the client can state the limit before a file is chosen.
 *
 * Raising it is not enough on its own: Dataverse caps attachments with the
 * organisation's own `maxuploadfilesize` setting (5MB by default, up to 128MB),
 * and the smaller of the two wins.
 *
 * **20MB since 2026-11-04** (was 10), asked for by a user with a budget
 * explanation deck over 10MB - for budget explanations and ringi attachments
 * both, and so for rule documents, which read the same number (rule 5). It
 * needs `maxuploadfilesize` at **21000KB or more** in every environment: below
 * that, a 20MB file is refused only at commit, after every block was sent. The
 * AI readers follow it (`MAX_QUOTATION_FILE_SIZE`), or a stored file over 10MB
 * would upload and then be skipped by every review.
 */
export const MAX_ATTACHMENT_MB = Number(process.env.NEXT_PUBLIC_MAX_ATTACHMENT_MB) || 20;

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/**
 * **What Vercel lets through, which is less than the limit above.** A function's
 * request body stops at 4.5MB, and a larger one is refused by the platform
 * before this app's code runs - so it arrives as a bare 413 with none of the
 * app's own sentences in it. Reported 2026-09-29 as "Upload failed (413)" on a
 * screen that says "up to 10MB each". Not a setting: Vercel's documented cap.
 */
export const PLATFORM_REQUEST_LIMIT_MB = 4.5;

/**
 * **The size a file moves in, both ways, where it is moved in blocks** (budget
 * explanation files, 2026-09-29). 2.5MB of file is ~3.3MB of base64 on its way
 * on to Dataverse, whose `UploadBlock` wants under 4MB, and 2.5MB plus the form
 * around it stays well inside the platform cap above in either direction.
 */
export const TRANSFER_BLOCK_BYTES = 2.5 * 1024 * 1024;

/** How many blocks the largest allowed file needs - the bound a block index is checked against. */
export const MAX_TRANSFER_BLOCKS = Math.ceil(MAX_ATTACHMENT_BYTES / TRANSFER_BLOCK_BYTES);

/**
 * The sentence for that refusal, naming the file's size and both numbers -
 * which the reader needs, since the screen promised the larger one.
 */
export function platformTooLargeMessage(fileBytes: number | null): string {
  const size = fileBytes && fileBytes > 0 ? `That file is ${formatFileSize(fileBytes)}. ` : "";
  return (
    `${size}The server refused it as too large before it could be read: an upload ` +
    `through this site can be at most about ${PLATFORM_REQUEST_LIMIT_MB}MB, less than the ` +
    `${MAX_ATTACHMENT_MB}MB the app allows. Make it smaller (in PowerPoint: File > Compress ` +
    `Pictures) or split it into two files, then upload again.`
  );
}

/** "12.4MB" - for messages that name the file that was refused. */
export function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * **Which list an attachment belongs to**, written into the annotation's
 * subject at upload time.
 *
 * Four lists share one `annotations` table, so the tag is the only thing that
 * separates them: an untagged note is Step 1's Item-description list, `[SPEC] `
 * is Step 1's Specification list, `[QUOTE] ` is a supplier quotation read on
 * **Step 2**, reached from the Source link on the price row it was read into,
 * and `[MSA] ` is the signed Master Service Agreement for a supplier that was
 * awarded on Step 2.
 *
 * Moved here from the approval page on 2026-08-31 (rule 5). The client wrote
 * the tag and the server had never heard of it, which is how Step 1's
 * attachment lock came to refuse a Step 2 quotation: the guard could only see
 * "an upload", and every upload looked like Step 1's.
 */
export const SPEC_ATTACHMENT_PREFIX = "[SPEC] ";
export const QUOTATION_ATTACHMENT_PREFIX = "[QUOTE] ";

/**
 * Is this note a Step 2 quotation rather than one of Step 1's attachments?
 *
 * The one test, asked by the upload guard and the delete guard - a second
 * spelling of `startsWith` in either of them is how the two come to disagree
 * about which files Step 1 approved.
 */
export function isQuotationAttachment(subject: string | null | undefined): boolean {
  return (subject ?? "").startsWith(QUOTATION_ATTACHMENT_PREFIX);
}

/**
 * The signed Master Service Agreement for one awarded supplier.
 *
 * A Step 2 document like a quotation, and locked with Step 2 rather than Step 1
 * for the same reason: it arrives **after** the applicant's approval and
 * describes the deal, not the requirement. Which supplier it belongs to is not
 * in the subject - it is written to the annotation's `notetext`, so a company
 * whose name contains a bracket or a dash cannot be parsed into the wrong slot.
 */
export const MSA_ATTACHMENT_PREFIX = "[MSA] ";

/**
 * **The other agreement a supplier may have at quotation time** (2026-09-06).
 *
 * Asked for by the owner: some suppliers already have a Master Service
 * Agreement, and some have only a Non-Disclosure Agreement when the quotation
 * is taken - and an NDA is the floor. So a slot may hold either, and **which
 * one it holds is the tag**, exactly as `[QUOTE]` and `[SPEC]` say what those
 * files are.
 *
 * A tag rather than a field inside `notetext` (which holds the supplier): the
 * kind of a document is what this app already keeps in the subject, existing
 * `[MSA] ` rows stay correct with no migration, and a reader of the table sees
 * it without parsing anything.
 */
export const NDA_ATTACHMENT_PREFIX = "[NDA] ";

/** What a slot's file was filed as. */
export type AgreementKind = "MSA" | "NDA";

export function isMsaAttachment(subject: string | null | undefined): boolean {
  return (subject ?? "").startsWith(MSA_ATTACHMENT_PREFIX);
}

export function isNdaAttachment(subject: string | null | undefined): boolean {
  return (subject ?? "").startsWith(NDA_ATTACHMENT_PREFIX);
}

/**
 * **Either kind of agreement** - the one test Step 2's rule turns on.
 *
 * "Has this supplier got an agreement" is asked by the card, by the count on it
 * and by `scm-action`'s refusal, and asking it as `isMsa || isNda` in three
 * places is how the third one comes to disagree the day a third kind is added
 * (rule 20).
 */
export function isAgreementAttachment(subject: string | null | undefined): boolean {
  return isMsaAttachment(subject) || isNdaAttachment(subject);
}

/** Which kind it is, or `null` for a file that is not an agreement at all. */
export function agreementKindOf(subject: string | null | undefined): AgreementKind | null {
  if (isMsaAttachment(subject)) return "MSA";
  if (isNdaAttachment(subject)) return "NDA";
  return null;
}

/**
 * **Is this file Step 2's rather than Step 1's?**
 *
 * The one question both locks turn on, and the reason it is a function: Step 1's
 * lock must not close over a document that arrives after it, and Step 2's must.
 * Written out at each guard, the two lists drift the moment a third Step 2
 * document exists - which is exactly what happened when the MSA was added and
 * only the upload guard had heard of it (rule 20).
 */
export function isStepTwoAttachment(subject: string | null | undefined): boolean {
  return isQuotationAttachment(subject) || isAgreementAttachment(subject);
}

/**
 * The tag a caller's own text must never carry.
 *
 * The subject a browser sends is a label, and the tag in front of it is the
 * server's (rule 27 - `subject=[QUOTE] anything.pdf` was a nine-character
 * bypass of Step 1's lock). Both guards strip with this one expression, so a
 * tag added here cannot be forgotten in one of them.
 */
export const ATTACHMENT_TAG_PATTERN = /^\s*\[(QUOTE|SPEC|MSA|NDA)\]\s*/i;

/**
 * **The types this app is willing to hand a browser to render.**
 *
 * The stored `mimetype` is whatever the uploading browser declared; nothing
 * checks it against the bytes. Served `inline` from this origin, a file calling
 * itself `text/plain` while containing `<script>` is a page on
 * `capex-md.vercel.app`, running beside the session. `nosniff` (see
 * `next.config.ts`) stops the browser guessing its way to that, and this list
 * stops the app *declaring* its way there: a PDF and an image are what anybody
 * previews, and everything else downloads.
 *
 * **An allowlist, not `startsWith("image/")`.** `image/svg+xml` is an image by
 * that test and a *document* in fact: it can carry `<script>`, and served
 * `inline` it runs on this origin, beside the session cookies. `nosniff` does
 * not help - the type is **declared**, not sniffed. This app's own upload
 * allowlist has no SVG, so the hole is not reachable through the form; it is
 * reachable through the table, because `annotations` is shared by the whole
 * organisation and a note attached from the Dynamics UI, a Power App or a flow
 * is served by that route like any other.
 *
 * Lives here rather than in the route because the browser now asks the same
 * question to decide whether to offer a Preview button (rule 20). **The route
 * still decides for itself, from the declared type alone** - the browser's copy
 * is the courtesy, and a filename never gets a vote in what is served inline.
 */
export const INLINE_RENDERABLE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
]);

/**
 * **A file name's extension, lower case, without the dot** - `""` when it has
 * none. One spelling for every reader of an extension here and in the
 * assistant's attachments (review, 2026-10-26: it was written out four times).
 */
export function extensionOf(filename: string | null | undefined): string {
  return /\.([a-z0-9]+)$/i.exec(String(filename ?? "").trim())?.[1]?.toLowerCase() ?? "";
}

/** `application/pdf; charset=x` and a stray capital are the same intent. */
export function baseMimeType(mimetype: string | null | undefined): string {
  return String(mimetype ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * The three binary formats Office replaced in 2007, and which nothing in this
 * app can read.
 *
 * They are one kind rather than three, because the refusal is one sentence with
 * one word changed - and three near-identical branches is how two of them come
 * to say different things (rule 20). `modernFormatFor()` supplies the word.
 */
const LEGACY_OFFICE = new Map([
  ["xls", ".xlsx"],
  ["doc", ".docx"],
  ["ppt", ".pptx"],
]);

/**
 * What to re-save a `legacy-office` file as, for the message that says so.
 *
 * Falls back to `.xlsx` only when the kind was reached through the **mimetype**
 * and the name carries no extension at all - `application/vnd.ms-excel` is by
 * far the commonest of the three to arrive that way.
 */
export function modernFormatFor(filename: string | null | undefined): string {
  const extension = extensionOf(filename);
  return LEGACY_OFFICE.get(extension) ?? ".xlsx";
}

/**
 * **How a given attachment can be previewed, if at all.**
 *
 * | kind           | what happens                                                   |
 * | -------------- | -------------------------------------------------------------- |
 * | `pdf`          | fetched as bytes and framed from a `blob:` URL - see the page   |
 * | `image`        | the bytes, served `inline`, in an `<img>`                       |
 * | `sheet`        | read on the server into a grid of strings, drawn as a table     |
 * | `document`     | a `.docx` / `.pptx` read into its **text** - no layout, no images |
 * | `text`         | decoded and shown as text                                       |
 * | `legacy-office`| **cannot be read**, and the screen says so (rule 10)            |
 * | `null`         | no preview is offered                                           |
 *
 * **The extension decides for an Office file, not the mimetype.** `.xlsx` and
 * `.xls` are two different container formats, and browsers routinely upload both
 * as `application/vnd.ms-excel`; the extension is what Office itself goes on.
 * That is safe here precisely because none of these paths serves the file's own
 * bytes with the file's own content type - the grid, the document and the text
 * come back as JSON, and the two that *are* served inline are decided by the
 * route from the declared mimetype alone.
 *
 * `legacy-office` earns a row of its own rather than falling into `null` because
 * a silently absent button is the thing that prompted this feature: the reader
 * cannot tell "we do not preview this" from "the button is broken" (rule 10).
 */
export type AttachmentPreviewKind =
  | "pdf"
  | "image"
  | "sheet"
  | "document"
  | "text"
  | "legacy-office";

/**
 * The formats whose properties `attachments/file-properties` can read.
 *
 * **Here rather than in that module** because the panel is a client component
 * and that module is not: it opens zips. `import type` is free, a value import
 * is not (rule 19), so the one test both sides ask lives with the other
 * file-shape questions (rule 20).
 *
 * Deliberately narrow. An image or a `.txt` carries nothing of the sort, and
 * `previewKindOf()` is not the right test here: it answers "how does this
 * display", which is a different question with a different answer for a PDF.
 */
export function hasReadableProperties(
  filename: string | null | undefined,
  mimetype: string | null | undefined
): boolean {
  const extension = extensionOf(filename);
  if (["xlsx", "xlsm", "docx", "pptx"].includes(extension)) return true;
  if (extension === "pdf") return true;
  // A file that arrived without a usable name still has its declared type.
  const type = String(mimetype ?? "").split(";")[0].trim().toLowerCase();
  return (
    type === "application/pdf" ||
    type.startsWith("application/vnd.openxmlformats-officedocument.") ||
    type === "application/vnd.ms-excel.sheet.macroenabled.12"
  );
}

export function previewKindOf(
  filename: string | null | undefined,
  mimetype: string | null | undefined
): AttachmentPreviewKind | null {
  const extension = extensionOf(filename);
  const type = baseMimeType(mimetype);

  if (extension === "xlsx" || extension === "xlsm") return "sheet";
  if (extension === "docx" || extension === "pptx") return "document";
  if (LEGACY_OFFICE.has(extension)) return "legacy-office";
  if (extension === "csv" || extension === "txt") return "text";

  if (type === "application/pdf") return "pdf";
  if (INLINE_RENDERABLE_TYPES.has(type)) return "image";
  if (type === "text/plain" || type === "text/csv") return "text";

  /*
   * An `.xlsx` whose extension was lost but whose type survived - and only the
   * two unambiguous OOXML types, never `application/vnd.ms-excel`, which is the
   * legacy format's own type as often as it is a mislabelled `.xlsx`.
   */
  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel.sheet.macroenabled.12"
  ) {
    return "sheet";
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "document";
  }
  if (
    type === "application/vnd.ms-excel" ||
    type === "application/msword" ||
    type === "application/vnd.ms-powerpoint"
  ) {
    return "legacy-office";
  }

  return null;
}
