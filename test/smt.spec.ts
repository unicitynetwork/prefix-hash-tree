/// <reference path="../src/types/unicitylabs__utils.d.ts" />
import { assert } from 'chai';
import { smthash, wordArrayToHex } from '@unicitylabs/utils';

import { Leaf, SMT, SumTree, WordArray, getCommonPathBits, splitPrefix, padAndValidatePath, unpad, Path } from '../src/index.js';
import { padTo32Bytes } from '../src/smt.js';

import CryptoJS from 'crypto-js';

type Tree = SMT | SumTree;

function checkPaths(
  smt: Tree, 
  leaves: Map<bigint, Leaf>, 
  pathTransformFunc: (path: bigint) => bigint, 
  shouldBeIncluded: boolean, 
  failMsg: (path: bigint) => string
): void {
  for (const [pathNum, leaf] of leaves) {
    const requestedPath = pathTransformFunc(pathNum);
    const path = smt.getProof(requestedPath);
    assert.equal(path.provesInclusionAt(requestedPath), shouldBeIncluded, failMsg(requestedPath));
  }
}

function checkValues(
  smt: Tree, 
  leaves: Map<bigint, Leaf>, 
  pathTransformFunc: (path: bigint) => bigint
): void {
  for (const [pathNum, leaf] of leaves) {
    const requestedPath = pathTransformFunc(pathNum);
    const path = smt.getProof(requestedPath);
    assert.equal(
      path.getLeafValue(), 
      wordArrayToHex(smthash('value' + requestedPath.toString(2).substring(1))), 
      `Value of ${requestedPath.toString(2)} has been changed`
    );
  }
}

function modifyValues(
  smt: Tree, 
  leaves: Map<bigint, Leaf>, 
  pathTransformFunc: (path: bigint) => bigint,
  errorMessage: RegExp
): void {
  for (const [path, leaf] of leaves) {
    const requestedPath = pathTransformFunc(path);
    
    assert.throws(
      () => {
        if (smt instanceof SMT) {
          smt.addLeaf(requestedPath, {value: wordArrayToHex(smthash('different value'))});
        } else if (smt instanceof SumTree) {
          smt.addLeaf(requestedPath, {value: wordArrayToHex(smthash('different value')), numericValue: 123456n});
        } else {
          throw new Error('Unknonw tree type');
        }
      },
      Error,
      errorMessage 
    );
  }
}

function generatePaths(l: number): Map<bigint, Leaf> {
  const leaves: Array<[bigint, Leaf]> = [];
  const trail = (1n << BigInt(l));
  for (let i = 0n; i < trail; i++) {
    const path = i | trail;
    leaves.push([
      path, 
      { value: wordArrayToHex(smthash('value' + path.toString(2).substring(1))) }
    ]);
  }
  return new Map(leaves);
}

const testConfigs = [
  {
    name: 'SMT routines',
    isSumTree: false,
    createTree: (leaves: Map<bigint, Leaf>) => new SMT(smthash, leaves, false),
  },
  {
    name: 'Sum tree routines',
    isSumTree: true,
    createTree: (leaves: Map<bigint, Leaf>) => new SumTree(
        smthash, 
        new Map(Array.from(leaves).map(([path, leaf]) => (
          [ path, {...leaf, numericValue: path + 99n} ]
        ))),
        false
        ),
  }
];

