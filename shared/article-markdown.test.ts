import assert from 'node:assert/strict';
import test from 'node:test';
import { articleSections, parseArticleMarkdown } from './article-markdown';
import {
  defaultTodayArticles,
  defaultArticleMarkdown,
  todayCardTitle,
} from './today-content';

test('bundled article Markdown preserves exact original introduction and section copy', () => {
  for (const article of defaultTodayArticles) {
    const sections = articleSections(
      parseArticleMarkdown(defaultArticleMarkdown(article)),
    );
    const first = sections[0].blocks[0];
    assert.equal(
      first.type !== 'list' && first.text.map((part) => part.text).join(''),
      article.intro,
    );
    assert.deepEqual(
      sections
        .slice(1)
        .map((section) => ({
          title: section.heading!.text.map((part) => part.text).join(''),
          text: section.blocks
            .map((block) =>
              block.type === 'paragraph'
                ? block.text.map((part) => part.text).join('')
                : '',
            )
            .join('\n'),
        })),
      article.sections,
    );
  }
});
test('formatting, multiline paragraphs and nested lists retain their structure', () => {
  const blocks = parseArticleMarkdown(
    'First line\ncontinued.\n\n## Heading\n\n**Bold** and *italic*\\\nNext line\n\n3. Ordered\n4. Another\n   - Nested',
  );
  assert.equal(
    blocks[0].type === 'paragraph' &&
      blocks[0].text.map((part) => part.text).join(''),
    'First line continued.',
  );
  assert.equal(
    blocks[2].type === 'paragraph' &&
      blocks[2].text.some((part) => part.bold && part.text === 'Bold'),
    true,
  );
  assert.equal(
    blocks[2].type === 'paragraph' &&
      blocks[2].text.some((part) => part.text === '\n'),
    true,
  );
  assert.equal(blocks[3].type === 'list' && blocks[3].start, 3);
  assert.equal(blocks[3].type === 'list' && blocks[3].items[1][1].type, 'list');
});
test('raw HTML and embedded media cannot enter native or browser article rendering', () => {
  for (const markdown of [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'Text <b>html</b>',
    '![cover](https://example.test/image)',
    '[remote](https://example.test)',
    '```\ncode\n```',
  ])
    assert.throws(
      () => parseArticleMarkdown(markdown),
      /ARTICLE_FORMAT_UNSUPPORTED/,
    );
  assert.throws(
    () => parseArticleMarkdown('a'.repeat(20_001)),
    /CONTENT_TOO_LARGE/,
  );
  assert.doesNotThrow(() => parseArticleMarkdown('Обычный текст: 2 < 3.'));
});
test('care plan caption remains dynamic without overriding the chosen title', () => {
  assert.equal(
    todayCardTitle({ cardTitle: 'Мой\nплан', cardKind: 'care-plan' }, 7),
    'Мой план\nПунктов: 7',
  );
  assert.equal(
    todayCardTitle({ cardTitle: 'Мой план', cardKind: 'care-plan' }, 0),
    'Мой план\nпока пуст',
  );
  assert.equal(
    todayCardTitle({ cardTitle: 'Моя\nкарточка', cardKind: 'article' }, 7),
    'Моя\nкарточка',
  );
});
