import { describe, expect, it } from "vitest";
import { JsonlBuffer } from "../../lib/jsonl-buffer";

describe("JsonlBuffer", () => {
  it("yields complete JSON lines and buffers partial lines", () => {
    const buf = new JsonlBuffer<{ n: number }>();
    expect(buf.push(`{"n":1}\n{"n":2}\n`)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(buf.push(`{"n":3}`)).toEqual([]);
    expect(buf.push(`\n`)).toEqual([{ n: 3 }]);
  });

  it("skips malformed lines without throwing", () => {
    const buf = new JsonlBuffer();
    expect(buf.push(`{bad}\n{"ok":true}\n`)).toEqual([{ ok: true }]);
  });

  it("flush returns any complete trailing JSON object", () => {
    const buf = new JsonlBuffer<{ tail: number }>();
    buf.push(`{"tail":1}`);
    expect(buf.flush()).toEqual([{ tail: 1 }]);
  });

  it("ignores empty lines between events", () => {
    const buf = new JsonlBuffer();
    expect(buf.push(`\n\n{"n":1}\n\n`)).toEqual([{ n: 1 }]);
  });
});
