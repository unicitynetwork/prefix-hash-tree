import { DataHasherFactory } from "@unicitylabs/commons/lib/hash/DataHasherFactory.js";
import { HashAlgorithm } from "@unicitylabs/commons/lib/hash/HashAlgorithm.js";
import { NodeDataHasher } from "@unicitylabs/commons/lib/hash/NodeDataHasher.js";
import { HexConverter } from "@unicitylabs/commons/lib/util/HexConverter.js";
import { assert } from "chai";

import { sha256 } from "./utils.js";
import { SumLeaf, SMT, SumTree } from "../src/index.js";

describe("Sum-Certifying Tree Example", function () {
  let tree: SumTree;

  this.beforeEach(async function () {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [0b0n, { value: await sha256("value-1"), numericValue: 100n }],
      [0b10000n, { value: await sha256("value-2"), numericValue: 200n }],
      [0b1000000n, { value: await sha256("value-3"), numericValue: 300n }],
    ]);

    tree = new SumTree(
      new DataHasherFactory(NodeDataHasher),
      HashAlgorithm.SHA256,
      leaves,
    );
  });

  it("shows tree root information", async function () {
    assert.equal(await tree.getRootSum(), 600n);
    assert.equal(
      HexConverter.encode(await tree.getRootHash()),
      "fef5cfb1f61e731452f1d643818493104213c20eb7ee9c96f1cb3409459d32df",
    );
  });

  it("shows working with proofs", async function () {
    const path = await tree.getProof(0b1000000n);
    assert.isTrue(await path.provesInclusionAt(0b1000000n));

    assert.equal(path.getLocation(), 0b1000000n);

    assert.deepStrictEqual(path.getItems(), [
      {
        type: "sumRoot",
        rootHash: HexConverter.decode(
          "fef5cfb1f61e731452f1d643818493104213c20eb7ee9c96f1cb3409459d32df",
        ),
        sum: 600n,
      },
      {
        type: "sumInternalNode",
        prefix: 16n,
        siblingHash: undefined,
        siblingSum: undefined,
      },
      {
        type: "sumInternalNode",
        prefix: 4n,
        siblingHash: HexConverter.decode(
          "30f38d28a56b235395af39954e5d6f5c510b2e3e92cb15dcc0f0735734a504c0",
        ),
        siblingSum: 200n,
      },
      {
        type: "sumInternalNode",
        prefix: (1n << (256n - 4n - 2n)) + 1n,
        siblingHash: HexConverter.decode(
          "f000a5b8e30680039f0bc339ef5f9f290fa29443b452b576796e52beeb132c1d",
        ),
        siblingSum: 100n,
      },
      {
        type: "sumLeaf",
        value: HexConverter.decode(
          "93f9c50853d1ba7b4dc6244a2a64b2f427cd612ae34a3cad638ef5bc14cc7ecb",
        ),
        numericValue: 300n,
      },
    ]);

    assert.equal(
      HexConverter.encode(path.getLeafValue()! as Uint8Array),
      HexConverter.encode(await sha256("value-3")),
    );
    assert.equal(path.getLeafNumericValue(), 300n);

    assert.equal(path.getRootSum(), 600n);
    assert.equal(
      HexConverter.encode(path.getRootHash()!),
      "fef5cfb1f61e731452f1d643818493104213c20eb7ee9c96f1cb3409459d32df",
    );
  });
});
