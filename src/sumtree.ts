import { IDataHasher } from '@unicitylabs/commons/lib/hash/IDataHasher.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import { AbstractTree, LEFT, RIGHT, AbstractLeafNode, LEAF_PREFIX, AbstractInternalNode, NODE_PREFIX, AbstractLeg, AbstractPath, ValidationResult, LEG_PREFIX, VerificationContext, padTo32Bytes, HashOptions, unpad, createHasher } from './smt.js';
import { PathItem } from './types/index.js';
import { AnySumPathItemJson, ISumPathItemEmptyBranchJson, ISumPathItemInternalNodeHashedJson, ISumPathItemInternalNodeJson, ISumPathItemLeafJson, ISumPathItemRootJson, ISumPathJson, SumPathItem } from './types/sumtreeindex.js';
import { SumPathItemLeaf } from './types/sumtreeindex.js';
import { SumPathItemEmptyBranch } from './types/sumtreeindex.js';
import { SumPathItemInternalNodeHashed } from './types/sumtreeindex.js';
import { SumPathItemInternalNode } from './types/sumtreeindex.js';
import { SumPathItemRoot } from './types/sumtreeindex.js';
import { SumLeaf } from './types/sumtreeindex.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { stringToBytes } from './utils.js';



export class SumTree extends AbstractTree<SumInternalNode, SumLeafNode, SumLeaf, SumLeg, SumPathItem, SumPathItemRoot,
    SumPathItemInternalNode, SumPathItemInternalNodeHashed, SumPathItemLeaf, SumPathItemEmptyBranch, 
    SumPath> 
{
  public constructor(dataHasherFactory: DataHasherFactory<IDataHasher>, hashAlgorithm: HashAlgorithm, leavesByPath: Map<bigint, SumLeaf>, pathLengthInBits: bigint | false | undefined = undefined) {
    super(dataHasherFactory, hashAlgorithm, leavesByPath, pathLengthInBits);
  }

  public async getRootSum(): Promise<bigint> {
    return await this.root.getSum();
  }
  
  override createPath(pathItems: SumPathItem[]): SumPath {
    return new SumPath(pathItems, this.hashOptions, this.pathPaddingBits);
  }

  override async createPathForEmptyTree(): Promise<SumPath> {
    return new SumPath(
      [{ type: 'sumRoot', rootHash: await this.getRootHash(), sum: 0n } as SumPathItemRoot],
      this.hashOptions,
      this.pathPaddingBits);
  }

  override createNewLeaf(leaf: SumLeaf): SumLeafNode {
    return new SumLeafNode(this.hashOptions, leaf.value, leaf.numericValue);
  }

  override async createPathItemRoot(): Promise<SumPathItemRoot> {
    return { type: 'sumRoot', rootHash: await this.root.getHash(), sum: await this.root.getSum() };
  }

  override createInternalNode(): SumInternalNode {
    return new SumInternalNode(this.hashOptions);
  }

  override async createEmptyLeftBranchPathItem(node: SumInternalNode): Promise<SumPathItemEmptyBranch> {
    return { type: 'sumEmptyBranch', direction: LEFT, siblingHash: await node.right!.getHash(), siblingSum: await node.right!.getSum() };
  }

  override async createEmptyRightBranchPathItem(node: SumInternalNode): Promise<SumPathItemEmptyBranch> {
    return { type: 'sumEmptyBranch', direction: RIGHT, siblingHash: await node.left!.getHash(), siblingSum: await node.left!.getSum() };
  }

  override createPathItemInternalNode(prefix: bigint): SumPathItemInternalNode {
    return { type: 'sumInternalNode', prefix, siblingHash: undefined, siblingSum: undefined };
  }

  override async createPathItemInternalNodeHashed(node: SumInternalNode): Promise<SumPathItemInternalNodeHashed> {
    return { type: 'sumInternalNodeHashed', nodeHash: await node.getHash(), sum: await node.getSum() };
  }

  override async createPathItemLeafNode(leaf: SumLeafNode): Promise<SumPathItemLeaf> {
    return { type: 'sumLeaf', value: leaf.getValue(), numericValue: await leaf.getSum() };
  }

  override async addSiblingDataToLeft(untypedPathItem: PathItem, node: SumInternalNode): Promise<void> {
    const pathItem = untypedPathItem as SumPathItemInternalNode;
    pathItem.siblingHash = node.right ? await node.right.getHash() : undefined;
    pathItem.siblingSum = node.right ? await node.right.getSum() : undefined;
  }

  override async addSiblingDataToRight(untypedPathItem: PathItem, node: SumInternalNode): Promise<void> {
    const pathItem = untypedPathItem as SumPathItemInternalNode;
    pathItem.siblingHash = node.left ? await node.left.getHash() : undefined;
    pathItem.siblingSum = node.left ? await node.left.getSum() : undefined;
  }

  override createLeg(remainingPath: bigint, child: SumLeafNode | SumInternalNode): SumLeg {
    return new SumLeg(
      this.hashOptions,
      remainingPath,
      child,
      this.pathPaddingBits);
  }
}
export class SumLeafNode extends AbstractLeafNode<SumLeafNode, SumInternalNode, SumLeg> {
  public readonly numericValue: bigint;

