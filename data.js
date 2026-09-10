// Woordenschat voor de Italiaans-flashcardsapp.
// Elke deck heeft een id, naam, emoji, accentkleur en een lijst kaarten (it = Italiaans, nl = Nederlands).
const DECKS = [
  {
    id: 'begroetingen',
    name: 'Begroetingen',
    emoji: '👋',
    color: '#FF6B4A',
    cards: [
      { it: 'Ciao', nl: 'Hoi / Doei' },
      { it: 'Buongiorno', nl: 'Goedemorgen / Goedendag' },
      { it: 'Buonasera', nl: 'Goedenavond' },
      { it: 'Buonanotte', nl: 'Welterusten' },
      { it: 'Arrivederci', nl: 'Tot ziens' },
      { it: 'A presto', nl: 'Tot snel' },
      { it: 'Come stai?', nl: 'Hoe gaat het met je?' },
      { it: 'Sto bene, grazie', nl: 'Het gaat goed, dank je' },
      { it: 'Piacere', nl: 'Aangenaam' },
      { it: 'Per favore', nl: 'Alsjeblieft (bij een verzoek)' },
      { it: 'Grazie', nl: 'Dank je' },
      { it: 'Prego', nl: 'Graag gedaan / Alsjeblieft' },
      { it: 'Scusa', nl: 'Sorry / Pardon' },
      { it: 'Come ti chiami?', nl: 'Hoe heet je?' },
      { it: 'Mi chiamo...', nl: 'Ik heet...' }
    ]
  },
  {
    id: 'eten-drinken',
    name: 'Eten & Drinken',
    emoji: '🍝',
    color: '#FFD23F',
    cards: [
      { it: 'Il pane', nl: 'Het brood' },
      { it: "L'acqua", nl: 'Het water' },
      { it: 'Il vino', nl: 'De wijn' },
      { it: 'Il caffè', nl: 'De koffie' },
      { it: 'La pizza', nl: 'De pizza' },
      { it: 'La pasta', nl: 'De pasta' },
      { it: 'Il formaggio', nl: 'De kaas' },
      { it: 'La carne', nl: 'Het vlees' },
      { it: 'Il pesce', nl: 'De vis' },
      { it: 'La verdura', nl: 'De groente' },
      { it: 'La frutta', nl: 'Het fruit' },
      { it: 'Lo zucchero', nl: 'De suiker' },
      { it: 'Il sale', nl: 'Het zout' },
      { it: 'Colazione', nl: 'Ontbijt' },
      { it: 'Pranzo', nl: 'Lunch' },
      { it: 'Cena', nl: 'Diner' },
      { it: 'Buon appetito', nl: 'Eet smakelijk' },
      { it: 'Il conto, per favore', nl: 'De rekening, alsjeblieft' }
    ]
  },
  {
    id: 'getallen',
    name: 'Getallen',
    emoji: '🔢',
    color: '#2DD4BF',
    cards: [
      { it: 'Uno', nl: 'Een' },
      { it: 'Due', nl: 'Twee' },
      { it: 'Tre', nl: 'Drie' },
      { it: 'Quattro', nl: 'Vier' },
      { it: 'Cinque', nl: 'Vijf' },
      { it: 'Sei', nl: 'Zes' },
      { it: 'Sette', nl: 'Zeven' },
      { it: 'Otto', nl: 'Acht' },
      { it: 'Nove', nl: 'Negen' },
      { it: 'Dieci', nl: 'Tien' },
      { it: 'Venti', nl: 'Twintig' },
      { it: 'Trenta', nl: 'Dertig' },
      { it: 'Cento', nl: 'Honderd' },
      { it: 'Mille', nl: 'Duizend' }
    ]
  },
  {
    id: 'reizen',
    name: 'Reizen',
    emoji: '✈️',
    color: '#60A5FA',
    cards: [
      { it: "L'aeroporto", nl: 'De luchthaven' },
      { it: 'Il treno', nl: 'De trein' },
      { it: 'La stazione', nl: 'Het station' },
      { it: 'Il biglietto', nl: 'Het kaartje' },
      { it: 'La valigia', nl: 'De koffer' },
      { it: "L'albergo", nl: 'Het hotel' },
      { it: 'La strada', nl: 'De straat' },
      { it: "Dov'è...?", nl: 'Waar is...?' },
      { it: 'A sinistra', nl: 'Links' },
      { it: 'A destra', nl: 'Rechts' },
      { it: 'Sempre dritto', nl: 'Rechtdoor' },
      { it: 'Il passaporto', nl: 'Het paspoort' },
      { it: 'La macchina', nl: 'De auto' },
      { it: 'Il mare', nl: 'De zee' }
    ]
  },
  {
    id: 'familie',
    name: 'Familie',
    emoji: '👨‍👩‍👧',
    color: '#FF8FB1',
    cards: [
      { it: 'La famiglia', nl: 'De familie' },
      { it: 'La madre', nl: 'De moeder' },
      { it: 'Il padre', nl: 'De vader' },
      { it: 'Il fratello', nl: 'De broer' },
      { it: 'La sorella', nl: 'De zus' },
      { it: 'Il figlio', nl: 'De zoon' },
      { it: 'La figlia', nl: 'De dochter' },
      { it: 'Il nonno', nl: 'De opa' },
      { it: 'La nonna', nl: 'De oma' },
      { it: 'Il marito', nl: 'De echtgenoot' },
      { it: 'La moglie', nl: 'De echtgenote' },
      { it: "L'amico / l'amica", nl: 'De vriend / vriendin' }
    ]
  },
  {
    id: 'tijd-dagen',
    name: 'Tijd & Dagen',
    emoji: '⏰',
    color: '#A78BFA',
    cards: [
      { it: 'Oggi', nl: 'Vandaag' },
      { it: 'Domani', nl: 'Morgen' },
      { it: 'Ieri', nl: 'Gisteren' },
      { it: 'Lunedì', nl: 'Maandag' },
      { it: 'Martedì', nl: 'Dinsdag' },
      { it: 'Mercoledì', nl: 'Woensdag' },
      { it: 'Giovedì', nl: 'Donderdag' },
      { it: 'Venerdì', nl: 'Vrijdag' },
      { it: 'Sabato', nl: 'Zaterdag' },
      { it: 'Domenica', nl: 'Zondag' },
      { it: "L'ora", nl: 'Het uur' },
      { it: 'Adesso', nl: 'Nu' }
    ]
  },
  {
    id: 'kleuren',
    name: 'Kleuren',
    emoji: '🎨',
    color: '#6EE7B7',
    cards: [
      { it: 'Rosso', nl: 'Rood' },
      { it: 'Blu', nl: 'Blauw' },
      { it: 'Verde', nl: 'Groen' },
      { it: 'Giallo', nl: 'Geel' },
      { it: 'Nero', nl: 'Zwart' },
      { it: 'Bianco', nl: 'Wit' },
      { it: 'Arancione', nl: 'Oranje' },
      { it: 'Viola', nl: 'Paars' },
      { it: 'Rosa', nl: 'Roze' },
      { it: 'Grigio', nl: 'Grijs' },
      { it: 'Marrone', nl: 'Bruin' }
    ]
  },
  {
    id: 'basiswoorden',
    name: 'Basiswoorden',
    emoji: '💬',
    color: '#F59E0B',
    cards: [
      { it: 'Sì', nl: 'Ja' },
      { it: 'No', nl: 'Nee' },
      { it: 'Forse', nl: 'Misschien' },
      { it: 'Molto', nl: 'Heel / veel' },
      { it: 'Poco', nl: 'Weinig' },
      { it: 'Grande', nl: 'Groot' },
      { it: 'Piccolo', nl: 'Klein' },
      { it: 'Bello', nl: 'Mooi' },
      { it: 'Buono', nl: 'Goed / lekker' },
      { it: 'Cattivo', nl: 'Slecht' },
      { it: 'Nuovo', nl: 'Nieuw' },
      { it: 'Vecchio', nl: 'Oud' },
      { it: 'Caldo', nl: 'Warm' },
      { it: 'Freddo', nl: 'Koud' },
      { it: 'Facile', nl: 'Makkelijk' },
      { it: 'Difficile', nl: 'Moeilijk' }
    ]
  },
  {
    id: 'huis',
    name: 'Huis',
    emoji: '🏠',
    color: '#818CF8',
    cards: [
      { it: 'La casa', nl: 'Het huis' },
      { it: 'La camera', nl: 'De kamer' },
      { it: 'La cucina', nl: 'De keuken' },
      { it: 'Il bagno', nl: 'De badkamer' },
      { it: 'La porta', nl: 'De deur' },
      { it: 'La finestra', nl: 'Het raam' },
      { it: 'Il letto', nl: 'Het bed' },
      { it: 'La sedia', nl: 'De stoel' },
      { it: 'Il tavolo', nl: 'De tafel' },
      { it: 'Le chiavi', nl: 'De sleutels' }
    ]
  },
  {
    id: 'gevoelens',
    name: 'Gevoelens',
    emoji: '❤️',
    color: '#FB7185',
    cards: [
      { it: 'Felice', nl: 'Blij' },
      { it: 'Triste', nl: 'Verdrietig' },
      { it: 'Stanco', nl: 'Moe' },
      { it: 'Affamato', nl: 'Hongerig' },
      { it: 'Assetato', nl: 'Dorstig' },
      { it: 'Arrabbiato', nl: 'Boos' },
      { it: 'Innamorato', nl: 'Verliefd' },
      { it: 'Spaventato', nl: 'Bang' },
      { it: 'Sorpreso', nl: 'Verrast' },
      { it: 'Tranquillo', nl: 'Rustig' }
    ]
  }
];
