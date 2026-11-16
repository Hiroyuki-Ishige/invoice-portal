/**
 * **Reading a response that arrives one JSON object per line.**
 *
 * Two screens stream their progress this way - Copy budget to other Q (a line per
 * schedule written) and the budget explanation AI review (a line per step) - and
 * both need the same care, so it is written once (rule 20). It lived inline in the
 * copy page until the review needed it on 2026-09-15.
 *
 * **A chunk is not a line.** A read can end in the middle of an object and two
 * lines can arrive in one chunk, so the unfinished tail is carried to the next
 * read and only whole lines are parsed. Getting that wrong shows up as a counter
 * that freezes near the end - the exact thing a progress display exists to
 * prevent. A last line with no newline is flushed when the stream ends, and a
 * line that is not JSON is skipped rather than ending the read.
 *
 * `createNdjsonSplitter` is pure so a script can drive the chunk boundaries.
 */

function parseLines(lines: readonly string[]): unknown[] {
  const messages: unknown[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // One malformed line costs that line, not the rest of the stream.
    }
  }
  return messages;
}

export function createNdjsonSplitter(): {
  /** Adds decoded text; returns the messages of every line it completed. */
  push: (text: string) => unknown[];
  /** The stream ended: the unterminated last line, if any. */
  flush: () => unknown[];
} {
  let tail = "";
  return {
    push(text: string) {
      tail += text;
      const lines = tail.split("\n");
      tail = lines.pop() ?? "";
      return parseLines(lines);
    },
    flush() {
      const rest = tail;
      tail = "";
      return parseLines([rest]);
    },
  };
}

/**
 * Calls `onMessage` for each object as it arrives. Resolves `false` when the
 * response has no body to read - the caller says so rather than waiting forever.
 */
export async function readNdjson(response: Response, onMessage: (message: unknown) => void): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  const splitter = createNdjsonSplitter();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const message of splitter.push(decoder.decode(value, { stream: true }))) onMessage(message);
  }
  for (const message of splitter.push(decoder.decode())) onMessage(message);
  for (const message of splitter.flush()) onMessage(message);
  return true;
}
