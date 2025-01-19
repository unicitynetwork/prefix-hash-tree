"use strict";

const { assert } = require("chai");
const { SMT, verifyPath, includesPath } = require("../smt/smt.js");
const { hash, wordArrayToHex } = require("../smt/helper.js");

function checkPaths(smt, leafs, pathTransformFunc, shouldBeIncluded, failMsg){
	for(const leaf of leafs){
		const requestedPath = pathTransformFunc(leaf.path);
		console.log(requestedPath.toString(2));
		const path = smt.getPath(requestedPath);
		assert.equal(includesPath(hash, requestedPath, path), shouldBeIncluded, failMsg(requestedPath));
	}
}

function generatePaths(l){
    let leafs = [];
    const trail = (1n << BigInt(l));
    for(let i=0n; i<trail; i++)
	leafs.push({path: i | trail, value: wordArrayToHex(hash('value'+i.toString(2)))});
    return leafs;
}

describe("SMT routines", function() {

    for(let i=0; i<2; i++){

	context(i==0?"sparse tree":"filled tree", function() {
	    const leafs = i==0?[
		{path: 0b100000000n, value: wordArrayToHex(hash('value00000000'))}, 
		{path: 0b100010000n, value: wordArrayToHex(hash('value100010000'))}, 
		{path: 0b111100101n, value: hash('value11100101')}, 
		{path:      0b1100n, value: hash('value100')}, 
		{path:      0b1011n, value: hash('value011')},
		{path: 0b111101111n, value: wordArrayToHex(hash('value11101111'))}, 
		{path:  0b10001010n, value: hash('value0001010')}, 
		{path:  0b11010101n, value: hash('value1010101')}
	    ]:generatePaths(7);

    	    let smt;

    	    beforeEach(function(){
		smt = new SMT(hash, leafs);
	    });

	    context("extracting proofs", function() {

		it("extracting all inclusion proofs", function() {
		    checkPaths(smt, leafs, (p) => {return p;}, true, (p) => {return "Leaf at location "+p.toString(2)+" not included";});
		});

		if(i==0)it("extracting non-inclusion proofs for paths deviating from the existing branches", function() {
		    checkPaths(smt, leafs, (p) => {return p ^ 4n;}, false, (p) => {return "Leaf at location "+p.toString(2)+" included";});
		});

		it("extracting non-inclusion proofs for paths exceeding existing branches", function() {
		    checkPaths(smt, leafs, (p) => {return p | (1n << 512n);}, false, (p) => {return "Leaf at location "+p.toString(2)+" included";});
		});

		it("extracting non-inclusion proofs for paths stopping inside existing branches", function() {
		    checkPaths(smt, leafs, (p) => {const pl = BigInt(p.toString(2).length)/2n; const mask = (1n << pl)-1n; return (p & mask) | (1n << pl);}, false, (p) => {return "Leaf at location "+p.toString(2)+" included";});
		});

	    });

	});

    }

});
