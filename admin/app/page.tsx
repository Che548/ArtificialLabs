'use client';

import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

type Section =
  | 'dashboard'
  | 'systems'
  | 'lots'
  | 'calibrations'
  | 'validation'
  | 'content'
  | 'monitoring'
  | 'admins'
  | 'audit';
const sections: Array<[Section, string]> = [
  ['dashboard', 'Dashboard'],
  ['systems', 'Test Systems'],
  ['lots', 'Lots'],
  ['calibrations', 'Calibrations'],
  ['validation', 'Validation'],
  ['content', 'Content'],
  ['monitoring', 'Monitoring'],
  ['admins', 'Admin Access'],
  ['audit', 'Audit'],
];
const requestId = () => crypto.randomUUID();
const day = (date: Date) => date.toISOString().slice(0, 10);

function Pager({
  status,
  loadMore,
}: {
  status: string;
  loadMore: (count: number) => void;
}) {
  if (status === 'Exhausted') return null;
  return (
    <button
      className="secondary load-more"
      disabled={status === 'LoadingMore'}
      onClick={() => loadMore(25)}
    >
      {status === 'LoadingMore' ? 'Загрузка…' : 'Показать ещё'}
    </button>
  );
}

function Dashboard() {
  const to = new Date();
  const from = new Date(Date.now() - 29 * 86400000);
  const data = useQuery(api.telemetry.overview, {
    fromDay: day(from),
    toDay: day(to),
    scope: 'global',
    dimension: 'all',
  });
  const monitoring = useQuery(api.monitoringData.latest, {});
  const totals = useMemo(
    () =>
      (data?.buckets ?? []).reduce(
        (sum, row) => ({
          events: sum.events + row.processed,
          errors: sum.errors + row.errors,
          scans: sum.scans + row.successes + row.reviews + row.invalid,
        }),
        { events: 0, errors: 0, scans: 0 },
      ),
    [data],
  );
  const active = (data?.activeUsers ?? []).reduce(
    (sum, row) => sum + row.count,
    0,
  );
  return (
    <>
      <PageTitle
        title="Dashboard"
        subtitle="Только агрегированные технические и продуктовые показатели за 30 дней."
      />
      <div className="metric-grid">
        <Metric label="События" value={totals.events} />
        <Metric label="CV обработки" value={totals.scans} />
        <Metric label="Ошибки" value={totals.errors} />
        <Metric label="Дневные heartbeat" value={active} />
      </div>
      <section className="panel">
        <h2>Сервисы</h2>
        <div className="service-grid">
          {monitoring?.map((row, index) => (
            <div className="service" key={index}>
              <span>{row?.service ?? 'Ожидание проверки'}</span>
              <b className={row?.status ?? 'offline'}>
                {row?.status ?? 'unknown'}
              </b>
              <small>{row?.latencyMs ? `${row.latencyMs} ms` : '—'}</small>
            </div>
          )) ?? <p>Загрузка…</p>}
        </div>
      </section>
    </>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value.toLocaleString('ru-RU')}</strong>
    </div>
  );
}
function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-title">
      <div>
        <p className="eyebrow">ArtificialLabs Admin</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
    </header>
  );
}
function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">Записей пока нет</p>}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return <span className={`status ${value}`}>{value}</span>;
}
function LiveConvexStatus() {
  const [state, setState] = useState<{ status: string; latency?: number }>({
    status: 'checking',
  });
  useEffect(() => {
    const controller = new AbortController();
    const started = performance.now();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetch(`${process.env.NEXT_PUBLIC_CONVEX_URL}/version`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) throw new Error('offline');
        setState({
          status: 'healthy',
          latency: Math.round(performance.now() - started),
        });
      })
      .catch(() => setState({ status: 'offline' }))
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);
  return (
    <div className="service">
      <span>convex-live /version</span>
      <b className={state.status}>{state.status}</b>
      <small>
        {state.latency !== undefined
          ? `${state.latency} ms`
          : 'Прямая проверка'}
      </small>
    </div>
  );
}

