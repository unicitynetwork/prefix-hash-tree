import CryptoJS from 'crypto-js';

export type WordArray = CryptoJS.WordArray;

export type HashFunction = (...inputs: (WordArray | bigint | string | null)[]) => WordArray;

export interface Leaf {
  path: bigint;
  value: string | WordArray;
  numericValue?: bigint;
}

export interface PathItemRoot {
  type: 'root';
  rootHash: WordArray;
  sum?: bigint;
}

export interface PathItemInternalNode {
  type: 'internalNode';
  prefix: bigint;
  siblingHash: WordArray | undefined;
  siblingSum?: bigint;
}

export interface PathItemInternalNodeHashed {
  type: 'internalNodeHashed';
  nodeHash: WordArray;
  sum?: bigint;
}

export interface PathItemNoNode {
  type: 'noNode';
  direction: bigint;
  siblingHash: WordArray;
  siblingSum?: bigint;
}

export interface PathItemLeaf {
  type: 'leaf';
  value: string | WordArray;
  numericValue?: bigint;
}

export type PathItem  =
  | PathItemRoot
  | PathItemInternalNode
  | PathItemInternalNodeHashed
  | PathItemNoNode
  | PathItemLeaf;

export interface PrefixSplit {
  prefix: bigint;
  pathSuffix: bigint;
  legSuffix: bigint;
}

