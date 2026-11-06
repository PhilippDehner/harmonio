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
    title: 'Tonangabe',
    text: 'Vierstimmigen Akkord lesen, vom Kammerton A aus die Töne finden und nachsingen – mit Mikrofon.',
    icon: 'pitch',
  },
];

export default function Home() {
  return (
    <div className="stack">
      <h1>Willkommen bei Harmonio</h1>
      <p>
        Harmonio hilft dir, dein musikalisches Gehör zu trainieren und Töne für den Chor anzugeben. Wähle einen Bereich –
        der Ton wird mit dem ersten Klick freigeschaltet. Deine Einstellungen und Fortschritte werden nur in deinem
        Browser gespeichert.
      </p>
      <Tiles tiles={AREAS} />
    </div>
  );
}
