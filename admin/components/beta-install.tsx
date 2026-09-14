'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge, Button } from './ui';
import sferaLogo from '../assets/sfera-logo.png';

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
    setUrl(new URL('/beta/', window.location.origin).href);
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
        <p className="beta-lead">Приложение для внимания<br />к себе и своему здоровью.</p>
        <p className="beta-description">Открытая бета для iPhone и Android.<br />Попробуйте и поделитесь впечатлениями.</p>
        <div className="beta-signs" aria-hidden="true"><i /><i /><i /><i /></div>
        <h1 aria-label="сфера."><img src={sferaLogo.src} width={sferaLogo.width} height={sferaLogo.height} alt="сфера." /></h1>
      </div>
      <svg className="beta-geometry" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
        {Array.from({ length: 16 }, (_, index) => <g key={index} transform={`rotate(${index * 22.5} 320 320)`}>
          <g fill="#fafafa" stroke="#9b9b9b" strokeWidth="0.65" strokeDasharray="11 17">
            <rect x="301" y="28" width="38" height="38" transform="rotate(3 320 47)" />
            <rect x="280" y="60" width="40" height="40" transform="rotate(-9 300 80)" />
            <rect x="323" y="64" width="40" height="40" transform="rotate(9 343 84)" />
            <rect x="299" y="92" width="42" height="42" />
          </g>
        </g>)}
      </svg>
    </section>
    <div className="beta-platforms" role="group" aria-label="Платформа">
      {([['all', 'Все устройства'], ['apple', 'iPhone / iPad'], ['android', 'Android']] as const).map(([value, label]) =>
        <Button key={value} variant={selected === value ? 'primary' : 'secondary'} aria-pressed={selected === value}
          onClick={() => { chosen.current = true; setSelected(value); }}>{label}</Button>)}
    </div>
    <div className="beta-grid">
      <section className="beta-install-panel" hidden={selected === 'android'} aria-labelledby="beta-apple">
        <h2 id="beta-apple">iPhone и iPad</h2>
        <p>Установите TestFlight → откройте бету → нажмите «Установить».</p>
        <a className="button button-primary button-md" href="https://testflight.apple.com/join/Aq5UurM8">Открыть в TestFlight <span aria-hidden="true">↗</span></a>
      </section>
      <section className="beta-install-panel" hidden={selected === 'apple'} aria-labelledby="beta-android">
        <h2 id="beta-android">Android</h2>
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
      <div><p>Наведите камеру на QR-код, чтобы открыть страницу на телефоне.</p>
        <Button onClick={() => void copyLink()}>Скопировать ссылку</Button>
        <a className="beta-share-url" href={url}>{url}</a>
        <p className="beta-copy-status" role="status">{copyStatus}</p>
      </div>
    </section>}
    <footer className="beta-footer"><p>Бета может содержать ошибки. Спасибо, что помогаете нам сделать приложение лучше.</p>
      <a className="beta-license" href="/beta-assets/StackSansNotch-OFL.txt">Лицензия шрифта Stack Sans Notch</a>
    </footer>
  </main>;
}
