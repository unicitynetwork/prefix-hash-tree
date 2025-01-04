
const LEFT = 0n;
const RIGHT = 1n;

class SMT {
    constructor(hash, leafs){
	this.hash = hash;
	this.root = buildTree(hash, leafs);
    }

    getPath(requestPath){
	return searchPath(this.root, requestPath);
    }
}

class Node {
    constructor(hash, leafValue){
	this.left = null
	this.right = null
	this.value = leafValue;
	this.hash = hash;
    }

    getValue(){
	if(this.value){
	    if(this.left || this.right)
		throw new Error("Malformed node: this is leaf and non-leaf in the same time");
	    return this.value;
	}else
	    return this.hash(this.left.getHash(), this.right.getHash());
    }

}

class Leg {
    constructor(hash, prefix, node){
	this.prefix = prefix;
	this.child = node;
	this.outdated = true;
	this.value = null;
    }

    getHash(){
	if(this.outdated){
	    this.value = hash(this.prefix, this.child.getValue());
	    this.outdated = false;
	}
	return this.value;
    }
}

function buildTree(hash, leafs){
    const root = new Node(hash);
    for(leaf in leafs){
	traverse(hash, root, leaf.path, leaf.value);
    }
    return root;
}

function traverse(hash, node, remainingPath, leafValue){
    const direction = getDirection(remainingPath);
    if(LEFT)
	node.left = splitLeg(hash, node.left, remainingPath, leafValue);
    else
	node.right = splitLeg(hash, node.right, remainingPath, leafValue);
}

function searchPath(node, remainingPath){
    const direction = getDirection(remainingPath);
    if(LEFT){
	const path = searchLeg(node.left, remainingPath);
	path[0].covalue = node.right.getHash();
	return path;
    }else{
	const path = searchLeg(node.right, remainingPath);
	path[0].covalue = node.left.getHash();
	return path;
    }
}

function searchLeg(leg, remainingPath){
    if(!leg){
	return [{prefix: null}];
    }
    const {prefix, pathSuffix, legSuffix} = splitPrefix(remainingPath, leg.prefix);
    if(prefix === remainingPath)
	throw new Error("Search eneded in non-leaf");
    if(prefix === leg.prefix){
	if(isLeaf(leg.child)){
	    return [{prefix}, {value: leg.child.getValue()}];
	}
	path = searchPath(leg.child, pathSuffix);
	path.unshift({prefix});
	return path;
    }
    return [{prefix: leg.prefix}, {value: leg.child.getValue()}];
}


function splitPrefix(prefix, sequence) {
    // Find the position where prefix and sequence differ
    let position = 0n;
    let mask = 1n;

    while ((prefix & mask) === (sequence & mask) && mask <= prefix) {
        position++;
        mask <<= 1n; // Shift mask left by one bit
    }

    // Determine the common prefix and the suffix of the prefix
    const commonPrefix = prefix & ((1n << position) - 1n); // Mask out bits beyond the divergence point
    const prefixSuffix = prefix & ~((1n << position) - 1n); // Mask out bits before the divergence point
    const sequenceSuffix = sequence & ~((1n << position) - 1n); // Mask out bits before the divergence point

    return {prefix: commonPrefix, pathSuffix: prefixSuffix, legSuffix: sequenceSuffix};
}

function splitLeg(hash, leg, remainingPath, leafValue){
    if(!leg){
	return new Leg(hash, remainingPath, new Node(leafValue));
    }
    leg.outdated = true;
    const {prefix, pathSuffix, legSuffix} = splitPrefix(remainingPath, leg.prefix);
    if(prefix === remainingPath)
	throw new Error("Cannot add leaf inside the leg");
    if(prefix === leg.prefix){
	if(isLeaf(leg.child))
	    throw new Error("Cannot extend the leg through the leaf");
	traverse(hash, leg.child, pathSuffix, leafValue);
	return leg;
    }
    leg.prefix = prefix;
    const junction = new Node();
    const oldLeg = new Leg(hash, legSuffix, leg.child);
    leg.child = junction;
    if(getDirection(legSuffix) === LEFT)
        junction.left = oldLeg;
    else
        junction.right = oldLeg;
    traverse(hash, junction, pathSuffix, leafValue);
    return leg;
}

function getDirection(path){
    return (path & 0b10n) === 0b10n ? RIGHT : LEFT;
}

function isLeaf(node){
    return (!node.left && !node.right);
}

module.exports = {
    SMT
}