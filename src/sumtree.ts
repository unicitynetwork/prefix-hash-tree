import { AbstractTree, LEFT, RIGHT, AbstractLeafNode, LEAF_PREFIX, AbstractInternalNode, NODE_PREFIX, AbstractLeg, AbstractPath, ValidationResult, LEG_PREFIX, VerificationContext } from './smt.js';
import { HashFunction, PathItem, WordArray } from './types/index.js';
import { SumPathItem } from './types/sumtreeindex.js';
import { SumPathItemLeaf } from './types/sumtreeindex.js';
import { SumPathItemEmptyBranch } from './types/sumtreeindex.js';
import { SumPathItemInternalNodeHashed } from './types/sumtreeindex.js';
import { SumPathItemInternalNode } from './types/sumtreeindex.js';
import { SumPathItemRoot } from './types/sumtreeindex.js';
import { SumLeaf } from './types/sumtreeindex.js';


export class SumTree extends AbstractTree<SumInternalNode, SumLeafNode, SumLeaf, SumLeg, SumPathItem, SumPathItemRoot,
    SumPathItemInternalNode, SumPathItemInternalNodeHashed, SumPathItemLeaf, SumPathItemEmptyBranch, 
    SumPath> 
{
  public constructor(hashFunction: HashFunction, leavesByPath: Map<bigint, SumLeaf>, pathLengthInBits: bigint | false | undefined = undefined) {
    super(hashFunction, leavesByPath, pathLengthInBits);
  }

  public getRootSum(): bigint {
    return this.root.getSum();
  }
  
  override createPath(pathItems: SumPathItem[]): SumPath {
    return new SumPath(pathItems, this.hashFunction, this.pathPaddingBits);
  }

  override createPathForEmptyTree(): SumPath {
    return new SumPath(
      [{ type: 'sumRoot', rootHash: this.getRootHash(), sum: 0n } as SumPathItemRoot],
      this.hashFunction,
      this.pathPaddingBits);
  }

  override createNewLeaf(leaf: SumLeaf): SumLeafNode {
    return new SumLeafNode(this.hashFunction, leaf.value, leaf.numericValue);
  }

  override createPathItemRoot(): SumPathItemRoot {
    return { type: 'sumRoot', rootHash: this.root.getHash(), sum: this.root.getSum() };
  }

  override createInternalNode(): SumInternalNode {
    return new SumInternalNode(this.hashFunction);
  }

  override createEmptyLeftBranchPathItem(node: SumInternalNode): SumPathItemEmptyBranch {
    return { type: 'sumEmptyBranch', direction: LEFT, siblingHash: node.right!.getHash(), siblingSum: node.right!.getSum() };
  }

  override createEmptyRightBranchPathItem(node: SumInternalNode): SumPathItemEmptyBranch {
    return { type: 'sumEmptyBranch', direction: RIGHT, siblingHash: node.left!.getHash(), siblingSum: node.left!.getSum() };
  }

  override createPathItemInternalNode(prefix: bigint): SumPathItemInternalNode {
    return { type: 'sumInternalNode', prefix, siblingHash: undefined, siblingSum: undefined };
  }

  override createPathItemInternalNodeHashed(node: SumInternalNode): SumPathItemInternalNodeHashed {
    return { type: 'sumInternalNodeHashed', nodeHash: node.getHash(), sum: node.getSum() };
  }

  override createPathItemLeafNode(leaf: SumLeafNode): SumPathItemLeaf {
    return { type: 'sumLeaf', value: leaf.getValue(), numericValue: leaf.getSum() };
  }

  override addSiblingDataToLeft(untypedPathItem: PathItem, node: SumInternalNode): void {
    const pathItem = untypedPathItem as SumPathItemInternalNode;
    pathItem.siblingHash = node.right ? node.right.getHash() : undefined;
    pathItem.siblingSum = node.right ? node.right.getSum() : undefined;
  }

  override addSiblingDataToRight(untypedPathItem: PathItem, node: SumInternalNode): void {
    const pathItem = untypedPathItem as SumPathItemInternalNode;
    pathItem.siblingHash = node.left ? node.left.getHash() : undefined;
    pathItem.siblingSum = node.left ? node.left.getSum() : undefined;
  }

  override createLeg(remainingPath: bigint, child: SumLeafNode | SumInternalNode): SumLeg {
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

  override recalculateIfOutdated() {
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

export class SumPath extends AbstractPath<SumPathItem, SumPathItemRoot, SumPathItemInternalNode,
    SumPathItemEmptyBranch, SumPathItemLeaf> {
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

  override verifyPath(): ValidationResult {
    if (!this.allNumericValuesOnPathArePositiveOrZero()) {
      return {success: false, error: 'Negative numeric values are not allowed on any part of the path'};
    }

    return super.verifyPath();
  }

  private allNumericValuesOnPathArePositiveOrZero(): boolean {
    for(const pathItem of this.path) {
      if(pathItem.type == 'sumRoot') {
        if (pathItem.sum < 0) {
          return false;
        }
      } else if(pathItem.type == 'sumInternalNode') {
        if (pathItem.siblingSum && pathItem.siblingSum < 0) {
          return false;
        }
      } else if(pathItem.type == 'sumInternalNodeHashed') {
        if (pathItem.sum < 0) {
          return false;
        }
      } else if(pathItem.type == 'sumEmptyBranch') {
        if (pathItem.siblingSum < 0) {
          return false;
        }
      } else if(pathItem.type == 'sumLeaf') {
        if (pathItem.numericValue < 0) {
          return false;
        }
      } else {
        const shouldNotHappen: never = pathItem;
        throw new Error(`Unknown type: ${shouldNotHappen}`);
      }
    };

    return true;
  }

  override isEmptyBranch(pathItem: SumPathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'sumEmptyBranch';
  }

  override isLeaf(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'sumLeaf';
  }

  override isInternalNodeHashed(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'sumInternalNodeHashed';
  }

  override getNodeHashFromInternalNodeHashed(pathItem: PathItem): WordArray {
    return (pathItem as SumPathItemInternalNodeHashed).nodeHash as WordArray;
  }

  override createVerificationContext(hashFunction: HashFunction): VerificationContext {
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

