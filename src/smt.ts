/// <reference path="./types/unicitylabs__utils.d.ts" />
import { wordArrayToHex } from '@unicitylabs/utils';

import { HashFunction, Leaf, PathItem, PathItemRoot, PathItemInternalNode,
  PathItemInternalNodeHashed, PathItemNoNode, PathItemLeaf, 
  WordArray } from './types/index.js';

export const LEFT: bigint = 0n;
export const RIGHT: bigint = 1n;

export const NODE_PREFIX: bigint = 0n;
export const LEG_PREFIX: bigint = 1n;
export const LEAF_PREFIX: bigint = 2n;

export abstract class AbstractTree<
      InternalNodeType extends AbstractInternalNode<LeafNodeType, InternalNodeType, LegType>, 
      LeafNodeType extends AbstractLeafNode<LeafNodeType, InternalNodeType, LegType>,
      LeafType extends Leaf,
      LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>,
      PathItemInternalNodeType extends PathItem,
      PathItemInternalNodeHashedType extends PathItem,
      PathItemLeafType extends PathItem,
      PathItemNoNodeType extends PathItem,
      PathType extends AbstractPath> {
  protected hashFunction: HashFunction;
  protected root: InternalNodeType;

  public constructor(hashFunction: HashFunction, leavesByPath: Map<bigint, LeafType>) {
    this.hashFunction = hashFunction;
    this.root = this.buildTree(leavesByPath);
  }

  public getProof(requestPath: bigint): PathType {
    if (this.isEmpty()) {
      return this.createPathForEmptyTree();
    }
    const path = this.searchPath(this.root, requestPath);
    path.unshift(this.createPathItemRoot());
    return this.createPath(path);
  }

  public isEmpty(): boolean {
    return (!this.root.left && (!this.root.right));
  }

  public addLeaf(requestPath: bigint, leaf: LeafType): void {
    this.traverse(this.root, requestPath, leaf);
  }

  public getRootHash(): WordArray {
    return this.root.getHash();
  }

  protected abstract createPath(pathItems: PathItem[]): PathType;

  protected abstract createNewLeaf(leaf: LeafType): LeafNodeType;

  protected abstract createPathForEmptyTree(): PathType;

  protected createPathItemRoot(): PathItem {
    return { type: 'root', rootHash: this.root.getHash() };
  }

  protected buildTree(leavesByPath: Map<bigint, LeafType>): InternalNodeType {
    const root = this.createInternalNode();

    for (const [path, leaf] of leavesByPath) {
      this.traverse(root, path, leaf);
    }
    return root;
  }

  protected abstract createInternalNode(): InternalNodeType;

  protected traverse(
    node: InternalNodeType, 
    remainingPath: bigint, 
    leaf: LeafType
  ): void {
    const direction = getDirection(remainingPath);
    if (direction === LEFT) {
      node.left = this.splitLeg(node.left, remainingPath, leaf);
    } else {
      node.right = this.splitLeg(node.right, remainingPath, leaf);
    }
  }

  protected abstract createNoNodePathItemForLeftDirection(node: InternalNodeType): PathItemNoNodeType;
  protected abstract createNoNodePathItemForRightDirection(node: InternalNodeType): PathItemNoNodeType;

  protected abstract addSiblingDataToLeft(pathItem: PathItem, node: InternalNodeType): void;
  protected abstract addSiblingDataToRight(pathItem: PathItem, node: InternalNodeType): void;

  protected searchPath(node: InternalNodeType, remainingPath: bigint): PathItem[] {
    const direction = getDirection(remainingPath);
    if (direction === LEFT) {
      if (!node.left) {
        return [this.createNoNodePathItemForLeftDirection(node)];
      }
      const path = this.searchLeg(node.left, remainingPath);
      if (path.length > 0) {
        this.addSiblingDataToLeft(path[0], node);
      }
      return path;
    } else {
      if (!node.right) {
        return [this.createNoNodePathItemForRightDirection(node)];
      }
      const path = this.searchLeg(node.right, remainingPath);
      if (path.length > 0) {
        this.addSiblingDataToRight(path[0], node);
      }
      return path;
    }
  }

  protected abstract createPathItemInternalNode(prefix: bigint): PathItemInternalNodeType;

  protected abstract createPathItemLeafNode(leaf: LeafNodeType): PathItemLeafType;

  protected abstract createPathItemInternalNodeHashed(node: InternalNodeType): PathItemInternalNodeHashedType;

  protected abstract createLeg(remainingPath: bigint, child: LeafNodeType | InternalNodeType): LegType;

  protected searchLeg(leg: LegType, remainingPath: bigint): PathItem[] {
    const { commonPrefix, remainingPathUniqueSuffix, existingPrefixUniqueSuffix } = 
        this.splitPrefix(remainingPath, leg.prefix);

    // TODO: refactor: if the path leads to the children of this leg... .
    if (commonPrefix === leg.prefix) {
      // TODO: refactor: if the path would go to the leaf node (that is, key is found) or to the children of that leaf node (that is, the key is not in the tree)... .
      if (leg.child.isLeaf()) {
        return [this.createPathItemInternalNode(commonPrefix), this.createPathItemLeafNode(leg.child)];
      } else if (leg.child.isInternal()) {
        // TODO: refactor: if the path would go to the child node (that is, key still may or may not be in the tree, need to continue traversing).
        const path = this.searchPath(leg.child, remainingPathUniqueSuffix);
        const item: PathItemInternalNodeType  = this.createPathItemInternalNode(commonPrefix);
        path.unshift(item);
        return path;
      } else {
        throw new Error('Unknown node type');
      }
    }

    // TODO: refactor: if the path diverges from the curren leg's prefix (the key is not in the tree)... .
    const item = this.createPathItemInternalNode(leg.prefix);

    const valueItem: PathItem = 
      leg.child.isLeaf() ?
        this.createPathItemLeafNode(leg.child) :
        this.createPathItemInternalNodeHashed(leg.child);

    return [item, valueItem];
  }

  protected splitPrefix(remainingPath: bigint, existingPrefix: bigint): 
      { commonPrefix: bigint; remainingPathUniqueSuffix: bigint; existingPrefixUniqueSuffix: bigint; } 
  {
    // Find the position where prefix and sequence differ
    let mask = 1n;
    const remainingPathLen = remainingPath.toString(2).length - 1;
    const existingPrefixLen = existingPrefix.toString(2).length - 1;
    const minLen =  Math.min(remainingPathLen, existingPrefixLen);

    let firstDifferencePos = 0n;
    while ((remainingPath & mask) === (existingPrefix & mask) && firstDifferencePos < minLen) {
      firstDifferencePos++;
      mask <<= 1n;
    }

    const commonPrefix = (remainingPath & ((1n << firstDifferencePos) - 1n)) | (1n << firstDifferencePos);
    const remainingPathUniqueSuffix = remainingPath >> firstDifferencePos;
    const existingPrefixUniqueSuffix = existingPrefix >> firstDifferencePos;

    return {commonPrefix, remainingPathUniqueSuffix, existingPrefixUniqueSuffix};
  }

  protected splitLeg(
    leg: LegType | null, 
    remainingPath: bigint, 
    leaf: LeafType
  ): LegType {
    if (!leg) {
      const child = this.createNewLeaf(leaf);
      return this.createLeg(remainingPath, child);
    }
    leg.markAsOutdated();
    const { commonPrefix, remainingPathUniqueSuffix, existingPrefixUniqueSuffix } = 
        this.splitPrefix(remainingPath, leg.prefix);

    if (commonPrefix === remainingPath) {
      throw new Error('Cannot add leaf inside the leg');
    }
    if (commonPrefix === leg.prefix) {
      if (leg.child.isLeaf()) {
        throw new Error('Cannot extend the leg through the leaf');
      }
      this.traverse(leg.child, remainingPathUniqueSuffix, leaf);
      return leg;
    }
    leg.prefix = commonPrefix;
    const junction = this.createInternalNode();
    const oldLeg = this.createLeg(existingPrefixUniqueSuffix, leg.child);

    leg.child = junction;
    if (getDirection(existingPrefixUniqueSuffix) === LEFT) {
      junction.left = oldLeg;
    } else {
      junction.right = oldLeg;
    }
    this.traverse(junction, remainingPathUniqueSuffix, leaf);
    return leg;
  }
}

