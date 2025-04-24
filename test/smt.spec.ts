/// <reference path="../src/types/unicitylabs__utils.d.ts" />
import { assert } from 'chai';
import { smthash, wordArrayToHex } from '@unicitylabs/utils';

import { Leaf, SMT, SumTree, AbstractTree, WordArray, getCommonPathBits } from '../src/index.js';

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
    createTree: (leaves: Map<bigint, Leaf>) => new SMT(smthash, leaves),
  },
  {
    name: 'Sum tree routines',
    isSumTree: true,
    createTree: (leaves: Map<bigint, Leaf>) => new SumTree(
        smthash, 
        new Map(Array.from(leaves).map(([path, leaf]) => (
          [ path, {...leaf, numericValue: path + 99n} ]
        )))),
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
                  'f30b5cfdcc126f1405d61fbe8de09d49810291f2e1ae8d44e8a6a3689221ee9c':
                  '220f4310e01a338279c83efc9b54cdc55cc6c6a3e49bda43de6173baaeb1aa6b');
          });
        });

        context('extracting proofs', function() {
          it('extracting all inclusion proofs', function() { // TODO: Fix this test.
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
          });
        }
      });
    }
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
  })
});