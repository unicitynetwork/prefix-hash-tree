import { AbstractTree, LEFT, RIGHT, AbstractLeafNode, LEAF_PREFIX, AbstractInternalNode, NODE_PREFIX, AbstractLeg, AbstractPath, LEG_PREFIX, VerificationContext } from './smt.js';
import { HashFunction, PathItem, PathItemRoot, WordArray } from './types/index.js';
import { SumPathItemLeaf } from './types/sumtreeindex.js';
import { SumPathItemEmptyBranch } from './types/sumtreeindex.js';
import { SumPathItemInternalNodeHashed } from './types/sumtreeindex.js';
import { SumPathItemInternalNode } from './types/sumtreeindex.js';
import { SumPathItemRoot } from './types/sumtreeindex.js';
import { SumLeaf } from './types/sumtreeindex.js';


export class SumTree extends AbstractTree<SumInternalNode, SumLeafNode, SumLeaf, SumLeg, SumPathItemRoot,
    SumPathItemInternalNode, SumPathItemInternalNodeHashed, SumPathItemLeaf, SumPathItemEmptyBranch, 
    SumPath> 
{
  public constructor(hashFunction: HashFunction, leavesByPath: Map<bigint, SumLeaf>) {
    super(hashFunction, leavesByPath);
  }

  public getRootSum(): bigint {
    return this.root.getSum();
  }

  protected createPath(pathItems: PathItem[]): SumPath {
    return new SumPath(pathItems, this.hashFunction);
  }

  protected createPathForEmptyTree(): SumPath {
    return new SumPath(
      [{ type: 'sumRoot', rootHash: this.getRootHash(), sum: 0n } as SumPathItemRoot],
      this.hashFunction);
  }

  protected createNewLeaf(leaf: SumLeaf): SumLeafNode {
    return new SumLeafNode(this.hashFunction, leaf.value, leaf.numericValue);
  }

  protected createPathItemRoot(): SumPathItemRoot {
    return { type: 'sumRoot', rootHash: this.root.getHash(), sum: this.root.getSum() } as SumPathItemRoot;
  }

  protected createInternalNode(): SumInternalNode {
    return new SumInternalNode(this.hashFunction);
  }

  protected createEmptyLeftBranchPathItem(node: SumInternalNode): SumPathItemEmptyBranch {
    return { type: 'sumEmptyBranch', direction: LEFT, siblingHash: node.right!.getHash(), siblingSum: node.right!.getSum() };
  }

  protected createEmptyRightBranchPathItem(node: SumInternalNode): SumPathItemEmptyBranch {
    return { type: 'sumEmptyBranch', direction: RIGHT, siblingHash: node.left!.getHash(), siblingSum: node.left!.getSum() };
  }

  protected createPathItemInternalNode(prefix: bigint): SumPathItemInternalNode {
    return { type: 'sumInternalNode', prefix, siblingHash: undefined, siblingSum: undefined };
  }

  protected createPathItemInternalNodeHashed(node: SumInternalNode): SumPathItemInternalNodeHashed {
    return { type: 'sumInternalNodeHashed', nodeHash: node.getHash(), sum: node.getSum() };
  }

  protected createPathItemLeafNode(leaf: SumLeafNode): SumPathItemLeaf {
    return { type: 'sumLeaf', value: leaf.getValue(), numericValue: leaf.getSum() };
  }

  protected addSiblingDataToLeft(untypedPathItem: PathItem, node: SumInternalNode): void {
    const pathItem = untypedPathItem as SumPathItemInternalNode;
    pathItem.siblingHash = node.right ? node.right.getHash() : undefined;
    pathItem.siblingSum = node.right ? node.right.getSum() : undefined;
  }

  protected addSiblingDataToRight(untypedPathItem: PathItem, node: SumInternalNode): void {
    const pathItem = untypedPathItem as SumPathItemInternalNode;
    pathItem.siblingHash = node.left ? node.left.getHash() : undefined;
    pathItem.siblingSum = node.left ? node.left.getSum() : undefined;
  }

  protected createLeg(remainingPath: bigint, child: SumLeafNode | SumInternalNode): SumLeg {
    return new SumLeg(
      this.hashFunction,
      remainingPath,
      child);
  }
}
export class SumLeafNode extends AbstractLeafNode<SumLeafNode, SumInternalNode, SumLeg> {
  public readonly numericValue: bigint;

  constructor(
    hashFunction: HashFunction,
    value: string | WordArray,
    numericValue: bigint
  ) {
    super(hashFunction, value);
    this.numericValue = numericValue;
  }

  override getHash(): WordArray {
    return this.hashFunction(LEAF_PREFIX, this.value, this.numericValue);
  }

  public getSum(): bigint {
    return this.numericValue;
  }
}

export class SumInternalNode extends AbstractInternalNode<SumLeafNode, SumInternalNode, SumLeg> {
  constructor(hashFunction: HashFunction) {
    super(hashFunction);
  }