export class SMT extends AbstractTree<InternalNode, LeafNode, Leaf, Leg, PathItemInternalNode, PathItemInternalNodeHashed, 
    PathItemLeaf, PathItemNoNode, Path> 
{
  protected createPathForEmptyTree(): Path {
    return new Path (
      [{type: 'root', rootHash: this.getRootHash()} as PathItemRoot],
      this.hashFunction);
  }

  protected createPath(pathItems: PathItem[]): Path {
    return new Path(pathItems, this.hashFunction);
  }

  protected createInternalNode(): InternalNode {
    return new InternalNode(this.hashFunction);
  }

  protected createNewLeaf(leaf: Leaf): LeafNode {
    return new LeafNode(this.hashFunction, leaf.value);
  }

  protected createNoNodePathItemForLeftDirection(node: InternalNode): PathItemNoNode {
    return { type: 'noNode', direction: LEFT, siblingHash: node.right!.getHash()};
  }

  protected createNoNodePathItemForRightDirection(node: InternalNode): PathItemNoNode {
    return { type: 'noNode', direction: RIGHT, siblingHash: node.left!.getHash()};
  }

  protected createPathItemInternalNode(prefix: bigint): PathItemInternalNode {
    return { type: 'internalNode', prefix, siblingHash: undefined };
  }

  protected createPathItemInternalNodeHashed(node: InternalNode): PathItemInternalNodeHashed {
    return { type: 'internalNodeHashed', nodeHash: node.getHash() };
  }

  protected createPathItemLeafNode(leaf: LeafNode): PathItemLeaf {
    return { type: 'leaf', value: leaf.getValue() };
  }

  protected addSiblingDataToLeft(untypedPathItem: PathItem, node: InternalNode): void {
    const pathItem = untypedPathItem as PathItemInternalNode;
    pathItem.siblingHash = node.right ? node.right.getHash() : undefined;
  }

  protected addSiblingDataToRight(untypedPathItem: PathItem, node: InternalNode): void {
    const pathItem = untypedPathItem as PathItemInternalNode;
    pathItem.siblingHash = node.left ? node.left.getHash() : undefined;
  }

  protected createLeg(remainingPath: bigint, child: LeafNode | InternalNode): Leg {
    return new Leg(
      this.hashFunction,
      remainingPath,
      child);
  }
} 

