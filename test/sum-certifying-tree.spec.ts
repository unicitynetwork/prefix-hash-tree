import { DataHasherFactory } from "@unicitylabs/commons/lib/hash/DataHasherFactory.js";
import { HashAlgorithm } from "@unicitylabs/commons/lib/hash/HashAlgorithm.js";
import { NodeDataHasher } from "@unicitylabs/commons/lib/hash/NodeDataHasher.js";
import { HexConverter } from "@unicitylabs/commons/lib/util/HexConverter.js";
import { assert } from "chai";

import { sha256 } from "./utils.js";
import { SumLeaf, SumTree } from "../src/index.js";
import { setSkipNegativeValueCheck, ValidationResult } from "../src/smt.js";

describe("Sum-Certifying Tree", function () {
  it("should build a tree with numeric values and compute correct sums", async function () {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [
        0b100000000n,
        {
          value: HexConverter.encode(await sha256("value-1")),
          numericValue: 100n,
        },
      ],
      [
        0b100010000n,
        {
          value: HexConverter.encode(await sha256("value-2")),
          numericValue: 200n,
        },
      ],
      [
        0b101000000n,
        {
          value: HexConverter.encode(await sha256("value-3")),
          numericValue: 300n,
        },
      ],
    ]);

    const tree = new SumTree(
      new DataHasherFactory(NodeDataHasher),
      HashAlgorithm.SHA256,
      leaves,
      8n,
    );

    assert.equal(await tree.getRootSum(), 600n);

    for (const [pathNum, leaf] of leaves) {
      const path = await tree.getProof(pathNum);

      assert.isTrue(
        await path.provesInclusionAt(pathNum),
        `Path ${pathNum.toString(2)} should be included`,
      );
      assert.equal(
        path.getLeafValue(),
        leaf.value,
        `Value for path ${pathNum.toString(2)} is incorrect`,
      );
      assert.equal(
        path.getRootSum(),
        600n,
        `Root sum for path ${pathNum.toString(2)} is incorrect`,
      );
    }
  });

  it("should update sum when adding a leaf", async function () {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [
        0b100000000n,
        {
          value: HexConverter.encode(await sha256("value-1")),
          numericValue: 100n,
        },
      ],
      [
        0b100010000n,
        {
          value: HexConverter.encode(await sha256("value-2")),
          numericValue: 200n,
        },
      ],
    ]);

    const tree = new SumTree(
      new DataHasherFactory(NodeDataHasher),
      HashAlgorithm.SHA256,
      leaves,
      8n,
    );

    // Initial sum should be 100 + 200 = 300
    assert.equal(await tree.getRootSum(), 300n);

    tree.addLeaf(0b101000000n, {
      value: HexConverter.encode(await sha256("value-3")),
      numericValue: 300n,
    });

    assert.equal(await tree.getRootSum(), 600n);

    const path = await tree.getProof(0b101000000n);
    assert.isTrue(await path.provesInclusionAt(0b101000000n));
    assert.equal(
      path.getLeafValue(),
      HexConverter.encode(await sha256("value-3")),
    );
    assert.equal(path.getRootSum(), 600n);
  });

  it("should handle complex tree structures with mixture of left and right children", async function () {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [
        0b1000n,
        {
          value: HexConverter.encode(await sha256("left-1")),
          numericValue: 10n,
        },
      ],
      [
        0b1001n,
        {
          value: HexConverter.encode(await sha256("left-2")),
          numericValue: 20n,
        },
      ],
      [
        0b1010n,
        {
          value: HexConverter.encode(await sha256("right-1")),
          numericValue: 30n,
        },
      ],
      [
        0b1011n,
        {
          value: HexConverter.encode(await sha256("right-2")),
          numericValue: 40n,
        },
      ],
    ]);

    const tree = new SumTree(
      new DataHasherFactory(NodeDataHasher),
      HashAlgorithm.SHA256,
      leaves,
      3n,
    );

    assert.equal(await tree.getRootSum(), 100n);

    const path1 = await tree.getProof(0b1000n);
    const path2 = await tree.getProof(0b1001n);
    const path3 = await tree.getProof(0b1010n);
    const path4 = await tree.getProof(0b1011n);

    assert.equal(path1.getRootSum(), 100n);
    assert.equal(path2.getRootSum(), 100n);
    assert.equal(path3.getRootSum(), 100n);
    assert.equal(path4.getRootSum(), 100n);

    assert.equal(
      HexConverter.encode(path1.getRootHash()!),
      "b61201658733cbd385e40c262b75dd583499242744e915ea04bd358b33362fd8",
    );
    assert.equal(
      HexConverter.encode(path2.getRootHash()!),
      "b61201658733cbd385e40c262b75dd583499242744e915ea04bd358b33362fd8",
    );
    assert.equal(
      HexConverter.encode(path3.getRootHash()!),
      "b61201658733cbd385e40c262b75dd583499242744e915ea04bd358b33362fd8",
    );
    assert.equal(
      HexConverter.encode(path4.getRootHash()!),
      "b61201658733cbd385e40c262b75dd583499242744e915ea04bd358b33362fd8",
    );

    assert.equal(
      path1.getLeafValue(),
      HexConverter.encode(await sha256("left-1")),
    );
    assert.equal(
      path2.getLeafValue(),
      HexConverter.encode(await sha256("left-2")),
    );
    assert.equal(
      path3.getLeafValue(),
      HexConverter.encode(await sha256("right-1")),
    );
    assert.equal(
      path4.getLeafValue(),
      HexConverter.encode(await sha256("right-2")),
    );

    assert.equal(path1.getLeafNumericValue(), 10n);
    assert.equal(path2.getLeafNumericValue(), 20n);
    assert.equal(path3.getLeafNumericValue(), 30n);
    assert.equal(path4.getLeafNumericValue(), 40n);
  });
});

