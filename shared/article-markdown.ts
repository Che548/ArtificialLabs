import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { TODAY_MARKDOWN_LIMIT } from './today-content';

// HTML tokens are recognized only to reject them. No HTML, remote embeds, links or executable content. These are the editor's
// supported formatting options, shared by the server, native sheet and preview.
const parser = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
});
export type ArticleInline = { text: string; bold?: boolean; italic?: boolean };
export type ArticleBlock =
  | { type: 'paragraph' | 'heading'; text: ArticleInline[]; level?: number }
  | { type: 'list'; ordered: boolean; start: number; items: ArticleBlock[][] };
export type ArticleSection = {
  heading?: ArticleBlock & { type: 'heading' };
  blocks: ArticleBlock[];
};

function inline(tokens: Token[] = []): ArticleInline[] {
  const result: ArticleInline[] = [];
  let bold = false;
  let italic = false;
  for (const token of tokens) {
    if (token.type === 'strong_open') bold = true;
    else if (token.type === 'strong_close') bold = false;
    else if (token.type === 'em_open') italic = true;
    else if (token.type === 'em_close') italic = false;
    else if (token.type === 'text')
      result.push({ text: token.content, bold, italic });
    else if (token.type === 'softbreak') result.push({ text: ' ' });
    else if (token.type === 'hardbreak') result.push({ text: '\n' });
    else throw new Error('ARTICLE_FORMAT_UNSUPPORTED');
  }
  return result;
}

export function parseArticleMarkdown(markdown: string): ArticleBlock[] {
  if (markdown.length > TODAY_MARKDOWN_LIMIT)
    throw new Error('CONTENT_TOO_LARGE');
  const tokens = parser.parse(markdown, {});
  let cursor = 0;
  function blocks(depth = 0): ArticleBlock[] {
    if (depth > 4) throw new Error('ARTICLE_FORMAT_UNSUPPORTED');
    const result: ArticleBlock[] = [];
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token.type === 'list_item_close') break;
      if (token.type === 'paragraph_open' || token.type === 'heading_open') {
        const isHeading = token.type === 'heading_open';
        // Titles live outside the body; headings use the existing section style.
        if (isHeading && !['h2', 'h3'].includes(token.tag))
          throw new Error('ARTICLE_FORMAT_UNSUPPORTED');
        result.push({
          type: isHeading ? 'heading' : 'paragraph',
          text: inline(tokens[cursor + 1]?.children ?? []),
          ...(isHeading ? { level: Number(token.tag[1]) } : {}),
        });
        cursor += 3;
      } else if (
        token.type === 'bullet_list_open' ||
        token.type === 'ordered_list_open'
      ) {
        const list: ArticleBlock & { type: 'list' } = {
          type: 'list',
          ordered: token.type === 'ordered_list_open',
          start: Number(token.attrGet('start') ?? 1),
          items: [],
        };
        cursor++;
        while (tokens[cursor]?.type === 'list_item_open') {
          cursor++;
          list.items.push(blocks(depth + 1));
          cursor++;
        }
        cursor++;
        result.push(list);
      } else throw new Error('ARTICLE_FORMAT_UNSUPPORTED');
    }
    return result;
  }
  return blocks();
}

export function articleSections(blocks: ArticleBlock[]): ArticleSection[] {
  const sections: ArticleSection[] = [];
  for (const block of blocks) {
    if (block.type === 'heading')
      sections.push({
        heading: block as ArticleSection['heading'],
        blocks: [],
      });
    else {
      if (!sections.length) sections.push({ blocks: [] });
      sections[sections.length - 1].blocks.push(block);
    }
  }
  return sections;
}