function Systems() {
  const list = usePaginatedQuery(
    api.adminCatalog.listTestSystems,
    {},
    { initialNumItems: 25 },
  );
  const save = useMutation(api.adminCatalog.saveTestSystem);
  const [message, setMessage] = useState<string>();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await save({
        key: String(fd.get('key')),
        name: String(fd.get('name')),
        manufacturer: String(fd.get('manufacturer')),
        description: String(fd.get('description')),
        format: String(fd.get('format')),
        testKind: String(fd.get('kind')) as 'pregnancy' | 'ovulation',
        status: String(fd.get('status')) as 'draft' | 'active' | 'archived',
        compatibleAlgorithmVersions: String(fd.get('algorithms'))
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        requestId: requestId(),
      });
      form.reset();
      setMessage('Тест-система сохранена');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  };
  return (
    <>
      <PageTitle
        title="Test Systems"
        subtitle="Каталог поддерживаемых тестов без пользовательских результатов."
      />
      <form className="panel form-grid" onSubmit={submit}>
        <h2>Новая тест-система</h2>
        <label>
          Ключ
          <input name="key" required placeholder="ovulation-strip" />
        </label>
        <label>
          Название
          <input name="name" required />
        </label>
        <label>
          Производитель
          <input name="manufacturer" required />
        </label>
        <label>
          Формат
          <input name="format" required placeholder="strip" />
        </label>
        <label>
          Тип
          <select name="kind">
            <option value="ovulation">Овуляция</option>
            <option value="pregnancy">Беременность</option>
          </select>
        </label>
        <label>
          Статус
          <select name="status">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="wide">
          Версии алгоритма
          <input name="algorithms" placeholder="stripcv-1, stripcv-2" />
        </label>
        <label className="wide">
          Описание
          <textarea name="description" />
        </label>
        <div className="form-actions">
          <button className="primary">Сохранить</button>
          {message && <span className="inline-message">{message}</span>}
        </div>
      </form>
      <section className="panel">
        <Table
          headers={['Ключ', 'Название', 'Производитель', 'Тип', 'Статус']}
          rows={list.results.map((x) => [
            x.key,
            x.name,
            x.manufacturer ?? '—',
            x.testKind,
            <Status value={x.status ?? (x.active ? 'active' : 'draft')} />,
          ])}
        />
        <Pager status={list.status} loadMore={list.loadMore} />
      </section>
    </>
  );
}

