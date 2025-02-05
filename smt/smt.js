
const { wordArrayToHex } = require("@unicitylabs/utils");

const LEFT = 0n;
const RIGHT = 1n;

class SMT {
    constructor(hash, leafs) {
        this.hash = hash;
        this.root = buildTree(hash, leafs);
    }

    getPath(requestPath) {
        const path = searchPath(this.root, requestPath);
        path.unshift({ value: this.root.getValue() });
        return path;
    }

    addLeaf(requestPath, value) {
        traverse(this.hash, this.root, requestPath, value);
    }
}

class Node {
    constructor(hash, leafValue) {
        this.left = null
        this.right = null
        this.value = leafValue;
        this.hash = hash;
        if (typeof hash !== "function")
            throw new Error("hash must be function");
    }

    getValue() {
        if (this.value) {
            if (this.left || this.right)
                throw new Error("Malformed node: this is leaf and non-leaf in the same time");
            return this.value;
        } else
            return this.hash(this.left ? this.left.getHash() : null, this.right ? this.right.getHash() : null);
    }

}

class Leg {
    constructor(hash, prefix, node) {
        this.hash = hash;
        this.prefix = prefix;
        this.child = node;
        this.outdated = true;
        this.value = null;
    }

    getHash() {
        if (this.outdated) {
            this.value = this.hash(this.prefix, this.child.getValue());
            this.outdated = false;
        }
        return this.value;
    }
}

function buildTree(hash, leafs) {
    const root = new Node(hash);

    for (const leaf of leafs) {
        traverse(hash, root, leaf.path, leaf.value);
    }
    return root;
}

function traverse(hash, node, remainingPath, leafValue) {
    const direction = getDirection(remainingPath);
    if (direction === LEFT)
        node.left = splitLeg(hash, node.left, remainingPath, leafValue);
    else
        node.right = splitLeg(hash, node.right, remainingPath, leafValue);
}

function searchPath(node, remainingPath) {
    const direction = getDirection(remainingPath);
    if (direction === LEFT) {
        const path = searchLeg(node.left, remainingPath);
        path[0].covalue = node.right ? node.right.getHash() : undefined;
        return path;
    } else {
        const path = searchLeg(node.right, remainingPath);
        path[0].covalue = node.left ? node.left.getHash() : undefined;
        return path;
    }
}

function searchLeg(leg, remainingPath) {
    if (!leg) {
        return [{ prefix: null }];
    }
    const { prefix, pathSuffix, legSuffix } = splitPrefix(remainingPath, leg.prefix);
    if (prefix === leg.prefix) {
        if (isLeaf(leg.child)) {
            return [{ prefix }, { value: leg.child.getValue() }];
        }
        const path = searchPath(leg.child, pathSuffix);
        path.unshift({ prefix });
        return path;
    }
    return [{ prefix: leg.prefix }, { value: leg.child.getValue() }];
}

function splitPrefix(prefix, sequence) {
    // Find the position where prefix and sequence differ
    let position = 0n;
    let mask = 1n;
    const prefixLen = prefix.toString(2).length - 1;
    const sequenceLen = sequence.toString(2).length - 1;
    const capLen = prefixLen < sequenceLen ? prefixLen : sequenceLen;

    while ((prefix & mask) === (sequence & mask) && position < capLen) {
        position++;
        mask <<= 1n; // Shift mask left by one bit
    }

    // Determine the common prefix and the suffix of the prefix
    const commonPrefix = (prefix & ((1n << position) - 1n)) | (1n << position); // Mask out bits beyond the divergence point
    const prefixSuffix = prefix >> position; // Mask out bits before the divergence point
    const sequenceSuffix = sequence >> position; // Mask out bits before the divergence point

    return { prefix: commonPrefix, pathSuffix: prefixSuffix, legSuffix: sequenceSuffix };
}

