// Minimal parser for Android's uiautomator XML, not arbitrary documents.
export function parseAndroidUiTree(xml) {
  if (!xml.includes('<hierarchy')) throw new Error('Android UI hierarchy unavailable');
  const decode = value => value.replace(/&(?:quot|apos|lt|gt|amp|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named = { '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' };
    if (named[entity]) return named[entity];
    return String.fromCodePoint(entity.startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
  });
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].flatMap(match => {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attributes.bounds ?? '');
    if (!bounds) return [];
    const [left, top, right, bottom] = bounds.slice(1).map(Number);
    if (right <= left || bottom <= top) return [];
    return [{ ...attributes, left, top, right, bottom }];
  });
}

export function matchingAndroidNode(nodes, pattern) {
  return nodes.find(node => node.enabled !== 'false' &&
    [node.text, node['content-desc'], node['resource-id']].some(value => value && pattern.test(value)));
}