  constructor (
    hashOptions: HashOptions,
    value: string | Uint8Array,
    numericValue: bigint
  ) {
    super(hashOptions, value);
    this.numericValue = numericValue;
  }

  override async getHash(): Promise<Uint8Array> {
    const hasher = createHasher(this.hashOptions);
    return (await hasher
      .update(padTo32Bytes(LEAF_PREFIX))
      .update(typeof(this.value) == 'string' ? stringToBytes(this.value) : padTo32Bytes(this.value))
      .update(padTo32Bytes(this.numericValue))
      .digest()).data;
  }

  public async getSum(): Promise<bigint> {
    return this.numericValue;
  }
}

export class SumInternalNode extends AbstractInternalNode<SumLeafNode, SumInternalNode, SumLeg> {
  constructor(hashOptions: HashOptions) {
    super(hashOptions);
  }

  override async getHash(): Promise<Uint8Array> {
    const leftHash = this.left ? await this.left.getHash() : 0n;
    const rightHash = this.right ? await this.right.getHash() : 0n;

    const leftSum = this.left ? await this.left.getSum() : 0n;
    const rightSum = this.right ? await this.right.getSum() : 0n;

    const hasher = createHasher(this.hashOptions);
    return (await hasher
      .update(padTo32Bytes(NODE_PREFIX))
      .update(padTo32Bytes(leftHash))
      .update(padTo32Bytes(rightHash))
      .update(padTo32Bytes(leftSum))
      .update(padTo32Bytes(rightSum))
      .digest()).data;
  }

  public async getSum(): Promise<bigint> {
    const leftSum = this.left ? await this.left.getSum() : 0n;
    const rightSum = this.right ? await this.right.getSum() : 0n;
    return leftSum + rightSum;
  }
}

export class SumLeg extends AbstractLeg<SumLeafNode, SumInternalNode, SumLeg> {
  private sum: bigint | null = null;

  public constructor(hashOptions: HashOptions, prefix: bigint, node: SumLeafNode | SumInternalNode, pathPaddingBits: bigint | false) {
    super(hashOptions, prefix, node, pathPaddingBits);
  }

  override async recalculateIfOutdated() {
    if (this.outdated) {
      this.sum = await this.child.getSum();
    }
    await super.recalculateIfOutdated();
  }

