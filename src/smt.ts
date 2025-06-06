import { CborEncoder } from "@unicitylabs/commons/lib/cbor/CborEncoder.js";
import { DataHasherFactory } from "@unicitylabs/commons/lib/hash/DataHasherFactory.js";
import { HashAlgorithm } from "@unicitylabs/commons/lib/hash/HashAlgorithm.js";
import { IDataHasher } from "@unicitylabs/commons/lib/hash/IDataHasher.js";
import { BigintConverter } from "@unicitylabs/commons/lib/util/BigintConverter.js";
import { HexConverter } from "@unicitylabs/commons/lib/util/HexConverter.js";
import { stringToBytes } from "./utils.js";

import {
  Leaf,
  PathItem,
  PathItemRoot,
  PathItemInternalNode,
  PathItemInternalNodeHashed,
  PathItemEmptyBranch,
  PathItemLeaf,
  AbstractPathItemRoot,
  AbstractPathItemInternalNode,
  AbstractPathItemInternalNodeHashed,
  AbstractPathItemEmptyBranch,
  AbstractPathItemLeaf,
  AnyPathItemJson,
  IPathJson,
  IPathItemEmptyBranchJson,
  IPathItemInternalNodeHashedJson,
  IPathItemInternalNodeJson,
  IPathItemLeafJson,
  IPathItemRootJson,
} from "./types/index.js";

export const LEFT: bigint = 0n;
export const RIGHT: bigint = 1n;

export const NODE_PREFIX: bigint = 0n;
export const LEG_PREFIX: bigint = 1n;
export const LEAF_PREFIX: bigint = 2n;

export abstract class AbstractTree<
  InternalNodeType extends AbstractInternalNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  LeafNodeType extends AbstractLeafNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  LeafType extends Leaf,
  LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>,
  PathItemType extends PathItem,
  PathItemRootType extends AbstractPathItemRoot,
  PathItemInternalNodeType extends AbstractPathItemInternalNode,
  PathItemInternalNodeHashedType extends AbstractPathItemInternalNodeHashed,
  PathItemLeafType extends AbstractPathItemLeaf,
  PathItemEmptyBranchType extends AbstractPathItemEmptyBranch,
  PathType extends AbstractPath<
    PathItemType,
    PathItemRootType,
    PathItemInternalNodeType,
    PathItemEmptyBranchType,
    PathItemLeafType
  >,