export abstract class Node<LeafNodeType extends AbstractLeafNode<LeafNodeType, InternalNodeType, LegType>, 
                           InternalNodeType extends AbstractInternalNode<LeafNodeType, InternalNodeType, LegType>,
                           LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>> {
  protected readonly hashFunction: HashFunction;

  protected constructor(hashFunction: HashFunction) {
    this.hashFunction = hashFunction;
  }

  abstract getHash(): WordArray;
  
  public isLeaf(): this is LeafNodeType {
    return this instanceof AbstractLeafNode;
  }

  public isInternal(): this is InternalNodeType {
    return this instanceof AbstractInternalNode;
  }
}

export abstract class AbstractLeafNode<LeafNodeType extends AbstractLeafNode<LeafNodeType, InternalNodeType, LegType>,
                                       InternalNodeType extends AbstractInternalNode<LeafNodeType, InternalNodeType, LegType>,
                                       LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>> 
     extends Node<LeafNodeType, InternalNodeType, LegType> {
  public readonly value: string | WordArray;

  constructor(
      hashFunction: HashFunction,
      value: string | WordArray
  ) {
      super(hashFunction);
      this.value = value;
  }

  public getValue(): string | WordArray {
    return this.value;
  }

  override getHash(): WordArray {
    return this.hashFunction(LEAF_PREFIX, this.value);
  }
}

export class LeafNode extends AbstractLeafNode<LeafNode, InternalNode, Leg> {
}

export abstract class AbstractInternalNode<LeafNodeType extends AbstractLeafNode<LeafNodeType, InternalNodeType, LegType>,
                                           InternalNodeType extends AbstractInternalNode<LeafNodeType, InternalNodeType, LegType>,
                                           LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>> 
    extends Node<LeafNodeType, InternalNodeType, LegType> 
{
  public left: LegType | null = null;
  public right: LegType | null = null;

  constructor(hashFunction: HashFunction) {
    super(hashFunction);
  }

  override getHash(): WordArray {
    const leftHash = this.left ? this.left.getHash() : null;
    const rightHash = this.right ? this.right.getHash() : null;

    return this.hashFunction(NODE_PREFIX, leftHash, rightHash);
  }
}

export class InternalNode extends AbstractInternalNode<LeafNode, InternalNode, Leg> {
}