testConfigs.forEach((config) => {
  describe(config.name, function() {
    for (let i = 0; i < 1; i++) {
      context(i === 0 ? 'sparse tree' : 'filled tree', function() {
        const leaves = i === 0 ? new Map<bigint, Leaf>([
          [ 0b100000000n, {value: wordArrayToHex(smthash('value00000000'))} ],
          [ 0b100010000n, {value: wordArrayToHex(smthash('value00010000'))} ],
          [ 0b111100101n, {value: smthash('value11100101') as WordArray} ],
          [      0b1100n, {value: smthash('value100') as WordArray} ],
          [      0b1011n, {value: smthash('value011') as WordArray} ],
          [ 0b111101111n, {value: wordArrayToHex(smthash('value11101111'))} ],
          [  0b10001010n, {value: smthash('value0001010') as WordArray} ],
          [  0b11010101n, {value: smthash('value1010101') as WordArray} ]
        ]) : generatePaths(7);

        let smt: Tree;

        beforeEach(function() {
          smt = config.createTree(leaves);
        });

        context('general checks', function() {
          it('specific hashes', function() {
            assert.equal(
              smt.getRootHash().toString(), 
              config.isSumTree ? 
                  '5cb6ea7b93485de6870262adde5c8a0b8814e0c2a46310814b4128c1fa562d96':
                  'e962897140998666f5dc1280d0d5fea1d8f858955801bd94b404d6b81cbf39a2');
          });
        });

        context('extracting proofs', function() {
          it('extracting all inclusion proofs', function() {
            checkPaths(
              smt, 
              leaves, 
              (p) => p, 
              true, 
              (p) => `Leaf at location ${p.toString(2)} not included`
            );
            checkValues(smt, leaves, (p) => p);
          });

          if (i === 0) {
            it('extracting non-inclusion proofs for paths deviating from the existing branches', function() {
              checkPaths(
                smt, 
                leaves, 
                (p) => p ^ 4n, 
                false, 
                (p) => `Leaf at location ${p.toString(2)} included`
              );
            });
          }

          it('extracting non-inclusion proofs for paths exceeding existing branches', function() {
            checkPaths(
              smt, 
              leaves, 
              (p) => p | (1n << 512n), 
              false, 
              (p) => `Leaf at location ${p.toString(2)} included`
            );
          });

          it('extracting non-inclusion proofs for paths stopping inside existing branches', function() {
            checkPaths(
              smt, 
              leaves, 
              (p) => {
                const pl = BigInt(p.toString(2).length) / 2n; 
                const mask = (1n << pl) - 1n; 
                return (p & mask) | (1n << pl);
              }, 
              false, 
              (p) => `Leaf at location ${p.toString(2)} included`
            );
          });
        });

        if (i === 0) {
          context('Trying to perform illegal leaf/value modifications', function() {
            context('Setting different value at existing leaf', function() {
              beforeEach(function() {
                modifyValues(smt, leaves, (p) => p, /Cannot add leaf inside the leg/);
              });

              it('leaves values not changed', function() {
                checkValues(smt, leaves, (p) => p);
              });
            });

            context('Adding leaf including in its path already existing leaf', function() {
              beforeEach(function() {
                modifyValues(smt, leaves, (p) => p | (1n << 512n), /Cannot extend the leg through the leaf/);
              });

              it('leaves values not changed', function() {
                checkPaths(
                  smt, 
                  leaves, 
                  (p) => p | (1n << 512n), 
                  false, 
                  (p) => `Leaf at location ${p.toString(2)} included`
                );
                checkValues(smt, leaves, (p) => p);
              });
            });

            context('Adding leaf inside a path of an already existing leaf', function() {
              beforeEach(function() {
                modifyValues(
                  smt, 
                  leaves, 
                  (p) => {
                    const pl = BigInt(p.toString(2).length) / 2n; 
                    const mask = (1n << pl) - 1n; 
                    return (p & mask) | (1n << pl);
                  },
                  /Cannot add leaf inside the leg/
                );
              });

              it('leaves values not changed', function() {
                checkPaths(
                  smt, 
                  leaves, 
                  (p) => {
                    const bitCountToHalf = BigInt(p.toString(2).length) / 2n; 
                    const maskKeepingHalfLowerBits = (1n << bitCountToHalf) - 1n; 
                    return (p & maskKeepingHalfLowerBits) | (1n << bitCountToHalf);
                  }, 
                  false, 
                  (p) => `Leaf at location ${p.toString(2)} included`
                );
                checkValues(smt, leaves, (p) => p);
              });
            });

            it('Wrong path acquired for the requested path', function() {
              const path = smt.getProof(0b11111111111000n);

              assert.throws(
                () => {path.provesInclusionAt(0b11111100000000n)}, 
                Error, 
                /Wrong path acquired for the requested path/);
            });  
          });
        }
      });
    }
  });

  function testTreeWithSingleLeaf(longPath: bigint) {
    const tree = config.createTree(
      new Map<bigint, Leaf>([
        [longPath, { value: wordArrayToHex(smthash('value00000000')) }],
      ]));
    assert.isTrue((tree.getProof(longPath)).provesInclusionAt(longPath));
    return tree;
  }

  describe('Hash function padding', function() {
    it('should handle a single node with a long prefix', function() {
      testTreeWithSingleLeaf(0xdf75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b870n);
      const tree = testTreeWithSingleLeaf(0xdf75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87fn);

      assert.equal(
          tree.getRootHash().toString(CryptoJS.enc.Hex), 
          tree instanceof SMT ?
            '178ab5191e4ccd2425448eb06aac88c0c5c5085703fefe119ccb33e5ff906a25':
            'f4a2933b49c37f3518a08df55356da83fdf312f094c513e67726f91896e2d707');
    });
  });
});

class MyNode {
  left: MyNode | null;
  right: MyNode | null;
  hash: WordArray;

