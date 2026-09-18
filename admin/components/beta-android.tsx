import React from 'react';

export type AndroidDistribution = {
  mode: 'apk' | 'google-play';
  apk: { url: string; version: string; size: string } | null;
  internalTestUrl: string;
  groupUrl: string;
  playUrl: string;
};

// Temporary APK distribution. Fill only after checking the supplied APK and
// its hosted URL, version, size and signing compatibility. No placeholder URL.
export const androidDistribution: AndroidDistribution = {
  mode: 'apk',
  apk: {
    url: '/beta-assets/downloads/sfera-1.0.0-10.apk',
    version: '1.0.0 (10)',
    size: '613,1 МиБ',
  },
  internalTestUrl: 'https://play.google.com/apps/internaltest/4701718642781511900',
  groupUrl: 'https://groups.google.com/g/sfera-brainwaves-beta',
  playUrl: 'https://play.google.com/apps/testing/engineering.brainwaves.sfera',
};

export function BetaAndroid({ distribution = androidDistribution }: { distribution?: AndroidDistribution }) {
  if (distribution.mode === 'google-play') return <>
    <p>Вступите в группу, затем присоединитесь к тестированию.</p>
    <div className="beta-actions">
      <a className="button button-secondary button-md" href={distribution.groupUrl} target="_blank" rel="noopener noreferrer">1. Вступить в группу <span aria-hidden="true">↗</span></a>
      <a className="button button-primary button-md" href={distribution.playUrl}>2. Установить бету <span aria-hidden="true">↗</span></a>
    </div>
    <p className="beta-note">Используйте один Google-аккаунт в группе и Google Play.</p>
    <details><summary>Не получается установить?</summary><p>Проверка Google может задержать доступ к бете. Если вы участвуете во внутреннем тестировании (internal testing), сначала выйдите из него, затем присоединитесь к закрытой бете.</p></details>
  </>;

  const apk = distribution.apk;
  return <>
    <div className="beta-actions">
      <a className="button button-primary button-md" href={distribution.internalTestUrl} target="_blank" rel="noopener noreferrer">Установить через Google Play <span aria-hidden="true">↗</span></a>
      {apk ? <a className="button button-secondary button-md" href={apk.url} download>Скачать APK</a>
        : <button type="button" className="button button-secondary button-md" disabled aria-describedby="beta-apk-status">Скачать APK</button>}
    </div>
    <p id="beta-apk-status" className="beta-note">{apk ? `Версия ${apk.version} · ${apk.size}` : 'APK готовится к загрузке'}</p>
    <details><summary>Как установить APK?</summary>
      <ol>
        <li>Скачайте файл на Android и откройте его из загрузок браузера.</li>
        <li>Если Android запросит разрешение, разрешите установку из этого браузера и вернитесь к файлу.</li>
        <li>Нажмите «Установить». После установки разрешение для браузера можно выключить.</li>
      </ol>
    </details>
  </>;
}
