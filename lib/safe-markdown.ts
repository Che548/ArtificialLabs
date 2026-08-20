export function isAllowedChatMarkdownLink(url: string) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
