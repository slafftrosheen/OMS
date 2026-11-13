declare module 'crypto-js/enc-latin1.js' {
  interface WordArray { words: number[]; sigBytes: number; toString(): string }
  const latin1: { parse(value: string): WordArray };
  export default latin1;
}
declare module 'crypto-js/sha256.js' {
  const sha256: (value: { words: number[]; sigBytes: number }) => { toString(): string };
  export default sha256;
}
