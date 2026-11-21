// Web parity phase 23: reading server-sent events (the web's readSse in apps/web/src/api.js). Pure parts first, so they can be tested:
// UTF-8 bytes are decoded as they arrive (a Hindi letter can be cut between two chunks), and the text is cut into events at blank lines.

export interface SseEvent {
  name: string;
  data: unknown;
}

/** Decodes UTF-8 a chunk at a time, keeping an unfinished character for the next chunk. Works where TextDecoder is missing. */
export function utf8Decoder() {
  let rest: number[] = [];
  return (chunk: Uint8Array, last = false): string => {
    const b = rest.length ? Uint8Array.from([...rest, ...chunk]) : chunk;
    rest = [];
    let out = '';
    let i = 0;
    while (i < b.length) {
      const c = b[i]!;
      const len = c < 0x80 ? 1 : c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
      if (i + len > b.length) {
        if (!last) rest = Array.from(b.slice(i));
        else out += '�';
        break;
      }
      let cp = len === 1 ? (c < 0x80 ? c : 0xfffd) : c & (0xff >> (len + 1));
      for (let j = 1; j < len; j++) cp = (cp << 6) | (b[i + j]! & 0x3f);
      out += String.fromCodePoint(cp);
      i += len;
    }
    return out;
  };
}

/** Cuts complete events off the front of the buffer; what is left is an unfinished event. Lines other than event/data are ignored. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  for (const block of parts) {
    let name = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) continue;
    const raw = data.join('\n');
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    events.push({ name, data: parsed });
  }
  return { events, rest };
}

interface ReadableLike {
  getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
}
/** Reads every event of a response as it arrives; a response that cannot be read piece by piece is read whole. */
export async function readSse(
  res: { body?: unknown; text(): Promise<string> },
  onEvent: (e: SseEvent) => void,
): Promise<void> {
  const body = res.body as ReadableLike | null | undefined;
  if (!body || typeof body.getReader !== 'function') {
    for (const e of parseSse(`${await res.text()}\n\n`).events) onEvent(e);
    return;
  }
  const reader = body.getReader();
  const decode = utf8Decoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decode(value);
    if (done) buf += decode(new Uint8Array(), true);
    const { events, rest } = parseSse(done ? `${buf}\n\n` : buf);
    buf = rest;
    for (const e of events) onEvent(e);
    if (done) return;
  }
}