function Lots() {
  const list = usePaginatedQuery(
    api.adminCatalog.listLots,
    {},
    { initialNumItems: 25 },
  );
  const systems = usePaginatedQuery(
    api.adminCatalog.listTestSystems,
    {},
    { initialNumItems: 50 },
  );
  const save = useMutation(api.adminCatalog.saveLot);
  const [message, setMessage] = useState<string>();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await save({
        testSystemId: String(fd.get('system')) as Id<'testSystems'>,
        lotNumber: String(fd.get('lot')),
        manufacturedAt: fd.get('manufactured')
          ? Date.parse(String(fd.get('manufactured')))
          : undefined,
        expiresAt: fd.get('expires')
          ? Date.parse(String(fd.get('expires')))
          : undefined,
        status: String(fd.get('status')) as
          'draft' | 'review' | 'active' | 'archived' | 'revoked',
        compatibleAppVersions: String(fd.get('apps'))
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        compatibleAlgorithmVersions: String(fd.get('algorithms'))
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        requestId: requestId(),
      });
      form.reset();
      setMessage('Партия сохранена');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка');
    }
  };
  return (
    <>
      <PageTitle
        title="Lots"
        subtitle="Партии, сроки и совместимость версий приложения/CV."
      />
      <form className="panel form-grid" onSubmit={submit}>
        <h2>Новая партия</h2>
        <label>
          Тест-система
          <select name="system" required>
            {systems.results.map((x) => (
              <option key={x._id} value={x._id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Номер партии
          <input name="lot" required />
        </label>
        <label>
          Производство
          <input name="manufactured" type="date" />
        </label>
        <label>
          Срок годности
          <input name="expires" type="date" />
        </label>
        <label>
          Статус
          <select name="status">
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="active">Active</option>
          </select>
        </label>
        <label>
          Версии приложения
          <input name="apps" placeholder="1.0, 1.1" />
        </label>
        <label className="wide">
          Версии CV
          <input name="algorithms" placeholder="stripcv-1" />
        </label>
        <div className="form-actions">
          <button className="primary">Сохранить</button>
          {message && <span>{message}</span>}
        </div>
      </form>
      <section className="panel">
        <Table
          headers={['Партия', 'Статус', 'Производство', 'Срок', 'Обновлено']}
          rows={list.results.map((x) => [
            x.lotNumber,
            <Status value={x.status} />,
            x.manufacturedAt
              ? new Date(x.manufacturedAt).toLocaleDateString('ru-RU')
              : '—',
            x.expiresAt
              ? new Date(x.expiresAt).toLocaleDateString('ru-RU')
              : '—',
            new Date(x.updatedAt).toLocaleString('ru-RU'),
          ])}
        />
        <Pager status={list.status} loadMore={list.loadMore} />
      </section>
    </>
  );
}

function Calibrations() {
  const list = usePaginatedQuery(
    api.adminCatalog.listCalibrations,
    {},
    { initialNumItems: 25 },
  );
  const systems = usePaginatedQuery(
    api.adminCatalog.listTestSystems,
    {},
    { initialNumItems: 50 },
  );
  const lots = usePaginatedQuery(
    api.adminCatalog.listLots,
    {},
    { initialNumItems: 50 },
  );
  const assets = usePaginatedQuery(
    api.adminCatalog.listAssets,
    {},
    { initialNumItems: 50 },
  );
  const create = useMutation(api.adminCatalog.createCalibration);
  const uploadUrl = useMutation(api.adminCatalog.generateUploadUrl);
  const register = useMutation(api.adminCatalog.registerAsset);
  const setStatus = useMutation(api.adminCatalog.setCalibrationStatus);
  const sign = useMutation(api.adminCatalog.requestCalibrationSigning);
  const rollback = useMutation(api.adminCatalog.rollbackCalibration);
  const [message, setMessage] = useState<string>();
  const upload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get('file');
    if (!(file instanceof File)) return;
    try {
      const url = await uploadUrl({});
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!response.ok) throw new Error('UPLOAD_FAILED');
      const result = (await response.json()) as { storageId: string };
      await register({
        storageId: result.storageId as Id<'_storage'>,
        kind: String(fd.get('kind')) as
          'calibration_json' | 'reference_csv' | 'reference_json' | 'cms_image',
        fileName: file.name,
        mimeType: file.type,
        requestId: requestId(),
      });
      form.reset();
      setMessage('Файл загружен; фоновая проверка запущена');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create({
        testSystemId: String(fd.get('system')) as Id<'testSystems'>,
        lotId: String(fd.get('lot')) as Id<'testLots'>,
        version: String(fd.get('version')),
        algorithmVersion: String(fd.get('algorithm')),
        instructions: String(fd.get('instructions'))
          .split('\n')
          .filter(Boolean),
        assetIds: fd.getAll('assets').map(String) as Id<'adminAssets'>[],
        requestId: requestId(),
      });
      form.reset();
      setMessage('Калибровка создана');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка');
    }
  };
  const action = async (
    id: (typeof list.results)[number]['_id'],
    status: string,
  ) => {
    if (status === 'approved')
      await sign({ calibrationId: id, requestId: requestId() });
    else {
      const next =
        status === 'draft' ? 'review' : status === 'review' ? 'approved' : null;
      if (next)
        await setStatus({
          calibrationId: id,
          status: next,
          requestId: requestId(),
        });
    }
  };
  return (
    <>
      <PageTitle
        title="Calibrations"
        subtitle="Версионируемый lifecycle; опубликованные manifest неизменяемы и подписаны Ed25519."
      />
      <form className="panel inline-form" onSubmit={upload}>
        <label>
          Служебный файл
          <input name="file" type="file" required />
        </label>
        <label>
          Тип
          <select name="kind">
            <option value="calibration_json">Calibration JSON</option>
            <option value="reference_csv">Reference CSV</option>
            <option value="reference_json">Reference JSON</option>
            <option value="cms_image">CMS image</option>
          </select>
        </label>
        <button>Загрузить</button>
      </form>
      <form className="panel form-grid" onSubmit={submit}>
        <h2>Новая калибровка</h2>
        <label>
          Система
          <select name="system" required>
            {systems.results.map((x) => (
              <option key={x._id} value={x._id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Партия
          <select name="lot" required>
            {lots.results.map((x) => (
              <option key={x._id} value={x._id}>
                {x.lotNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Версия
          <input name="version" required />
        </label>
        <label>
          Алгоритм
          <input name="algorithm" required />
        </label>
        <label className="wide">
          Проверенные файлы
          <select name="assets" multiple required>
            {assets.results
              .filter(
                (x) => x.status === 'validated' && x.kind !== 'cms_image',
              )
              .map((x) => (
                <option key={x._id} value={x._id}>
                  {x.fileName} · {x.kind}
                </option>
              ))}
          </select>
        </label>
        <label className="wide">
          Инструкции
          <textarea
            name="instructions"
            placeholder="Одна инструкция на строку"
          />
        </label>
        <div className="form-actions">
          <button className="primary">Создать draft</button>
          {message && <span>{message}</span>}
        </div>
      </form>
      <section className="panel">
        <h2>Файлы</h2>
        <Table
          headers={['Имя', 'Тип', 'Размер', 'Статус']}
          rows={assets.results.map((x) => [
            x.fileName,
            x.kind,
            `${Math.round(x.size / 1024)} KiB`,
            <Status value={x.status} />,
          ])}
        />
      </section>
      <section className="panel">
        <Table
          headers={['Система', 'Версия', 'Алгоритм', 'Состояние', 'Действие']}
          rows={list.results.map((x) => [
            x.testSystemKey,
            x.version,
            x.algorithmVersion,
            <Status value={x.lifecycleStatus ?? x.status} />,
            <div className="row-actions" key={x._id}>
              <button
                disabled={
                  !['draft', 'review', 'approved'].includes(
                    x.lifecycleStatus ?? x.status,
                  )
                }
                onClick={() =>
                  void action(x._id, x.lifecycleStatus ?? x.status).catch(
                    (error) =>
                      setMessage(
                        error instanceof Error ? error.message : 'Ошибка',
                      ),
                  )
                }
              >
                {x.lifecycleStatus === 'approved'
                  ? 'Проверить и подписать'
                  : x.lifecycleStatus === 'review'
                    ? 'Одобрить'
                    : 'На review'}
              </button>
              {x.signature && x.lotId && x.lifecycleStatus !== 'active' && (
                <button
                  onClick={() =>
                    void rollback({
                      lotId: x.lotId!,
                      targetCalibrationId: x._id,
                      requestId: requestId(),
                    }).catch((error) =>
                      setMessage(
                        error instanceof Error ? error.message : 'Ошибка',
                      ),
                    )
                  }
                >
                  Rollback
                </button>
              )}
            </div>,
          ])}
        />
        <Pager status={list.status} loadMore={list.loadMore} />
      </section>
    </>
  );
}

function Validation() {
  const list = usePaginatedQuery(
    api.adminCatalog.listValidations,
    {},
    { initialNumItems: 25 },
  );
  const calibrations = usePaginatedQuery(
    api.adminCatalog.listCalibrations,
    {},
    { initialNumItems: 50 },
  );
  const save = useMutation(api.adminCatalog.saveValidation);
  const [message, setMessage] = useState<string>();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await save({
        calibrationId: String(
          fd.get('calibration'),
        ) as Id<'calibrationVersions'>,
        sampleCount: Number(fd.get('samples')),
        passed: fd.get('passed') === 'yes',
        metrics: [
          {
            key: String(fd.get('metricKey')),
            value: Number(fd.get('metricValue')),
            threshold: fd.get('threshold')
              ? Number(fd.get('threshold'))
              : undefined,
            passed: fd.get('passed') === 'yes',
          },
        ],
        notes: String(fd.get('notes')),
        algorithmVersions: String(fd.get('algorithms'))
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        requestId: requestId(),
      });
      form.reset();
      setMessage('Валидация сохранена');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка');
    }
  };
  return (
    <>
      <PageTitle
        title="Validation"
        subtitle="Результаты технической валидации калибровок и эталонных наборов."
      />
      <form className="panel form-grid" onSubmit={submit}>
        <h2>Новая валидация</h2>
        <label>
          Калибровка
          <select name="calibration" required>
            {calibrations.results.map((x) => (
              <option key={x._id} value={x._id}>
                {x.testSystemKey} · {x.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Образцов
          <input name="samples" type="number" min="0" required />
        </label>
        <label>
          Метрика
          <input name="metricKey" placeholder="accuracy" required />
        </label>
        <label>
          Значение
          <input name="metricValue" type="number" step="any" required />
        </label>
        <label>
          Порог
          <input name="threshold" type="number" step="any" />
        </label>
        <label>
          Итог
          <select name="passed">
            <option value="yes">Passed</option>
            <option value="no">Failed</option>
          </select>
        </label>
        <label className="wide">
          Версии алгоритма
          <input name="algorithms" />
        </label>
        <label className="wide">
          Комментарий
          <textarea name="notes" />
        </label>
        <div className="form-actions">
          <button className="primary">Сохранить</button>
          {message && <span>{message}</span>}
        </div>
      </form>
      <section className="panel">
        <Table
          headers={['Статус', 'Метрики', 'Комментарий', 'Проверено']}
          rows={list.results.map((x) => [
            <Status value={x.passed ? 'approved' : 'rejected'} />,
            x.metrics
              .map((metric) => `${metric.key}: ${metric.value}`)
              .join(', '),
            x.notes ?? '—',
            new Date(x.createdAt).toLocaleString('ru-RU'),
          ])}
        />
        <Pager status={list.status} loadMore={list.loadMore} />
      </section>
    </>
  );
}

function Content() {
  const list = usePaginatedQuery(
    api.adminCatalog.listContent,
    {},
    { initialNumItems: 25 },
  );
  const save = useMutation(api.adminCatalog.saveContent);
  const review = useMutation(api.adminCatalog.reviewContent);
  const publish = useMutation(api.adminCatalog.publishContent);
  const assets = usePaginatedQuery(
    api.adminCatalog.listAssets,
    {},
    { initialNumItems: 50 },
  );
  const [message, setMessage] = useState<string>();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await save({
        key: String(fd.get('key')),
        category: String(fd.get('category')) as
          'article' | 'infographic' | 'term' | 'hint' | 'tooltip',
        placement: String(fd.get('placement')),
        title: String(fd.get('title')),
        markdown: String(fd.get('markdown')),
        imageAssetId: fd.get('imageAssetId')
          ? (String(fd.get('imageAssetId')) as Id<'adminAssets'>)
          : undefined,
        requestId: requestId(),
      });
      form.reset();
      setMessage('Черновик сохранён');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка');
    }
  };
  return (
    <>
      <PageTitle
        title="Content"
        subtitle="Версионируемый Markdown CMS с preview и публикацией."
      />
      <form className="panel form-grid" onSubmit={submit}>
        <h2>Новый материал</h2>
        <label>
          Ключ
          <input name="key" required />
        </label>
        <label>
          Категория
          <select name="category">
            <option value="article">Article</option>
            <option value="hint">Hint</option>
            <option value="tooltip">Tooltip</option>
            <option value="term">Term</option>
            <option value="infographic">Infographic</option>
          </select>
        </label>
        <label>
          Placement
          <input name="placement" required />
        </label>
        <label>
          Заголовок
          <input name="title" required />
        </label>
        <label className="wide">
          Markdown
          <textarea name="markdown" required rows={8} />
        </label>
        <label className="wide">
          Проверенное CMS-изображение
          <select name="imageAssetId" defaultValue="">
            <option value="">Без изображения</option>
            {assets.results
              .filter(
                (asset) =>
                  asset.kind === 'cms_image' && asset.status === 'validated',
              )
              .map((asset) => (
                <option key={asset._id} value={asset._id}>
                  {asset.fileName}
                </option>
              ))}
          </select>
        </label>
        <div className="form-actions">
          <button className="primary">Сохранить draft</button>
          {message && <span>{message}</span>}
        </div>
      </form>
      <section className="panel">
        <Table
          headers={['Ключ', 'Категория', 'Placement', 'Версия', 'Действие']}
          rows={list.results.map((x) => [
            x.key,
            x.category,
            x.placement,
            x.latestVersion
              ? `v${x.latestVersion.version} · ${x.latestVersion.status}`
              : '—',
            x.latestVersion ? (
              <div className="row-actions">
                {x.latestVersion.status === 'draft' && (
                  <button
                    onClick={() =>
                      void review({
                        versionId: x.latestVersion!._id,
                        requestId: requestId(),
                      }).catch((error) =>
                        setMessage(
                          error instanceof Error ? error.message : 'Ошибка',
                        ),
                      )
                    }
                  >
                    На review
                  </button>
                )}
                {x.latestVersion.status === 'review' && (
                  <button
                    onClick={() =>
                      void publish({
                        versionId: x.latestVersion!._id,
                        requestId: requestId(),
                      }).catch((error) =>
                        setMessage(
                          error instanceof Error ? error.message : 'Ошибка',
                        ),
                      )
                    }
                  >
                    Опубликовать
                  </button>
                )}
                {x.latestVersion.status === 'published' && 'Опубликовано'}
                {x.latestVersion.status === 'unpublished' && 'Снято'}
              </div>
            ) : (
              '—'
            ),
          ])}
        />
        <Pager status={list.status} loadMore={list.loadMore} />
      </section>
    </>
  );
}

function Monitoring() {
  const latest = useQuery(api.monitoringData.latest, {});
  const errors = useQuery(api.telemetry.recentErrors, { limit: 25 });
  return (
    <>
      <PageTitle
        title="Monitoring"
        subtitle="Health checks и нормализованные технические ошибки; без PII и медицинских значений."
      />
      <section className="panel">
        <h2>Live status</h2>
        <div className="service-grid">
          <LiveConvexStatus />
        </div>
      </section>
      <SmsTariffBalance />
      <section className="panel">
        <h2>Последние проверки</h2>
        <Table
          headers={['Сервис', 'Статус', 'Latency', 'Время']}
          rows={(latest ?? [])
            .filter(Boolean)
            .map((x) => [
              x!.service,
              <Status value={x!.status} />,
              x!.latencyMs ? `${x!.latencyMs} ms` : '—',
              new Date(x!.checkedAt).toLocaleString('ru-RU'),
            ])}
        />
      </section>
      <section className="panel">
        <h2>Ошибки</h2>
        <Table
          headers={['Код', 'Платформа', 'App', 'CV', 'Время']}
          rows={(errors ?? []).map((x) => [
            x.errorCode ?? 'unknown',
            x.platform,
            x.appVersion,
            x.algorithmVersion ?? '—',
            new Date(x.occurredAt).toLocaleString('ru-RU'),
          ])}
        />
      </section>
    </>
  );
}

const smsBalanceErrors: Record<string, string> = {
  SMS_BALANCE_COOLDOWN: 'Повторная проверка пока недоступна',
  SMS_BALANCE_UNAVAILABLE: 'Модем или оператор сейчас недоступен',
  SMS_BALANCE_TIMEOUT: 'T2 не ответил за отведённое время',
  SMS_BALANCE_UNPARSEABLE: 'Ответ T2 получен, но остаток SMS не распознан',
  SMS_BALANCE_NOT_INCLUDED:
    'T2 не предоставляет остаток SMS для тарифа этой SIM',
};

function SmsTariffBalance() {
  const overview = useQuery(api.monitoringData.smsOverview, {});
  const refresh = useMutation(api.monitoringData.requestSmsTariffRefresh);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const balance = overview?.balance;
  const nextAllowedAt = balance?.nextAllowedAt;
  const checking = balance?.status === 'checking';
  const coolingDown = Boolean(nextAllowedAt && nextAllowedAt > now);
  const disabled = overview === undefined || checking || coolingDown;
  const requestRefresh = async () => {
    setMessage(undefined);
    try {
      const result = await refresh({ requestId: requestId() });
      setMessage(
        result.accepted
          ? 'Запрос отправлен. Результат появится здесь автоматически.'
          : `Следующая проверка доступна ${new Date(result.nextAllowedAt).toLocaleString('ru-RU')}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Не удалось запустить проверку',
      );
    }
  };
  const balanceStatus = !balance || balance.status === 'idle'
    ? 'Остаток ещё не проверялся'
    : balance.status === 'checking'
      ? 'Запрашиваем данные у T2…'
      : balance.status === 'error'
        ? smsBalanceErrors[balance.errorCode ?? ''] ?? 'Не удалось обновить остаток'
        : 'Данные получены от T2';
  return (
    <section className="panel sms-balance-panel">
      <div className="sms-balance-head">
        <div>
          <h2>Остаток SMS по тарифу T2</h2>
          <p className="muted">{balanceStatus}</p>
        </div>
        <button
          className="primary"
          disabled={disabled}
          onClick={() => void requestRefresh()}
        >
          {checking ? 'Проверяем…' : 'Обновить остаток'}
        </button>
      </div>
      <div className="sms-balance-grid">
        <div className="sms-balance-value">
          <span>По тарифу</span>
          <strong>
            {balance?.remainingSms !== undefined
              ? balance.remainingSms.toLocaleString('ru-RU')
              : '—'}
          </strong>
          <small>SMS осталось</small>
        </div>
        <Metric label="Запросы OTP сегодня (UTC)" value={overview?.todayUtc.requested ?? 0} />
        <Metric label="Отправлено gateway" value={overview?.todayUtc.sent ?? 0} />
        <Metric label="Ошибки отправки" value={overview?.todayUtc.failed ?? 0} />
      </div>
      <div className="sms-balance-meta">
        <span>
          Последнее успешное обновление:{' '}
          {balance?.lastSuccessAt
            ? new Date(balance.lastSuccessAt).toLocaleString('ru-RU')
            : 'никогда'}
        </span>
        <span>
          Следующая ручная проверка:{' '}
          {nextAllowedAt && nextAllowedAt > now
            ? new Date(nextAllowedAt).toLocaleString('ru-RU')
            : 'доступна сейчас'}
        </span>
        <span>
          Успешность сегодня:{' '}
          {overview?.todayUtc.successPercent === null || overview === undefined
            ? '—'
            : `${overview.todayUtc.successPercent}%`}
        </span>
      </div>
      <p className="sms-explanation">
        Это остаток пакета SMS у оператора, а не занятое место в памяти модема.
        USSD *255*0# выполняется только по этой кнопке и не чаще одного раза за 24
        часа для всей админки. Остальные показатели рассчитаны из запросов
        Convex и не подтверждают доставку сообщения на телефон.
      </p>
      {message && <p className="muted sms-message">{message}</p>}
    </section>
  );
}

function Admins() {
  const list = usePaginatedQuery(api.admin.list, {}, { initialNumItems: 25 });
  const grant = useMutation(api.admin.grant);
  const revoke = useMutation(api.admin.revoke);
  const [message, setMessage] = useState<string>();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await grant({ email: String(fd.get('email')), requestId: requestId() });
      form.reset();
      setMessage('Права выданы');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка');
    }
  };
  return (
    <>
      <PageTitle
        title="Admin Access"
        subtitle="Единственная роль Admin. Последнего активного администратора отозвать нельзя."
      />
      <form className="panel inline-form" onSubmit={submit}>
        <label>
          Email пользователя
          <input name="email" type="email" required />
        </label>
        <button className="primary">Выдать права</button>
        {message && <span>{message}</span>}
      </form>
      <section className="panel">
        <Table
          headers={['Email', 'Выдано', 'Статус', 'Действие']}
          rows={list.results.map((x) => [
            x.email,
            new Date(x.grantedAt).toLocaleString('ru-RU'),
            x.revokedAt ? (
              <Status value="revoked" />
            ) : (
              <Status value="active" />
            ),
            x.revokedAt ? (
              '—'
            ) : (
              <button
                className="danger"
                onClick={() =>
                  void revoke({ membershipId: x._id, requestId: requestId() })
                }
              >
                Отозвать
              </button>
            ),
          ])}
        />
        <Pager status={list.status} loadMore={list.loadMore} />
      </section>
    </>
  );
}
function Audit() {
  const list = usePaginatedQuery(api.admin.audit, {}, { initialNumItems: 25 });
  return (
    <>
      <PageTitle
        title="Audit"
        subtitle="Неизменяемый журнал административных действий без файлов, токенов и медицинских данных."
      />
      <section className="panel">
        <Table
          headers={['Время', 'Действие', 'Объект', 'Описание', 'Request ID']}
          rows={list.results.map((x) => [
            new Date(x.occurredAt).toLocaleString('ru-RU'),
            x.action,
            x.entityType,
            x.summary,
            x.requestId,
          ])}
        />
        <Pager status={list.status} loadMore={list.loadMore} />
      </section>
    </>
  );
}

export default function AdminPage() {
  const [section, setSection] = useState<Section>('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const { signOut } = useAuthActions();
  const content =
    section === 'dashboard' ? (
      <Dashboard />
    ) : section === 'systems' ? (
      <Systems />
    ) : section === 'lots' ? (
      <Lots />
    ) : section === 'calibrations' ? (
      <Calibrations />
    ) : section === 'validation' ? (
      <Validation />
    ) : section === 'content' ? (
      <Content />
    ) : section === 'monitoring' ? (
      <Monitoring />
    ) : section === 'admins' ? (
      <Admins />
    ) : (
      <Audit />
    );
  return (
    <main className="admin-shell">
      <header className="topbar">
        <button
          className="nav-toggle"
          aria-label="Открыть навигацию"
          onClick={() => setNavOpen((v) => !v)}
        >
          ☰
        </button>
        <div className="brand-mark small">AL</div>
        <strong>ArtificialLabs Admin</strong>
        <span className="connection">● Convex</span>
        <button onClick={() => void signOut()}>Выйти</button>
      </header>
      <div className="admin-frame">
        {navOpen && (
          <button
            className="nav-scrim"
            aria-label="Закрыть навигацию"
            onClick={() => setNavOpen(false)}
          />
        )}
        <nav className={navOpen ? 'open' : ''}>
          {sections.map(([id, label]) => (
            <button
              key={id}
              className={section === id ? 'active' : ''}
              onClick={() => {
                setSection(id);
                setNavOpen(false);
              }}
            >
              {label}
            </button>
          ))}
          <a href="/kit/">UI Kit</a>
        </nav>
        <div className="admin-content">{content}</div>
      </div>
    </main>
  );
}
