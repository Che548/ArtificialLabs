'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { ArticleEditor } from './article-editor';
import {
  articleSections,
  parseArticleMarkdown,
  type ArticleBlock,
  type ArticleInline,
} from '../../shared/article-markdown';
import {
  todayCardTitle,
  type TodayCardKind,
  type TodayCoverPreset,
} from '../../shared/today-content';

type Row = FunctionReturnType<typeof api.todayContent.list>['page'][number];
type Draft = {
  itemId?: Id<'contentItems'>;
  expectedVersion?: number;
  title: string;
  cardTitle: string;
  cardKind: TodayCardKind;
  coverPreset: TodayCoverPreset;
  imageAssetId?: Id<'adminAssets'>;
  sortOrder: number;
  markdown: string;
};
const blank = (): Draft => ({
  title: '',
  cardTitle: '',
  cardKind: 'article',
  coverPreset: 'nutrition',
  sortOrder: 10,
  markdown: '',
});
const messages: Record<string, string> = {
  ADMIN_REQUIRED: 'Недостаточно прав администратора.',
  UNAUTHENTICATED: 'Войдите в админку снова.',
  CONTENT_CONFLICT:
    'Статья уже изменена в другом окне. Откройте её заново, чтобы не перезаписать изменения.',
  ASSET_NOT_VALIDATED:
    'Обложка ещё не прошла проверку. Выберите готовую картинку или дождитесь проверки.',
  INVALID_ARTICLE_FIELDS:
    'Заполните название, заголовок карточки и текст. Порядок — целое число от 0 до 999.',
  ARTICLE_FORMAT_UNSUPPORTED:
    'В тексте поддерживаются абзацы, заголовки ## и ###, жирный, курсив и списки.',
  CONTENT_TOO_LARGE: 'Текст должен быть не длиннее 20 000 знаков.',
  TODAY_LIMIT:
    'На «Сегодня» доступно до 40 статей. Удалите ненужную, чтобы добавить новую.',
  CONTENT_NOT_FOUND: 'Статья удалена. Обновите список.',
};
function errorMessage(error: unknown) {
  return (
    Object.entries(messages).find(([key]) =>
      String(error).includes(key),
    )?.[1] ??
    'Не удалось сохранить. Проверьте подключение и повторите — текст остался в редакторе.'
  );
}
function Inline({ text }: { text: ArticleInline[] }) {
  return (
    <>
      {text.map((part, i) => (
        <span key={i}>
          {part.bold ? (
            <strong>{part.italic ? <em>{part.text}</em> : part.text}</strong>
          ) : part.italic ? (
            <em>{part.text}</em>
          ) : (
            part.text
          )}
        </span>
      ))}
    </>
  );
}
function Blocks({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'list') {
          const children = block.items.map((item, n) => (
            <li key={n}>
              <Blocks blocks={item} />
            </li>
          ));
          return block.ordered ? (
            <ol key={i} start={block.start}>
              {children}
            </ol>
          ) : (
            <ul key={i}>{children}</ul>
          );
        }
        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </>
  );
}
function ArticlePreview({ draft, cover }: { draft: Draft; cover: string }) {
  let sections: ReturnType<typeof articleSections> = [];
  try {
    sections = articleSections(parseArticleMarkdown(draft.markdown));
  } catch {
    /* Source mode can be incomplete while typing. */
  }
  return (
    <aside className="article-preview">
      <h3>В приложении</h3>
      <div
        className="today-card-preview"
        style={{
          backgroundImage: `linear-gradient(transparent,rgba(0,0,0,.32)),url(${JSON.stringify(cover)})`,
        }}
      >
        <span className="today-card-arrow">↗</span>
        <p>{todayCardTitle(draft, 7) || 'Заголовок карточки'}</p>
      </div>
      {draft.cardKind === 'care-plan' && (
        <p className="muted">
          В примере — 7 пунктов. В приложении число берётся из личного плана.
        </p>
      )}
      <div className="today-sheet-preview">
        <div className="today-sheet-bar">
          Статья <span>×</span>
        </div>
        <div className="today-sheet-content">
          <h1>{draft.title || 'Название статьи'}</h1>
          {sections.map((section, i) => (
            <section
              key={i}
              className={!section.heading && i === 0 ? 'article-intro' : ''}
            >
              {section.heading && (
                <h2>
                  <Inline text={section.heading.text} />
                </h2>
              )}
              <Blocks blocks={section.blocks} />
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function TodayContentManager() {
  const status = useQuery(api.todayContent.status, {});
  const list = usePaginatedQuery(
    api.todayContent.list,
    {},
    { initialNumItems: 20 },
  );
  const covers = usePaginatedQuery(
    api.todayContent.covers,
    {},
    { initialNumItems: 20 },
  );
  const initialize = useMutation(api.todayContent.initialize);
  const save = useMutation(api.todayContent.save);
  const remove = useMutation(api.todayContent.remove);
  const generateUploadUrl = useMutation(api.adminCatalog.generateUploadUrl);
  const registerAsset = useMutation(api.adminCatalog.registerAsset);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    row: Row;
    delete: boolean;
  } | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'start' });
  }, [editorKey]);
  useEffect(() => {
    if (confirmation) confirmRef.current?.showModal();
  }, [confirmation]);
  const selectedCover = useQuery(
    api.todayContent.coverStatus,
    draft?.imageAssetId ? { id: draft.imageAssetId } : 'skip',
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const guardNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('nav button, nav a') &&
        !window.confirm(
          'В редакторе есть несохранённые изменения. Уйти без сохранения?',
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardNavigation, true);
    };
  }, [dirty]);
  function open(row?: Row) {
    if (
      dirty &&
      !window.confirm('В редакторе есть несохранённые изменения. Отбросить их?')
    )
      return;
    const version = row?.latestVersion;
    setDraft(
      row && version
        ? {
            itemId: row._id,
            expectedVersion: version.version,
            title: version.title,
            cardTitle: version.cardTitle ?? version.title,
            cardKind: version.cardKind ?? 'article',
            coverPreset: version.coverPreset ?? 'nutrition',
            imageAssetId: version.imageAssetId,
            sortOrder: version.sortOrder ?? 10,
            markdown: version.markdown,
          }
        : blank(),
    );
    setEditorKey((key) => key + 1);
    setDirty(false);
    setError('');
    setMessage('');
  }
  function change(patch: Partial<Draft>) {
    setDraft((value) => (value ? { ...value, ...patch } : value));
    setDirty(true);
  }
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy) return;
    const publish =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
      'publish';
    await act(
      async () => {
        parseArticleMarkdown(draft.markdown);
        const result = await save({
          ...draft,
          publish,
          requestId: crypto.randomUUID(),
        });
        setDraft((value) =>
          value
            ? {
                ...value,
                itemId: result.itemId,
                expectedVersion: result.version,
              }
            : value,
        );
        setDirty(false);
      },
      publish
        ? 'Опубликовано. Статья появится на «Сегодня» после обновления данных в приложении.'
        : 'Черновик сохранён. Опубликованная статья в приложении не изменилась.',
    );
  }
  const coverPending = Boolean(
    draft?.imageAssetId && selectedCover?.status !== 'validated',
  );
  return (
    <>
      <div className="article-manager-heading">
        <div>
          <h2>Статьи на «Сегодня»</h2>
          <p className="muted">
            Карточки для режимов цикла и беременности. Сначала отредактируйте
            статью, затем опубликуйте.
          </p>
        </div>
        {status?.initialized && (
          <button className="primary" disabled={busy} onClick={() => open()}>
            Новая статья
          </button>
        )}
      </div>
      {status === undefined ? (
        <p role="status">Загрузка статей…</p>
      ) : (
        !status.initialized && (
          <section className="panel">
            <p>
              Подключите две текущие статьи к редактору. Их текст и оформление
              сохранятся.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void act(
                  () => initialize({ requestId: crypto.randomUUID() }),
                  'Текущие статьи готовы к редактированию.',
                )
              }
            >
              Включить управление статьями
            </button>
          </section>
        )
      )}
      {error && (
        <p className="article-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="article-message" role="status">
          {message}
        </p>
      )}
      {draft && (
        <div className="article-workspace">
          <form ref={formRef} className="panel article-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              <div className="article-form-heading">
                <h3>
                  {draft.itemId ? 'Редактирование статьи' : 'Новая статья'}
                </h3>
                <span className="muted">
                  {dirty ? 'Есть изменения' : 'Сохранено'}
                </span>
              </div>
              <label>
                Название статьи
                <input
                  value={draft.title}
                  required
                  maxLength={180}
                  onChange={(e) => change({ title: e.target.value })}
                />
              </label>
              <div className="article-fields">
                <label>
                  Заголовок карточки
                  <textarea
                    value={draft.cardTitle}
                    required
                    maxLength={90}
                    rows={3}
                    onChange={(e) => change({ cardTitle: e.target.value })}
                  />
                </label>
                <div>
                  <label>
                    Подпись на карточке
                    <select
                      value={draft.cardKind}
                      onChange={(e) =>
                        change({ cardKind: e.target.value as TodayCardKind })
                      }
                    >
                      <option value="article">Только заголовок</option>
                      <option value="care-plan">
                        Добавить число пунктов плана
                      </option>
                    </select>
                  </label>
                  <label>
                    Порядок карточки
                    <input
                      type="number"
                      required
                      min={0}
                      max={999}
                      step={1}
                      value={draft.sortOrder}
                      onChange={(e) =>
                        change({ sortOrder: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
              </div>
              <label>
                Обложка
                <select
                  value={draft.imageAssetId ?? draft.coverPreset}
                  onChange={(e) => {
                    if (
                      e.target.value === 'nutrition' ||
                      e.target.value === 'care-plan'
                    )
                      change({
                        coverPreset: e.target.value,
                        imageAssetId: undefined,
                      });
                    else
                      change({
                        imageAssetId: e.target.value as Id<'adminAssets'>,
                      });
                  }}
                >
                  <option value="nutrition">Текущая: питание</option>
                  <option value="care-plan">Текущая: план наблюдения</option>
                  {draft.imageAssetId &&
                    !covers.results.some(
                      (cover) => cover.id === draft.imageAssetId,
                    ) && (
                      <option value={draft.imageAssetId}>
                        {selectedCover?.name ?? 'Выбранная обложка'}
                      </option>
                    )}
                  {covers.results.map((cover) => (
                    <option key={cover.id} value={cover.id}>
                      {cover.name}
                    </option>
                  ))}
                </select>
              </label>
              {covers.status !== 'Exhausted' && (
                <button
                  type="button"
                  disabled={covers.status === 'LoadingMore'}
                  onClick={() => covers.loadMore(20)}
                >
                  Ещё обложки
                </button>
              )}
              <label>
                Загрузить картинку
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (
                      !['image/png', 'image/jpeg', 'image/webp'].includes(
                        file.type,
                      ) ||
                      file.size > 10 * 1024 * 1024
                    ) {
                      setError('Выберите PNG, JPEG или WebP до 10 МБ.');
                      return;
                    }
                    void act(async () => {
                      const url = await generateUploadUrl({});
                      const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': file.type },
                        body: file,
                      });
                      if (!response.ok) throw new Error('UPLOAD_FAILED');
                      const { storageId } = await response.json();
                      const id = await registerAsset({
                        storageId,
                        kind: 'cms_image',
                        fileName: file.name,
                        mimeType: file.type,
                        requestId: crypto.randomUUID(),
                      });
                      change({ imageAssetId: id });
                    }, 'Картинка загружена и проверяется.');
                  }}
                />
              </label>
              {coverPending && (
                <p role="status" className="muted">
                  {selectedCover?.status === 'rejected'
                    ? 'Картинка не прошла проверку. Выберите другую.'
                    : 'Проверяем картинку…'}
                </p>
              )}
              <p className="muted">
                Первый абзац — вступление. Заголовки разделов формируют
                оглавление редактора.
              </p>
              <ArticleEditor
                key={editorKey}
                initialValue={draft.markdown}
                disabled={busy}
                onChange={(markdown) => change({ markdown })}
              />
              <div className="article-form-actions">
                <button type="submit" value="draft" disabled={coverPending}>
                  Сохранить черновик
                </button>
                <button
                  type="submit"
                  value="publish"
                  className="primary"
                  disabled={coverPending}
                >
                  Опубликовать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm('Отбросить несохранённые изменения?')
                    ) {
                      setDraft(null);
                      setDirty(false);
                    }
                  }}
                >
                  Закрыть редактор
                </button>
              </div>
            </fieldset>
          </form>
          <ArticlePreview
            draft={draft}
            cover={selectedCover?.url ?? `/today/${draft.coverPreset}.png`}
          />
        </div>
      )}
      {status?.initialized && (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Статья</th>
                  <th>Порядок</th>
                  <th>В приложении</th>
                  <th>Последняя версия</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {list.results.map((row) => (
                  <tr key={row._id}>
                    <td>{row.latestVersion?.title ?? row.key}</td>
                    <td>
                      {row.publishedVersion?.sortOrder ??
                        row.latestVersion?.sortOrder ??
                        0}
                    </td>
                    <td>
                      {row.currentPublishedVersionId
                        ? 'Опубликована'
                        : 'Скрыта'}
                    </td>
                    <td>
                      {row.latestVersion
                        ? `v${row.latestVersion.version} · ${row.latestVersion.status === 'draft' ? 'черновик' : row.latestVersion.status === 'published' ? 'опубликована' : 'снята с публикации'}`
                        : '—'}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button disabled={busy} onClick={() => open(row)}>
                          Редактировать
                        </button>
                        {row.currentPublishedVersionId && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              setConfirmation({ row, delete: false })
                            }
                          >
                            Снять с публикации
                          </button>
                        )}
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => setConfirmation({ row, delete: true })}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.status === 'LoadingFirstPage' ? (
            <p role="status">Загрузка…</p>
          ) : (
            !list.results.length && (
              <p className="empty">Статей пока нет. Добавьте новую.</p>
            )
          )}
          {list.status !== 'Exhausted' && (
            <button
              disabled={list.status === 'LoadingMore'}
              onClick={() => list.loadMore(20)}
            >
              Ещё статьи
            </button>
          )}
        </section>
      )}
      {confirmation && (
        <dialog
          ref={confirmRef}
          className="article-confirm"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) setConfirmation(null);
          }}
          aria-label={
            confirmation.delete ? 'Удаление статьи' : 'Снятие с публикации'
          }
        >
          <div className="panel">
            <h3>
              {confirmation.delete
                ? 'Удалить статью?'
                : 'Снять статью с публикации?'}
            </h3>
            <p>{confirmation.row.latestVersion?.title}</p>
            <p className="muted">
              Карточка исчезнет с «Сегодня» после получения приложением
              обновления.
              {confirmation.delete
                ? ''
                : ' Текст останется в редакторе, его можно опубликовать снова.'}
            </p>
            <div className="row-actions">
              <button
                autoFocus
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Отмена
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void act(
                    async () => {
                      await remove({
                        itemId: confirmation.row._id,
                        expectedUpdatedAt: confirmation.row.updatedAt,
                        delete: confirmation.delete,
                        requestId: crypto.randomUUID(),
                      });
                      if (draft?.itemId === confirmation.row._id) {
                        setDraft(null);
                        setDirty(false);
                      }
                      setConfirmation(null);
                    },
                    confirmation.delete
                      ? 'Статья удалена.'
                      : 'Статья снята с публикации.',
                  )
                }
              >
                Подтвердить
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        </dialog>
      )}
    </>
  );
}
