import { Suspense, lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import IntervalsPage from './pages/IntervalsPage';
import ChordsPage from './pages/ChordsPage';
import EarTrainingPage from './pages/EarTrainingPage';
import PitchGivingPage from './pages/PitchGivingPage';
import DictationListPage from './pages/DictationListPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';

// Load music notation (VexFlow) only when a dictation or setting is opened
const DictationPage = lazy(() => import('./pages/DictationPage'));
const SatzListPage = lazy(() => import('./pages/SatzListPage'));
const SatzPage = lazy(() => import('./pages/SatzPage'));
const SatzRulesPage = lazy(() => import('./pages/SatzRulesPage'));

const loading = <p>Lade …</p>;

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="intervals" element={<IntervalsPage />} />
          <Route path="ear-training" element={<EarTrainingPage />} />
          <Route path="chords" element={<ChordsPage />} />
          <Route path="pitch-giving" element={<PitchGivingPage />} />
          <Route path="dictation/:kind" element={<DictationListPage />} />
          <Route
            path="dictation/:kind/:id"
            element={
              <Suspense fallback={<p>Lade …</p>}>
                <DictationPage />
              </Suspense>
            }
          />
          <Route path="satz" element={<Suspense fallback={loading}><SatzListPage /></Suspense>} />
          <Route path="satz/lied/:songId" element={<Suspense fallback={loading}><SatzPage /></Suspense>} />
          <Route path="satz/regeln" element={<Suspense fallback={loading}><SatzRulesPage /></Suspense>} />
          <Route path="satz/regeln/:ruleId" element={<Suspense fallback={loading}><SatzRulesPage /></Suspense>} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
