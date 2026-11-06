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

// Load music notation (VexFlow) only when a dictation is opened
const DictationPage = lazy(() => import('./pages/DictationPage'));

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
          <Route path="stats" element={<StatsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
