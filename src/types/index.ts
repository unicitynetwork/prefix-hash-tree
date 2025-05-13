export interface Leaf {
  value: string | Uint8Array;
}

export interface PathItem {}

export interface AbstractPathItemRoot extends PathItem {
  rootHash: Uint8Array;
}

export interface AbstractPathItemInternalNode extends PathItem {
  prefix: bigint;
  siblingHash: Uint8Array | undefined;
}

export interface AbstractPathItemInternalNodeHashed extends PathItem {
  nodeHash: Uint8Array;
}

export interface AbstractPathItemEmptyBranch extends PathItem {
  direction: bigint;
  siblingHash: Uint8Array;
}

export interface AbstractPathItemLeaf extends PathItem {
  value: string | Uint8Array;
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
