/**
 * **A file sent in blocks: start, each block, commit** - the browser half of
 * the budget explanation upload (`api/dataverse/item-explanations/[itemId]/files`,
 * 2026-09-29). A Vercel function takes 4.5MB at most; a 10MB file sent whole
 * was refused by the platform as a bare 413.
 *
 * Progress is the bytes of the file that have gone up, across every block, and
 * it reaches 100% only when the **last block has been accepted** - a block's
 * last byte leaving the browser is not the server having passed it on, so the
 * figure is held just short until the answer arrives. What follows 100% is the
 * commit, which is the caller's "saving" stage.
 *
 * Answers in `postWithProgress`'s shape, so a caller reads a refusal from any
 * step the same way.
 */
import { postWithProgress } from "@/lib/utils/post-with-progress";

type Answer = { ok: boolean; status: number; data: Record<string, unknown> };

async function postJson(url: string, body: unknown): Promise<Answer> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

function withStep(url: string, step: "start" | "block" | "commit"): string {
  return `${url}${url.includes("?") ? "&" : "?"}step=${step}`;
}

export async function uploadInBlocks(
  url: string,
  file: File,
  onProgress: (percent: number, sent: { loaded: number; total: number }) => void,
  /**
   * What the route needs besides the file - a ringi attachment's category and
   * supplier, a rule document's title. Sent with **both** start and commit,
   * because the commit asks every question again.
   */
  fields: Record<string, string> = {}
): Promise<Answer> {
  /* The browser's declared type goes too: the ringi attachments route has
     always decided by it; the routes that decide by the name ignore it. */
  const description = { ...fields, filename: file.name, size: file.size, mimetype: file.type };
  const started = await postJson(withStep(url, "start"), description);
  if (!started.ok) return started;

  const session = started.data.session;
  const blockBytes = Number(started.data.blockBytes);
  if (typeof session !== "string" || !Number.isFinite(blockBytes) || blockBytes <= 0) {
    return { ok: false, status: 502, data: { error: "The server did not open the upload. Try again." } };
  }

  const total = file.size;
  const report = (loaded: number) =>
    onProgress(Math.round((loaded / total) * 100), { loaded, total });

  for (let index = 0, offset = 0; offset < total; index++, offset += blockBytes) {
    const piece = file.slice(offset, Math.min(offset + blockBytes, total));
    const form = new FormData();
    form.append("session", session);
    form.append("index", String(index));
    form.append("block", piece, file.name);
    const answer = await postWithProgress(withStep(url, "block"), form, (_percent, sent) => {
      if (!sent || sent.total <= 0) return;
      /* Held one byte short until the block is accepted - see the header. */
      report(Math.min(total - 1, offset + (sent.loaded / sent.total) * piece.size));
    });
    if (!answer.ok) return answer;
  }
  report(total);

  return postJson(withStep(url, "commit"), { ...description, session });
}
