import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_VERSION, GITHUB_URL, LINKEDIN_URL, REPO_URL, SITE_NAME } from '../config';
import { updateSettings, useSettings } from '../storage/store';
import AudioHint from './AudioHint';
import WhatsNew, { ChangelogButton } from './WhatsNew';

function ThemeToggle() {
  const { theme } = useSettings();
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  return (
    <button
      className="ghost"
      onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
      aria-label={isDark ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren'}
      title={isDark ? 'Heller Modus' : 'Dunkler Modus'}
    >
      {isDark ? '☀' : '☾'}
    </button>
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
      <WhatsNew />
    </>
  );
}
