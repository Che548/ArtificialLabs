export function createLocalDocumentEngine(
  _rotation: 0 | 90 | 180 | 270 = 0,
): never {
  throw new Error('DOCUMENT_NATIVE_ONLY');
}
