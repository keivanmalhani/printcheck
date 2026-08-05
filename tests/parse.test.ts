import { describe, expect, it } from "vitest";

import { MAX_TRIANGLES, StlParseError, parseSTL } from "../src/core/parse";
import { box, soupToMesh, toAsciiSTL, toBinarySTL } from "../src/core/shapes";

const cube = soupToMesh(box(0, 0, 5, 10, 10, 10));

describe("binary STL", () => {
  it("round-trips a cube", () => {
    const parsed = parseSTL(toBinarySTL(cube.positions));
    expect(parsed.format).toBe("binary");
    expect(parsed.triCount).toBe(12);
    expect([...parsed.positions]).toEqual([...cube.positions]);
  });

  it("recomputes normals from winding, ignoring stored zeros", () => {
    const parsed = parseSTL(toBinarySTL(cube.positions));
    // the serializer writes zero normals; the top face must still be +z
    const top = [...parsed.normals].some(
      (_, i) => i % 3 === 2 && parsed.normals[i] > 0.99,
    );
    expect(top).toBe(true);
  });

  it("rejects a triangle count over the cap", () => {
    const buffer = new ArrayBuffer(84 + 50);
    new DataView(buffer).setUint32(80, MAX_TRIANGLES + 1, true);
    expect(() => parseSTL(buffer)).toThrow(StlParseError);
  });
});

describe("ascii STL", () => {
  it("round-trips a cube", () => {
    const text = toAsciiSTL(cube.positions);
    const parsed = parseSTL(new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(parsed.format).toBe("ascii");
    expect(parsed.triCount).toBe(12);
  });

  it("handles scientific notation coordinates", () => {
    const text = [
      "solid s",
      "facet normal 0 0 0",
      "outer loop",
      "vertex 1.5e1 0 0",
      "vertex 0 1E+1 0",
      "vertex 0 0 -2.5e-1",
      "endloop",
      "endfacet",
      "endsolid s",
    ].join("\n");
    const parsed = parseSTL(new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(parsed.triCount).toBe(1);
    expect(parsed.positions[0]).toBeCloseTo(15);
    expect(parsed.positions[4]).toBeCloseTo(10);
    expect(parsed.positions[8]).toBeCloseTo(-0.25);
  });
});

describe("garbage", () => {
  it("rejects random bytes", () => {
    const junk = new TextEncoder().encode("this is definitely not an stl file at all");
    expect(() => parseSTL(junk.buffer as ArrayBuffer)).toThrow(StlParseError);
  });

  it("rejects the empty file", () => {
    expect(() => parseSTL(new ArrayBuffer(0))).toThrow(StlParseError);
  });

  it("a lying 'solid' prefix on binary data still parses as binary", () => {
    // many exporters write binary files that start with "solid"
    const buffer = toBinarySTL(cube.positions);
    const bytes = new Uint8Array(buffer);
    bytes.set(new TextEncoder().encode("solid lying-exporter"), 0);
    const parsed = parseSTL(buffer);
    expect(parsed.format).toBe("binary");
    expect(parsed.triCount).toBe(12);
  });
});
