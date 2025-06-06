export function stringToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value);
  }
  return new TextEncoder().encode(value);
}
