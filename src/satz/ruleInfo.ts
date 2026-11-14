import { RuleId } from './rules';

export interface RuleExample {
  /** S, A, T, B in compact notation (see notation.ts), C major, 4/4 */
  voices: [string, string, string, string];
  caption: string;
}

export interface RuleInfo {
  id: RuleId;
  title: string;
  text: string;
  wrong: RuleExample;
  right: RuleExample;
  /** Example is only a section: ignore rules about the ending */
  fragment: boolean;
}

/**
 * Rule explanations with examples (C major). Based on the draft
 * "Tonsatz – Regelerklärungen"; the examples are complete four-part chords.
 */
export const RULE_INFO: RuleInfo[] = [
  {
    id: 'parallel-fifths',
    title: 'Quintparallelen',
    text:
      'Zwei Stimmen dürfen nicht im Abstand einer reinen Quinte (oder Duodezime) parallel zum nächsten Ton weiterziehen. Die beiden Stimmen verschmelzen klanglich und verlieren ihre Selbstständigkeit. Auch Quinten in Gegenbewegung (Quinte → Duodezime) gelten als Fehler.',
    wrong: {
      voices: ['E5/h D5/h', 'G4/h A4/h', 'C4/h F4/h', 'C3/h D3/h'],
      caption: 'C-Dur → d-Moll: Bass c → d, Alt g′ → a′. Bass und Alt bewegen sich beide in Quinten (Duodezimen) aufwärts.',
    },
    right: {
      voices: ['E5/h D5/h', 'G4/h F4/h', 'C4/h A3/h', 'C3/h D3/h'],
      caption: 'C-Dur → d-Moll: Bass c → d, Alt g′ → f′ (Gegenbewegung zum Bass).',
    },
    fragment: true,
  },
  {
    id: 'parallel-octaves',
    title: 'Oktavparallelen',
    text:
      'Zwei Stimmen dürfen nicht im Abstand einer Oktave (oder Prime/Doppeloktave) parallel weiterziehen. Sonst klingen sie wie eine einzige Stimme, und der Satz wird faktisch dreistimmig. Auch Oktaven in Gegenbewegung gelten als Fehler.',
    wrong: {
      voices: ['E5/h A4/h', 'G4/h F4/h', 'C4/h D4/h', 'C3/h D3/h'],
      caption: 'C-Dur → d-Moll: Bass c → d, Tenor c′ → d′ (beide Stimmen ziehen in Oktaven parallel aufwärts).',
    },
    right: {
      voices: ['E5/h A4/h', 'G4/h F4/h', 'C4/h A3/h', 'C3/h D3/h'],
      caption: 'Bass c → d, Tenor c′ → a (Gegenbewegung).',
    },
    fragment: true,
  },
  {
    id: 'hidden',
    title: 'Verdeckte Quinten und Oktaven',
    text:
      'Bewegen sich Sopran und Bass in gleicher Richtung in eine Quinte oder Oktave hinein, entsteht eine verdeckte Parallele. Sie ist erlaubt, wenn der Sopran schrittweise geht; springt der Sopran, gilt sie als Fehler.',
    wrong: {
      voices: ['E5/h G4/h', 'C5/h D4/h', 'G4/h B3/h', 'C3/h G2/h'],
      caption: 'C-Dur → G-Dur. Bass c → G, Sopran e″ → g′ (Sprung abwärts in die Oktave).',
    },
    right: {
      voices: ['E5/h D5/h', 'G4/h G4/h', 'C4/h B3/h', 'C3/h G2/h'],
      caption: 'Bass c → G, Sopran e″ → d″ (Schritt, die Quinte über dem Bass ist dann unproblematisch).',
    },
    fragment: true,
  },
  {
    id: 'crossing',
    title: 'Stimmkreuzung',
    text:
      'Eine tiefere Stimme darf nicht über eine höhere Stimme steigen (z. B. Alt über Sopran). Das gilt im Orgelsatz und vorerst auch im Chorsatz. Gleiche Töne (Einklang) sind erlaubt.',
    wrong: {
      voices: ['E4/h G4/h', 'G4/h D4/h', 'C4/h D4/h', 'C3/h B2/h'],
      caption: 'C-Dur → G-Dur (Sextakkord). Im ersten Akkord liegt der Alt (g′, Hals nach unten) über dem Sopran (e′, Hals nach oben).',
    },
    right: {
      voices: ['G4/h G4/h', 'E4/h D4/h', 'C4/h G3/h', 'C3/h B2/h'],
      caption: 'C-Dur → G-Dur (Sextakkord). Sopran g′ → g′, Alt e′ → d′ (Alt unter dem Sopran).',
    },
    fragment: true,
  },
  {
    id: 'spacing',
    title: 'Abstand zwischen den Stimmen',
    text:
      'Zwischen Sopran und Alt sowie zwischen Alt und Tenor darf höchstens eine Oktave liegen. Zwischen Tenor und Bass gibt es keine Beschränkung. So bleibt der Klang in den Oberstimmen geschlossen.',
    wrong: { voices: ['E5/w', 'C4/w', 'G3/w', 'C3/w'], caption: 'C-Dur mit Sopran e″, Alt c′ (Abstand größer als eine Oktave).' },
    right: { voices: ['E5/w', 'G4/w', 'C4/w', 'C3/w'], caption: 'C-Dur mit Sopran e″, Alt g′, Tenor c′, Bass c.' },
    fragment: true,
  },
  {
    id: 'range',
    title: 'Stimmumfang',
    text:
      'Jede Stimme muss in ihrem singbaren bzw. spielbaren Bereich bleiben. Chorsatz: Sopran c′–g″, Alt g–d″, Tenor c–g′, Bass F–d′. Orgelsatz: Sopran c′–c‴, Alt f–g″, Tenor c–c″, Pedal (Bass) C–d′. Liegt die Melodie nach dem Transponieren außerhalb des Sopranumfangs, zählt das ebenfalls als Fehler.',
    wrong: { voices: ['E5/w', 'C5/w', 'A4/w', 'A3/w'], caption: 'a-Moll, Chorsatz: Tenor auf a′ (zu hoch).' },
    right: { voices: ['E5/w', 'C5/w', 'E4/w', 'A3/w'], caption: 'Tenor auf e′.' },
    fragment: true,
  },
  {
    id: 'leading-tone',
    title: 'Leittonauflösung',
    text:
      'Der Leitton (7. Stufe, in C-Dur das h) strebt einen Halbton aufwärts zum Grundton. In den Außenstimmen (Sopran und Bass) muss er bei Dominante → Tonika aufgelöst werden; in den Mittelstimmen darf er zur Quinte abspringen. Das gilt auch für Zwischendominanten.',
    wrong: { voices: ['B4/h G4/h', 'D4/h E4/h', 'G3/h G3/h', 'G2/h C3/h'], caption: 'G-Dur → C-Dur. Sopran h′ → g′.' },
    right: { voices: ['B4/h C5/h', 'D4/h E4/h', 'G3/h G3/h', 'G2/h C3/h'], caption: 'G-Dur → C-Dur. Sopran h′ → c″.' },
    fragment: true,
  },
  {
    id: 'seventh',
    title: 'Septauflösung',
    text:
      'Die Septime eines Septakkords (z. B. f im G7) wird schrittweise abwärts aufgelöst. Ausnahme: Übernimmt der Bass den Auflösungston, darf die Septime einen Schritt aufwärts gehen.',
    wrong: { voices: ['D5/h C5/h', 'F4/h G4/h', 'B3/h E4/h', 'G2/h C3/h'], caption: 'G7 → C-Dur. Alt f′ → g′.' },
    right: { voices: ['D5/h C5/h', 'F4/h E4/h', 'B3/h G3/h', 'G2/h C3/h'], caption: 'G7 → C-Dur. Alt f′ → e′.' },
    fragment: true,
  },
  {
    id: 'doubling',
    title: 'Verdopplung',
    text:
      'In Dur- und Molldreiklängen in Grundstellung wird bevorzugt der Grundton verdoppelt. Der Leitton und die Septime dürfen nie verdoppelt werden.',
    wrong: { voices: ['B4/w', 'D4/w', 'B3/w', 'G2/w'], caption: 'G-Dur mit h′ im Sopran und h im Tenor (Leitton verdoppelt).' },
    right: { voices: ['B4/w', 'D4/w', 'G3/w', 'G2/w'], caption: 'G-Dur mit G im Bass und g im Tenor, h′ nur einmal.' },
    fragment: true,
  },
  {
    id: 'final',
    title: 'Schluss',
    text:
      'Der letzte Akkord des Satzes ist die Tonika in Grundstellung, der Bass endet also auf dem Grundton der Tonart. Davor steht die Dominante (oder die Subdominante).',
    wrong: { voices: ['D5/h C5/h', 'G4/h G4/h', 'B3/h C4/h', 'G2/h E3/h'], caption: 'Schlussakkord C-Dur mit e im Bass.' },
    right: { voices: ['D5/h C5/h', 'G4/h G4/h', 'B3/h E4/h', 'G2/h C3/h'], caption: 'Schlussakkord C-Dur mit c im Bass.' },
    fragment: false,
  },
  {
    id: 'chord',
    title: 'Erlaubte Akkorde',
    text:
      'Erlaubt sind Dur-, Moll- und verminderte Dreiklänge (auch als Sextakkord), Dominantseptakkorde und Septakkorde auf anderen Stufen, Nebenstufen sowie Quartsextakkorde nach eigener Regel. Übermäßige Dreiklänge sind nicht vorgesehen. Töne, die weder zum Akkord gehören noch als Durchgang, Wechselnote, Vorhalt oder Vorausnahme erklärbar sind, ergeben keinen erlaubten Akkord.',
    wrong: { voices: ['G#4/w', 'E4/w', 'C4/w', 'C3/w'], caption: 'Übermäßiger Dreiklang c – e – gis.' },
    right: { voices: ['G4/w', 'E4/w', 'C4/w', 'C3/w'], caption: 'C-Dur-Dreiklang.' },
    fragment: true,
  },
  {
    id: 'complete',
    title: 'Vollständige Akkorde',
    text:
      'Akkorde sind grundsätzlich vollständig: Grundton, Terz und Quinte (beim Septakkord darf die Quinte fehlen). Ausnahme: Folgt die Tonika auf die Dominante, etwa am Schluss, wenn die Melodie von der 2. zur 1. Stufe geht und der Leitton hochgeführt wird, genügen Grundton und Terz.',
    wrong: { voices: ['C5/w', 'E4/w', 'C4/w', 'C3/w'], caption: 'C-Dur ohne Quinte (dreifacher Grundton).' },
    right: { voices: ['C5/w', 'G4/w', 'E4/w', 'C3/w'], caption: 'C-Dur mit Grundton, Terz und Quinte.' },
    fragment: true,
  },
  {
    id: 'six-four',
    title: 'Quartsextakkorde',
    text:
      'Ein Dreiklang mit der Quinte im Bass (Quartsextakkord) ist nur erlaubt als Kadenzquartsextakkord (vor der Dominante auf demselben Basston), als Durchgangsquartsextakkord (der Bass geht schrittweise hindurch) oder als Wechselquartsextakkord (der Bass bleibt liegen).',
    wrong: {
      voices: ['C5/h C5/h C5/h', 'A4/h G4/h A4/h', 'F4/h E4/h F4/h', 'F3/h G3/h F3/h'],
      caption: 'F-Dur → C-Dur mit g im Bass → F-Dur: der Bass geht hin und zurück.',
    },
    right: {
      voices: ['C5/h C5/h B4/h C5/h', 'A4/h G4/h G4/h G4/h', 'F4/h E4/h D4/h E4/h', 'F3/h G3/h G3/h C3/h'],
      caption: 'Kadenz: F-Dur → C-Dur mit g im Bass → G-Dur → C-Dur.',
    },
    fragment: true,
  },
  {
    id: 'suspension',
    title: 'Vorhalte und akkordfremde Töne',
    text:
      'Akkordfremde Töne sind als Durchgang, Wechselnote, Vorausnahme oder Vorhalt erlaubt. Ein Vorhalt muss vorbereitet sein: Derselbe Ton erklingt vorher in derselben Stimme (gehalten oder wiederholt) und löst sich dann schrittweise auf.',
    wrong: {
      voices: ['D5/h C5/h', 'D4/h F4/q E4/q', 'B3/h G3/h', 'G2/h C3/h'],
      caption: 'Alt springt ins f′ (Quartvorhalt ohne Vorbereitung).',
    },
    right: {
      voices: ['C5/h C5/h', 'F4/h~ F4/q E4/q', 'A3/h G3/h', 'F3/h C3/h'],
      caption: 'Das f′ im Alt wird aus dem F-Dur-Akkord übergebunden und löst sich ins e′ auf.',
    },
    fragment: true,
  },
  {
    id: 'rhythm',
    title: 'Takte füllen und Pausen',
    text:
      'Jede Stimme füllt jeden Takt vollständig mit Noten oder Pausen. Pausen in den Unterstimmen gibt es nur genau dort, wo auch der Sopran pausiert; dort pausieren alle Stimmen.',
    wrong: { voices: ['E5/h D5/h', 'G4/h r/h', 'C4/h B3/h', 'C3/h G2/h'], caption: 'Der Alt pausiert, obwohl der Sopran singt.' },
    right: { voices: ['E5/h D5/h', 'G4/h G4/h', 'C4/h B3/h', 'C3/h G2/h'], caption: 'Alle Stimmen singen durch.' },
    fragment: true,
  },
];

export function ruleInfo(id: RuleId): RuleInfo {
  return RULE_INFO.find((r) => r.id === id)!;
}
