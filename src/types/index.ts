import CryptoJS from 'crypto-js';

export type WordArray = CryptoJS.WordArray;

export type HashFunction = (...inputs: (WordArray | bigint | string | null)[]) => WordArray;

export interface Leaf {
  value: string | WordArray;
}

export interface PathItem {}

export interface PathItemRoot extends PathItem {
  type: 'root';
  rootHash: WordArray;
}

export interface PathItemInternalNode extends PathItem {
  type: 'internalNode';
  prefix: bigint;
  siblingHash: WordArray | undefined;
}

export interface PathItemInternalNodeHashed extends PathItem {
  type: 'internalNodeHashed';
  nodeHash: WordArray;
}

export interface PathItemNoNode extends PathItem {
  type: 'noNode';
  direction: bigint;
  siblingHash: WordArray;
}

export interface PathItemLeaf extends PathItem {
  type: 'leaf';
  value: string | WordArray;
}

export interface PrefixSplit extends PathItem {
  prefix: bigint;
  pathSuffix: bigint;
  legSuffix: bigint;
}
