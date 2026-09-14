import { View, StyleSheet } from 'react-native';
import { AppText } from '../design-system/components';
import { useAppTheme } from '../lib/theme';
import {
  articleSections,
  parseArticleMarkdown,
  type ArticleBlock,
  type ArticleInline,
} from '../shared/article-markdown';

function Inline({ text, intro }: { text: ArticleInline[]; intro: boolean }) {
  const { colors } = useAppTheme();
  return (
    <>
      {text.map((part, i) =>
        part.bold || part.italic ? (
          <AppText
            key={i}
            color={intro ? colors.text.secondary : colors.text.primary}
            weight={part.bold ? 'semibold' : 'regular'}
            style={[
              intro ? styles.intro : styles.body,
              part.italic ? { fontStyle: 'italic' } : undefined,
            ]}
          >
            {part.text}
          </AppText>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
function Blocks({
  blocks,
  intro = false,
}: {
  blocks: ArticleBlock[];
  intro?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <>
      {blocks.map((block, index) =>
        block.type === 'list' ? (
          <View key={index} style={styles.blocks}>
            {block.items.map((item, i) => (
              <View key={i} style={styles.listItem}>
                <AppText style={styles.body}>
                  {block.ordered ? `${block.start + i}.` : '•'}
                </AppText>
                <View style={styles.listBody}>
                  <Blocks blocks={item} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <AppText
            key={index}
            role={block.type === 'heading' ? 'heading' : undefined}
            style={intro ? styles.intro : styles.body}
            color={intro ? colors.text.secondary : colors.text.primary}
          >
            <Inline text={block.text} intro={intro} />
          </AppText>
        ),
      )}
    </>
  );
}

export function TodayArticleBody({ markdown }: { markdown: string }) {
  const sections = articleSections(parseArticleMarkdown(markdown));
  return (
    <>
      {sections.map((section, index) => (
        <View
          key={index}
          style={section.heading ? styles.section : styles.blocks}
        >
          {section.heading && (
            <AppText
              role="heading"
              weight="semibold"
              style={styles.sectionTitle}
            >
              {section.heading.text.map((part) => part.text).join('')}
            </AppText>
          )}
          <View style={styles.blocks}>
            <Blocks
              blocks={section.blocks}
              intro={!section.heading && index === 0}
            />
          </View>
        </View>
      ))}
    </>
  );
}
const styles = StyleSheet.create({
  intro: { fontSize: 18, lineHeight: 27 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, lineHeight: 26 },
  body: { fontSize: 17, lineHeight: 26 },
  blocks: { gap: 12 },
  listItem: { flexDirection: 'row', gap: 8 },
  listBody: { flex: 1, gap: 8 },
});
