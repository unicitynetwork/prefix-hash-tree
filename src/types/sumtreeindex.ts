import { Leaf, PathItem, WordArray } from './index.js';


export interface SumLeaf extends Leaf {
  numericValue: bigint;
}

export interface SumPathItemRoot extends PathItem {
  type: 'sumRoot';
  rootHash: WordArray;
  sum: bigint;
}

export interface SumPathItemInternalNode extends PathItem {
  type: 'sumInternalNode';
  prefix: bigint;
  siblingHash: WordArray | undefined;
  siblingSum: bigint | undefined;
}

export interface SumPathItemInternalNodeHashed extends PathItem {
  type: 'sumInternalNodeHashed';
  nodeHash: WordArray;
  sum: bigint;
}

export interface SumPathItemNoNode extends PathItem {
  type: 'sumNoNode';
  direction: bigint;
  siblingHash: WordArray;
  siblingSum: bigint;
}

export interface SumPathItemLeaf extends PathItem {
  type: 'sumLeaf';
  value: string | WordArray;
  numericValue: bigint;
}