export abstract class AbstractLeg<LeafNodeType extends AbstractLeafNode<LeafNodeType, InternalNodeType, LegType>, 
                           InternalNodeType extends AbstractInternalNode<LeafNodeType, InternalNodeType, LegType>,
                           LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>>
{
  private hashFunction: HashFunction;
  public prefix: bigint;
  public child: LeafNodeType | InternalNodeType;
  protected outdated: boolean = true;
  private hash: WordArray | null = null;

  public constructor(hashFunction: HashFunction, prefix: bigint, node: LeafNodeType | InternalNodeType) {
    this.hashFunction = hashFunction;
    this.prefix = prefix;
    this.child = node;
  }

  public getHash(): WordArray {
    this.recalculateIfOutdated();
    return this.hash!;
  }
  
  protected recalculateIfOutdated() {
    if (this.outdated) {
      this.hash = this.hashFunction(LEG_PREFIX, this.prefix, this.child.getHash());
      this.outdated = false;
    }
  }

  public markAsOutdated(): void {
    this.outdated = true;
  }
}

class Leg extends AbstractLeg<LeafNode, InternalNode, Leg> {
}

export abstract class AbstractPath {
  protected readonly path: PathItem[];
  protected readonly hashFunction: HashFunction;

  constructor(items: PathItem[], hashFunction: HashFunction) {
    this.path = items;
    this.hashFunction = hashFunction;
  }

  public verifyPath(): boolean {
    if (this.path.length == 1) { // Empty tree
      return true;
    }

    const context = this.createVerificationContext(this.hashFunction);

    let h: WordArray;

    if (this.isNoNode(this.path[this.path.length - 1])) {
      const lastPathItem = this.path[this.path.length - 1] as PathItemNoNode;
      if (getDirection(lastPathItem.direction) === LEFT) {
        h = context.hashLeftNoNode(lastPathItem);
      } else {
        h = context.hashRightNoNode(lastPathItem);
      }
    } else {
      if ((!(this.path[this.path.length - 1] as PathItemLeaf).value) &&
          (!(this.path[this.path.length - 1] as PathItemInternalNodeHashed).nodeHash)) {
        throw new Error('Last path item has no leaf or nodeHash value');
      }

      if (this.isLeaf(this.path[this.path.length - 1])) {
        h = context.hashLeaf(this.path[this.path.length - 1]);
      } else {
        h = this.getNodeHashFromInternalNodeHashed(this.path[this.path.length - 1]);
      }
    }

    context.beginCalculation(this.path[this.path.length - 1]);
    
    for (let i = this.path.length - 3; i >= 0; i--) {
      const pathItem = this.path[i + 1] as PathItemInternalNode;
      const prefix = pathItem.prefix;
      const legHash = context.hashLeg(prefix, h);

      if (getDirection(prefix) === LEFT) {
        h = context.hashLeftNode(pathItem, legHash);
      } else {
        h = context.hashRightNode(pathItem, legHash);
      }
      context.pathItemProcessed(pathItem);
    }
  
    return wordArrayToHex(h) === wordArrayToHex((this.path[0] as PathItemRoot).rootHash);
  }

  public provesInclusionAt(requestPath: bigint): boolean {
    if (!this.verifyPath()) {
      throw new Error(`Path integrity check fail for path ${requestPath}`);
    }
    if (this.isEmptyTree()) {
      return false;
    }
    const lastItemAsSupertype = this.path[this.path.length - 1];
    if (this.isNoNode(lastItemAsSupertype)) {
      return false;
    }
    const extractedLocation = this.getLocation();
    if (requestPath === extractedLocation) return true;
    
    const requestPathBits = requestPath.toString(2).substring(1);
    const extractedLocationBits = extractedLocation.toString(2).substring(1);
    const commonPathBits = getCommonPathBits(requestPathBits, extractedLocationBits);
    
    if (commonPathBits === requestPathBits) return false;
    if (commonPathBits === extractedLocationBits) {
      // Since the leaf property doesn't exist in our IPathItem, we'll check for a value property instead,
      // which would indicate this is a leaf node
      const lastItem = lastItemAsSupertype as PathItemLeaf;
      if (lastItem.value !== undefined) {
        return false;
      } else {
        // TODO: According to the type system, this is impossible.
        throw new Error('Wrong path acquired for the requested path');
      }
    }
    if (this.vertexAtDepth(commonPathBits.length)) {
      throw new Error('Wrong path acquired for the requested path');
    }
    return false;
  }

