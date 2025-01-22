"use strict";

const { assert } = require("chai");
const { SMT, verifyPath, includesPath, extractValue } = require("../smt/smt.js");
const { hash } = require("../smt/helper.js");
const { wordArrayToHex } = require("@unicitylabs/shared");

function checkPaths(smt, leafs, pathTransformFunc, shouldBeIncluded, failMsg){
	for(const leaf of leafs){
		const requestedPath = pathTransformFunc(leaf.path);
		console.log(requestedPath.toString(2));
		const path = smt.getPath(requestedPath);
		assert.equal(includesPath(hash, requestedPath, path), shouldBeIncluded, failMsg(requestedPath));
	}
}

function checkValues(smt, leafs, pathTransformFunc){
	for(const leaf of leafs){
		const requestedPath = pathTransformFunc(leaf.path);
		console.log(requestedPath.toString(2));
		const path = smt.getPath(requestedPath);
/*		console.log(JSON.stringify(path, (key, value) =>
		  typeof value === 'bigint' ? value.toString() : value
		,4));*/
		assert.equal(extractValue(path), wordArrayToHex(hash('value'+requestedPath.toString(2).substring(1))), "Value of "+requestedPath.toString(2)+" has been changed");
	}
}

function modifyValues(smt, leafs, pathTransformFunc){
	for(const leaf of leafs){
		const requestedPath = pathTransformFunc(leaf.path);
		console.log(requestedPath.toString(2));
		try{
		    smt.addLeaf(requestedPath, wordArrayToHex(hash('different value')));
		}catch(e){}
	}
}

function generatePaths(l){
    let leafs = [];
    const trail = (1n << BigInt(l));
    for(let i=0n; i<trail; i++){
	const path = i | trail;
	leafs.push({path , value: wordArrayToHex(hash('value'+path.toString(2).substring(1)))});
    }
    return leafs;
}

describe("SMT routines", function() {

    for(let i=0; i<1; i++){

	context(i==0?"sparse tree":"filled tree", function() {
	    const leafs = i==0?[
		{path: 0b100000000n, value: wordArrayToHex(hash('value00000000'))}, 
		{path: 0b100010000n, value: wordArrayToHex(hash('value00010000'))}, 
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
		    checkValues(smt, leafs, (p) => {return p;});
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

	    if(i==0)context("Trying to perform illegal leaf/value modifications", function() {

		context("Setting different value at existing leaf", function() {

		    beforeEach(function(){
			modifyValues(smt, leafs, (p) => {return p;});
		    });

		    it("leafs values not changed", function() {
			checkValues(smt, leafs, (p) => {return p;});
		    });

		});

		context("Adding leaf including in its path already existing leaf", function() {

		    beforeEach(function(){
			modifyValues(smt, leafs, (p) => {return p | (1n << 512n);});
		    });

		    it("leafs values not changed", function() {
			checkPaths(smt, leafs, (p) => {return p | (1n << 512n);}, false, (p) => {return "Leaf at location "+p.toString(2)+" included";});
			checkValues(smt, leafs, (p) => {return p;});
		    });

		});


		context("Adding leaf inside a path of an already existing leaf", function() {

		    beforeEach(function(){
			modifyValues(smt, leafs, (p) => {const pl = BigInt(p.toString(2).length)/2n; const mask = (1n << pl)-1n; return (p & mask) | (1n << pl);});
		    });

		    it("leafs values not changed", function() {
			checkPaths(smt, leafs, (p) => {const pl = BigInt(p.toString(2).length)/2n; const mask = (1n << pl)-1n; return (p & mask) | (1n << pl);}, false, (p) => {return "Leaf at location "+p.toString(2)+" included";});
			checkValues(smt, leafs, (p) => {return p;});
		    });

		});

	    });

	});

    }

});
