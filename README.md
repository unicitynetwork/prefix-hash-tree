# Prefix Hash Tree

A TypeScript implementation of two compact Sparse Merkle Trees (SMTs):

* smt.ts contains a regular compact SMT.
* sumtree.ts contains a sum tree as a compact SMT where every leaf has an associated non-negative numeric value and every parent node contains the sum of its child nodes' numeric values.

## Browser usage

The library is compatible with modern browsers like Chrome. When constructing a
tree in the browser, use `SubtleCryptoDataHasher` from
`@unicitylabs/commons`:

```typescript
import { SubtleCryptoDataHasher } from '@unicitylabs/commons/lib/hash/SubtleCryptoDataHasher.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';

const factory = new DataHasherFactory(SubtleCryptoDataHasher);
```


