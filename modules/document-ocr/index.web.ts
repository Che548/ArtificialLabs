export function createLocalDocumentEngine(
  _rotation: 0 | 90 | 180 | 270 = 0,
): never {
  throw new Error('DOCUMENT_NATIVE_ONLY');
}

export async function renderDocumentPage(
  _uri: string,
  _page: number,
  _rotation: number,
): Promise<{ image: string; pages: number }> {
  throw new Error('DOCUMENT_NATIVE_ONLY');
}

export async function inspectLocalDocument(
  _uri: string,
): Promise<{ mime: string; bytes: number; pages: number }> {
  throw new Error('DOCUMENT_NATIVE_ONLY');
}