  public async getSum(): Promise<bigint> {
    await this.recalculateIfOutdated();
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

  override async verifyPath(): Promise<ValidationResult> {
    if (!this.allNumericValuesOnPathArePositiveOrZero()) {
      return {success: false, error: 'Negative numeric values are not allowed on any part of the path'};
    }

    return await super.verifyPath();
  }

  protected allNumericValuesOnPathArePositiveOrZero(): boolean {
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

  override getNodeHashFromInternalNodeHashed(pathItem: PathItem): Uint8Array {
    return (pathItem as SumPathItemInternalNodeHashed).nodeHash as Uint8Array;
  }

  override createVerificationContext(hashOptions: HashOptions): VerificationContext {
    const pathPaddingBits = this.pathPaddingBits;
    let sumSoFar: bigint = 0n;
    return {
      async beginCalculation(pathItem: PathItem): Promise<void> {
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
      async pathItemProcessed(pathItemAsSupertype: PathItem): Promise<void> {
        if (!(('type' in pathItemAsSupertype) && (pathItemAsSupertype.type == 'sumInternalNode'))) {
          throw new Error('Unsupported PathItem type');
        }
        const pathItem = pathItemAsSupertype as SumPathItemInternalNode;

        sumSoFar += pathItem.siblingSum ? pathItem.siblingSum : 0n;
      },
      async hashLeftNode(pathItemAsSupertype: PathItem, legHash: Uint8Array): Promise<Uint8Array> {
        const pathItem = pathItemAsSupertype as SumPathItemInternalNode;
        const hasher = createHasher(hashOptions);
        return (await hasher
          .update(padTo32Bytes(NODE_PREFIX))
          .update(padTo32Bytes(legHash))
          .update(padTo32Bytes(pathItem.siblingHash ? pathItem.siblingHash : 0n))
          .update(padTo32Bytes(sumSoFar))
          .update(padTo32Bytes(pathItem.siblingSum ? pathItem.siblingSum : 0n))
          .digest()).data;
      },
      async hashRightNode(pathItemAsSupertype: PathItem, legHash: Uint8Array): Promise<Uint8Array> {
        const pathItem = pathItemAsSupertype as SumPathItemInternalNode;
        const hasher = createHasher(hashOptions);
        return (await hasher
          .update(padTo32Bytes(NODE_PREFIX))
          .update(padTo32Bytes(pathItem.siblingHash ? pathItem.siblingHash : 0n))
          .update(padTo32Bytes(legHash))
          .update(padTo32Bytes(pathItem.siblingSum ? pathItem.siblingSum : 0n))
          .update(padTo32Bytes(sumSoFar))
          .digest()).data;
      },
      async hashLeftEmptyBranch(pathItemAsSupertype: PathItem): Promise<Uint8Array> {
        const pathItem = pathItemAsSupertype as SumPathItemEmptyBranch;
        const hasher = createHasher(hashOptions);
        return (await hasher
          .update(padTo32Bytes(NODE_PREFIX))
          .update(padTo32Bytes(0n))
          .update(padTo32Bytes(pathItem.siblingHash))
          .update(padTo32Bytes(0n))
          .update(padTo32Bytes(pathItem.siblingSum))
          .digest()).data;
      },
      async hashRightEmptyBranch(pathItemAsSupertype: PathItem): Promise<Uint8Array> {
        const pathItem = pathItemAsSupertype as SumPathItemEmptyBranch;
        const hasher = createHasher(hashOptions);
        return (await hasher
          .update(padTo32Bytes(NODE_PREFIX))
          .update(padTo32Bytes(pathItem.siblingHash))
          .update(padTo32Bytes(0n))
          .update(padTo32Bytes(pathItem.siblingSum))
          .update(padTo32Bytes(0n))
          .digest()).data;
      },
      async hashLeaf(pathItem: PathItem): Promise<Uint8Array> {
        const leaf = pathItem as SumPathItemLeaf;
        const hasher = createHasher(hashOptions);
        return (await hasher
          .update(padTo32Bytes(LEAF_PREFIX))
          .update(typeof(leaf.value) == 'string' ? stringToBytes(leaf.value) : padTo32Bytes(leaf.value))
          .update(padTo32Bytes(leaf.numericValue))
          .digest()).data;
      },
      async hashLeg(prefix: bigint, childHash: Uint8Array): Promise<Uint8Array> {
        const hasher = createHasher(hashOptions);
        return (await hasher
          .update(padTo32Bytes(LEG_PREFIX))
          .update(padTo32Bytes(unpad(prefix, pathPaddingBits)))
          .update(padTo32Bytes(childHash))
          .digest()).data;
      }
    };
  }

  public toCBOR(): Uint8Array {
    const encodedPathItems: Uint8Array[] = this.path.map(item => {
      let itemPayloadEncodedElements: Uint8Array[];

      switch (item.type) {
        case 'sumRoot':
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(item.type),
            CborEncoder.encodeByteString(item.rootHash),
            CborEncoder.encodeByteString(BigintConverter.encode(item.sum)),
          ];
          break;
        case 'sumInternalNode':
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(item.type),
            CborEncoder.encodeByteString(BigintConverter.encode(item.prefix)),
            CborEncoder.encodeOptional(item.siblingHash, CborEncoder.encodeByteString),
            CborEncoder.encodeOptional(encodeBigintOrUndefined(item.siblingSum), CborEncoder.encodeByteString),
          ];
          break;
        case 'sumInternalNodeHashed':
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(item.type),
            CborEncoder.encodeByteString(item.nodeHash),
            CborEncoder.encodeByteString(BigintConverter.encode(item.sum)),
          ];
          break;
        case 'sumEmptyBranch':
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(item.type),
            CborEncoder.encodeByteString(BigintConverter.encode(item.direction)),
            CborEncoder.encodeByteString(item.siblingHash),
            CborEncoder.encodeByteString(BigintConverter.encode(item.siblingSum)),
          ];
          break;
        case 'sumLeaf':
          const encodedValue = typeof item.value === 'string'
            ? CborEncoder.encodeTextString(item.value)
            : CborEncoder.encodeByteString(item.value as Uint8Array);
          
          itemPayloadEncodedElements = [
            CborEncoder.encodeTextString(item.type),
            encodedValue,
            CborEncoder.encodeByteString(BigintConverter.encode(item.numericValue)),
          ];
          break;
        default:
          const _exhaustiveCheck: never = item;
          throw new Error(`Unknown SumPathItem type encountered during CBOR encoding: ${(_exhaustiveCheck as any).type}`);
      }
      return CborEncoder.encodeArray(itemPayloadEncodedElements);
    });

