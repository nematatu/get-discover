export type ProtoField = {
  field: number;
  wire: number;
  value?: bigint;
  data?: Buffer;
};

export function varint(n: number | bigint): Buffer {
  let value = BigInt(n);
  const bytes: number[] = [];

  while (value >= 0x80n) {
    bytes.push(Number((value & 0x7fn) | 0x80n));
    value >>= 7n;
  }

  bytes.push(Number(value));
  return Buffer.from(bytes);
}

export function key(field: number, wire: number): Buffer {
  return varint(BigInt(field) * 8n + BigInt(wire));
}

export function vint(field: number, value: number | bigint): Buffer {
  return Buffer.concat([key(field, 0), varint(value)]);
}

export function bytes(field: number, value: Buffer): Buffer {
  return Buffer.concat([
    key(field, 2),
    varint(value.length),
    value,
  ]);
}

export function str(field: number, value: string): Buffer {
  return bytes(field, Buffer.from(value));
}

export function float32(field: number, value: number): Buffer {
  const encoded = Buffer.alloc(4);
  encoded.writeFloatLE(value);
  return Buffer.concat([key(field, 5), encoded]);
}

export function readVarint(
  buffer: Buffer,
  start: number,
): [bigint, number] {
  let value = 0n;
  let shift = 0n;
  let position = start;

  while (position < buffer.length) {
    const byte = buffer[position++];
    value |= BigInt(byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) {
      return [value, position];
    }

    shift += 7n;

    if (shift > 70n) {
      throw new Error("Invalid protobuf varint");
    }
  }

  throw new Error("Truncated protobuf varint");
}

export function parseProto(buffer: Buffer): ProtoField[] {
  const fields: ProtoField[] = [];
  let position = 0;

  while (position < buffer.length) {
    const [tag, afterTag] = readVarint(buffer, position);
    position = afterTag;

    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);

    if (field === 0) {
      throw new Error("Invalid protobuf field number");
    }

    if (wire === 0) {
      const [value, next] = readVarint(buffer, position);
      position = next;
      fields.push({ field, wire, value });
      continue;
    }

    if (wire === 1) {
      if (position + 8 > buffer.length) {
        throw new Error("Truncated protobuf fixed64");
      }

      fields.push({
        field,
        wire,
        data: buffer.subarray(position, position + 8),
      });
      position += 8;
      continue;
    }

    if (wire === 2) {
      const [lengthBig, next] = readVarint(buffer, position);
      position = next;

      const length = Number(lengthBig);
      const end = position + length;

      if (end > buffer.length) {
        throw new Error("Truncated protobuf bytes");
      }

      fields.push({
        field,
        wire,
        data: buffer.subarray(position, end),
      });
      position = end;
      continue;
    }

    if (wire === 5) {
      if (position + 4 > buffer.length) {
        throw new Error("Truncated protobuf fixed32");
      }

      fields.push({
        field,
        wire,
        data: buffer.subarray(position, position + 4),
      });
      position += 4;
      continue;
    }

    throw new Error(`Unsupported protobuf wire type: ${wire}`);
  }

  return fields;
}

export function messages(buffer: Buffer, field: number): Buffer[] {
  return parseProto(buffer)
    .filter(
      (item) =>
        item.field === field &&
        item.wire === 2 &&
        item.data !== undefined,
    )
    .map((item) => item.data!);
}

export function protoString(buffer: Buffer, field: number): string {
  return messages(buffer, field)[0]?.toString("utf8") ?? "";
}
