/// <reference path="./types/unicitylabs__utils.d.ts" />
import { wordArrayToHex } from '@unicitylabs/utils';

import { HashFunction, Leaf, PathItem, PathItemRoot, PathItemInternalNode, PathItemInternalNodeHashed, PathItemNoNode, PathItemLeaf, WordArray } from './types/index.js';

const LEFT: bigint = 0n;
const RIGHT: bigint = 1n;

const NODE_PREFIX: bigint = 0n;
const LEG_PREFIX: bigint = 1n;
const LEAF_PREFIX: bigint = 2n;

export class SMT {
  private hashFunction: HashFunction;
  private root: InternalNode;
  private sumCertifying: boolean;

  public constructor(hashFunction: HashFunction, leaves: Leaf[], sumCertifying: boolean = false) {
    this.hashFunction = hashFunction;
    this.sumCertifying = sumCertifying;
    this.root = buildTree(hashFunction, leaves, sumCertifying);
  }

  public getProof(requestPath: bigint): Path {
    if (this.isEmpty()) {
      if (this.sumCertifying) {
        return new Path(
          [{type: 'root', rootHash: this.getRootHash(), sum: 0n} as PathItemRoot],
          this.hashFunction);
      } else {
        return new Path (
          [{type: 'root', rootHash: this.getRootHash()} as PathItemRoot],
          this.hashFunction);
      }
    }
    const path = searchPath(this.root, requestPath, this.sumCertifying);
    const rootItem: PathItemRoot = { type: 'root', rootHash: this.root.getHash() };
    if (this.sumCertifying) {
      rootItem.sum = this.root.getSum();
    }
    path.unshift(rootItem);
    return new Path(path, this.hashFunction);
  }

  public isEmpty(): boolean {
    return (!this.root.left && (!this.root.right));
  }

  public addLeaf(requestPath: bigint, value: string | WordArray, numericValue?: bigint): void {
    traverse(this.hashFunction, this.root, requestPath, value, numericValue, this.sumCertifying);
  }

  public getRootHash(): WordArray {
    return this.root.getHash() as WordArray;
  }

  public getRootSum(): bigint | undefined {
    if (!this.sumCertifying) {
      throw new Error('This tree is not sum certifying');
    }
    return this.root.getSum();
  }
}

export abstract class Node {
  protected readonly hashFunction: HashFunction;
  protected readonly sumCertifying: boolean;

  protected constructor(hashFunction: HashFunction, sumCertifying: boolean = false) {
    if (typeof hashFunction !== 'function') {
      throw new Error('hashFunction must be function');
    }
    this.hashFunction = hashFunction;
    this.sumCertifying = sumCertifying;
  }

  abstract getHash(): WordArray;
  abstract getSum(): bigint;
  
  public getValue(): string | WordArray {
    throw new Error('Cannot get value from this node type');
  }

  public isLeaf(): this is LeafNode {
    return this instanceof LeafNode;
  }

  public isInternal(): this is InternalNode {
    return this instanceof InternalNode;
  }
}

export class LeafNode extends Node {
  public readonly value: string | WordArray;
  public readonly numericValue?: bigint;

  constructor(
      hashFunction: HashFunction,
      sumCertifying: boolean = false,
      value: string | WordArray,
      numericValue?: bigint
  ) {
      super(hashFunction, sumCertifying);
      this.value = value;
      this.numericValue = numericValue;
  }

  override getHash(): WordArray {
    if (this.sumCertifying) {
      return this.hashFunction(LEAF_PREFIX, this.value, this.numericValue!);
    } else {
      return this.hashFunction(LEAF_PREFIX, this.value);
    }
  }

  override getSum(): bigint {
    if (!this.sumCertifying) {
      throw new Error('This is not a sum certifying tree');
    }
    return this.numericValue!;
  }

  override getValue(): string | WordArray {
    return this.value;
  }
}

export class InternalNode extends Node {
  public left: Leg | null = null;
  public right: Leg | null = null;

  constructor(hashFunction: HashFunction, sumCertifying: boolean = false) {
    super(hashFunction, sumCertifying);
  }

  override getHash(): WordArray {
    const leftHash = this.left ? this.left.getHash() : null;
    const rightHash = this.right ? this.right.getHash() : null;

    if (this.sumCertifying) {
      const leftSum = this.left ? this.left.getSum() : null;
      const rightSum = this.right ? this.right.getSum() : null;
      return this.hashFunction(NODE_PREFIX, leftHash, rightHash, leftSum, rightSum);
    } else {
      return this.hashFunction(NODE_PREFIX, leftHash, rightHash);
    }
  }

