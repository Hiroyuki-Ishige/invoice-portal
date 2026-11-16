/**
 * **A file read back in blocks, joined in the browser.**
 *
 * A Vercel function answers 4.5MB at most, so a route that serves a larger file
 * serves it `?block=n` at a time and says how many there are
 * (`BLOCK_COUNT_HEADER`) and how large the whole is (`FILE_SIZE_HEADER`) - the
 * budget explanation files, since 2026-09-29. This asks for block 0, then the
 * rest, and hands back one `Blob`.
 *
 * **A route that does not cut files answers block 0 with the whole file and no
 * count header**, and that is the whole answer - so a caller shared with such a
 * route (the preview modal serves ringi attachments too) needs no second path.
 *
 * Progress is bytes, counted as they arrive. Two production bugs from the IIR
 * deck's reader (fixed 2026-09-27) shape how, and are why this never trusts
 * `Content-Length`: Vercel compresses, so the header is often missing or is
 * the *compressed* size of a body that arrives decompressed. Chunks are kept as
 * they come - nothing is sized from the header - and the total is the file's
 * own size from `FILE_SIZE_HEADER`, never exceeded in a report.
 *
 * Browser and server both import the header names; nothing here runs on import.
 */

export const FILE_SIZE_HEADER = "X-File-Size";
export const BLOCK_COUNT_HEADER = "X-Block-Count";

function withBlock(url: string, index: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}block=${index}`;
}

/** The route's own sentence where it sent one, else what the status means. */
async function failure(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return new Error(
    typeof body.error === "string" && body.error ? body.error : `The file could not be read (${response.status}).`
  );
}

/** A response's body as its chunks, each reported as it lands. */
async function readChunks(response: Response, onChunk: (bytes: number) => void): Promise<Uint8Array[]> {
  if (!response.body) {
    const whole = new Uint8Array(await response.arrayBuffer());
    onChunk(whole.length);
    return [whole];
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onChunk(value.length);
  }
  return chunks;
}

/** Which block is being read, of how many - known once block 0 has answered. */
export interface BlockPosition {
  block: number;
  blocks: number;
}

export async function fetchInBlocks(
  url: string,
  onProgress?: (loaded: number, total: number, position?: BlockPosition) => void
): Promise<Blob> {
  const first = await fetch(withBlock(url, 0));
  if (!first.ok) throw await failure(first);
  const count = Number(first.headers.get(BLOCK_COUNT_HEADER));
  const blocks = Number.isInteger(count) && count > 1 ? count : 1;
  const type = first.headers.get("Content-Type") ?? "";
  const announced = Number(first.headers.get(FILE_SIZE_HEADER));
  const size = Number.isFinite(announced) && announced > 0 ? announced : 0;

  let loaded = 0;
  let block = 0;
  const arrived = (bytes: number) => {
    loaded += bytes;
    // An unknown size reports what has arrived as the total, never past 100%.
    onProgress?.(loaded, Math.max(size, loaded), { block, blocks });
  };

  const parts: BlobPart[] = [];
  parts.push(...((await readChunks(first, arrived)) as BlobPart[]));
  /* In order, one at a time: each is two Dataverse reads on the server, and the
     parts must be joined in order anyway. */
  for (let index = 1; index < blocks; index++) {
    block = index;
    /* Said before the request, not after: the wait for a block is the server
       reading it from Dataverse, and that is the wait worth naming. */
    onProgress?.(loaded, Math.max(size, loaded), { block, blocks });
    const response = await fetch(withBlock(url, index));
    if (!response.ok) throw await failure(response);
    parts.push(...((await readChunks(response, arrived)) as BlobPart[]));
  }
  return new Blob(parts, { type });
}

/**
 * Saves the file as a download without leaving the page. `onProgress` is
 * `fetchInBlocks`'s - see `components/ui/DownloadProgress` for a screen that
 * shows it.
 */
export async function downloadInBlocks(
  url: string,
  filename: string,
  onProgress?: (loaded: number, total: number, position?: BlockPosition) => void
): Promise<void> {
  const blob = await fetchInBlocks(url, onProgress);
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoked after the browser has taken it - revoking in the same tick can
     cancel the download in some browsers. */
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
