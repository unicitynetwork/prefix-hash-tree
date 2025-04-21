/// <reference path="../src/types/unicitylabs__utils.d.ts" />
import { assert } from 'chai';
import { smthash, wordArrayToHex } from '@unicitylabs/utils';

import { Leaf, SMT } from '../src/index.js';

import CryptoJS from 'crypto-js';

describe('Sum-Certifying Tree', function() {
  it('should build a tree with numeric values and compute correct sums', function() {
    const leaves: Leaf[] = [
      { 
        path: 0b100000000n, 
        value: wordArrayToHex(smthash('value-1')), 
        numericValue: 100n 
      },
      { 
        path: 0b100010000n, 
        value: wordArrayToHex(smthash('value-2')), 
        numericValue: 200n 
      },
      { 
        path: 0b101000000n, 
        value: wordArrayToHex(smthash('value-3')), 
        numericValue: 300n 
      }
    ];
    
    const tree = new SMT(smthash, leaves, true);
    
    assert.equal(tree.getRootSum(), 600n);
    
    for (const leaf of leaves) {
      const path = tree.getProof(leaf.path);
      
      assert.isTrue(path.provesInclusionAt(leaf.path), `Path ${leaf.path.toString(2)} should be included`);
      assert.equal(path.getLeafValue(), leaf.value, `Value for path ${leaf.path.toString(2)} is incorrect`);
      assert.equal(path.getRootSum(), 600n, `Root sum for path ${leaf.path.toString(2)} is incorrect`);
    }
  });
  
  it('should update sum when adding a leaf', function() {
    const leaves: Leaf[] = [
      { 
        path: 0b100000000n, 
        value: wordArrayToHex(smthash('value-1')), 
        numericValue: 100n 
      },
      { 
        path: 0b100010000n, 
        value: wordArrayToHex(smthash('value-2')), 
        numericValue: 200n 
      }
    ];
    
    const tree = new SMT(smthash, leaves, true);
    
    // Initial sum should be 100 + 200 = 300
    assert.equal(tree.getRootSum(), 300n);
    
    tree.addLeaf(0b101000000n, wordArrayToHex(smthash('value-3')), 300n);
    
    assert.equal(tree.getRootSum(), 600n);
    
    const path = tree.getProof(0b101000000n);
    assert.isTrue(path.provesInclusionAt(0b101000000n));
    assert.equal(path.getLeafValue(), wordArrayToHex(smthash('value-3')));
    assert.equal(path.getRootSum(), 600n);
  });
  
  it('should work correctly with regular (non-sum-certifying) trees', function() {
    const leaves: Leaf[] = [
      { 
        path: 0b100000000n, 
        value: wordArrayToHex(smthash('value-1')), 
        numericValue: 100n  // This should be ignored in regular tree
      },
      { 
        path: 0b100010000n, 
        value: wordArrayToHex(smthash('value-2')), 
        numericValue: 200n  // This should be ignored in regular tree
      }
    ];
    
    const tree = new SMT(smthash, leaves);
    
    assert.throws(
      () => {
        tree.getRootSum();
      },
      Error,
      /This tree is not sum certifying/
    );
    
    // Paths should still be verifiable
    for (const leaf of leaves) {
      const path = tree.getProof(leaf.path);
      assert.isTrue(path.provesInclusionAt(leaf.path));
      assert.equal(path.getLeafValue(), leaf.value);
      assert.isUndefined(path.getRootSum());
    }
  });
  
  it('should handle complex tree structures with mixture of left and right children', function() {
    const leaves: Leaf[] = [
      { path: 0b1000n, value: wordArrayToHex(smthash('left-1')), numericValue: 10n },
      { path: 0b1001n, value: wordArrayToHex(smthash('left-2')), numericValue: 20n },
      { path: 0b1010n, value: wordArrayToHex(smthash('right-1')), numericValue: 30n },
      { path: 0b1011n, value: wordArrayToHex(smthash('right-2')), numericValue: 40n }
    ];
    
    const tree = new SMT(smthash, leaves, true);
    
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