> {
  protected readonly hashOptions: HashOptions;
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
  public constructor(
    dataHasherFactory: DataHasherFactory<IDataHasher>,
    algorithm: HashAlgorithm,
    leavesByPath: Map<bigint, LeafType>,
    pathPaddingBits: bigint | false = 256n,
  ) {
    this.hashOptions = { dataHasherFactory, algorithm };
    this.pathPaddingBits = pathPaddingBits;
    this.root = this.buildTree(leavesByPath);
  }

  public async getProof(requestPath: bigint): Promise<PathType> {
    const path = this.padAndValidatePath(requestPath);
    if (this.isEmpty()) {
      return await this.createPathForEmptyTree();
    }
    const pathItems = await this.searchPath(this.root, path);
    pathItems.unshift(await this.createPathItemRoot());
    return this.createPath(pathItems);
  }

  public isEmpty(): boolean {
    return !this.root.left && !this.root.right;
  }

  public addLeaf(requestPath: bigint, leaf: LeafType): void {
    const path = this.padAndValidatePath(requestPath);
    this.traverse(this.root, path, leaf);
  }

  public async getRootHash(): Promise<Uint8Array> {
    return await this.root.getHash();
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
    leaf: LeafType,
  ): void {
    const direction = getDirection(remainingPath);
    if (direction === LEFT) {
      node.left = this.splitLeg(node.left, remainingPath, leaf);
    } else {
      node.right = this.splitLeg(node.right, remainingPath, leaf);
    }
  }

  protected async searchPath(
    node: InternalNodeType,
    remainingPath: bigint,
  ): Promise<PathItem[]> {
    const direction = getDirection(remainingPath);
    if (direction === LEFT) {
      if (!node.left) {
        return [await this.createEmptyLeftBranchPathItem(node)];
      }
      const path = await this.searchLeg(node.left, remainingPath);
      if (path.length > 0) {
        await this.addSiblingDataToLeft(path[0], node);
      }
      return path;
    } else {
      if (!node.right) {
        return [await this.createEmptyRightBranchPathItem(node)];
      }
      const path = await this.searchLeg(node.right, remainingPath);
      if (path.length > 0) {
        await this.addSiblingDataToRight(path[0], node);
      }
      return path;
    }
  }

  protected async searchLeg(
    leg: LegType,
    remainingPath: bigint,
  ): Promise<PathItem[]> {
    const {
      commonPrefix,
      remainingPathUniqueSuffix,
      existingPrefixUniqueSuffix,
    } = splitPrefix(remainingPath, leg.prefix);

    // If the path leads to the children of this leg.
    if (commonPrefix === leg.prefix) {
      if (leg.child.isLeaf()) {
        // Here, either the key is found or not, but the path terminates at the leaf.
        return [
          this.createPathItemInternalNode(commonPrefix),
          await this.createPathItemLeafNode(leg.child),
        ];
      } else if (leg.child.isInternal()) {
        const path = await this.searchPath(
          leg.child,
          remainingPathUniqueSuffix,
        );
        path.unshift(this.createPathItemInternalNode(commonPrefix));
        return path;
      } else {
        throw new Error("Unknown node type");
      }
    }

    // The path diverges from the curren leg's prefix (the key is not in the tree).
    const item = this.createPathItemInternalNode(leg.prefix);

    const valueItem: PathItem = leg.child.isLeaf()
      ? await this.createPathItemLeafNode(leg.child)
      : await this.createPathItemInternalNodeHashed(leg.child);

    return [item, valueItem];
  }

  protected splitLeg(
    leg: LegType | null,
    remainingPath: bigint,
    leaf: LeafType,
  ): LegType {
    if (!leg) {
      const child = this.createNewLeaf(leaf);
      return this.createLeg(remainingPath, child);
    }
    leg.markAsOutdated();
    const {
      commonPrefix,
      remainingPathUniqueSuffix,
      existingPrefixUniqueSuffix,
    } = splitPrefix(remainingPath, leg.prefix);

    if (commonPrefix === remainingPath) {
      // This means either:
      //
      // 1. An attempt to change an existing value, which is not supported.
      //
      // 2. The new path would be in the middle of the prefix/path of an exisiting leg.
      // In this tree, only leaf nodes contain values, so this is not allowed.
      // More generally, every tree path must have only one value node (the leaf node).
      throw new Error("Cannot add leaf inside the leg");
    }
    if (commonPrefix === leg.prefix) {
      if (leg.child.isLeaf()) {
        // Here the path of the existing leaf would be in the middle of the new path.
        // In this tree, every tree path can contain only one value node, thus this is not allowed.
        throw new Error("Cannot extend the leg through the leaf");
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

  protected abstract createPathForEmptyTree(): Promise<PathType>;

  protected abstract createPathItemRoot(): Promise<PathItemRootType>;

  protected abstract createInternalNode(): InternalNodeType;

  protected abstract createEmptyLeftBranchPathItem(
    node: InternalNodeType,
  ): Promise<PathItemEmptyBranchType>;

  protected abstract createEmptyRightBranchPathItem(
    node: InternalNodeType,
  ): Promise<PathItemEmptyBranchType>;

  protected abstract addSiblingDataToLeft(
    pathItem: PathItem,
    node: InternalNodeType,
  ): Promise<void>;

  protected abstract addSiblingDataToRight(
    pathItem: PathItem,
    node: InternalNodeType,
  ): Promise<void>;

  protected abstract createPathItemInternalNode(
    prefix: bigint,
  ): PathItemInternalNodeType;

  protected abstract createPathItemLeafNode(
    leaf: LeafNodeType,
  ): Promise<PathItemLeafType>;

  protected abstract createPathItemInternalNodeHashed(
    node: InternalNodeType,
  ): Promise<PathItemInternalNodeHashedType>;

  protected abstract createLeg(
    remainingPath: bigint,
    child: LeafNodeType | InternalNodeType,
  ): LegType;
}

export class SMT extends AbstractTree<
  InternalNode,
  LeafNode,
  Leaf,
  Leg,
  PathItem,
  PathItemRoot,
  PathItemInternalNode,
  PathItemInternalNodeHashed,
  PathItemLeaf,
  PathItemEmptyBranch,
  Path
> {
  protected async createPathForEmptyTree(): Promise<Path> {
    return new Path(
      [{ type: "root", rootHash: await this.getRootHash() } as PathItemRoot],
      this.hashOptions,
      this.pathPaddingBits,
    );
  }

  protected createPath(pathItems: PathItem[]): Path {
    return new Path(pathItems, this.hashOptions, this.pathPaddingBits);
  }

  protected createInternalNode(): InternalNode {
    return new InternalNode(this.hashOptions);
  }

  protected createNewLeaf(leaf: Leaf): LeafNode {
    return new LeafNode(this.hashOptions, leaf.value);
  }

  protected async createPathItemRoot(): Promise<PathItemRoot> {
    return { type: "root", rootHash: await this.root.getHash() };
  }

  protected async createEmptyLeftBranchPathItem(
    node: InternalNode,
  ): Promise<PathItemEmptyBranch> {
    return {
      type: "emptyBranch",
      direction: LEFT,
      siblingHash: await node.right!.getHash(),
    };
  }

  protected async createEmptyRightBranchPathItem(
    node: InternalNode,
  ): Promise<PathItemEmptyBranch> {
    return {
      type: "emptyBranch",
      direction: RIGHT,
      siblingHash: await node.left!.getHash(),
    };
  }

  protected createPathItemInternalNode(prefix: bigint): PathItemInternalNode {
    return { type: "internalNode", prefix, siblingHash: undefined };
  }

  protected async createPathItemInternalNodeHashed(
    node: InternalNode,
  ): Promise<PathItemInternalNodeHashed> {
    return { type: "internalNodeHashed", nodeHash: await node.getHash() };
  }

  protected async createPathItemLeafNode(
    leaf: LeafNode,
  ): Promise<PathItemLeaf> {
    return { type: "leaf", value: leaf.getValue() };
  }

  protected async addSiblingDataToLeft(
    untypedPathItem: PathItem,
    node: InternalNode,
  ): Promise<void> {
    const pathItem = untypedPathItem as PathItemInternalNode;
    pathItem.siblingHash = node.right ? await node.right.getHash() : undefined;
  }

  protected async addSiblingDataToRight(
    untypedPathItem: PathItem,
    node: InternalNode,
  ): Promise<void> {
    const pathItem = untypedPathItem as PathItemInternalNode;
    pathItem.siblingHash = node.left ? await node.left.getHash() : undefined;
  }

  protected createLeg(
    remainingPath: bigint,
    child: LeafNode | InternalNode,
  ): Leg {
    return new Leg(
      this.hashOptions,
      remainingPath,
      child,
      this.pathPaddingBits,
    );
  }
}

export abstract class Node<
  LeafNodeType extends AbstractLeafNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  InternalNodeType extends AbstractInternalNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>,
> {
  protected readonly hashOptions: HashOptions;

  protected constructor(hashOptions: HashOptions) {
    this.hashOptions = hashOptions;
  }

  abstract getHash(): Promise<Uint8Array>;

  public isLeaf(): this is LeafNodeType {
    return this instanceof AbstractLeafNode;
  }

  public isInternal(): this is InternalNodeType {
    return this instanceof AbstractInternalNode;
  }
}

export abstract class AbstractLeafNode<
  LeafNodeType extends AbstractLeafNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  InternalNodeType extends AbstractInternalNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>,
> extends Node<LeafNodeType, InternalNodeType, LegType> {
  public readonly value: string | Uint8Array;

  constructor(hashOptions: HashOptions, value: string | Uint8Array) {
    super(hashOptions);
    this.value = value;
  }

  public getValue(): string | Uint8Array {
    return this.value;
  }

  override async getHash(): Promise<Uint8Array> {
    const hasher = createHasher(this.hashOptions);
    return (
      await hasher
        .update(padTo32Bytes(LEAF_PREFIX))
        .update(
          typeof this.value == "string"
            ? stringToBytes(this.value)
            : padTo32Bytes(this.value),
        )
        .digest()
    ).data;
  }
}

export class LeafNode extends AbstractLeafNode<LeafNode, InternalNode, Leg> {}

export abstract class AbstractInternalNode<
  LeafNodeType extends AbstractLeafNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  InternalNodeType extends AbstractInternalNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>,
> extends Node<LeafNodeType, InternalNodeType, LegType> {
  public left: LegType | null = null;
  public right: LegType | null = null;

  constructor(hashOptions: HashOptions) {
    super(hashOptions);
  }

  override async getHash(): Promise<Uint8Array> {
    const leftHash = this.left ? await this.left.getHash() : 0n;
    const rightHash = this.right ? await this.right.getHash() : 0n;

    const hasher = createHasher(this.hashOptions);
    return (
      await hasher
        .update(padTo32Bytes(NODE_PREFIX))
        .update(padTo32Bytes(leftHash))
        .update(padTo32Bytes(rightHash))
        .digest()
    ).data;
  }
}

export class InternalNode extends AbstractInternalNode<
  LeafNode,
  InternalNode,
  Leg
> {}

export abstract class AbstractLeg<
  LeafNodeType extends AbstractLeafNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  InternalNodeType extends AbstractInternalNode<
    LeafNodeType,
    InternalNodeType,
    LegType
  >,
  LegType extends AbstractLeg<LeafNodeType, InternalNodeType, LegType>,
> {
  protected readonly hashOptions: HashOptions;
  private _prefix!: bigint;
  public child: LeafNodeType | InternalNodeType;
  protected outdated: boolean = true;
  private hash: Uint8Array | null = null;
  protected readonly pathPaddingBits: bigint | false;

  public constructor(
    hashOptions: HashOptions,
    prefix: bigint,
    node: LeafNodeType | InternalNodeType,
    pathPaddingBits: bigint | false,
  ) {
    this.hashOptions = hashOptions;
    this.prefix = prefix;
    this.child = node;
    this.pathPaddingBits = pathPaddingBits;
  }

  public set prefix(newPrefix: bigint) {
    validatePrefix(newPrefix);
    this._prefix = newPrefix;
  }

  public get prefix(): bigint {
    return this._prefix;
  }

  public async getHash(): Promise<Uint8Array> {
    await this.recalculateIfOutdated();
    return this.hash!;
  }

  protected async recalculateIfOutdated() {
    if (this.outdated) {
      const hasher = createHasher(this.hashOptions);
      this.hash = (
        await hasher
          .update(padTo32Bytes(LEG_PREFIX))
          .update(padTo32Bytes(unpad(this.prefix, this.pathPaddingBits)))
          .update(padTo32Bytes(await this.child.getHash()))
          .digest()
      ).data;
      this.outdated = false;
    }
  }

  public markAsOutdated(): void {
    this.outdated = true;
  }
}

class Leg extends AbstractLeg<LeafNode, InternalNode, Leg> {}

export type ValidationResult =
  | { success: true }
  | { success: false; error: string };

export abstract class AbstractPath<
  PathItemType extends PathItem,
  PathItemRootType extends AbstractPathItemRoot,
  PathItemInternalNodeType extends AbstractPathItemInternalNode,
  PathItemEmptyBranchType extends AbstractPathItemEmptyBranch,
  PathItemLeafType extends AbstractPathItemLeaf,
> {
  protected readonly path: PathItemType[];
  protected readonly hashOptions: HashOptions;
  protected readonly pathPaddingBits: bigint | false;

  constructor(
    items: PathItemType[],
    hashOptions: HashOptions,
    pathPaddingBits: bigint | false,
  ) {
    this.path = items;
    this.hashOptions = hashOptions;
    this.pathPaddingBits = pathPaddingBits;
  }

  public async verifyPath(): Promise<ValidationResult> {
    if (this.emptyTree()) {
      return { success: true };
    }

    const context = this.createVerificationContext(this.hashOptions);

    let h: Uint8Array;

    const lastItem = this.path[this.path.length - 1];
    if (this.isEmptyBranch(lastItem)) {
      const lastPathItem = lastItem as unknown as PathItemEmptyBranchType;
      if (getDirection(lastPathItem.direction) === LEFT) {
        h = await context.hashLeftEmptyBranch(lastPathItem);
      } else {
        h = await context.hashRightEmptyBranch(lastPathItem);
      }
    } else {
      if (!this.isLeaf(lastItem) && !this.isInternalNodeHashed(lastItem)) {
        throw new Error("Last path item has no leaf or nodeHash value");
      }

      if (this.isLeaf(this.path[this.path.length - 1])) {
        h = await context.hashLeaf(this.path[this.path.length - 1]);
      } else {
        h = this.getNodeHashFromInternalNodeHashed(
          this.path[this.path.length - 1],
        );
      }
    }

    await context.beginCalculation(this.path[this.path.length - 1]);

    for (let i = this.path.length - 3; i >= 0; i--) {
      const pathItem = this.path[i + 1] as unknown as PathItemInternalNodeType;
      const prefix = pathItem.prefix;
      validatePrefix(prefix);
      const legHash = await context.hashLeg(prefix, h);

      if (getDirection(prefix) === LEFT) {
        h = await context.hashLeftNode(pathItem, legHash);
      } else {
        h = await context.hashRightNode(pathItem, legHash);
      }
      await context.pathItemProcessed(pathItem);
    }

    return this.createValidationResult(
      uint8ArraysEqual(
        h,
        (this.path[0] as unknown as PathItemRootType).rootHash,
      ),
      "Hash mismatch",
    );
  }

  protected createValidationResult(
    success: boolean,
    errorIfFailed: string,
  ): ValidationResult {
    if (success) {
      return { success: true };
    } else {
      return { success: false, error: errorIfFailed };
    }
  }

  private emptyTree() {
    return this.path.length == 1;
  }

  public async provesInclusionAt(requestPath: bigint): Promise<boolean> {
    const paddedRequestPath = padAndValidatePath(
      requestPath,
      this.pathPaddingBits,
    );
    const pathValidationResult = await this.verifyPath();
    if (!pathValidationResult.success) {
      throw new Error(
        `Path integrity check error for path ${paddedRequestPath}: ${pathValidationResult.error}`,
      );
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
    const commonPathBits = getCommonPathBits(
      requestPathBits,
      extractedLocationBits,
    );

    const allRequestedPathMatchesButTreePathGoesDeeper =
      requestPathBits != extractedLocationBits &&
      commonPathBits === requestPathBits;
    const allTreePathMatchesButRequestGoesDeeper =
      requestPathBits != extractedLocationBits &&
      commonPathBits === extractedLocationBits;

    if (allRequestedPathMatchesButTreePathGoesDeeper) {
      return false;
    } else if (allTreePathMatchesButRequestGoesDeeper) {
      if (this.isLeaf(lastItemAsSupertype)) {
        return false;
      } else {
        throw new Error("Wrong path acquired for the requested path");
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
      if (!("prefix" in this.path[i])) continue;
      const bits = (this.path[i] as unknown as PathItemInternalNodeType).prefix;
      validatePrefix(bits);
      const bitLength = bits.toString(2).length - 1;
      result =
        (result << BigInt(bitLength)) |
        (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result;
  }

  public getLeafValue(): string | Uint8Array | undefined {
    const leaf = this.path[this.path.length - 1];
    if (
      !(leaf as unknown as PathItemLeafType).value ||
      (leaf as unknown as PathItemInternalNodeType).siblingHash ||
      (leaf as unknown as PathItemInternalNodeType).prefix
    ) {
      return undefined;
    }
    return (leaf as unknown as PathItemLeafType).value;
  }

  public getRootHash(): Uint8Array | undefined {
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

  protected abstract isLeaf(pathItem: PathItemType): boolean;

  protected abstract isEmptyBranch(pathItem: PathItemType): boolean;

  protected abstract isInternalNodeHashed(lastItem: PathItemType): boolean;

  protected abstract getNodeHashFromInternalNodeHashed(
    pathItem: PathItemType,
  ): Uint8Array;

  protected abstract createVerificationContext(
    hashOptions: HashOptions,
  ): VerificationContext;

  public abstract toCBOR(): Uint8Array;

  public abstract toJSON(): object;
}

export class Path extends AbstractPath<
  PathItem,
  PathItemRoot,
  PathItemInternalNode,
  PathItemEmptyBranch,
  PathItemLeaf
> {
  protected isEmptyBranch(pathItem: PathItem): boolean {
    return "type" in pathItem && pathItem.type == "emptyBranch";
  }

  protected isLeaf(pathItem: PathItem): boolean {
    return "type" in pathItem && pathItem.type == "leaf";
  }

  protected isInternalNodeHashed(pathItem: PathItem): boolean {
    return "type" in pathItem && pathItem.type == "internalNodeHashed";
  }

  protected getNodeHashFromInternalNodeHashed(pathItem: PathItem): Uint8Array {
    return (pathItem as PathItemInternalNodeHashed).nodeHash;
  }

  protected createVerificationContext(
    hashOptions: HashOptions,
  ): VerificationContext {
    const pathPaddingBits = this.pathPaddingBits;
    return {
      async beginCalculation(pathItem: PathItem): Promise<void> {},
      async pathItemProcessed(pathItemAsSupertype: PathItem): Promise<void> {},
      async hashLeftNode(
        pathItemAsSupertype: PathItem,
        legHash: Uint8Array,
      ): Promise<Uint8Array> {
        const pathItem = pathItemAsSupertype as PathItemInternalNode;
        const hasher = createHasher(hashOptions);
        return (
          await hasher
            .update(padTo32Bytes(NODE_PREFIX))
            .update(padTo32Bytes(legHash))
            .update(
              padTo32Bytes(pathItem.siblingHash ? pathItem.siblingHash : 0n),
            )
            .digest()
        ).data;
      },
      async hashRightNode(
        pathItemAsSupertype: PathItem,
        legHash: Uint8Array,
      ): Promise<Uint8Array> {
        const pathItem = pathItemAsSupertype as PathItemInternalNode;
        const hasher = createHasher(hashOptions);
        return (
          await hasher
            .update(padTo32Bytes(NODE_PREFIX))
            .update(
              padTo32Bytes(pathItem.siblingHash ? pathItem.siblingHash : 0n),
            )
            .update(padTo32Bytes(legHash))
            .digest()
        ).data;
      },
      async hashLeftEmptyBranch(pathItemAsSupertype: PathItem) {
        const pathItem = pathItemAsSupertype as PathItemEmptyBranch;
        const hasher = createHasher(hashOptions);
        return (
          await hasher
            .update(padTo32Bytes(NODE_PREFIX))
            .update(padTo32Bytes(0n))
            .update(padTo32Bytes(pathItem.siblingHash))
            .digest()
        ).data;
      },
      async hashRightEmptyBranch(pathItemAsSupertype: PathItem) {
        const pathItem = pathItemAsSupertype as PathItemEmptyBranch;
        const hasher = createHasher(hashOptions);
        return (
          await hasher
            .update(padTo32Bytes(NODE_PREFIX))
            .update(padTo32Bytes(pathItem.siblingHash))
            .update(padTo32Bytes(0n))
            .digest()
        ).data;
      },
      async hashLeaf(pathItem: PathItem): Promise<Uint8Array> {
        const leaf = pathItem as PathItemLeaf;
        const hasher = createHasher(hashOptions);
        return (
          await hasher
            .update(padTo32Bytes(LEAF_PREFIX))
            .update(
              typeof leaf.value == "string"
                ? stringToBytes(leaf.value)
                : padTo32Bytes(leaf.value),
            )
            .digest()
        ).data;
      },
      async hashLeg(
        prefix: bigint,
        childHash: Uint8Array,
      ): Promise<Uint8Array> {
        const hasher = createHasher(hashOptions);
        return (
          await hasher
            .update(padTo32Bytes(LEG_PREFIX))
            .update(padTo32Bytes(unpad(prefix, pathPaddingBits)))
            .update(padTo32Bytes(childHash))
            .digest()
        ).data;
      },
    };
  }

  public toCBOR(): Uint8Array {
    const encodedPathItems: Uint8Array[] = this.path.map((item) => {
      let itemPayloadEncodedElements: Uint8Array[];

      const concreteItem = item as
        | PathItemRoot
        | PathItemInternalNode
        | PathItemInternalNodeHashed
        | PathItemEmptyBranch
        | PathItemLeaf;

      switch (concreteItem.type) {
        case "root":
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(concreteItem.type),
            CborEncoder.encodeByteString(concreteItem.rootHash),
          ];
          break;
        case "internalNode":
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(concreteItem.type),
            CborEncoder.encodeByteString(
              BigintConverter.encode(concreteItem.prefix),
            ),
            CborEncoder.encodeOptional(
              concreteItem.siblingHash,
              CborEncoder.encodeByteString,
            ),
          ];
          break;
        case "internalNodeHashed":
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(concreteItem.type),
            CborEncoder.encodeByteString(concreteItem.nodeHash),
          ];
          break;
        case "emptyBranch":
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(concreteItem.type),
            CborEncoder.encodeByteString(
              BigintConverter.encode(concreteItem.direction),
            ),
            CborEncoder.encodeByteString(concreteItem.siblingHash),
          ];
          break;
        case "leaf":
          const encodedValue =
            typeof concreteItem.value === "string"
              ? CborEncoder.encodeTextString(concreteItem.value)
              : CborEncoder.encodeByteString(concreteItem.value as Uint8Array);

          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(concreteItem.type),
            encodedValue,
          ];
          break;
        default:
          const _exhaustiveCheck: never = concreteItem;
          throw new Error(
            `Unknown PathItem type encountered during CBOR encoding: ${(_exhaustiveCheck as any).type}`,
          );
      }
      return CborEncoder.encodeArray(itemPayloadEncodedElements);
    });

    return CborEncoder.encodeArray(encodedPathItems);
  }

  public static isJSON(data: unknown): data is IPathJson {
    if (typeof data !== "object" || data === null) {
      return false;
    }

    const obj = data as IPathJson;

    if (
      !(
        "pathPaddingBits" in obj &&
        (typeof obj.pathPaddingBits === "string" ||
          obj.pathPaddingBits === false)
      )
    ) {
      return false;
    }

    if (!("items" in obj && Array.isArray(obj.items))) {
      return false;
    }

    for (const item of obj.items) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof item.type !== "string"
      ) {
        return false;
      }
      switch (item.type) {
        case "root":
          if (!(typeof (item as IPathItemRootJson).rootHash === "string"))
            return false;
          break;
        case "internalNode":
          const internalNode = item as IPathItemInternalNodeJson;
          if (!(typeof internalNode.prefix === "string")) return false;
          if (
            internalNode.siblingHash !== undefined &&
            typeof internalNode.siblingHash !== "string"
          )
            return false;
          break;
        case "internalNodeHashed":
          if (
            !(
              typeof (item as IPathItemInternalNodeHashedJson).nodeHash ===
              "string"
            )
          )
            return false;
          break;
        case "emptyBranch":
          const emptyBranch = item as IPathItemEmptyBranchJson;
          if (
            !(
              typeof emptyBranch.direction === "string" &&
              typeof emptyBranch.siblingHash === "string"
            )
          )
            return false;
          break;
        case "leaf":
          if (!(typeof (item as IPathItemLeafJson).value === "string"))
            return false;
          if (!(typeof (item as IPathItemLeafJson).valueType === "string"))
            return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  public static fromJSON(data: unknown, hashOptions: HashOptions): Path {
    if (!Path.isJSON(data)) {
      throw new Error("Invalid JSON data for Path object.");
    }

    const pathPaddingBits =
      data.pathPaddingBits === false ? false : BigInt(data.pathPaddingBits);

    const reconstructedPathItems: PathItem[] = data.items.map(
      (jsonItem: AnyPathItemJson) => {
        switch (jsonItem.type) {
          case "root":
            return {
              type: "root",
              rootHash: HexConverter.decode(jsonItem.rootHash),
            } as PathItemRoot;
          case "internalNode":
            return {
              type: "internalNode",
              prefix: BigInt(jsonItem.prefix),
              siblingHash: jsonItem.siblingHash
                ? HexConverter.decode(jsonItem.siblingHash)
                : undefined,
            } as PathItemInternalNode;
          case "internalNodeHashed":
            return {
              type: "internalNodeHashed",
              nodeHash: HexConverter.decode(jsonItem.nodeHash),
            } as PathItemInternalNodeHashed;
          case "emptyBranch":
            return {
              type: "emptyBranch",
              direction: BigInt(jsonItem.direction),
              siblingHash: HexConverter.decode(jsonItem.siblingHash),
            } as PathItemEmptyBranch;
          case "leaf":
            let valueResult: string | Uint8Array;
            if (jsonItem.valueType === "string") {
              valueResult = jsonItem.value;
            } else if (jsonItem.valueType === "Uint8Array") {
              valueResult = HexConverter.decode(jsonItem.value);
            } else {
              throw new Error(`Unknown value type: ${jsonItem.valueType}`);
            }
            return {
              type: "leaf",
              value: valueResult,
            } as PathItemLeaf;
          default:
            const exhaustiveCheck: never = jsonItem;
            throw new Error(
              `Invalid item type in Path JSON data during reconstruction: ${(exhaustiveCheck as any).type}`,
            );
        }
      },
    );

    return new Path(reconstructedPathItems, hashOptions, pathPaddingBits);
  }

  public toJSON(): IPathJson {
    const jsonItems: AnyPathItemJson[] = this.path.map((item) => {
      const concreteItem = item as
        | PathItemRoot
        | PathItemInternalNode
        | PathItemInternalNodeHashed
        | PathItemEmptyBranch
        | PathItemLeaf;

      let itemAsJson: any;

      switch (concreteItem.type) {
        case "root":
          itemAsJson = {
            type: concreteItem.type,
            rootHash: HexConverter.encode(concreteItem.rootHash),
          };
          break;
        case "internalNode":
          itemAsJson = {
            type: concreteItem.type,
            prefix: concreteItem.prefix.toString(),
          };
          if (concreteItem.siblingHash !== undefined) {
            itemAsJson.siblingHash = HexConverter.encode(
              concreteItem.siblingHash,
            );
          }
          break;
        case "internalNodeHashed":
          itemAsJson = {
            type: concreteItem.type,
            nodeHash: HexConverter.encode(concreteItem.nodeHash),
          };
          break;
        case "emptyBranch":
          itemAsJson = {
            type: concreteItem.type,
            direction: concreteItem.direction.toString(),
            siblingHash: HexConverter.encode(concreteItem.siblingHash),
          };
          break;
        case "leaf":
          itemAsJson = {
            type: concreteItem.type,
            value:
              typeof concreteItem.value === "string"
                ? concreteItem.value
                : HexConverter.encode(concreteItem.value as Uint8Array),
            valueType:
              typeof concreteItem.value === "string" ? "string" : "Uint8Array",
          };
          break;
        default:
          const _exhaustiveCheck: never = concreteItem;
          throw new Error(
            `Unknown PathItem type encountered during toJSON serialization: ${(_exhaustiveCheck as any).type}`,
          );
      }
      return itemAsJson as AnyPathItemJson;
    });

    return {
      pathPaddingBits:
        typeof this.pathPaddingBits === "bigint"
          ? this.pathPaddingBits.toString()
          : this.pathPaddingBits,
      items: jsonItems,
    };
  }
}

export interface VerificationContext {
  beginCalculation(pathItem: PathItem): Promise<void>;
  pathItemProcessed(pathItem: PathItem): Promise<void>;
  hashLeftNode(pathItem: PathItem, legHash: Uint8Array): Promise<Uint8Array>;
  hashRightNode(pathItem: PathItem, legHash: Uint8Array): Promise<Uint8Array>;
  hashLeftEmptyBranch(pathItem: PathItem): Promise<Uint8Array>;
  hashRightEmptyBranch(pathItem: PathItem): Promise<Uint8Array>;
  hashLeaf(pathItem: PathItem): Promise<Uint8Array>;
  hashLeg(prefix: bigint, childHash: Uint8Array): Promise<Uint8Array>;
}

function getDirection(path: bigint): bigint {
  const masked = path & 0b1n;
  return masked === RIGHT ? RIGHT : LEFT;
}

export function splitPrefix(
  remainingPath: bigint,
  existingPrefix: bigint,
): {
  commonPrefix: bigint;
  remainingPathUniqueSuffix: bigint;
  existingPrefixUniqueSuffix: bigint;
} {
  validatePrefix(remainingPath);
  validatePrefix(existingPrefix);
  // Find the position where prefix and sequence differ
  let mask = 1n;
  const remainingPathLen = remainingPath.toString(2).length - 1;
  const existingPrefixLen = existingPrefix.toString(2).length - 1;
  const minLen = Math.min(remainingPathLen, existingPrefixLen);

  let firstDifferencePos = 0n;
  while (
    (remainingPath & mask) === (existingPrefix & mask) &&
    firstDifferencePos < minLen
  ) {
    firstDifferencePos++;
    mask <<= 1n;
  }

  const commonPrefix =
    (remainingPath & ((1n << firstDifferencePos) - 1n)) |
    (1n << firstDifferencePos);
  const remainingPathUniqueSuffix = remainingPath >> firstDifferencePos;
  const existingPrefixUniqueSuffix = existingPrefix >> firstDifferencePos;

  return {
    commonPrefix,
    remainingPathUniqueSuffix,
    existingPrefixUniqueSuffix,
  };
}

export function getCommonPathBits(
  pathBits1: string,
  pathBits2: string,
): string {
  let i1 = pathBits1.length - 1;
  let i2 = pathBits2.length - 1;

  while (
    i1 >= 0 &&
    i2 >= 0 &&
    pathBits1.substring(i1, i1 + 1) === pathBits2.substring(i2, i2 + 1)
  ) {
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

export function padAndValidatePath(
  path: bigint,
  pathLengthBits: bigint | false,
): bigint {
  if (path < 0n) {
    throw new Error(`Invalid path: ${path}`);
  }
  if (!pathLengthBits) {
    return path;
  }

  if (path >= 1n << (pathLengthBits + 1n)) {
    throw new Error(
      `Path too long for given bit length: 0b${path.toString(2)} is longer than ${pathLengthBits} + 1 bits`,
    );
  }
  return path | (1n << pathLengthBits);
}

export function unpad(path: bigint, pathLengthBits: bigint | false): bigint {
  if (!pathLengthBits) {
    return path;
  }
  return path & ((1n << pathLengthBits) - 1n);
}

export function padTo32Bytes(value: bigint | Uint8Array): Uint8Array {
  return padLeft(value, 32);
}

let skipNegativeValueCheck: boolean = false;

/** For testing only, unsafe! */
export function setSkipNegativeValueCheck(value: boolean): void {
  skipNegativeValueCheck = value;
}

function padLeft(
  value: bigint | Uint8Array,
  resultBytesLength: number,
): Uint8Array {
  if (resultBytesLength < 0) {
    throw new Error("resultBytesLength cannot be negative.");
  }

  if (value instanceof Uint8Array) {
    const array: Uint8Array = value;

    const currentLength = array.byteLength;
    const paddingByteCount = resultBytesLength - currentLength;
    if (paddingByteCount < 0) {
      throw new Error(`Input value too long: ${value}`);
    }

    const paddedArray = new Uint8Array(resultBytesLength);
    paddedArray.set(array, paddingByteCount);
    return paddedArray;
  } else if (typeof value == "bigint") {
    if (skipNegativeValueCheck && value < 0) {
      value = (1n << (BigInt(resultBytesLength) * 8n)) + value;
    }
    if (value < 0) {
      throw new Error(`Negative numbers cannot be encoded`);
    }
    const hexString = value.toString(16);
    const paddingByteCount = resultBytesLength * 2 - hexString.length;
    if (paddingByteCount < 0) {
      throw new Error(`Input value too long: ${value}`);
    }
    return HexConverter.decode("0".repeat(paddingByteCount) + hexString);
  } else {
    throw new Error(`Unknown type: ${typeof value}`);
  }
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) {
    return true;
  }

  if (a == null || b == null) {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export function createHasher(hashOptions: HashOptions): IDataHasher {
  return hashOptions.dataHasherFactory.create(hashOptions.algorithm);
}

export type HashOptions<T extends IDataHasher = IDataHasher> = {
  dataHasherFactory: DataHasherFactory<T>;
  algorithm: HashAlgorithm;
};