  override getSum(): bigint {
    if (!this.sumCertifying) {
      throw new Error('This is not a sum certifying tree');    
    }
    const leftSum = this.left ? this.left.getSum() : 0n;
    const rightSum = this.right ? this.right.getSum() : 0n;
    return leftSum + rightSum;
  }
}

class Leg {
  private hashFunction: HashFunction;
  public prefix: bigint;
  public child: Node;
  private outdated: boolean = true;
  private hash: WordArray | null = null;
  private sum: bigint | null = null;

  private sumCertifying: boolean;

  public constructor(hashFunction: HashFunction, prefix: bigint, node: Node, sumCertifying: boolean = false) {
    this.hashFunction = hashFunction;
    this.prefix = prefix;
    this.child = node;
    this.sumCertifying = sumCertifying;
  }

  public getHash(): WordArray {
    this.recalculateIfOutdated();
    return this.hash!;
  }
  
  public getSum(): bigint {
    if (!this.sumCertifying) {
      throw new Error('This is not a sum certifying tree');
    }
    this.recalculateIfOutdated();
    return this.sum!;
  }
  
  private recalculateIfOutdated() {
    if (this.outdated) {
      this.hash = this.hashFunction(LEG_PREFIX, this.prefix, this.child.getHash());
      if (this.sumCertifying) {
        this.sum = this.child.getSum();
      }
      this.outdated = false;
    }
  }

  public markAsOutdated(): void {
    this.outdated = true;
  }
}

function buildTree(hashFunction: HashFunction, leaves: Leaf[], sumCertifying: boolean = false): InternalNode {
  const root = new InternalNode(hashFunction, sumCertifying);

  for (const leaf of leaves) {
    traverse(hashFunction, root, leaf.path, leaf.value, leaf.numericValue, sumCertifying);
  }
  return root;
}

function traverse(
  hashFunction: HashFunction, 
  node: InternalNode, 
  remainingPath: bigint, 
  leafValue: string | WordArray, 
  numericValue?: bigint,
  sumCertifying: boolean = false
): void {
  const direction = getDirection(remainingPath);
  if (direction === LEFT) {
    node.left = splitLeg(hashFunction, node.left, remainingPath, leafValue, numericValue, sumCertifying);
  } else {
    node.right = splitLeg(hashFunction, node.right, remainingPath, leafValue, numericValue, sumCertifying);
  }
}

function searchPath(node: InternalNode, remainingPath: bigint, sumCertifying: boolean = false): PathItem[] {
  const direction = getDirection(remainingPath);
  if (direction === LEFT) {
    if (!node.left) {
      return [{ type: 'noNode', direction: LEFT, siblingHash: node.right!.getHash()} as PathItemNoNode];
    }
    const path = searchLeg(node.left, remainingPath, sumCertifying);
    if (path.length > 0) {
      const firstPathItem = path[0] as PathItemInternalNode;
      firstPathItem.siblingHash = node.right ? node.right.getHash() : undefined;
      if (sumCertifying) {
        firstPathItem.siblingSum = node.right ? node.right.getSum() : undefined;
      }
    }
    return path;
  } else {
    if (!node.right) {
      return [{ type: 'noNode', direction: RIGHT, siblingHash: node.left!.getHash()} as PathItemNoNode];
    }
    const path = searchLeg(node.right, remainingPath, sumCertifying);
    if (path.length > 0) {
      const firstPathItem = path[0] as PathItemInternalNode;
      firstPathItem.siblingHash = node.left ? node.left.getHash() : undefined;
      if (sumCertifying) {
        firstPathItem.siblingSum = node.left ? node.left.getSum() : undefined;
      }
    }
    return path;
  }
}

