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
