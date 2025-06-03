import { DataHasherFactory } from "@unicitylabs/commons/lib/hash/DataHasherFactory.js";
import { HashAlgorithm } from "@unicitylabs/commons/lib/hash/HashAlgorithm.js";
import { NodeDataHasher } from "@unicitylabs/commons/lib/hash/NodeDataHasher.js";
import { expect } from "chai";

import { Path, HashOptions } from "../src/index.js";

describe("Hash Options", () => {
  it("type check", () => {
    const hashOptions: HashOptions = {
      algorithm: HashAlgorithm.SHA256,
      dataHasherFactory: new DataHasherFactory(NodeDataHasher),
    };
    expect(() => Path.fromJSON(null, hashOptions)).to.throw(
      "Invalid JSON data for Path object.",
    );
  });
});
