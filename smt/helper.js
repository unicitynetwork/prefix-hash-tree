const CryptoJS = require("crypto-js");

/**
 * Hash function that accepts multiple input parameters (String, WordArray or BigInt).
 * Converts BigInt into WordArray, concatenates all inputs, hashes, and returns a WordArray.
 * 
 * @param {...(CryptoJS.lib.WordArray | BigInt)} inputs - Parameters to hash.
 * @returns {CryptoJS.lib.WordArray} - The resulting SHA256 hash as a WordArray.
 */
function hash(...inputs) {
  // Helper function to convert BigInt to WordArray
  const bigIntToWordArray = (bigInt) => {
    // Convert BigInt to Hex String
    let hexString = bigInt.toString(16);
    // Ensure even length for Hex String
    if (hexString.length % 2 !== 0) {
      hexString = "0" + hexString;
    }
    // Convert Hex String to WordArray
    return CryptoJS.enc.Hex.parse(hexString);
  };

  // Helper function to convert a string to WordArray
  const stringToWordArray = (string) => {
    return CryptoJS.enc.Utf8.parse(string);
  }

  // Concatenate all inputs into a single WordArray
  const concatenatedWordArray = inputs.reduce((acc, input) => {
    if (typeof input === "bigint") {
      // Convert BigInt to WordArray
      input = bigIntToWordArray(input);
    } else if (typeof input === "string") {
      // Convert string to WordArray
      input = stringToWordArray(input);
    } else if (!CryptoJS.lib.WordArray.isPrototypeOf(input)) {
      throw new Error("Invalid input: must be a BigInt or CryptoJS.lib.WordArray.");
    }
    // Append to accumulator
    return acc.concat(input);
  }, CryptoJS.lib.WordArray.create());

  // Hash the concatenated WordArray and return the result
  return CryptoJS.SHA256(concatenatedWordArray);
}

function wordArrayToHex(wordArray){
    return wordArray.toString(CryptoJS.enc.Hex);
}

module.exports = { hash, wordArrayToHex };
