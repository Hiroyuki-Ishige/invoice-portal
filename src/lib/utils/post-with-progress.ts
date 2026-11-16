/**
 * POSTs a form and reports how much of it has gone up.
 *
 * `XMLHttpRequest` rather than `fetch`: fetch cannot report upload progress at
 * all, and a bar that animates without measuring anything tells the user a
 * comforting lie about a 9MB file on a slow link.
 *
 * `onProgress` reports **0-100 for bytes sent**. Reaching 100 does not mean
 * done - the server still has work after the last byte arrives, whether that is
 * storing a file in Dataverse or reading a quotation with two Azure services -
 * so callers show an indeterminate state from there until the response lands.
 *
 * Lifted out of the approval page on 2026-08-31, when the quotation reader
 * needed the same thing from a different file (rule 20). Not React, no DOM
 * beyond `XMLHttpRequest`, so it belongs here rather than in a component.
 */
import { createNdjsonSplitter } from "@/lib/utils/read-ndjson";
import { platformTooLargeMessage } from "@/lib/constants/attachments";

/** An NDJSON line from a streaming route, as the caller receives it. */
export type ProgressLine = Record<string, unknown>;

export function postWithProgress(
  url: string,
  body: FormData,
  /**
   * `sent` carries the byte counts behind the percentage, for a caller that
   * shows a size, a speed or a time left. They count the whole multipart body,
   * so `total` is a little larger than the file - a caller printing a size
   * scales the fraction onto the file's own size.
   */
  onProgress: (percent: number, sent?: { loaded: number; total: number }) => void,
  /**
   * Milliseconds before the request is abandoned. Absent = no timeout, which is
   * what the attachment upload has always done.
   */
  timeoutMs?: number,
  /**
   * **A route that streams its own progress** answers `application/x-ndjson`
   * once its checks have passed: progress lines, then one carrying `result`
   * or `error` (+ `status`). Each line is handed here as it lands, and the
   * final one becomes this call's `data` / `ok` / `status`, so a caller reads
   * the answer the same way whichever shape the route chose.
   */
  onLine?: (line: ProgressLine) => void
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    if (timeoutMs) request.timeout = timeoutMs;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100), { loaded: event.loaded, total: event.total });
      }
    };
    /* **The last byte is its own event.** `progress` is throttled and need not
       fire at exactly 100, so without this a caller can sit on 97% through the
       whole of the server's work, reading "still uploading" when it is not. */
    request.upload.onload = (event) => {
      const total = event.lengthComputable ? event.total : 0;
      onProgress(100, total ? { loaded: total, total } : undefined);
    };

    const splitter = createNdjsonSplitter();
    let consumed = 0;
    let finalLine: ProgressLine | null = null;
    const isStream = () => /application\/x-ndjson/i.test(request.getResponseHeader("Content-Type") ?? "");
    const take = (lines: unknown[]) => {
      for (const line of lines) {
        if (!line || typeof line !== "object" || Array.isArray(line)) continue;
        const entry = line as ProgressLine;
        if ("result" in entry || "error" in entry) finalLine = entry;
        else onLine?.(entry);
      }
    };
    const readNew = () => {
      if (!isStream()) return;
      const text = request.responseText;
      take(splitter.push(text.slice(consumed)));
      consumed = text.length;
    };
    request.onprogress = readNew;

    request.onload = () => {
      if (isStream()) {
        readNew();
        take(splitter.flush());
        const last = finalLine as ProgressLine | null;
        if (last && "result" in last && last.result && typeof last.result === "object") {
          resolve({ ok: true, status: request.status, data: last.result as Record<string, unknown> });
          return;
        }
        if (last && "error" in last) {
          const status = Number(last.status);
          resolve({ ok: false, status: Number.isFinite(status) && status > 0 ? status : 502, data: last });
          return;
        }
        /* The stream ended with no answer in it - the server was stopped, or
           the connection dropped, after the write may already have landed.
           That is "could not ask", not a failure (rule 6), and it says so. */
        resolve({
          ok: false,
          status: 502,
          data: {
            error:
              "The server stopped before saying whether the file was saved. Refresh the list to check before uploading it again.",
          },
        });
        return;
      }
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(request.responseText) as Record<string, unknown>;
      } catch {
        // A non-JSON body is still a result; the status carries the meaning.
      }
      /* **A 413 with no sentence is the platform's, not a route's.** Every
         upload route words its own 413 in JSON; a body over Vercel's 4.5MB is
         refused before any of them runs, and arrived on screen as
         "Upload failed (413)" (reported 2026-09-29). Worded here, once, for
         every caller (rule 20), with the size of what was sent. */
      if (request.status === 413 && typeof data.error !== "string") {
        data = { ...data, error: platformTooLargeMessage(filesSize(body)) };
      }
      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, data });
    };
    request.onerror = () => reject(new Error("Could not reach the server. Check your connection and try again."));
    request.onabort = () => reject(new Error("Upload cancelled"));
    /*
     * **`name`, not the message.** Callers written against `fetch` +
     * `AbortSignal.timeout` branch on `error.name === "TimeoutError"` to turn a
     * timeout into their own sentence - the quotation reader says "try a
     * smaller file, or one with fewer pages". An `Error` whose *message* is
     * "TimeoutError" carries the name "Error", so that branch misses and the
     * word itself is printed at the user. Swapping fetch for XHR must not
     * change what a timeout looks like from outside.
     */
    request.ontimeout = () => {
      const timeout = new Error("The request took too long and was stopped");
      timeout.name = "TimeoutError";
      reject(timeout);
    };

    request.send(body);
  });
}

/** The bytes of the files in a form - what the reader chose, not the envelope. */
function filesSize(body: FormData): number | null {
  let total = 0;
  for (const value of body.values()) {
    if (typeof value !== "string") total += value.size;
  }
  return total > 0 ? total : null;
}