function searchLeg(leg: Leg, remainingPath: bigint, sumCertifying: boolean = false): PathItem[] {
  const { commonPrefix, remainingPathUniqueSuffix, existingPrefixUniqueSuffix } = 
      splitPrefix(remainingPath, leg.prefix);

  // TODO: refactor: if the path leads to the children of this leg... .
  if (commonPrefix === leg.prefix) {
    // TODO: refactor: if the path would go to the leaf node (that is, key is found) or to the children of that leaf node (that is, the key is not in the tree)... .
    if (leg.child.isLeaf()) {
      const item: PathItemInternalNode = { type: 'internalNode', prefix: commonPrefix } as PathItemInternalNode;
      const leafItem: PathItemLeaf = { type: 'leaf', value: leg.child.getValue() } as PathItemLeaf;
      
      if (sumCertifying) {
        leafItem.numericValue = leg.child.getSum();
      }
      
      return [item, leafItem];
    } else if (leg.child.isInternal()) {
      // TODO: refactor: if the path would go to the child node (that is, key still may or may not be in the tree, need to continue traversing).
      const path = searchPath(leg.child as InternalNode, remainingPathUniqueSuffix, sumCertifying);
      const item: PathItem = { type: 'internalNode', prefix: commonPrefix } as PathItemInternalNode;
      path.unshift(item);
      return path;
    } else {
      throw new Error('Unknown node type');
    }
  }

  // TODO: refactor: if the path diverges from the curren leg's prefix (the key is not in the tree)... .
  const item: PathItem = { type: 'internalNode', prefix: leg.prefix } as PathItemInternalNode;
  const valueItem: PathItem = 
    leg.child.isLeaf() ?
      (sumCertifying ?
        { type: 'leaf', value: leg.child.getValue(), numericValue: leg.child.getSum()} as PathItemLeaf :
        { type: 'leaf', value: leg.child.getValue()} as PathItemLeaf) 
      :
      (sumCertifying ?
        { type: 'internalNodeHashed', nodeHash: leg.child.getHash(), sum: leg.child.getSum() } as PathItemInternalNodeHashed :
        { type: 'internalNodeHashed', nodeHash: leg.child.getHash() } as PathItemInternalNodeHashed);
  
  return [item, valueItem];
}

function splitPrefix(remainingPath: bigint, existingPrefix: bigint): 
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

function splitLeg(
  hashFunction: HashFunction,
  leg: Leg | null, 
  remainingPath: bigint, 
  leafValue: string | WordArray,
  numericValue?: bigint,
  sumCertifying: boolean = false
): Leg {
  if (!leg) {
    return new Leg(hashFunction, remainingPath, new LeafNode(hashFunction, sumCertifying, leafValue, numericValue), sumCertifying);
  }
  leg.markAsOutdated();
  const { commonPrefix, remainingPathUniqueSuffix, existingPrefixUniqueSuffix } = 
      splitPrefix(remainingPath, leg.prefix);

  if (commonPrefix === remainingPath) {
    throw new Error('Cannot add leaf inside the leg');
  }
  if (commonPrefix === leg.prefix) {
    if (leg.child.isLeaf()) {
      throw new Error('Cannot extend the leg through the leaf');
    }
    traverse(hashFunction, leg.child as InternalNode, remainingPathUniqueSuffix, leafValue, numericValue, sumCertifying);
    return leg;
  }
  leg.prefix = commonPrefix;
  const junction = new InternalNode(hashFunction, sumCertifying);
  const oldLeg = new Leg(hashFunction, existingPrefixUniqueSuffix, leg.child, sumCertifying);
  leg.child = junction;
  if (getDirection(existingPrefixUniqueSuffix) === LEFT) {
    junction.left = oldLeg;
  } else {
    junction.right = oldLeg;
  }
  traverse(hashFunction, junction, remainingPathUniqueSuffix, leafValue, numericValue, sumCertifying);
  return leg;
}

export class Path {
  private readonly path: PathItem[];
  private readonly hashFunction: HashFunction;

  constructor(items: PathItem[], hashFunction: HashFunction) {
    this.path = items;
    this.hashFunction = hashFunction;
  }