describe("SumPath Validation", function () {
  describe("allNumericValuesOnPathArePositiveOrZero", function () {
    let treeWithNegativeValue: SumTree;
    const positivePath = 0b10n;
    const negativePath = 0b11n;

    beforeEach(async function () {
      const leaves: Map<bigint, SumLeaf> = new Map([
        [
          positivePath,
          { value: await sha256("positive-leaf"), numericValue: 100n },
        ],
        [
          negativePath,
          { value: await sha256("negative-leaf"), numericValue: -50n },
        ],
      ]);

      setSkipNegativeValueCheck(true);
      try {
        treeWithNegativeValue = new SumTree(
          new DataHasherFactory(NodeDataHasher),
          HashAlgorithm.SHA256,
          leaves,
          1n,
        );
        assert.equal(await treeWithNegativeValue.getRootSum(), 50n);
      } finally {
        setSkipNegativeValueCheck(false);
      }
    });

    it("should fail verification for the path of the leaf with a negative numericValue", async function () {
      let proof;
      setSkipNegativeValueCheck(true);
      try {
        proof = await treeWithNegativeValue.getProof(negativePath);
      } finally {
        setSkipNegativeValueCheck(false);
      }
      const verificationResult: ValidationResult = await proof.verifyPath();

      assert.isFalse(verificationResult.success);
      assert.strictEqual(
        verificationResult.error,
        "Negative numeric values are not allowed on any part of the path",
        "Incorrect error message",
      );
    });

    it("should fail verification for the path of a positive leaf if its sibling has a negative sum", async function () {
      let proof;
      setSkipNegativeValueCheck(true);
      try {
        proof = await treeWithNegativeValue.getProof(positivePath);
      } finally {
        setSkipNegativeValueCheck(false);
      }
      const verificationResult: ValidationResult = await proof.verifyPath();

      assert.isFalse(verificationResult.success);
      assert.strictEqual(
        verificationResult.error,
        "Negative numeric values are not allowed on any part of the path",
        "Incorrect error message",
      );
    });
  });
});
