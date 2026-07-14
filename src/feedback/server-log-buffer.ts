// Keeps a ring buffer of recent server output (Nest logger writes to
// stdout/stderr directly) so feedback reports can include a slice of the
// server-side context around the moment the feedback was submitted.

const MAX_LINES = 500;
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

// `lines` only holds the most recent MAX_LINES, but `totalPushed` counts every
// line ever written. The absolute index of lines[0] is therefore
// `totalPushed - lines.length`, which lets a caller anchor a window at a point
// in time and still resolve it correctly after the buffer has been trimmed.
const lines: string[] = [];
let totalPushed = 0;
let installed = false;

export function installServerLogBuffer() {
  if (installed) return;
  installed = true;

  for (const stream of [process.stdout, process.stderr] as const) {
    const originalWrite = stream.write.bind(stream);

    stream.write = ((chunk: unknown, ...args: unknown[]) => {
      try {
        const text =
          typeof chunk === 'string'
            ? chunk
            : Buffer.isBuffer(chunk)
              ? chunk.toString('utf8')
              : '';

        for (const line of text.replace(ANSI_PATTERN, '').split('\n')) {
          if (line.trim()) {
            lines.push(line);
            totalPushed += 1;
          }
        }

        if (lines.length > MAX_LINES) {
          lines.splice(0, lines.length - MAX_LINES);
        }
      } catch {
        // Logging must never break because of the buffer.
      }

      return (originalWrite as (...writeArgs: unknown[]) => boolean)(chunk, ...args);
    }) as typeof stream.write;
  }
}

/** The current write position — pass this as the anchor to getServerLogWindow. */
export function currentLogPosition(): number {
  return totalPushed;
}

/**
 * Returns the log lines in the window [anchor - before, anchor + after),
 * clamped to whatever is still retained in the buffer.
 */
export function getServerLogWindow(anchor: number, before: number, after: number): string {
  const base = totalPushed - lines.length;
  const from = Math.max(0, anchor - before);
  const to = anchor + after;

  const window: string[] = [];
  for (let absolute = from; absolute < to; absolute += 1) {
    const index = absolute - base;
    if (index >= 0 && index < lines.length) {
      window.push(lines[index]);
    }
  }

  return window.join('\n');
}
