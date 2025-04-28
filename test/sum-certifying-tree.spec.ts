/// <reference path="../src/types/unicitylabs__utils.d.ts" />
import { assert } from 'chai';
import { smthash, wordArrayToHex } from '@unicitylabs/utils';

import { SumLeaf, SumTree } from '../src/index.js';

import CryptoJS from 'crypto-js';
import { ValidationResult } from '../src/smt.js';

describe('Sum-Certifying Tree', function() {
  it('should build a tree with numeric values and compute correct sums', function() {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [ 0b100000000n, { value: wordArrayToHex(smthash('value-1')), numericValue: 100n } ],
      [ 0b100010000n, { value: wordArrayToHex(smthash('value-2')), numericValue: 200n } ],
      [ 0b101000000n, { value: wordArrayToHex(smthash('value-3')), numericValue: 300n } ]
    ]);
    
    const tree = new SumTree(smthash, leaves, 8n);
    
    assert.equal(tree.getRootSum(), 600n);
    
    for (const [pathNum, leaf] of leaves) {
      const path = tree.getProof(pathNum);
      
      assert.isTrue(path.provesInclusionAt(pathNum), `Path ${pathNum.toString(2)} should be included`);
      assert.equal(path.getLeafValue(), leaf.value, `Value for path ${pathNum.toString(2)} is incorrect`);
      assert.equal(path.getRootSum(), 600n, `Root sum for path ${pathNum.toString(2)} is incorrect`);
    }
  });
  
  it('should update sum when adding a leaf', function() {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [ 0b100000000n, { value: wordArrayToHex(smthash('value-1')), numericValue: 100n } ], 
      [ 0b100010000n, { value: wordArrayToHex(smthash('value-2')), numericValue: 200n } ]
    ]);
    
    const tree = new SumTree(smthash, leaves, 8n);
    
    // Initial sum should be 100 + 200 = 300
    assert.equal(tree.getRootSum(), 300n);
    
    tree.addLeaf(0b101000000n, {value: wordArrayToHex(smthash('value-3')), numericValue: 300n});
    
    assert.equal(tree.getRootSum(), 600n);
    
    const path = tree.getProof(0b101000000n);
    assert.isTrue(path.provesInclusionAt(0b101000000n));
    assert.equal(path.getLeafValue(), wordArrayToHex(smthash('value-3')));
    assert.equal(path.getRootSum(), 600n);
  });
  
  it('should handle complex tree structures with mixture of left and right children', function() {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [ 0b1000n, { value: wordArrayToHex(smthash('left-1')), numericValue: 10n } ],
      [ 0b1001n, { value: wordArrayToHex(smthash('left-2')), numericValue: 20n } ],
      [ 0b1010n, { value: wordArrayToHex(smthash('right-1')), numericValue: 30n } ],
      [ 0b1011n, { value: wordArrayToHex(smthash('right-2')), numericValue: 40n } ]
    ]);
    
    const tree = new SumTree(smthash, leaves, 3n);
    
    assert.equal(tree.getRootSum(), 100n);
    
    const path1 = tree.getProof(0b1000n);
    const path2 = tree.getProof(0b1001n);
    const path3 = tree.getProof(0b1010n);
    const path4 = tree.getProof(0b1011n);
    
    assert.equal(path1.getRootSum(), 100n);
    assert.equal(path2.getRootSum(), 100n);
    assert.equal(path3.getRootSum(), 100n);
    assert.equal(path4.getRootSum(), 100n);
    
    assert.equal(path1.getRootHash()!.toString(CryptoJS.enc.Hex), 'c612c2c52684e2d95397ec09fd01e41a12503e2a8403a7099c2bec718b942321');
    assert.equal(path2.getRootHash()!.toString(CryptoJS.enc.Hex), 'c612c2c52684e2d95397ec09fd01e41a12503e2a8403a7099c2bec718b942321');
    assert.equal(path3.getRootHash()!.toString(CryptoJS.enc.Hex), 'c612c2c52684e2d95397ec09fd01e41a12503e2a8403a7099c2bec718b942321');
    assert.equal(path4.getRootHash()!.toString(CryptoJS.enc.Hex), 'c612c2c52684e2d95397ec09fd01e41a12503e2a8403a7099c2bec718b942321');

    assert.equal(path1.getLeafValue(), wordArrayToHex(smthash('left-1')));
    assert.equal(path2.getLeafValue(), wordArrayToHex(smthash('left-2')));
    assert.equal(path3.getLeafValue(), wordArrayToHex(smthash('right-1')));
    assert.equal(path4.getLeafValue(), wordArrayToHex(smthash('right-2')));

    assert.equal(path1.getLeafNumericValue(), 10n);
    assert.equal(path2.getLeafNumericValue(), 20n);
    assert.equal(path3.getLeafNumericValue(), 30n);
    assert.equal(path4.getLeafNumericValue(), 40n);
  });
});

describe('SumPath Validation', function() {
  describe('allNumericValuesOnPathArePositiveOrZero', function() {
    let treeWithNegativeValue: SumTree;
    const positivePath = 0b10n;
    const negativePath = 0b11n;

    beforeEach(function() {
      const leaves: Map<bigint, SumLeaf> = new Map([
        [positivePath, { value: smthash('positive-leaf'), numericValue: 100n }],
        [negativePath, { value: smthash('negative-leaf'), numericValue: -50n }]
      ]);
      treeWithNegativeValue = new SumTree(smthash, leaves, 1n);

      assert.equal(treeWithNegativeValue.getRootSum(), 50n);
    });

    it('should fail verification for the path of the leaf with a negative numericValue', function() {
      const verificationResult: ValidationResult = treeWithNegativeValue.getProof(negativePath).verifyPath();

      assert.isFalse(verificationResult.success);
      assert.strictEqual(verificationResult.error, 'Negative numeric values are not allowed on any part of the path', 'Incorrect error message');
    });

    it('should fail verification for the path of a positive leaf if its sibling has a negative sum', function() {
      const verificationResult: ValidationResult = treeWithNegativeValue.getProof(positivePath).verifyPath();

      assert.isFalse(verificationResult.success);
      assert.strictEqual(verificationResult.error, 'Negative numeric values are not allowed on any part of the path', 'Incorrect error message');
    });
  });
});
