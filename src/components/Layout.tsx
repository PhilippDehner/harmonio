import type React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_VERSION, GITHUB_URL, LINKEDIN_URL, REPO_URL, SITE_NAME } from '../config';
import { ThemeSetting, updateSettings, useSettings } from '../storage/store';
import AudioHint from './AudioHint';
import PianoDock from './PianoDock';
import WhatsNew, { ChangelogButton } from './WhatsNew';

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  'aria-hidden': true,
};

const SunIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </svg>
);

const MoonIcon = () => (
  <svg {...iconProps}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);

/** Halb Sonne (links), halb Mond (rechts) */
const SystemIcon = () => (
  <svg {...iconProps}>
    <path d="M12 6.5a5.5 5.5 0 0 0 0 11z" />
    <path d="M12 6.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
    <path d="M12 2v2M12 20v2M2 12h2.5M4.9 4.9l1.6 1.6M4.9 19.1l1.6-1.6" />
  </svg>
);

const THEME_OPTIONS: [ThemeSetting, string, () => React.JSX.Element][] = [
  ['light', 'Heller Modus', SunIcon],
  ['system', 'Farbschema: System', SystemIcon],
  ['dark', 'Dunkler Modus', MoonIcon],
];

function ThemeToggle() {
  const { theme } = useSettings();
  return (
    <div className="segmented theme-switch" role="group" aria-label="Farbschema">
      {THEME_OPTIONS.map(([t, label, Icon]) => (
        <button key={t} aria-pressed={theme === t} aria-label={label} title={label} onClick={() => updateSettings({ theme: t })}>
          <Icon />
        </button>
      ))}
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const isExercise = location.pathname !== '/' && !['/stats', '/settings', '/ear-training'].includes(location.pathname);
  return (
    <>
      <header className="site-header">
        <NavLink to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
          {SITE_NAME}
        </NavLink>
        <nav aria-label="Hauptnavigation">
          <NavLink to="/stats" aria-label="Statistik">
            📊 <span className="nav-label">Statistik</span>
          </NavLink>
          <NavLink to="/settings" aria-label="Einstellungen">
            ⚙ <span className="nav-label">Einstellungen</span>
          </NavLink>
          <ThemeToggle />
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>
          Kontakt zum Entwickler: <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a> · <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">LinkedIn</a> ·{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">Quellcode</a>
        </p>
        <p>
          Klavier-Samples:{' '}
          <a href="https://archive.org/details/SalamanderGrandPianoV3" target="_blank" rel="noopener noreferrer">Salamander Grand Piano</a>,
          Lizenz <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a>
        </p>
        <p className="version">
          Version {APP_VERSION} · <ChangelogButton />
        </p>
      </footer>
      {isExercise && <AudioHint />}
      <PianoDock />
      <WhatsNew />
    </>
  );
}
