'use strict';

const CryptoJS = require("crypto-js");

const { bigIntToWordArray, stringToWordArray } = require("@unicitylabs/shared");

/**
 * Hash function that accepts multiple input parameters (String, WordArray or BigInt).
 * Converts BigInt into WordArray, concatenates all inputs, hashes, and returns a WordArray.
 * 
 * @param {...(CryptoJS.lib.WordArray | BigInt)} inputs - Parameters to hash.
 * @returns {CryptoJS.lib.WordArray} - The resulting SHA256 hash as a WordArray.
 */
function hash(...inputs) {

  // Concatenate all inputs into a single WordArray
  const concatenatedWordArray = inputs.reduce((acc, input) => {
    if (typeof input === "bigint") {
      // Convert BigInt to WordArray
      input = bigIntToWordArray(input);
    } else if (typeof input === "string") {
      // Convert string to WordArray
      input = stringToWordArray(input);
    } else if (input === null) {
      // Null value as bigint 0
      input = bigIntToWordArray(0n);
    } else if (!CryptoJS.lib.WordArray.isPrototypeOf(input)) {
      throw new Error("Invalid input: must be a BigInt or CryptoJS.lib.WordArray.");
    }
    // Append to accumulator
    return acc.concat(input);
  }, CryptoJS.lib.WordArray.create());

  // Hash the concatenated WordArray and return the result
  return CryptoJS.SHA256(concatenatedWordArray);
}

module.exports = { hash };
