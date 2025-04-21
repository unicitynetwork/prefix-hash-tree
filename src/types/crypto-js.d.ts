declare module 'crypto-js' {
  namespace CryptoJS {
    interface WordArray {
      words: number[];
      sigBytes: number;
      toString(encoder?: any): string;
      concat(wordArray: WordArray): WordArray;
      clamp(): void;
      clone(): WordArray;
    }

    interface WordArrayStatic {
      create(words?: number[] | null, sigBytes?: number): WordArray;
      random(nBytes: number): WordArray;
      create(): WordArray;
      isPrototypeOf(obj: any): boolean;
    }

    interface Hash {
      (message: string | WordArray, key?: string | WordArray): WordArray;
      create(message: string | WordArray, key?: string | WordArray): WordArray;
      update(message: string | WordArray): Hash;
      finalize(): WordArray;
    }

    interface Encoder {
      stringify(wordArray: WordArray): string;
      parse(str: string): WordArray;
    }

    interface LibStatic {
      WordArray: WordArrayStatic;
    }

    interface EncodersStatic {
      Hex: Encoder;
      Latin1: Encoder;
      Utf8: Encoder;
      Utf16: Encoder;
      Utf16BE: Encoder;
      Utf16LE: Encoder;
      Base64: Encoder;
    }

    interface IHasher {
      reset(): void;
      update(messageUpdate: WordArray | string): IHasher;
      finalize(messageUpdate?: WordArray | string): WordArray;
    }

    const lib: LibStatic;
    const enc: EncodersStatic;

    function SHA256(message: string | WordArray): WordArray;
    function HmacSHA256(message: string | WordArray, key: string | WordArray): WordArray;
  }
  
  export = CryptoJS;
  export as namespace CryptoJS;
}