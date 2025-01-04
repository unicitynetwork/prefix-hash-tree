
const { SMT } = require("../smt/smt.js");
const { hash } = require("../smt/helper.js");

describe("SMT routines", function() {

    const leafs = [{path: 0b10000000, value: hash('value0000000')}, {path: 0b10001000, value: hash('value0001000')}, {path: 0b1100, value: hash('value100')}, {path: 0b10001010, value: hash('value0001010')}, {path: 0b11010101, value: hash('value1010101')}];

    let smt;

    beforeEach(function(){
	smt = new SMT();
    });

    context("extracting proofs", function() {

	it("extracting all inclusion proofs", function() {
	    const path = smt.getPath(0b10000000);
	});

    });

});
