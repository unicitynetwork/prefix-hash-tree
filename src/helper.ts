/// <reference path="./types/unicitylabs__utils.d.ts" />
import CryptoJS from 'crypto-js';
import { bigIntToWordArray, stringToWordArray } from '@unicitylabs/utils';

import { HashFunction, WordArray } from './types/index.js';

/**
 * Hash function that accepts multiple input parameters (String, WordArray or BigInt).
 * Converts BigInt into WordArray, concatenates all inputs, hashes, and returns a WordArray.
 * 
 * @param inputs - Parameters to hash.
 * @returns The resulting SHA256 hash as a WordArray.
 */
export function hash(...inputs: (WordArray | bigint | string | null)[]): WordArray {
  // Concatenate all inputs into a single WordArray
  const concatenatedWordArray = inputs.reduce<WordArray>((acc, input) => {
    let convertedInput: WordArray;
    
    if (typeof input === 'bigint') {
      // Convert BigInt to WordArray
      convertedInput = bigIntToWordArray(input);
    } else if (typeof input === 'string') {
      // Convert string to WordArray
      convertedInput = stringToWordArray(input);
    } else if (input === null) {
      // Null value as bigint 0
      convertedInput = bigIntToWordArray(0n);
    } else {
      // Must be a WordArray
      convertedInput = input;
    }
    
    // Append to accumulator, which is guaranteed to be a WordArray due to the type param on reduce
    return acc.concat(convertedInput);
  }, CryptoJS.lib.WordArray.create());

  // Hash the concatenated WordArray and return the result
  return CryptoJS.SHA256(concatenatedWordArray);
}