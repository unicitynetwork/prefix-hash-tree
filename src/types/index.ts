import CryptoJS from 'crypto-js';

export type WordArray = CryptoJS.WordArray;

export type HashFunction = (...inputs: (WordArray | bigint | string | null)[]) => WordArray;

export interface Leaf {
  value: string | WordArray;
}

export interface PathItem {}

export interface AbstractPathItemRoot extends PathItem {
  rootHash: WordArray;
}

export interface AbstractPathItemInternalNode extends PathItem {
  prefix: bigint;
  siblingHash: WordArray | undefined;
}

export interface AbstractPathItemInternalNodeHashed extends PathItem {
  nodeHash: WordArray;
}

export interface AbstractPathItemEmptyBranch extends PathItem {
  direction: bigint;
  siblingHash: WordArray;
}

export interface AbstractPathItemLeaf extends PathItem {
  value: string | WordArray;
}

export interface PrefixSplit extends PathItem {
  prefix: bigint;
  pathSuffix: bigint;
  legSuffix: bigint;
}

export interface PathItemRoot extends AbstractPathItemRoot {
  type: 'root';
}

export interface PathItemInternalNode extends AbstractPathItemInternalNode {
  type: 'internalNode';
}

export interface PathItemInternalNodeHashed extends AbstractPathItemInternalNodeHashed  {
  type: 'internalNodeHashed';
}

export interface PathItemEmptyBranch extends AbstractPathItemEmptyBranch {
  type: 'emptyBranch';
}

export interface PathItemLeaf extends AbstractPathItemLeaf {
  type: 'leaf';
}
