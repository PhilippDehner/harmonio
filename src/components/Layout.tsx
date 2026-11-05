import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { GITHUB_URL, LINKEDIN_URL, REPO_URL, SITE_NAME } from '../config';
import { updateSettings, useSettings } from '../storage/store';
import AudioHint from './AudioHint';

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
  const isExercise = location.pathname !== '/' && !['/statistik', '/einstellungen'].includes(location.pathname);
  return (
    <>
      <header className="site-header">
        <NavLink to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
          {SITE_NAME}
        </NavLink>
        <nav aria-label="Hauptnavigation">
          <NavLink to="/statistik" aria-label="Statistik">
            📊 <span className="nav-label">Statistik</span>
          </NavLink>
          <NavLink to="/einstellungen" aria-label="Einstellungen">
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
          Kontakt zum Entwickler: <a href={GITHUB_URL}>GitHub</a> · <a href={LINKEDIN_URL}>LinkedIn</a> ·{' '}
          <a href={REPO_URL}>Quellcode</a>
        </p>
        <p>Klavier-Samples: Salamander Grand Piano von Alexander Holm, Lizenz CC BY 3.0</p>
      </footer>
      {isExercise && <AudioHint />}
    </>
  );
}
