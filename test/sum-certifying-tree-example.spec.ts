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
      'fef5cfb1f61e731452f1d643818493104213c20eb7ee9c96f1cb3409459d32df');
  });

  it('shows working with proofs', function() {
    const path = tree.getProof(0b1000000n);
    assert.isTrue(path.provesInclusionAt(0b1000000n));

    assert.equal(path.getLocation(), 0b1000000n);

    assert.deepStrictEqual(
      path.getItems(), 
      [
        { type: "sumRoot", rootHash: CryptoJS.enc.Hex.parse("fef5cfb1f61e731452f1d643818493104213c20eb7ee9c96f1cb3409459d32df"), sum: 600n },
        { type: "sumInternalNode", prefix: 16n, siblingHash: undefined, siblingSum: undefined },
        { type: "sumInternalNode", prefix: 4n, siblingHash: CryptoJS.enc.Hex.parse("30f38d28a56b235395af39954e5d6f5c510b2e3e92cb15dcc0f0735734a504c0"), siblingSum: 200n },
        { type: "sumInternalNode", prefix: ((1n << (256n-4n-2n)) + 1n), siblingHash: CryptoJS.enc.Hex.parse("f000a5b8e30680039f0bc339ef5f9f290fa29443b452b576796e52beeb132c1d"), siblingSum: 100n },
        { type: "sumLeaf", value: CryptoJS.enc.Hex.parse("93f9c50853d1ba7b4dc6244a2a64b2f427cd612ae34a3cad638ef5bc14cc7ecb"), numericValue: 300n }]);

    assert.equal(
      path.getLeafValue()!.toString(CryptoJS.enc.Hex), 
      smthash('value-3').toString(CryptoJS.enc.Hex));
    assert.equal(path.getLeafNumericValue(), 300n);

    assert.equal(path.getRootSum(), 600n);
    assert.equal(path.getRootHash()!.toString(CryptoJS.enc.Hex), 'fef5cfb1f61e731452f1d643818493104213c20eb7ee9c96f1cb3409459d32df');
  });
});