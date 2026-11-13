import { Tile, Tiles } from './EarTrainingPage';

const AREAS: Tile[] = [
  {
    to: '/ear-training',
    title: 'Gehörbildung',
    text: 'Intervalle, Akkorde und Diktate – hören, bestimmen und aufschreiben.',
    icon: 'ear',
  },
  {
    to: '/pitch-giving',
    beta: true,
    title: 'Tonangabe',
    text: 'Vierstimmigen Akkord lesen, vom Kammerton A aus die Töne finden und nachsingen – mit Mikrofon.',
    icon: 'pitch',
  },
  {
    to: '/satz',
    alpha: true,
    title: 'Tonsatz',
    text: 'Zu einer Melodie einen vierstimmigen Chor- oder Orgelsatz schreiben – mit automatischer Regelprüfung.',
    icon: 'satz',
  },
];

export default function Home() {
  return (
    <div className="stack">
      <h1>Willkommen bei Harmonio</h1>
      <p>
        Harmonio hilft dir, dein musikalisches Gehör zu trainieren: Intervalle und Akkorde erkennen, Melodien oder
        vierstimmige Sätze nach Gehör aufschreiben, Töne für den Chor angeben und eigene vierstimmige Sätze schreiben. Wähle einen Bereich. Deine
        Einstellungen und Fortschritte werden nur in deinem Browser gespeichert.
      </p>
      <Tiles tiles={AREAS} />
    </div>
  );
}
