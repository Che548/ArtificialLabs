'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge, Button } from './ui';

type Platform = 'all' | 'apple' | 'android';

export function detectBetaPlatform(userAgent: string, platform: string, touchPoints: number): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Mac/i.test(platform + userAgent) && touchPoints > 1)) return 'apple';
  return 'all';
}

export function BetaInstall() {
  const [selected, setSelected] = useState<Platform>('all');
  const [desktop, setDesktop] = useState(false);
  const [url, setUrl] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const chosen = useRef(false);
  useEffect(() => {
    const detected = detectBetaPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    if (!chosen.current) setSelected(detected);
    setDesktop(detected === 'all');
    setUrl(new URL(window.location.hostname === 'sfera.brainwaves.engineering' ? '/' : '/beta/', window.location.origin).href);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('Ссылка скопирована');
    } catch {
      setCopyStatus('Не удалось скопировать. Выделите ссылку ниже и скопируйте вручную.');
    }
  }

  return <main className="beta-page">
    <header className="beta-header">
      <a href={url || '/beta/'} className="beta-brand" aria-label="Сфера — установка беты">ArtificialLabs</a>
      <span className="beta-mark" aria-hidden="true"><i /><i /></span>
      <Badge>Тестовая версия</Badge>
    </header>
    <section className="beta-intro">
      <div className="beta-intro-copy">
        <p className="beta-eyebrow">01 / ОТКРЫТОЕ ТЕСТИРОВАНИЕ</p>
        <p className="beta-lead">Здоровье начинается<br />с внимания к себе.</p>
        <h1>сфера<span>.</span></h1>
        <p>Попробуйте бету «сфера.» — установите приложение на телефон за несколько шагов.</p>
      </div>
      <div className="beta-geometry" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
    </section>
    <div className="beta-platforms" role="group" aria-label="Платформа">
      {([['all', 'Все устройства'], ['apple', 'iPhone / iPad'], ['android', 'Android']] as const).map(([value, label]) =>
        <Button key={value} variant={selected === value ? 'primary' : 'secondary'} aria-pressed={selected === value}
          onClick={() => { chosen.current = true; setSelected(value); }}>{label}</Button>)}
    </div>
    <div className="beta-grid">
      <section className="beta-install-panel" hidden={selected === 'android'} aria-labelledby="beta-apple">
        <span className="beta-step-label">02 / APPLE</span><h2 id="beta-apple">iPhone и iPad</h2>
        <p>Установите TestFlight → откройте бету → нажмите «Установить».</p>
        <a className="button button-primary button-md" href="https://testflight.apple.com/join/Aq5UurM8">Открыть в TestFlight <span aria-hidden="true">↗</span></a>
      </section>
      <section className="beta-install-panel" hidden={selected === 'apple'} aria-labelledby="beta-android">
        <span className="beta-step-label">03 / GOOGLE PLAY</span><h2 id="beta-android">Android</h2>
        <p>Вступите в группу, затем присоединитесь к тестированию.</p>
        <div className="beta-actions">
          <a className="button button-secondary button-md" href="https://groups.google.com/g/sfera-brainwaves-beta" target="_blank" rel="noopener noreferrer">1. Вступить в группу <span aria-hidden="true">↗</span></a>
          <a className="button button-primary button-md" href="https://play.google.com/apps/testing/engineering.brainwaves.sfera">2. Установить бету <span aria-hidden="true">↗</span></a>
        </div>
        <p className="beta-note">Используйте один Google-аккаунт в группе и Google Play.</p>
        <details><summary>Не получается установить?</summary><p>Проверка Google может задержать доступ к бете. Если вы участвуете во внутреннем тестировании (internal testing), сначала выйдите из него, затем присоединитесь к закрытой бете.</p></details>
      </section>
    </div>
    {desktop && url && <section className="beta-share" aria-label="Открыть на телефоне">
      <QRCodeSVG value={url} size={176} level="M" marginSize={4} title="QR-код страницы установки беты" />
      <div><span className="beta-step-label">04 / ПРОДОЛЖИТЬ НА ТЕЛЕФОНЕ</span><h2>Один код.<br />Ваше устройство.</h2><p>Наведите камеру на QR-код — покажем инструкцию для вашего устройства.</p>
        <Button onClick={() => void copyLink()}>Скопировать ссылку</Button>
        <a className="beta-share-url" href={url}>{url}</a>
        <p className="beta-copy-status" role="status">{copyStatus}</p>
      </div>
    </section>}
    <footer className="beta-footer">Бета может содержать ошибки. Спасибо, что помогаете нам сделать приложение лучше.</footer>
  </main>;
}
