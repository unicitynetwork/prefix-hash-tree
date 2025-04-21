declare module '@unicitylabs/utils' {
  import { WordArray } from '../types/index.js';
  
  export function smthash(...inputs: (WordArray | bigint | string | null)[]): WordArray;
  export function bigIntToWordArray(bigInt: bigint): WordArray;
  export function stringToWordArray(string: string): WordArray;
  export function hexToWordArray(hexStr: string): WordArray;
  export function wordArrayToHex(wordArray: WordArray | null | undefined): string;
  export function isWordArray(obj: any): boolean;
  export function isHexString(str: string): boolean;
  export function stringToHex(str: string): string;
  export function normalizeObject(obj: any): string;
}