function splitLeg(hash, leg, remainingPath, leafValue) {
    if (!leg) {
        return new Leg(hash, remainingPath, new Node(hash, leafValue));
    }
    leg.outdated = true;
    const { prefix, pathSuffix, legSuffix } = splitPrefix(remainingPath, leg.prefix);
    if (prefix === remainingPath)
        throw new Error("Cannot add leaf inside the leg");
    if (prefix === leg.prefix) {
        if (isLeaf(leg.child))
            throw new Error("Cannot extend the leg through the leaf");
        traverse(hash, leg.child, pathSuffix, leafValue);
        return leg;
    }
    leg.prefix = prefix;
    const junction = new Node(hash);
    const oldLeg = new Leg(hash, legSuffix, leg.child);
    leg.child = junction;
    if (getDirection(legSuffix) === LEFT)
        junction.left = oldLeg;
    else
        junction.right = oldLeg;
    traverse(hash, junction, pathSuffix, leafValue);
    return leg;
}

function getDirection(path) {
    const masked = path & 0b1n;
    return masked === 0b1n ? RIGHT : LEFT;
}

function isLeaf(node) {
    return (!node.left && !node.right);
}

function verifyPath(hash, path) {
    let h = path[path.length - 1].value;
    for (let i = path.length - 3; i >= 0; i--) {
        h = (getDirection(path[i + 1].prefix) === LEFT) ?
            hash(hash(path[i + 1].prefix, h), path[i + 1].covalue ? path[i + 1].covalue : null) :
            hash(path[i + 1].covalue ? path[i + 1].covalue : null, hash(path[i + 1].prefix, h));
    }
    return wordArrayToHex(h) === wordArrayToHex(path[0].value);
}

function includesPath(hash, requestPath, path) {
    if (!verifyPath(hash, path))
        throw new Error("Path integrity check fail");
    const extractedLocation = extractLocation(path);
    if (requestPath === extractedLocation) return true;
    const requestPathBits = requestPath.toString(2).substring(1);
    const extractedLocationBits = extractedLocation.toString(2).substring(1);
    const commonPathBits = getCommonPathBits(requestPathBits, extractedLocationBits);
    if (commonPathBits === requestPathBits) return false;
    if (commonPathBits === extractedLocationBits)
        if (path[path.length - 1].leaf)
            return false;
        else
            throw new Error("Wrong path aquired for the requested path");
    if (vertexAtDepth(path, commonPathBits.length))
        throw new Error("Wrong path aquired for the requested path");
    return false;
}

function getCommonPathBits(pathBits1, pathBits2) {
    let i1 = pathBits1.length - 1;
    let i2 = pathBits2.length - 1;
    while ((i1 >= 0) && (i2 >= 0) && (pathBits1.substring(i1, 1) === pathBits2.substring(i2, 1))) {
        i1--;
        i2--;
    }
    return pathBits1.substring(i1 + 1);
}

function extractLocation(path) {
    let result = 1n;
    for (let i = path.length - 1; i > 0; i--) {
        if (!path[i].prefix) continue;
        const bits = path[i].prefix;
        const bitLength = bits.toString(2).length - 1;
        result = (result << BigInt(bitLength)) | (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result;
}

function vertexAtDepth(path, depth) {
    let result = 1n;
    for (let i = path.length - 1; i > 0 && (1n << BigInt(depth)) > result; i--) {
        if (!path[i].prefix) continue;
        const bits = path[i].prefix;
        const bitLength = bits.toString(2).length - 1;
        result = (result << BigInt(bitLength)) | (bits & ((1n << BigInt(bitLength)) - 1n));
    }
    return result.toString(2).length == depth;
}

function extractValue(path) {
    const leaf = path[path.length - 1];
    if (leaf.covalue || leaf.prefix)
        throw new Error("Path has no leaf");
    return leaf.value;
}

module.exports = {
    SMT,
    searchPath,
    verifyPath,
    includesPath,
    extractLocation,
    extractValue
}
