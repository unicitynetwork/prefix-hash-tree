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

export interface IPathItemJsonBase {
  readonly type: string;
}

export interface IPathItemRootJson extends IPathItemJsonBase {
  readonly type: 'root';
  readonly rootHash: string;
}

export interface IPathItemInternalNodeJson extends IPathItemJsonBase {
  readonly type: 'internalNode';
  readonly prefix: string;
  readonly siblingHash?: string;
}

export interface IPathItemInternalNodeHashedJson extends IPathItemJsonBase {
  readonly type: 'internalNodeHashed';
  readonly nodeHash: string;
}

export interface IPathItemEmptyBranchJson extends IPathItemJsonBase {
  readonly type: 'emptyBranch';
  readonly direction: string;
  readonly siblingHash: string;
}

export interface IPathItemLeafJson extends IPathItemJsonBase {
  readonly type: 'leaf';
  readonly value: string;
  readonly valueType: 'string' | 'Uint8Array';
}

export type AnyPathItemJson =
  | IPathItemRootJson
  | IPathItemInternalNodeJson
  | IPathItemInternalNodeHashedJson
  | IPathItemEmptyBranchJson
  | IPathItemLeafJson;

export interface IPathJson {
  readonly pathPaddingBits: string | false;
  readonly items: readonly AnyPathItemJson[];
}