  constructor(left: MyNode | null, right: MyNode | null, hash: WordArray) {
    this.left = left;
    this.right = right;
    this.hash = hash;
  }
}

describe('Utility functions', function() {
  it('getCommonPathBits', function() {
    assert.equal(getCommonPathBits('', ''), '');

    assert.equal(getCommonPathBits('', '0'), '');
    assert.equal(getCommonPathBits('1', ''), '');

    assert.equal(getCommonPathBits('0', '0'), '0');
    assert.equal(getCommonPathBits('1', '0'), '');

    assert.equal(getCommonPathBits('00', '00'), '00');
    assert.equal(getCommonPathBits('10', '10'), '10');
    assert.equal(getCommonPathBits('10', '00'), '0');

    assert.equal(getCommonPathBits('01111', '10111'), '111');
  });

  it('splitPrefix', function() {
    assert.throws(() => {splitPrefix(0b0n, 0b0n)}, Error, /Invalid prefix: 0/);
    assert.throws(() => {splitPrefix(0b1n, 0b0n)}, Error, /Invalid prefix: 0/);
    assert.throws(() => {splitPrefix(0b0n, 0b1n)}, Error, /Invalid prefix: 0/);

    // Equal paths
    assert.deepStrictEqual(
        splitPrefix(0b1n, 0b1n), 
        { commonPrefix: 0b1n, remainingPathUniqueSuffix: 0b1n, existingPrefixUniqueSuffix: 0b1n });
    assert.deepStrictEqual(
        splitPrefix(0b10n, 0b10n), 
        { commonPrefix: 0b10n, remainingPathUniqueSuffix: 0b1n, existingPrefixUniqueSuffix: 0b1n });
    assert.deepStrictEqual(
        splitPrefix(0b100n, 0b100n), 
        { commonPrefix: 0b100n, remainingPathUniqueSuffix: 0b1n, existingPrefixUniqueSuffix: 0b1n });
    assert.deepStrictEqual(
        splitPrefix(0b101n, 0b101n), 
        { commonPrefix: 0b101n, remainingPathUniqueSuffix: 0b1n, existingPrefixUniqueSuffix: 0b1n });

    // Completely different paths
    assert.deepStrictEqual(
        splitPrefix(0b101n, 0b110n), 
        { commonPrefix: 0b1n, remainingPathUniqueSuffix: 0b101n, existingPrefixUniqueSuffix: 0b110n });

    // Paths similar from the end
    assert.deepStrictEqual(
        splitPrefix(0b101n, 0b111n), 
        { commonPrefix: 0b11n, remainingPathUniqueSuffix: 0b10n, existingPrefixUniqueSuffix: 0b11n });

    // Path similarity from the start
    assert.deepStrictEqual(
        splitPrefix(0b100n, 0b101n), 
        { commonPrefix: 0b1n, remainingPathUniqueSuffix: 0b100n, existingPrefixUniqueSuffix: 0b101n });
  });

  it('getLocation', function() {
    // Empty tree
    assert.equal(
      new Path([
        {type: 'root', rootHash: 9}
      ], smthash, false).getPaddedLocation(), 
      0b1n);

    assert.throws(
      () => {
        new Path([
          {type: 'root', rootHash: 9},
          {type: 'internalNode', prefix: 0b0n, siblingHash: 9},
          {type: 'leaf', value: 'v'}
        ], smthash, false).getPaddedLocation()
      }, 
      Error, 
      /Invalid prefix: 0/);

    // An edge on the left
    assert.equal(
      new Path([
        {type: 'root', rootHash: 9},
        {type: 'internalNode', prefix: 0b10n, siblingHash: 9},
        {type: 'leaf', value: 'v'}
      ], smthash, false).getPaddedLocation(), 
      0b10n);

    // A edge on the left with a longer prefix 
    assert.equal(
      new Path([
        {type: 'root', rootHash: 9},
        {type: 'internalNode', prefix: 0b1110n, siblingHash: 9},
        {type: 'leaf', value: 'v'}
      ], smthash, false).getPaddedLocation(), 
      0b1110n);

    // Several nodes on the path
    assert.equal(
      new Path([
        {type: 'root', rootHash: 9},
        {type: 'internalNode', prefix: 0b1_0n, siblingHash: 9},
        {type: 'internalNode', prefix: 0b1_0n, siblingHash: 9},
        {type: 'internalNode', prefix: 0b1_01n, siblingHash: 9},
        {type: 'internalNode', prefix: 0b1_0111n, siblingHash: 9},
        {type: 'internalNode', prefix: 0b1_0n, siblingHash: 9},
        {type: 'leaf', value: 'v'}
      ], smthash, false).getPaddedLocation(), 
      0b1_0_0111_01_0_0n);
  });

  it('padAndValidatePath', function() {
    // Highest bit is set by the function.
    assert.equal(padAndValidatePath(0b0n, 1n), 0b10n);
    assert.equal(padAndValidatePath(0b1n, 1n), 0b11n);

    // User already sets the highest bit.
    assert.equal(padAndValidatePath(0b10n, 1n), 0b10n);
    assert.equal(padAndValidatePath(0b11n, 1n), 0b11n);

    // Larger bit length.
    assert.equal(padAndValidatePath(0b0n, 3n),   0b1000n);
    assert.equal(padAndValidatePath(0b110n, 3n), 0b1110n);

    // Realistically large bit length.
    assert.equal(
      padAndValidatePath(0x50c496ca24078e75b149f02109e8ddfc3867fecd6b520d3b5a803b62580bd36dn, 256n),
                        0x150c496ca24078e75b149f02109e8ddfc3867fecd6b520d3b5a803b62580bd36dn);

    // Negative paths are not allowed
    assert.throws(
      () => { padAndValidatePath(-1n, 3n) }, 
      Error, 
      /Invalid path: -1/);

    // Paths longer than bit length are not allowed
    assert.throws(
      () => { padAndValidatePath(0b100n, 1n) }, 
      Error, 
      /Path too long for given bit length: 0b100 is longer than 1 \+ 1 bits/);

    // Padding can be turned off.
    assert.equal(padAndValidatePath(0b0n, false), 0b0n);
    assert.equal(padAndValidatePath(0b1n, false), 0b1n);

    // Negative paths are still not allowed even with padding turned off
    assert.throws(
      () => { padAndValidatePath(-1n, false) }, 
      Error, 
      /Invalid path: -1/);
  });

  it('unpad', function() {
    // No padding
    assert.equal(unpad(0b0n, false), 0b0n);
    assert.equal(unpad(0b1n, false), 0b1n);
    assert.equal(unpad(0b0101n, false), 0b101n);

    // Padding
    assert.equal(unpad(0b11n, 1n), 0b1n);
    assert.equal(unpad(0b1010101n, 6n), 0b10101n);
  });

  it('padTo32Bytes', function() {
    // BigInt input
    assert.equal(padTo32Bytes(0x0n).toString(CryptoJS.enc.Hex),  
        '0000000000000000000000000000000000000000000000000000000000000000');
    assert.equal(padTo32Bytes(0x1n).toString(CryptoJS.enc.Hex),  
        '0000000000000000000000000000000000000000000000000000000000000001');
    assert.equal(padTo32Bytes(0x10n).toString(CryptoJS.enc.Hex), 
        '0000000000000000000000000000000000000000000000000000000000000010');
    assert.equal(padTo32Bytes(0x123456789ABCDEFn).toString(CryptoJS.enc.Hex), 
        '0000000000000000000000000000000000000000000000000123456789abcdef');
    assert.equal(padTo32Bytes(0xdf75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87fn).toString(CryptoJS.enc.Hex), 
        'df75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87f');

    // WordArray input
    assert.equal(padTo32Bytes(CryptoJS.enc.Hex.parse('00')).toString(CryptoJS.enc.Hex), 
        '0000000000000000000000000000000000000000000000000000000000000000');
    assert.equal(padTo32Bytes(CryptoJS.enc.Hex.parse('01')).toString(CryptoJS.enc.Hex), 
        '0000000000000000000000000000000000000000000000000000000000000001');
    assert.equal(padTo32Bytes(CryptoJS.enc.Hex.parse('10')).toString(CryptoJS.enc.Hex), 
        '0000000000000000000000000000000000000000000000000000000000000010');
    assert.equal(padTo32Bytes(CryptoJS.enc.Hex.parse('df75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87f')).toString(CryptoJS.enc.Hex), 
        'df75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87f');

    // Too long -- bigint
    assert.throws(
      () => { padTo32Bytes(0xfdf75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87fn) },
      Error,
      /Input value too long/
    );
    assert.throws(
      () => { padTo32Bytes(0xffdf75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87fn) },
      Error,
      /Input value too long/
    );

    // Too long -- WordArray
    assert.throws(
      () => { padTo32Bytes(CryptoJS.enc.Hex.parse('fdf75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87f')) },
      Error,
      /Input value too long/
    );
    assert.throws(
      () => { padTo32Bytes(CryptoJS.enc.Hex.parse('ffdf75dba2b13db9a7554e2f7d9a967feec9b2998cfe08e730a56cf3fc2088b87f')) },
      Error,
      /Input value too long/
    );
  });
});