  public getLocation(): bigint {
    let result = 1n;
    for (let i = this.path.length - 1; i > 0; i--) {
      if (!(this.path[i] as PathItemInternalNode).prefix) continue;
      const bits = (this.path[i] as PathItemInternalNode).prefix;
      const bitLength = bits.toString(2).length - 1;
      result = (result << BigInt(bitLength)) | (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result;
  }

  public getLeafValue(): string | WordArray | undefined {
    const leaf = this.path[this.path.length - 1];
    if (!(leaf as PathItemLeaf).value || (leaf as PathItemInternalNode).siblingHash || (leaf as PathItemInternalNode).prefix) {
      return undefined;
    }
    return (leaf as PathItemLeaf).value;
  }

  public getRootHash(): WordArray | undefined {
    if (this.path.length === 0) {
      return undefined;
    }
    
    return (this.path[0] as PathItemRoot).rootHash;
  }

  public isEmptyTree() {
    return this.path.length == 1;
  }

  public getItems(): PathItem[] {
    return this.path;
  }

  public getHashFunction(): HashFunction {
    return this.hashFunction;
  }

  protected abstract isLeaf(pathItem: PathItem): boolean;

  protected abstract isNoNode(pathItem: PathItem): boolean;

  protected abstract getNodeHashFromInternalNodeHashed(pathItem: PathItem): WordArray;

  protected abstract createVerificationContext(hashFunction: HashFunction): VerificationContext;

  private vertexAtDepth(depth: number): boolean {
    let result = 1n;
    for (let i = this.path.length - 1; i > 0 && (1n << BigInt(depth)) > result; i--) {
      if (!(this.path[i] as PathItemInternalNode).prefix) continue;
      const bits = (this.path[i] as PathItemInternalNode).prefix;
      const bitLength = bits.toString(2).length - 1;
      result = (result << BigInt(bitLength)) | (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result.toString(2).length === depth;
  }
}

export class Path extends AbstractPath {
  protected isNoNode(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'noNode';
  }

  protected isLeaf(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'leaf';
  }

  protected getNodeHashFromInternalNodeHashed(pathItem: PathItem): WordArray {
    return (pathItem as PathItemInternalNodeHashed).nodeHash;
  }

  protected createVerificationContext(hashFunction: HashFunction): VerificationContext {
    return {
      beginCalculation(pathItem: PathItem): void {
      },
      pathItemProcessed(pathItemAsSupertype: PathItem): void {
      },
      hashLeftNode(pathItemAsSupertype: PathItem, legHash: WordArray): WordArray {
        const pathItem = pathItemAsSupertype as PathItemInternalNode;
        return hashFunction(
          NODE_PREFIX, 
          legHash, 
          pathItem.siblingHash ? pathItem.siblingHash : null); 
      },
      hashRightNode(pathItemAsSupertype: PathItem, legHash: WordArray): WordArray {
        const pathItem = pathItemAsSupertype as PathItemInternalNode;
        return hashFunction(
          NODE_PREFIX, 
          pathItem.siblingHash ? pathItem.siblingHash : null, 
          legHash);
      },
      hashLeftNoNode(pathItemAsSupertype: PathItem) {
        const pathItem = pathItemAsSupertype as PathItemNoNode;
        return hashFunction(
          NODE_PREFIX, 
          null, 
          pathItem.siblingHash);
      },
      hashRightNoNode(pathItemAsSupertype: PathItem) {
        const pathItem = pathItemAsSupertype as PathItemNoNode;
        return hashFunction(
          NODE_PREFIX, 
          pathItem.siblingHash, 
          null);
      },
      hashLeaf(pathItem: PathItem): WordArray {
        return hashFunction(LEAF_PREFIX, (pathItem as PathItemLeaf).value);
      },
      hashLeg (prefix: bigint, childHash: WordArray): WordArray {
        return hashFunction(LEG_PREFIX, prefix, childHash);
      }
    };
  }
}

export interface VerificationContext {
  beginCalculation(pathItem: PathItem): void;
  pathItemProcessed(pathItem: PathItem): void;
  hashLeftNode(pathItem: PathItem, legHash: WordArray): WordArray;
  hashRightNode(pathItem: PathItem, legHash: WordArray): WordArray;
  hashLeftNoNode(pathItem: PathItem): WordArray;
  hashRightNoNode(pathItem: PathItem): WordArray;
  hashLeaf(pathItem: PathItem): WordArray;
  hashLeg(prefix: bigint, childHash: WordArray): WordArray;
}

function getDirection(path: bigint): bigint {
  const masked = path & 0b1n;
  return masked === RIGHT ? RIGHT : LEFT;
}

export function getCommonPathBits(pathBits1: string, pathBits2: string): string {
  let i1 = pathBits1.length - 1;
  let i2 = pathBits2.length - 1;
  
  while ((i1 >= 0) && (i2 >= 0) && (pathBits1.substring(i1, i1 + 1) === pathBits2.substring(i2, i2 + 1))) {
    i1--;
    i2--;
  }
  return pathBits1.substring(i1 + 1);
}