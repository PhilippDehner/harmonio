import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import IntervalsPage from './pages/IntervalsPage';
import ChordsPage from './pages/ChordsPage';
import PitchGivingPage from './pages/PitchGivingPage';
import DictationListPage from './pages/DictationListPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';
import { useSettings } from './storage/store';

// Notensatz (VexFlow) erst laden, wenn ein Diktat geöffnet wird
const DictationPage = lazy(() => import('./pages/DictationPage'));

export default function App() {
  const { theme } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="intervalle" element={<IntervalsPage />} />
          <Route path="akkorde" element={<ChordsPage />} />
          <Route path="tonangabe" element={<PitchGivingPage />} />
          <Route path="diktat/:kind" element={<DictationListPage />} />
          <Route
            path="diktat/:kind/:id"
            element={
              <Suspense fallback={<p>Lade …</p>}>
                <DictationPage />
              </Suspense>
            }
          />
          <Route path="statistik" element={<StatsPage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
