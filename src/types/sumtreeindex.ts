import { Leaf, AbstractPathItemRoot, AbstractPathItemInternalNode, AbstractPathItemInternalNodeHashed, 
  AbstractPathItemEmptyBranch, AbstractPathItemLeaf } from './index.js';


export interface SumLeaf extends Leaf {
  numericValue: bigint;
}


export interface SumPathItemRoot extends AbstractPathItemRoot {
  type: 'sumRoot';
  sum: bigint;
}

export interface SumPathItemInternalNode extends AbstractPathItemInternalNode {
  type: 'sumInternalNode';
  siblingSum: bigint | undefined;
}

export interface SumPathItemInternalNodeHashed extends AbstractPathItemInternalNodeHashed {
  type: 'sumInternalNodeHashed';
  sum: bigint;
}

export interface SumPathItemEmptyBranch extends AbstractPathItemEmptyBranch{
  type: 'sumEmptyBranch';
  siblingSum: bigint;
}

export interface SumPathItemLeaf extends AbstractPathItemLeaf {
  type: 'sumLeaf';
  numericValue: bigint;
}

export type SumPathItem = 
    SumPathItemRoot |
    SumPathItemInternalNode |
    SumPathItemInternalNodeHashed | 
    SumPathItemEmptyBranch |  
    SumPathItemLeaf;


export interface ISumPathItemJsonBase {
  readonly type: string;
}

export interface ISumPathItemRootJson extends ISumPathItemJsonBase {
  readonly type: 'sumRoot';
  readonly rootHash: string;
  readonly sum: string;
}

export interface ISumPathItemInternalNodeJson extends ISumPathItemJsonBase {
  readonly type: 'sumInternalNode';
  readonly prefix: string;
  readonly siblingHash?: string;
  readonly siblingSum?: string;
}

export interface ISumPathItemInternalNodeHashedJson extends ISumPathItemJsonBase {
  readonly type: 'sumInternalNodeHashed';
  readonly nodeHash: string;
  readonly sum: string;
}

export interface ISumPathItemEmptyBranchJson extends ISumPathItemJsonBase {
  readonly type: 'sumEmptyBranch';
  readonly direction: string;
  readonly siblingHash: string;
  readonly siblingSum: string;
}

export interface ISumPathItemLeafJson extends ISumPathItemJsonBase {
  readonly type: 'sumLeaf';
  readonly value: string;
  readonly valueType: 'string' | 'Uint8Array';
  readonly numericValue: string;
}

export type AnySumPathItemJson =
  | ISumPathItemRootJson
  | ISumPathItemInternalNodeJson
  | ISumPathItemInternalNodeHashedJson
  | ISumPathItemEmptyBranchJson
  | ISumPathItemLeafJson;

export interface ISumPathJson {
  readonly pathPaddingBits: string | false;
  readonly items: readonly AnySumPathItemJson[];
}

