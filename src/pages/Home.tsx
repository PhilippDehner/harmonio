import { Link } from 'react-router-dom';
import { unlockAudio } from '../audio/engine';

const TILES = [
  { to: '/intervalle', tag: 'Stufe 1', title: 'Intervalle', text: 'Intervalle hören und bestimmen – gleichzeitig, aufwärts oder abwärts.' },
  { to: '/akkorde', tag: 'Stufe 1', title: 'Akkorde', text: 'Dur, Moll, vermindert und übermäßig – auf Wunsch mit Umkehrung.' },
  { to: '/diktat/einstimmig', tag: 'Stufe 2', title: 'Einstimmiges Diktat', text: 'Eine Melodie hören und notieren.' },
  { to: '/diktat/zweistimmig', tag: 'Stufe 2', title: 'Zweistimmiges Diktat', text: 'Zwei Stimmen gleichzeitig hören und notieren.' },
  { to: '/diktat/vierstimmig', tag: 'Stufe 2', title: 'Vierstimmiger Satz', text: 'Akkordfolgen im vierstimmigen Satz notieren.' },
];

export default function Home() {
  return (
    <div className="stack">
      <h1>Willkommen bei Harmonio</h1>
      <p>
        Harmonio hilft dir, dein musikalisches Gehör zu trainieren: Intervalle und Akkorde erkennen und Melodien
        oder vierstimmige Sätze nach Gehör aufschreiben. Wähle eine Übung – der Ton wird mit dem ersten Klick
        freigeschaltet. Deine Einstellungen und Fortschritte werden nur in deinem Browser gespeichert.
      </p>
      <div className="tiles">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="tile" onClick={() => void unlockAudio()}>
            <span className="tag">{t.tag}</span>
            <h2>{t.title}</h2>
            <p>{t.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
