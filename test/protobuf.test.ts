import { describe, expect, test } from "bun:test";
import {
  bytes,
  messages,
  parseProto,
  protoString,
  readVarint,
  str,
  varint,
  vint,
} from "../src/protobuf";

describe("protobuf codec", () => {
  test("encodes and decodes varints", () => {
    for (const value of [0, 1, 127, 128, 300, 16384, 341477699]) {
      const encoded = varint(value);
      const [decoded, offset] = readVarint(encoded, 0);

      expect(decoded).toBe(BigInt(value));
      expect(offset).toBe(encoded.length);
    }
  });

  test("reads varint and length-delimited fields", () => {
    const message = Buffer.concat([
      vint(1, 42),
      str(2, "discover"),
    ]);

    const fields = parseProto(message);

    expect(fields[0].field).toBe(1);
    expect(fields[0].value).toBe(42n);
    expect(protoString(message, 2)).toBe("discover");
  });

  test("extracts nested messages", () => {
    const child = str(1, "nested");
    const parent = bytes(1000, child);

    expect(messages(parent, 1000)).toHaveLength(1);
    expect(protoString(messages(parent, 1000)[0], 1)).toBe("nested");
  });
});
