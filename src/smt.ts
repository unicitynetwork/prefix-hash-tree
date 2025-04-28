/// <reference path="./types/unicitylabs__utils.d.ts" />
import { wordArrayToHex } from '@unicitylabs/utils';

import { HashFunction, Leaf, PathItem, PathItemRoot, PathItemInternalNode,
  PathItemInternalNodeHashed, PathItemEmptyBranch, PathItemLeaf, 
  AbstractPathItemRoot, AbstractPathItemInternalNode,
  AbstractPathItemInternalNodeHashed, AbstractPathItemEmptyBranch, AbstractPathItemLeaf,
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
      PathItemType extends PathItem,
      PathItemRootType extends AbstractPathItemRoot,
      PathItemInternalNodeType extends AbstractPathItemInternalNode,
      PathItemInternalNodeHashedType extends AbstractPathItemInternalNodeHashed,
      PathItemLeafType extends AbstractPathItemLeaf,
      PathItemEmptyBranchType extends AbstractPathItemEmptyBranch,
      PathType extends AbstractPath<PathItemType, PathItemRootType, PathItemInternalNodeType, PathItemEmptyBranchType, PathItemLeafType>> 
{
  protected readonly hashFunction: HashFunction;
  protected root: InternalNodeType;
  protected readonly pathPaddingBits: bigint | false;

  /**
   * By default, paths are internally padded to 256 bits by performing a bitwise OR operation
   * with 2^256. This ensures consistent path lengths internally. The tree path 
   * length compression efficiency is unaffected by this. The padding is automatically handled 
   * and is removed by methods like `getLocation()`.
   * 
   * @param {number | false | undefined} pathPaddingBits - Specifies the target bit length 
   * for padding (e.g., 256). Provide a positive integer to set a custom length.
   * Set to `false` disable path padding entirely. Defaults to 256 if `undefined`.
   */
  public constructor(hashFunction: HashFunction, leavesByPath: Map<bigint, LeafType>, pathPaddingBits: bigint | false = 256n) {
    this.hashFunction = hashFunction;
    this.pathPaddingBits = pathPaddingBits;
    this.root = this.buildTree(leavesByPath);
  }

  public getProof(requestPath: bigint): PathType {
    const path = this.padAndValidatePath(requestPath);
    if (this.isEmpty()) {
      return this.createPathForEmptyTree();
    }
    const pathItems = this.searchPath(this.root, path);
    pathItems.unshift(this.createPathItemRoot());
    return this.createPath(pathItems);
  }

  public isEmpty(): boolean {
    return (!this.root.left && (!this.root.right));
  }

  public addLeaf(requestPath: bigint, leaf: LeafType): void {
    const path = this.padAndValidatePath(requestPath);
    this.traverse(this.root, path, leaf);
  }

  public getRootHash(): WordArray {
    return this.root.getHash();
  }

  protected buildTree(leavesByPath: Map<bigint, LeafType>): InternalNodeType {
    const root = this.createInternalNode();

    for (const [pathWithoutPadding, leaf] of leavesByPath) {
      const path = this.padAndValidatePath(pathWithoutPadding);
      this.traverse(root, path, leaf);
    }
    return root;
  }

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

  protected searchPath(node: InternalNodeType, remainingPath: bigint): PathItem[] {
    const direction = getDirection(remainingPath);
    if (direction === LEFT) {
      if (!node.left) {
        return [this.createEmptyLeftBranchPathItem(node)];
      }
      const path = this.searchLeg(node.left, remainingPath);
      if (path.length > 0) {
        this.addSiblingDataToLeft(path[0], node);
      }
      return path;
    } else {
      if (!node.right) {
        return [this.createEmptyRightBranchPathItem(node)];
      }
      const path = this.searchLeg(node.right, remainingPath);
      if (path.length > 0) {
        this.addSiblingDataToRight(path[0], node);
      }
      return path;
    }
  }

  protected searchLeg(leg: LegType, remainingPath: bigint): PathItem[] {
    const { commonPrefix, remainingPathUniqueSuffix, existingPrefixUniqueSuffix } = 
        splitPrefix(remainingPath, leg.prefix);

    // TODO: refactor: if the path leads to the children of this leg... .
    if (commonPrefix === leg.prefix) {
      // TODO: refactor: if the path would go to the leaf node (that is, key is found) or to the children of that leaf node (that is, the key is not in the tree)... .
      if (leg.child.isLeaf()) {
        return [this.createPathItemInternalNode(commonPrefix), this.createPathItemLeafNode(leg.child)];
      } else if (leg.child.isInternal()) {
        // TODO: refactor: if the path would go to the child node (that is, key still may or may not be in the tree, need to continue traversing).
        const path = this.searchPath(leg.child, remainingPathUniqueSuffix);
        path.unshift(this.createPathItemInternalNode(commonPrefix));
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
        splitPrefix(remainingPath, leg.prefix);

    if (commonPrefix === remainingPath) {
      // This means either:
      // 
      // 1. An attempt to change an existing value, which is not supported.
      //  
      // 2. The new path would be in the middle of the prefix/path of an exisiting leg.
      // In this tree, only leaf nodes contain values, so this is not allowed.
      // More generally, every tree path must have only one value node (the leaf node).
      throw new Error('Cannot add leaf inside the leg');
    }
    if (commonPrefix === leg.prefix) {
      if (leg.child.isLeaf()) {
        // Here the path of the existing leaf would be in the middle of the new path.
        // In this tree, every tree path can contain only one value node, thus this is not allowed.
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

  protected padAndValidatePath(path: bigint): bigint {
    return padAndValidatePath(path, this.pathPaddingBits);
  }

  protected abstract createPath(pathItems: PathItem[]): PathType;

  protected abstract createNewLeaf(leaf: LeafType): LeafNodeType;

  protected abstract createPathForEmptyTree(): PathType;

  protected abstract createPathItemRoot(): PathItemRootType;

  protected abstract createInternalNode(): InternalNodeType;

  protected abstract createEmptyLeftBranchPathItem(node: InternalNodeType): PathItemEmptyBranchType;

  protected abstract createEmptyRightBranchPathItem(node: InternalNodeType): PathItemEmptyBranchType;

  protected abstract addSiblingDataToLeft(pathItem: PathItem, node: InternalNodeType): void;

  protected abstract addSiblingDataToRight(pathItem: PathItem, node: InternalNodeType): void;

  protected abstract createPathItemInternalNode(prefix: bigint): PathItemInternalNodeType;

  protected abstract createPathItemLeafNode(leaf: LeafNodeType): PathItemLeafType;

  protected abstract createPathItemInternalNodeHashed(node: InternalNodeType): PathItemInternalNodeHashedType;

  protected abstract createLeg(remainingPath: bigint, child: LeafNodeType | InternalNodeType): LegType;
}

export class SMT extends AbstractTree<InternalNode, LeafNode, Leaf, Leg, PathItem, PathItemRoot, PathItemInternalNode, 
                         PathItemInternalNodeHashed, PathItemLeaf, PathItemEmptyBranch, Path> 
{
  protected createPathForEmptyTree(): Path {
    return new Path (
      [{type: 'root', rootHash: this.getRootHash()} as PathItemRoot],
      this.hashFunction,
      this.pathPaddingBits);
  }

  protected createPath(pathItems: PathItem[]): Path {
    return new Path(pathItems, this.hashFunction, this.pathPaddingBits);
  }

  protected createInternalNode(): InternalNode {
    return new InternalNode(this.hashFunction);
  }

  protected createNewLeaf(leaf: Leaf): LeafNode {
    return new LeafNode(this.hashFunction, leaf.value);
  }

  protected createPathItemRoot(): PathItemRoot {
    return { type: 'root', rootHash: this.root.getHash() };
  }

  protected createEmptyLeftBranchPathItem(node: InternalNode): PathItemEmptyBranch {
    return { type: 'emptyBranch', direction: LEFT, siblingHash: node.right!.getHash()};
  }

  protected createEmptyRightBranchPathItem(node: InternalNode): PathItemEmptyBranch {
    return { type: 'emptyBranch', direction: RIGHT, siblingHash: node.left!.getHash()};
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
  private _prefix!: bigint;
  public child: LeafNodeType | InternalNodeType;
  protected outdated: boolean = true;
  private hash: WordArray | null = null;

  public constructor(hashFunction: HashFunction, prefix: bigint, node: LeafNodeType | InternalNodeType) {
    this.hashFunction = hashFunction;
    this.prefix = prefix;
    this.child = node;
  }

  public set prefix(newPrefix: bigint) {
    validatePrefix(newPrefix);
    this._prefix = newPrefix;
  }

  public get prefix(): bigint {
    return this._prefix;
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

export type ValidationResult = { success: true } | { success: false; error: string };

export abstract class AbstractPath<
    PathItemType extends PathItem,
    PathItemRootType extends AbstractPathItemRoot,
    PathItemInternalNodeType extends AbstractPathItemInternalNode,
    PathItemEmptyBranchType extends AbstractPathItemEmptyBranch,
    PathItemLeafType extends AbstractPathItemLeaf> 
{
  protected readonly path: PathItemType[];
  protected readonly hashFunction: HashFunction;
  protected readonly pathPaddingBits: bigint | false;

  constructor(items: PathItemType[], hashFunction: HashFunction, pathPaddingBits: bigint | false) {
    this.path = items;
    this.hashFunction = hashFunction;
    this.pathPaddingBits = pathPaddingBits;
  }

  public verifyPath(): ValidationResult {
    if (this.emptyTree()) {
      return {success: true};
    }

    const context = this.createVerificationContext(this.hashFunction);

    let h: WordArray;

    const lastItem = this.path[this.path.length - 1];
    if (this.isEmptyBranch(lastItem)) {
      const lastPathItem = lastItem as unknown as PathItemEmptyBranchType;
      if (getDirection(lastPathItem.direction) === LEFT) {
        h = context.hashLeftEmptyBranch(lastPathItem);
      } else {
        h = context.hashRightEmptyBranch(lastPathItem);
      }
    } else {
      if ((!this.isLeaf(lastItem)) &&
          (!this.isInternalNodeHashed(lastItem))) {
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
      const pathItem = this.path[i + 1] as unknown as PathItemInternalNodeType;
      const prefix = pathItem.prefix;
      validatePrefix(prefix);
      const legHash = context.hashLeg(prefix, h);

      if (getDirection(prefix) === LEFT) {
        h = context.hashLeftNode(pathItem, legHash);
      } else {
        h = context.hashRightNode(pathItem, legHash);
      }
      context.pathItemProcessed(pathItem);
    }
  
    return this.createValidationResult(
        wordArrayToHex(h) === wordArrayToHex((this.path[0] as unknown as PathItemRootType).rootHash),
        'Hash mismatch');
  }

  protected createValidationResult(success: boolean, errorIfFailed: string): ValidationResult {
    if (success) {
      return {success: true};
    } else {
      return {success: false, error: errorIfFailed};
    }
  }

  private emptyTree() {
    return this.path.length == 1;
  }

  public provesInclusionAt(requestPath: bigint): boolean {
    const paddedRequestPath = padAndValidatePath(requestPath, this.pathPaddingBits);
    const pathValidationResult = this.verifyPath();
    if (!pathValidationResult.success) {
      throw new Error(`Path integrity check error for path ${paddedRequestPath}: ${pathValidationResult.error}`);
    }
    if (this.isEmptyTree()) {
      return false;
    }
    const lastItemAsSupertype = this.path[this.path.length - 1];
    if (this.isEmptyBranch(lastItemAsSupertype)) {
      return false;
    }
    const extractedLocation = this.getPaddedLocation();
    if (paddedRequestPath === extractedLocation) {
      return true;
    }
    
    const requestPathBits = paddedRequestPath.toString(2).substring(1);
    const extractedLocationBits = extractedLocation.toString(2).substring(1);
    const commonPathBits = getCommonPathBits(requestPathBits, extractedLocationBits);
   
    const allRequestedPathMatchesButTreePathGoesDeeper = requestPathBits != extractedLocationBits && 
        commonPathBits === requestPathBits;
    const allTreePathMatchesButRequestGoesDeeper = requestPathBits != extractedLocationBits && 
        commonPathBits === extractedLocationBits;

    if (allRequestedPathMatchesButTreePathGoesDeeper) {
      return false;
    } else if (allTreePathMatchesButRequestGoesDeeper) {
      if (this.isLeaf(lastItemAsSupertype)) {
        return false;
      } else {
        throw new Error('Wrong path acquired for the requested path');
      }
    }
    return false;
  }

  public getLocation(): bigint {
    return unpad(this.getPaddedLocation(), this.pathPaddingBits);
  }

  public getPaddedLocation(): bigint {
    let result = 1n;
    for (let i = this.path.length - 1; i > 0; i--) {
      if (!('prefix' in this.path[i])) continue; 
      const bits = (this.path[i] as unknown as PathItemInternalNodeType).prefix;
      validatePrefix(bits);
      const bitLength = bits.toString(2).length - 1;
      result = (result << BigInt(bitLength)) | (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result;
  }

  public getLeafValue(): string | WordArray | undefined {
    const leaf = this.path[this.path.length - 1];
    if (!(leaf as unknown as PathItemLeafType).value || 
        (leaf as unknown as PathItemInternalNodeType).siblingHash || 
        (leaf as unknown as PathItemInternalNodeType).prefix) {
      return undefined;
    }
    return (leaf as unknown as PathItemLeafType).value;
  }

  public getRootHash(): WordArray | undefined {
    if (this.path.length === 0) {
      return undefined;
    }
    
    return (this.path[0] as unknown as PathItemRootType).rootHash;
  }

  public isEmptyTree() {
    return this.path.length == 1;
  }

  public getItems(): PathItemType[] {
    return this.path;
  }

  public getHashFunction(): HashFunction {
    return this.hashFunction;
  }

  protected abstract isLeaf(pathItem: PathItemType): boolean;

  protected abstract isEmptyBranch(pathItem: PathItemType): boolean;

  protected abstract isInternalNodeHashed(lastItem: PathItemType): boolean;

  protected abstract getNodeHashFromInternalNodeHashed(pathItem: PathItemType): WordArray;

  protected abstract createVerificationContext(hashFunction: HashFunction): VerificationContext;
}

export class Path extends AbstractPath<PathItem, PathItemRoot, PathItemInternalNode, PathItemEmptyBranch, PathItemLeaf> {
  protected isEmptyBranch(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'emptyBranch';
  }

  protected isLeaf(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'leaf';
  }

  protected isInternalNodeHashed(pathItem: PathItem): boolean {
    return 'type' in pathItem && pathItem.type == 'internalNodeHashed';
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
      hashLeftEmptyBranch(pathItemAsSupertype: PathItem) {
        const pathItem = pathItemAsSupertype as PathItemEmptyBranch;
        return hashFunction(
          NODE_PREFIX, 
          null, 
          pathItem.siblingHash);
      },
      hashRightEmptyBranch(pathItemAsSupertype: PathItem) {
        const pathItem = pathItemAsSupertype as PathItemEmptyBranch;
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
  hashLeftEmptyBranch(pathItem: PathItem): WordArray;
  hashRightEmptyBranch(pathItem: PathItem): WordArray;
  hashLeaf(pathItem: PathItem): WordArray;
  hashLeg(prefix: bigint, childHash: WordArray): WordArray;
}

function getDirection(path: bigint): bigint {
  const masked = path & 0b1n;
  return masked === RIGHT ? RIGHT : LEFT;
}

export function splitPrefix(remainingPath: bigint, existingPrefix: bigint): 
    { commonPrefix: bigint; remainingPathUniqueSuffix: bigint; existingPrefixUniqueSuffix: bigint; } 
{
  validatePrefix(remainingPath);
  validatePrefix(existingPrefix);
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

export function getCommonPathBits(pathBits1: string, pathBits2: string): string {
  let i1 = pathBits1.length - 1;
  let i2 = pathBits2.length - 1;
  
  while ((i1 >= 0) && (i2 >= 0) && (pathBits1.substring(i1, i1 + 1) === pathBits2.substring(i2, i2 + 1))) {
    i1--;
    i2--;
  }
  return pathBits1.substring(i1 + 1);
}

export function validatePrefix(prefix: bigint) {
  if (prefix <= 0n) {
    throw new Error(`Invalid prefix: ${prefix}`);
  }
}

export function padAndValidatePath(path: bigint, pathLengthBits: bigint | false): bigint {
  if (path < 0n) {
    throw new Error(`Invalid path: ${path}`);
  } 
  if (!pathLengthBits) {
    return path;
  }
  
  if (path >= (1n << (pathLengthBits + 1n))) {
    throw new Error(`Path too long for given bit length: 0b${path.toString(2)} is longer than ${pathLengthBits} + 1 bits`);
  }
  return path | (1n << pathLengthBits);
}

export function unpad(path: bigint, pathLengthBits: bigint | false): bigint {
  if (!pathLengthBits) {
    return path;
  }
  return path & ((1n << pathLengthBits) - 1n);
}