  override getHash(): WordArray {
    const leftHash = this.left ? this.left.getHash() : null;
    const rightHash = this.right ? this.right.getHash() : null;

    const leftSum = this.left ? this.left.getSum() : null;
    const rightSum = this.right ? this.right.getSum() : null;

    return this.hashFunction(NODE_PREFIX, leftHash, rightHash, leftSum, rightSum);
  }

  public getSum(): bigint {
    const leftSum = this.left ? this.left.getSum() : 0n;
    const rightSum = this.right ? this.right.getSum() : 0n;
    return leftSum + rightSum;
  }
}

export class SumLeg extends AbstractLeg<SumLeafNode, SumInternalNode, SumLeg> {
  private sum: bigint | null = null;

  public constructor(hashFunction: HashFunction, prefix: bigint, node: SumLeafNode | SumInternalNode) {
    super(hashFunction, prefix, node);
  }

  protected recalculateIfOutdated() {
    if (this.outdated) {
      this.sum = this.child.getSum();
    }
    super.recalculateIfOutdated();
  }

  public getSum(): bigint {
    this.recalculateIfOutdated();
    return this.sum!;
  }
}

export class SumPath extends AbstractPath {
  public getLeafNumericValue(): bigint | undefined {
    const leaf = this.path[this.path.length - 1];
    if (!(leaf as SumPathItemLeaf).value || (leaf as SumPathItemInternalNode).siblingHash || (leaf as SumPathItemInternalNode).prefix) {
      return undefined;
    }
    return (leaf as SumPathItemLeaf).numericValue;
  }

  public getRootSum(): bigint | undefined {
    if (this.path.length === 0) {
      return undefined;
    }

    return (this.path[0] as SumPathItemRoot).sum;
  }

  protected isEmptyBranch(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'sumEmptyBranch';
  }

  protected isLeaf(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'sumLeaf';
  }

  protected getNodeHashFromInternalNodeHashed(pathItem: PathItem): WordArray {
    return (pathItem as SumPathItemInternalNodeHashed).nodeHash as WordArray;
  }

  protected createVerificationContext(hashFunction: HashFunction): VerificationContext {
    let sumSoFar: bigint = 0n;
    return {
      beginCalculation(pathItem: PathItem): void {
        if ('type' in pathItem && pathItem.type == 'sumLeaf') {
          sumSoFar = (pathItem as SumPathItemLeaf).numericValue;
        } else if ('type' in pathItem && pathItem.type == 'sumInternalNodeHashed') {
          sumSoFar = (pathItem as SumPathItemInternalNodeHashed).sum;
        } else if ('type' in pathItem && pathItem.type == 'sumEmptyBranch') {
          sumSoFar = 0n;
        } else {
          throw new Error(`Unsupported PathItem type`);
        }
      },
      pathItemProcessed(pathItemAsSupertype: PathItem): void {
        if (!(('type' in pathItemAsSupertype) && (pathItemAsSupertype.type == 'sumInternalNode'))) {
          throw new Error('Unsupported PathItem type');
        }
        const pathItem = pathItemAsSupertype as SumPathItemInternalNode;
        sumSoFar += pathItem.siblingSum ? pathItem.siblingSum : 0n;
      },
      hashLeftNode(pathItemAsSupertype: PathItem, legHash: WordArray): WordArray {
        const pathItem = pathItemAsSupertype as SumPathItemInternalNode;
        return hashFunction(
          NODE_PREFIX,
          legHash,
          pathItem.siblingHash ? pathItem.siblingHash : null,
          sumSoFar,
          pathItem.siblingSum ? pathItem.siblingSum : null
        );
      },
      hashRightNode(pathItemAsSupertype: PathItem, legHash: WordArray): WordArray {
        const pathItem = pathItemAsSupertype as SumPathItemInternalNode;
        return hashFunction(
          NODE_PREFIX,
          pathItem.siblingHash ? pathItem.siblingHash : null,
          legHash,
          pathItem.siblingSum ? pathItem.siblingSum : null,
          sumSoFar
        );
      },
      hashLeftEmptyBranch(pathItemAsSupertype: PathItem): WordArray {
        const pathItem = pathItemAsSupertype as SumPathItemEmptyBranch;
        return hashFunction(
          NODE_PREFIX,
          null,
          pathItem.siblingHash,
          null,
          pathItem.siblingSum);
      },
      hashRightEmptyBranch(pathItemAsSupertype: PathItem): WordArray {
        const pathItem = pathItemAsSupertype as SumPathItemEmptyBranch;
        return hashFunction(
          NODE_PREFIX,
          pathItem.siblingHash,
          null,
          pathItem.siblingSum,
          null);
      },
      hashLeaf(pathItem: PathItem): WordArray {
        return hashFunction(
          LEAF_PREFIX,
          (pathItem as SumPathItemLeaf).value,
          (pathItem as SumPathItemLeaf).numericValue);
      },
      hashLeg(prefix: bigint, childHash: WordArray): WordArray {
        return hashFunction(LEG_PREFIX, prefix, childHash);
      }
    };
  }
}

