/// <reference path="../src/types/unicitylabs__utils.d.ts" />
import CryptoJS from 'crypto-js';
import { assert } from 'chai';
import { smthash } from '@unicitylabs/utils';

import { SumLeaf, SMT, SumTree } from '../src/index.js';

describe('Sum-Certifying Tree Example', function() {
  let tree: SumTree;

  this.beforeEach(function () {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [ 0b0n,       { value: smthash('value-1'), numericValue: 100n } ],
      [ 0b10000n,   { value: smthash('value-2'), numericValue: 200n } ],
      [ 0b1000000n, { value: smthash('value-3'), numericValue: 300n } ]
    ]);
    
    tree = new SumTree(smthash, leaves);
  });

  it('shows tree root information', function() {
    assert.equal(tree.getRootSum(), 600n);
    assert.equal(
      tree.getRootHash().toString(CryptoJS.enc.Hex), 
      'fbc5d5fef7ba6e37d050e48869745066ce0dd2178dfa526151c8e817109ea0d3');
  });

  it('shows working with proofs', function() {
    const path = tree.getProof(0b1000000n);
    assert.isTrue(path.provesInclusionAt(0b1000000n));

    assert.equal(path.getLocation(), 0b1000000n);

    assert.deepStrictEqual(
      path.getItems(), 
      [
        { type: "sumRoot", rootHash: CryptoJS.enc.Hex.parse("fbc5d5fef7ba6e37d050e48869745066ce0dd2178dfa526151c8e817109ea0d3"), sum: 600n },
        { type: "sumInternalNode", prefix: 16n, siblingHash: undefined, siblingSum: undefined },
        { type: "sumInternalNode", prefix: 4n, siblingHash: CryptoJS.enc.Hex.parse("a8de8e835830e95096ef6403790461ecc4ebd27df188c8a94b23f87c4e863cf6"), siblingSum: 200n },
        { type: "sumInternalNode", prefix: ((1n << (256n-4n-2n)) + 1n), siblingHash: CryptoJS.enc.Hex.parse("f5397063c39890df025958174fb5dde92832cd144e21fa9137b44da5fa6bfcde"), siblingSum: 100n },
        { type: "sumLeaf", value: CryptoJS.enc.Hex.parse("93f9c50853d1ba7b4dc6244a2a64b2f427cd612ae34a3cad638ef5bc14cc7ecb"), numericValue: 300n }]);

    assert.equal(
      path.getLeafValue()!.toString(CryptoJS.enc.Hex), 
      smthash('value-3').toString(CryptoJS.enc.Hex));
    assert.equal(path.getLeafNumericValue(), 300n);

    assert.equal(path.getRootSum(), 600n);
    assert.equal(path.getRootHash()!.toString(CryptoJS.enc.Hex), 'fbc5d5fef7ba6e37d050e48869745066ce0dd2178dfa526151c8e817109ea0d3');
  });
});