    return CborEncoder.encodeArray(encodedPathItems);
  }

  public toJSON(): ISumPathJson {
    const jsonItems: AnySumPathItemJson[] = this.path.map(item => {
      const concreteItem = item as (SumPathItemRoot | SumPathItemInternalNode | SumPathItemInternalNodeHashed | SumPathItemEmptyBranch | SumPathItemLeaf);
      
      let itemAsJson: any; 

      switch (concreteItem.type) {
        case 'sumRoot':
          itemAsJson = {
            type: concreteItem.type,
            rootHash: HexConverter.encode(concreteItem.rootHash),
            sum: concreteItem.sum.toString(),
          };
          break;
        case 'sumInternalNode':
          itemAsJson = {
            type: concreteItem.type,
            prefix: concreteItem.prefix.toString(),
          };
          if (concreteItem.siblingHash !== undefined) {
            itemAsJson.siblingHash = HexConverter.encode(concreteItem.siblingHash);
          }
          if (concreteItem.siblingSum !== undefined) {
            itemAsJson.siblingSum = concreteItem.siblingSum.toString();
          }
          break;
        case 'sumInternalNodeHashed':
          itemAsJson = {
            type: concreteItem.type,
            nodeHash: HexConverter.encode(concreteItem.nodeHash),
            sum: concreteItem.sum.toString(),
          };
          break;
        case 'sumEmptyBranch':
          itemAsJson = {
            type: concreteItem.type,
            direction: concreteItem.direction.toString(),
            siblingHash: HexConverter.encode(concreteItem.siblingHash),
            siblingSum: concreteItem.siblingSum.toString(),
          };
          break;
        case 'sumLeaf':
          itemAsJson = {
            type: concreteItem.type,
            value: typeof concreteItem.value === 'string'
              ? concreteItem.value
              : HexConverter.encode(concreteItem.value as Uint8Array),
            valueType: typeof concreteItem.value === 'string'
              ? 'string'
              : 'Uint8Array',
            numericValue: concreteItem.numericValue.toString(),
          };
          break;
        default:
          const _exhaustiveCheck: never = concreteItem;
          throw new Error(`Unknown SumPathItem type encountered during toJSON serialization: ${(_exhaustiveCheck as any).type}`);
      }
      return itemAsJson as AnySumPathItemJson;
    });

    return {
      pathPaddingBits: typeof this.pathPaddingBits === 'bigint' 
        ? this.pathPaddingBits.toString() 
        : this.pathPaddingBits,
      items: jsonItems,
    };
  }

  public static isJSON(data: unknown): data is ISumPathJson {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as ISumPathJson;

    if (!('pathPaddingBits' in obj && (typeof obj.pathPaddingBits === 'string' || obj.pathPaddingBits === false))) {
      return false;
    }

    if (!('items' in obj && Array.isArray(obj.items))) {
      return false;
    }

    for (const item of obj.items) {
      if (typeof item !== 'object' || item === null || typeof item.type !== 'string') {
        return false;
      }
      switch (item.type) {
        case 'sumRoot':
          const rootNode = item as ISumPathItemRootJson;
          if (!(typeof rootNode.rootHash === 'string' && typeof rootNode.sum === 'string')) return false;
          break;
        case 'sumInternalNode':
          const internalNode = item as ISumPathItemInternalNodeJson;
          if (!(typeof internalNode.prefix === 'string')) return false;
          if (internalNode.siblingHash !== undefined && typeof internalNode.siblingHash !== 'string') return false;
          if (internalNode.siblingSum !== undefined && typeof internalNode.siblingSum !== 'string') return false;
          break;
        case 'sumInternalNodeHashed':
          const hashedNode = item as ISumPathItemInternalNodeHashedJson;
          if (!(typeof hashedNode.nodeHash === 'string' && typeof hashedNode.sum === 'string')) return false;
          break;
        case 'sumEmptyBranch':
          const emptyBranch = item as ISumPathItemEmptyBranchJson;
          if (!(typeof emptyBranch.direction === 'string' && typeof emptyBranch.siblingHash === 'string' && typeof emptyBranch.siblingSum === 'string')) return false;
          break;
        case 'sumLeaf':
          const leafNode = item as ISumPathItemLeafJson;
          if (!(typeof leafNode.value === 'string' && typeof leafNode.numericValue === 'string' &&
            typeof leafNode.valueType === 'string')) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  public static fromJSON(data: unknown, hashOptions: HashOptions): SumPath {
    if (!SumPath.isJSON(data)) {
      throw new Error('Invalid JSON data for SumPath object.');
    }

    const pathPaddingBits = data.pathPaddingBits === false ? false : BigInt(data.pathPaddingBits);

    const reconstructedPathItems: SumPathItem[] = data.items.map((jsonItem: AnySumPathItemJson) => {
      switch (jsonItem.type) {
        case 'sumRoot':
          return {
            type: 'sumRoot',
            rootHash: HexConverter.decode(jsonItem.rootHash),
            sum: BigInt(jsonItem.sum),
          } as SumPathItemRoot;
        case 'sumInternalNode':
          return {
            type: 'sumInternalNode',
            prefix: BigInt(jsonItem.prefix),
            siblingHash: jsonItem.siblingHash ? HexConverter.decode(jsonItem.siblingHash) : undefined,
            siblingSum: jsonItem.siblingSum ? BigInt(jsonItem.siblingSum) : undefined,
          } as SumPathItemInternalNode;
        case 'sumInternalNodeHashed':
          return {
            type: 'sumInternalNodeHashed',
            nodeHash: HexConverter.decode(jsonItem.nodeHash),
            sum: BigInt(jsonItem.sum),
          } as SumPathItemInternalNodeHashed;
        case 'sumEmptyBranch':
          return {
            type: 'sumEmptyBranch',
            direction: BigInt(jsonItem.direction),
            siblingHash: HexConverter.decode(jsonItem.siblingHash),
            siblingSum: BigInt(jsonItem.siblingSum),
          } as SumPathItemEmptyBranch;
        case 'sumLeaf':
          let reconstructedValue: string | Uint8Array;
          const leafJson = jsonItem as (ISumPathItemLeafJson & { valueType?: 'string' | 'Uint8Array' }); // Simulate valueType
          if (leafJson.valueType === 'Uint8Array') {
            reconstructedValue = HexConverter.decode(leafJson.value);
          } else if (leafJson.valueType === 'string') {
            reconstructedValue = leafJson.value;
          } else {
            throw new Error(`Unknown value type: ${leafJson.valueType}`);
          }
          return {
            type: 'sumLeaf',
            value: reconstructedValue,
            numericValue: BigInt(leafJson.numericValue),
          } as SumPathItemLeaf;
        default:
          const exhaustiveCheck: never = jsonItem;
          throw new Error(`Invalid item type in SumPath JSON data during reconstruction: ${(exhaustiveCheck as any).type}`);
      }
    });

    return new SumPath(reconstructedPathItems, hashOptions, pathPaddingBits);
  }
}

function encodeBigintOrUndefined(value: bigint | undefined): Uint8Array | undefined {
  return (value === undefined) ? undefined : BigintConverter.encode(value);
}
