/// <reference path="../src/types/unicitylabs__utils.d.ts" />
import CryptoJS from 'crypto-js';
import { assert } from 'chai';
import { smthash } from '@unicitylabs/utils';

import { SumLeaf, SMT, SumTree } from '../src/index.js';

describe('Sum-Certifying Tree Example', function() {
  let tree: SumTree;

  this.beforeEach(function () {
    const leaves: Map<bigint, SumLeaf> = new Map([
      [ 0b100000000n, { value: smthash('value-1'), numericValue: 100n } ],
      [ 0b100010000n, { value: smthash('value-2'), numericValue: 200n } ],
      [ 0b101000000n, { value: smthash('value-3'), numericValue: 300n } ]
    ]);
    
    tree = new SumTree(smthash, leaves);
  });

  it('shows tree root information', function() {
    assert.equal(tree.getRootSum(), 600n);
    assert.equal(
      tree.getRootHash().toString(CryptoJS.enc.Hex), 
      '5036fb762516b11bab5ae51302992aadad1b614f75390a61d0dfea9f01eb9a72');
  });

  it('shows working with proofs', function() {
    const path = tree.getProof(0b101000000n);
    assert.isTrue(path.provesInclusionAt(0b101000000n));

    assert.deepStrictEqual(
      path.getItems(), 
      [
        { type: "sumRoot", rootHash: CryptoJS.enc.Hex.parse("5036fb762516b11bab5ae51302992aadad1b614f75390a61d0dfea9f01eb9a72"), sum: 600n },
        { type: "sumInternalNode", prefix: 16n, siblingHash: undefined, siblingSum: undefined },
        { type: "sumInternalNode", prefix: 4n, siblingHash: CryptoJS.enc.Hex.parse("3e3388924a231e8b932e64be43477becdb937d83f87b3d350f99b6df53053151"), siblingSum: 200n },
        { type: "sumInternalNode", prefix: 5n, siblingHash: CryptoJS.enc.Hex.parse("0231facbbdb1132a3af0e036907d27910971e6915a37cb1d7e7e632a766f97fd"), siblingSum: 100n },
        { type: "sumLeaf", value: CryptoJS.enc.Hex.parse("93f9c50853d1ba7b4dc6244a2a64b2f427cd612ae34a3cad638ef5bc14cc7ecb"), numericValue: 300n }]);

    assert.equal(
      path.getLeafValue()!.toString(CryptoJS.enc.Hex), 
      smthash('value-3').toString(CryptoJS.enc.Hex));
    assert.equal(path.getLeafNumericValue(), 300n);

    assert.equal(path.getRootSum(), 600n);
    assert.equal(path.getRootHash()!.toString(CryptoJS.enc.Hex), '5036fb762516b11bab5ae51302992aadad1b614f75390a61d0dfea9f01eb9a72');
  });
});