import { HashAlgorithm } from "@unicitylabs/commons/lib/hash/HashAlgorithm.js";
import { NodeDataHasher } from "@unicitylabs/commons/lib/hash/NodeDataHasher.js";
import { stringToBytes } from "../src/utils.js";

export async function sha256(
  value: string,
): Promise<Uint8Array<ArrayBufferLike>> {
  return (
    await new NodeDataHasher(HashAlgorithm.SHA256)
      .update(stringToBytes(value))
      .digest()
  ).data;
}
