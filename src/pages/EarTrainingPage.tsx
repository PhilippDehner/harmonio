import { Link } from 'react-router-dom';
import { unlockAudio } from '../audio/engine';
import BetaBadge from '../components/BetaBadge';
import TileIcon, { TileIconKind } from '../components/TileIcon';

export interface Tile {
  to: string;
  tag?: string;
  /** Feature still being tested */
  beta?: boolean;
  title: string;
  text: string;
  icon: TileIconKind;
}

const TILES: Tile[] = [
  { to: '/intervals', tag: 'Stufe 1', title: 'Intervalle', text: 'Intervalle hören und bestimmen – gleichzeitig, aufwärts oder abwärts.', icon: 'interval' },
  { to: '/chords', tag: 'Stufe 1', title: 'Akkorde', text: 'Dur, Moll, vermindert und übermäßig – auf Wunsch mit Umkehrung.', icon: 'chord' },
  { to: '/dictation/monophonic', tag: 'Stufe 2', title: 'Einstimmiges Diktat', text: 'Eine Melodie hören und notieren.', icon: 'mono' },
  { to: '/dictation/two-part', tag: 'Stufe 2', title: 'Zweistimmiges Diktat', text: 'Zwei Stimmen gleichzeitig hören und notieren.', icon: 'two' },
  { to: '/dictation/four-part', tag: 'Stufe 2', beta: true, title: 'Vierstimmiger Satz', text: 'Akkordfolgen im vierstimmigen Satz notieren.', icon: 'four' },
];

export function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <Link key={t.to} to={t.to} className="tile" onClick={() => void unlockAudio()}>
          <TileIcon kind={t.icon} />
          {t.tag && <span className="tag">{t.tag}</span>}
          <h2>
            {t.title}
            {t.beta && <BetaBadge />}
          </h2>
          <p>{t.text}</p>
        </Link>
      ))}
    </div>
  );
}

export default function EarTrainingPage() {
  return (
    <div className="stack">
      <h1>Gehörbildung</h1>
      <p>Intervalle und Akkorde erkennen, Melodien und vierstimmige Sätze nach Gehör aufschreiben.</p>
      <Tiles tiles={TILES} />
    </div>
  );
}
