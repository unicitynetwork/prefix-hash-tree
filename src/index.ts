import { hash } from './helper.js';
import { SMT, AbstractTree, Path, getCommonPathBits, splitPrefix } from './smt.js';
import { SumPath } from './sumtree.js';
import { SumTree } from './sumtree.js';
import { HashFunction, Leaf, PathItem, WordArray, PrefixSplit } from './types/index.js';
import { SumLeaf } from './types/sumtreeindex.js';

export {
  hash,
  SMT,
  SumTree,
  AbstractTree,
  Path,
  SumPath,
  getCommonPathBits,
  splitPrefix,
  // Types
  HashFunction,
  Leaf,
  SumLeaf,
  PathItem,
  WordArray,
  PrefixSplit
};