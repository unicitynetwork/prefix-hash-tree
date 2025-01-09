
const { SMT } = require("../smt/smt.js");
const { hash, wordArrayToHex } = require("../smt/helper.js");

describe("SMT routines", function() {

    const leafs = [
	{path: 0b100000000n, value: wordArrayToHex(hash('value00000000'))}, 
	{path: 0b100010000n, value: wordArrayToHex(hash('value100010000'))}, 
//	{path: 0b1100n, value: hash('value100')}, 
//	{path: 0b10001010n, value: hash('value0001010')}, 
//	{path: 0b11010101n, value: hash('value1010101')}
    ];

    let smt;

    beforeEach(function(){
	smt = new SMT(hash, leafs);
    });

    context("extracting proofs", function() {

	it("extracting all inclusion proofs", function() {
	    const path = smt.getPath(0b100000000n);
	    console.log(JSON.stringify(path, 
		(key, value) =>
		  typeof value === 'bigint' ? value.toString() : value,
		4));
	});

    });

});
