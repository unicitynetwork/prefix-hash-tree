import { DataHasherFactory } from "@unicitylabs/commons/lib/hash/DataHasherFactory.js";
import { HashAlgorithm } from "@unicitylabs/commons/lib/hash/HashAlgorithm.js";
import { NodeDataHasher } from "@unicitylabs/commons/lib/hash/NodeDataHasher.js";
import { HexConverter } from "@unicitylabs/commons/lib/util/HexConverter.js";
import { assert } from "chai";

import { sha256 } from "./utils.js";
import { Leaf, SMT, SumTree, Path, SumPath } from "../src/index.js";

type Tree = SMT | SumTree;

const testConfigs = [
  {
    name: "SMT routines",
    isSumTree: false,
    createTree: (leaves: Map<bigint, Leaf>) =>
      new SMT(
        new DataHasherFactory(NodeDataHasher),
        HashAlgorithm.SHA256,
        leaves,
        false,
      ),
  },
  {
    name: "Sum tree routines",
    isSumTree: true,
    createTree: (leaves: Map<bigint, Leaf>) =>
      new SumTree(
        new DataHasherFactory(NodeDataHasher),
        HashAlgorithm.SHA256,
        new Map(
          Array.from(leaves).map(([path, leaf]) => [
            path,
            { ...leaf, numericValue: path + 99n },
          ]),
        ),
        false,
      ),
  },
];

testConfigs.forEach((config) => {
  describe(`${config.name}: All possible tree shapes for depth of 3`, function () {
    const allPathBits = [
      "000",
      "001",
      "010",
      "011",
      "100",
      "101",
      "110",
      "111",
    ];

    const allPaths = allPathBits.map((bits) => BigInt("0b1" + bits));

    it("should have all paths working correctly", async function () {
      this.timeout(100000);

      for (let pathsBitmap = 0; pathsBitmap < 256; pathsBitmap++) {
        const selectedPathsUnpremuted = selectPathsByBitmap(
          allPaths,
          pathsBitmap,
        );

        [
          selectedPathsUnpremuted,
          selectedPathsUnpremuted.reverse() /*...permutations(selectedPathsUnpremuted)*/,
        ].forEach(async (selectedPaths) => {
          const leaves = await Promise.all(
            selectedPaths.map(async (path) => {
              const hashValue = await sha256(`value-${path}`);
              const result: [bigint, { value: string }] = [
                path,
                { value: HexConverter.encode(hashValue) },
              ];
              return result;
            }),
          );
          const tree = config.createTree(new Map(leaves));
          await assertPaths(selectedPaths, tree);
        });
      }

      async function assertPaths(selectedPaths: bigint[], tree: Tree) {
        for (let j = 0; j < 8; j++) {
          const path = allPaths[j];
          const shouldBeIncluded = selectedPaths.includes(path);

          const treePath = await tree.getProof(path);

          assert.equal(
            await safeIncludesPath(treePath, path),
            shouldBeIncluded,
            `Tree ${selectedPaths}: Path ${allPathBits[j]} should ${shouldBeIncluded ? "" : "NOT "}be included`,
          );

          if (shouldBeIncluded) {
            assert.equal(
              safeExtractValue(treePath),
              HexConverter.encode(await sha256(`value-${allPaths[j]}`)),
              `Tree ${selectedPaths}: Value for path ${allPathBits[j]} is incorrect`,
            );
          }
        }
      }
    });
  });
});

function selectPathsByBitmap(allPaths: bigint[], pathsCombination: number) {
  return allPaths.filter((_, index) => {
    return (pathsCombination & (1 << index)) !== 0;
  });
}

async function safeIncludesPath(
  treePath: Path | SumPath,
  path: bigint,
): Promise<boolean> {
  try {
    const result = await treePath.provesInclusionAt(path);
    return result;
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("Path has no leaf value") ||
        e.message.includes("Path integrity check fail"))
    ) {
      return false;
    }
    // Re-throw any other errors
    throw e;
  }
}

function safeExtractValue(treePath: Path | SumPath): string | undefined {
  try {
    const value = treePath.getLeafValue();
    return typeof value === "string" ? value : undefined;
  } catch (e) {
    return undefined;
  }
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length === 0) return [[]];

  return arr.flatMap((value, index) => {
    const remaining = [...arr.slice(0, index), ...arr.slice(index + 1)];
    return permutations(remaining).map((perm) => [value, ...perm]);
  });
}

describe("Array utils", function () {
  it("should be able to permute arrays", function () {
    assert.equal("[[]]", JSON.stringify(permutations([])));
    assert.equal("[[1]]", JSON.stringify(permutations([1])));
    assert.equal(
      "[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]",
      JSON.stringify(permutations([1, 2, 3])),
    );

    assert.equal(
      '[["1","2"],["2","1"]]',
      JSON.stringify(permutations(["1", "2"])),
    );
  });
});
