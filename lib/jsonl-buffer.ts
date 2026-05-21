/**
 * Incremental JSONL parser. Feed it bytes; it yields parsed JSON objects when complete
 * lines arrive. Tolerates partial trailing lines across feeds.
 */
export class JsonlBuffer<T = unknown> {
  private buffer = "";

  push(chunk: string): T[] {
    this.buffer += chunk;
    const out: T[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        out.push(JSON.parse(line) as T);
      } catch {
        // Skip malformed lines (e.g. partial stderr noise).
      }
    }
    return out;
  }

  flush(): T[] {
    const tail = this.buffer.trim();
    this.buffer = "";
    if (!tail) return [];
    try {
      return [JSON.parse(tail) as T];
    } catch {
      return [];
    }
  }
}
