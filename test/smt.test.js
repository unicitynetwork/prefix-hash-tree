"use strict";

const { assert } = require("chai");
const { SMT, verifyPath, includesPath } = require("../smt/smt.js");
const { hash, wordArrayToHex } = require("../smt/helper.js");

function checkPaths(leafs, pathTransformFunc, shouldBeIncluded){

}

describe("SMT routines", function() {

    const leafs = [
	{path: 0b100000000n, value: wordArrayToHex(hash('value00000000'))}, 
	{path: 0b100010000n, value: wordArrayToHex(hash('value100010000'))}, 
	{path: 0b111100101n, value: hash('value11100101')}, 
	{path:      0b1100n, value: hash('value100')}, 
	{path:      0b1011n, value: hash('value011')},
	{path: 0b111101111n, value: wordArrayToHex(hash('value11101111'))}, 
	{path:  0b10001010n, value: hash('value0001010')}, 
	{path:  0b11010101n, value: hash('value1010101')}
    ];

    let smt;

    beforeEach(function(){
	smt = new SMT(hash, leafs);
    });

    context("extracting proofs", function() {

	it("extracting all inclusion proofs", function() {
	    for(const leaf of leafs){
		console.log(leaf.path.toString(2));
		const path = smt.getPath(leaf.path);
		assert.equal(includesPath(hash, leaf.path, path), true, "Leaf at location "+leaf.path.toString(2)+" not included");
	    }
	});

	it("extracting non-inclusion proofs for paths deviating from the existing branches", function() {
	    for(const leaf of leafs){
		const requestedPath = leaf.path ^ 4n;
		console.log(requestedPath.toString(2));
		const path = smt.getPath(requestedPath);
		assert.equal(includesPath(hash, requestedPath, path), false, "Leaf at location "+requestedPath.toString(2)+" not included");
	    }
	});

	it("extracting non-inclusion proofs for paths exceeding existing branches", function() {
	    for(const leaf of leafs){
		const requestedPath = leaf.path | 1024n;
		console.log(requestedPath.toString(2));
		const path = smt.getPath(requestedPath);
		assert.equal(includesPath(hash, requestedPath, path), false, "Leaf at location "+requestedPath.toString(2)+" not included");
	    }
	});

	it("extracting non-inclusion proofs for paths stopping inside existing branches", function() {
	    for(const leaf of leafs){
		const pl = BigInt(leaf.path.toString(2).length)/2n;
		const mask = (1n << pl)-1n;
		const requestedPath = (leaf.path & mask) | (1n << pl);
		console.log(requestedPath.toString(2));
		const path = smt.getPath(requestedPath);
		assert.equal(includesPath(hash, requestedPath, path), false, "Leaf at location "+requestedPath.toString(2)+" not included");
	    }
	});



    });

});