  public verifyPath(): boolean {
    if (this.path.length == 1) { // Empty tree
      return true;
    }

    const isSumCertifying = (this.path[0] as PathItemRoot).sum !== undefined;
    let sumSoFar: bigint = 0n;

    let h;

    if (this.path[this.path.length - 1].type == 'noNode') {
      const lastPathItem = this.path[this.path.length - 1] as PathItemNoNode;
      if (getDirection(lastPathItem.direction) === LEFT) {
        h = this.hashFunction(
          NODE_PREFIX, 
          null, 
          lastPathItem.siblingHash,
          ...(isSumCertifying ? [null, lastPathItem.siblingSum!] : [])
        );
      } else {
        h = this.hashFunction(
          NODE_PREFIX, 
          lastPathItem.siblingHash, 
          null,
          ...(isSumCertifying ? [lastPathItem.siblingSum!, null] : [])
        );
      }
    } else {
      if ((!(this.path[this.path.length - 1] as PathItemLeaf).value) &&
          (!(this.path[this.path.length - 1] as PathItemInternalNodeHashed).nodeHash)) {
        throw new Error('Last path item has no leaf or nodeHash value');
      }

      h = (this.path[this.path.length - 1].type == 'leaf') ? 
        (this.path[this.path.length - 1] as PathItemLeaf).value as WordArray:
        (this.path[this.path.length - 1] as PathItemInternalNodeHashed).nodeHash as WordArray;
    
      if (this.path[this.path.length - 1].type == 'leaf') {
        if (isSumCertifying) {
          h = this.hashFunction(LEAF_PREFIX, h, (this.path[this.path.length - 1] as PathItemLeaf).numericValue!);
          sumSoFar = (this.path[this.path.length - 1] as PathItemLeaf).numericValue!;
        } else {
          h = this.hashFunction(LEAF_PREFIX, h);
        }
      }
    }
    
    for (let i = this.path.length - 3; i >= 0; i--) {
      const pathItem = this.path[i + 1] as PathItemInternalNode;
      const prefix = pathItem.prefix as bigint;
      const siblingHash = pathItem.siblingHash;
      const legHash = this.hashFunction(LEG_PREFIX, prefix, h);
      
      if (isSumCertifying) {
        if (getDirection(prefix) === LEFT) {
          h = this.hashFunction(
            NODE_PREFIX, 
            legHash, 
            siblingHash ? siblingHash : null,
            sumSoFar,
            pathItem.siblingSum ? pathItem.siblingSum : null
        );
        } else {
          h = this.hashFunction(
            NODE_PREFIX, 
            siblingHash ? siblingHash : null, 
            legHash,
            pathItem.siblingSum ? pathItem.siblingSum : null,
            sumSoFar
          );
        }
        sumSoFar += pathItem.siblingSum ? pathItem.siblingSum : 0n;
      } else {
        if (getDirection(prefix) === LEFT) {
          h = this.hashFunction(NODE_PREFIX, legHash, siblingHash ? siblingHash : null);
        } else {
          h = this.hashFunction(NODE_PREFIX, siblingHash ? siblingHash : null, legHash);
        }
      }
    }
  
    return wordArrayToHex(h) === wordArrayToHex((this.path[0] as PathItemRoot).rootHash as WordArray);
  }

  public provesInclusionAt(requestPath: bigint): boolean {
    if (!this.verifyPath()) {
      throw new Error('Path integrity check fail');
    }
    if (this.isEmptyTree()) {
      return false;
    }
    if (this.path[this.path.length - 1].type == 'noNode') {
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
      const lastItem = this.path[this.path.length - 1] as PathItemLeaf;
      if (lastItem.value !== undefined) {
        return false;
      } else {
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
      const bits = (this.path[i] as PathItemInternalNode).prefix as bigint;
      const bitLength = bits.toString(2).length - 1;
      result = (result << BigInt(bitLength)) | (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result;
  }

  private vertexAtDepth(depth: number): boolean {
    let result = 1n;
    for (let i = this.path.length - 1; i > 0 && (1n << BigInt(depth)) > result; i--) {
      if (!(this.path[i] as PathItemInternalNode).prefix) continue;
      const bits = (this.path[i] as PathItemInternalNode).prefix as bigint;
      const bitLength = bits.toString(2).length - 1;
      result = (result << BigInt(bitLength)) | (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result.toString(2).length === depth;
  }

  public getLeafValue(): string | WordArray | undefined {
    const leaf = this.path[this.path.length - 1];
    if (!(leaf as PathItemLeaf).value || (leaf as PathItemInternalNode).siblingHash || (leaf as PathItemInternalNode).prefix) {
      return undefined;
    }
    return (leaf as PathItemLeaf).value;
  }

  public getLeafNumericValue(): bigint | undefined {
    const leaf = this.path[this.path.length - 1];
    if (!(leaf as PathItemLeaf).value || (leaf as PathItemInternalNode).siblingHash || (leaf as PathItemInternalNode).prefix) {
      return undefined;
    }
    return (leaf as PathItemLeaf).numericValue;
  }

  public getRootSum(): bigint | undefined {
    if (this.path.length === 0) {
      return undefined;
    }
    
    return (this.path[0] as PathItemRoot).sum;
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