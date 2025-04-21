/// <reference path="../src/types/unicitylabs__utils.d.ts" />
import { assert } from 'chai';
import { smthash, wordArrayToHex } from '@unicitylabs/utils';

import { SMT, Path } from '../src/index.js';

describe('All possible tree shapes for depth of 3', function() {
  const allPathBits = [
    '000', '001', '010', '011', 
    '100', '101', '110', '111'
  ];
  
  const allPaths = allPathBits.map(bits => BigInt('0b1' + bits));
  
  it('should have all paths working correctly', function() {
    this.timeout(100000);

    for (let pathsBitmap = 0; pathsBitmap < 256; pathsBitmap++) {
      const selectedPathsUnpremuted = selectPathsByBitmap(allPaths, pathsBitmap);

      [selectedPathsUnpremuted, selectedPathsUnpremuted.reverse(), /*...permutations(selectedPathsUnpremuted)*/].forEach(selectedPaths => {
        const tree = new SMT(
          smthash, 
          selectedPaths.map(path => {
            return {
              path: path,
              value: wordArrayToHex(smthash(`value-${path}`))
            };
          })
        );
        assertPaths(selectedPaths, tree);
      });
      
    }

    function assertPaths(selectedPaths: bigint[], tree: SMT) {
      for (let j = 0; j < 8; j++) {
        const path = allPaths[j];
        const shouldBeIncluded = selectedPaths.includes(path);

        const treePath = tree.getProof(path);

        assert.equal(
          safeIncludesPath(treePath, path),
          shouldBeIncluded,
          `Tree ${selectedPaths}: Path ${allPathBits[j]} should ${shouldBeIncluded ? '' : 'NOT '}be included`
        );

        if (shouldBeIncluded) {
          assert.equal(
            safeExtractValue(treePath),
            wordArrayToHex(smthash(`value-${allPaths[j]}`)),
            `Tree ${selectedPaths}: Value for path ${allPathBits[j]} is incorrect`
          );
        }
      }
    }
  });
});

function selectPathsByBitmap(allPaths: bigint[], pathsCombination: number) {
  return allPaths.filter((_, index) => {
    return (pathsCombination & (1 << index)) !== 0;
  });
}

function safeIncludesPath(treePath: Path, path: bigint): boolean {
  try {
    const result = treePath.provesInclusionAt(path);
    return result;
  } catch (e) {
    if (e instanceof Error && 
        (e.message.includes('Path has no leaf value') || 
         e.message.includes('Path integrity check fail'))) {
      return false;
    }
    // Re-throw any other errors
    throw e;
  }
}

function safeExtractValue(treePath: Path): string | undefined {
  try {
    const value = treePath.getLeafValue();
    return typeof value === 'string' ? value : undefined;
  } catch (e) {
    return undefined;
  }
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length === 0) return [[]];
  
  return arr.flatMap((value, index) => {
    const remaining = [...arr.slice(0, index), ...arr.slice(index + 1)];
    return permutations(remaining).map(perm => [value, ...perm]);
  });
}

describe('Array utils', function() {
  it('should be able to permute arrays', function() {
    assert.equal(
      '[[]]',
      JSON.stringify(permutations([]))
    );
    assert.equal(
      '[[1]]',
      JSON.stringify(permutations([1]))
    );
    assert.equal(
      '[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]',
      JSON.stringify(permutations([1, 2, 3]))
    );

    assert.equal(
      '[["1","2"],["2","1"]]',
      JSON.stringify(permutations(["1", "2"]))
    );
  });
});

