'use client';
import { useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { parseArticleMarkdown } from '../../shared/article-markdown';
import { TODAY_MARKDOWN_LIMIT } from '../../shared/today-content';

export function ArticleEditor({
  initialValue,
  onChange,
  disabled,
}: {
  initialValue: string;
  onChange: (markdown: string) => void;
  disabled: boolean;
}) {
  const [source, setSource] = useState(false);
  const [markdown, setMarkdown] = useState(initialValue);
  const [error, setError] = useState('');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
      }),
      Markdown,
    ],
    content: initialValue,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        'aria-label': 'Текст статьи',
        role: 'textbox',
        'aria-multiline': 'true',
        class: 'article-prose',
      },
    },
    onUpdate: ({ editor }) => {
      const value = editor.getMarkdown();
      setMarkdown(value);
      onChange(value);
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      const headings: { label: string; position: number }[] = [];
      editor?.state.doc.descendants((node, position) => {
        if (node.type.name === 'heading')
          headings.push({ label: node.textContent, position: position + 1 });
      });
      return {
        bold: editor?.isActive('bold'),
        italic: editor?.isActive('italic'),
        bullet: editor?.isActive('bulletList'),
        ordered: editor?.isActive('orderedList'),
        level: editor?.isActive('heading', { level: 2 })
          ? '2'
          : editor?.isActive('heading', { level: 3 })
            ? '3'
            : 'paragraph',
        headings,
      };
    },
  });
  function validate(value: string) {
    try {
      parseArticleMarkdown(value);
      setError('');
      return true;
    } catch {
      setError(
        'Поддерживаются текст, заголовки ## и ###, жирный, курсив и списки. Картинка выбирается отдельно. Максимум 20 000 знаков.',
      );
      return false;
    }
  }
  function switchMode() {
    if (source) {
      if (!validate(markdown)) return;
      editor?.commands.setContent(markdown, { contentType: 'markdown' });
    }
    setSource(!source);
  }
  return (
    <div className="article-editor">
      <div
        className="article-toolbar"
        role="toolbar"
        aria-label="Форматирование статьи"
      >
        {!source && (
          <>
            <select
              aria-label="Стиль текста"
              value={state?.level ?? 'paragraph'}
              disabled={disabled || !editor}
              onChange={(e) => {
                if (e.target.value === 'paragraph')
                  editor?.chain().focus().setParagraph().run();
                else
                  editor
                    ?.chain()
                    .focus()
                    .setHeading({ level: Number(e.target.value) as 2 | 3 })
                    .run();
              }}
            >
              <option value="paragraph">Обычный текст</option>
              <option value="2">Заголовок раздела</option>
              <option value="3">Подзаголовок</option>
            </select>
            <button
              type="button"
              aria-label="Жирный"
              aria-pressed={state?.bold ?? false}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <b>Ж</b>
            </button>
            <button
              type="button"
              aria-label="Курсив"
              aria-pressed={state?.italic ?? false}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <i>К</i>
            </button>
            <button
              type="button"
              aria-pressed={state?.bullet ?? false}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              • Список
            </button>
            <button
              type="button"
              aria-pressed={state?.ordered ?? false}
              disabled={disabled}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              1. Список
            </button>
            <button
              type="button"
              aria-label="Отменить ввод"
              disabled={disabled}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              ↶
            </button>
            <button
              type="button"
              aria-label="Повторить ввод"
              disabled={disabled}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              ↷
            </button>
          </>
        )}
        <button type="button" onClick={switchMode} disabled={disabled}>
          {source ? 'Визуальный редактор' : 'Исходник .md'}
        </button>
        <label className="article-import">
          Открыть .md
          <input
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > TODAY_MARKDOWN_LIMIT * 4) {
                setError('Файл слишком большой. Максимум 20 000 знаков.');
                return;
              }
              const value = await file.text();
              if (!validate(value)) return;
              setMarkdown(value);
              onChange(value);
              editor?.commands.setContent(value, { contentType: 'markdown' });
            }}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = 'article.md';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Скачать .md
        </button>
      </div>
      {!source && Boolean(state?.headings.length) && (
        <select
          aria-label="Оглавление"
          value=""
          onChange={(e) =>
            editor
              ?.chain()
              .focus()
              .setTextSelection(Number(e.target.value))
              .scrollIntoView()
              .run()
          }
        >
          <option value="">Перейти к разделу…</option>
          {state?.headings.map((heading) => (
            <option key={heading.position} value={heading.position}>
              {heading.label}
            </option>
          ))}
        </select>
      )}
      {source ? (
        <textarea
          aria-label="Исходник Markdown"
          value={markdown}
          maxLength={TODAY_MARKDOWN_LIMIT}
          rows={16}
          disabled={disabled}
          onChange={(e) => {
            setMarkdown(e.target.value);
            onChange(e.target.value);
            validate(e.target.value);
          }}
        />
      ) : (
        <EditorContent editor={editor} inert={disabled} />
      )}
      {error && (
        <p className="article-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
