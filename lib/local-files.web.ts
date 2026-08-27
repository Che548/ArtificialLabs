export async function persistScanImage(uri: string) {
  return uri;
}
export async function persistLabDocument(uri: string) {
  return uri;
}
export async function persistChatAttachment(uri: string) {
  return uri;
}
export async function discardTemporaryScanImage(_uri: string) {}
export async function discardPersistedScanImage(_uri: string) {}
export async function discardPersistedChatAttachment(_uri: string) {}
export async function discardPersistedLabDocument(_uri: string) {}
export async function clearLocalHealthFiles() {}
export async function loadLocalFileDiagnostics() {
  const empty = { count: 0, bytes: 0 };
  return { scanImages: empty, labDocuments: empty, chatAttachments: empty };
}
