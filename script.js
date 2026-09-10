// Parla! — kleine, dependency-vrije flashcards-app.
// Alles draait client-side; voortgang wordt bewaard in localStorage.
//
// De studielogica is gebaseerd op principes uit taalverwervingsonderzoek:
//  1. Spaced repetition (Leitner-boxen): kaarten komen terug vlak voordat je ze
//     zou vergeten, met steeds langere tussenpozen naarmate je ze beter kent
//     (Ebbinghaus' vergeetcurve; Cepeda e.a. 2006 over het spacing-effect).
//  2. Interleaving: de dagelijkse oefening husselt categorieën door elkaar in
//     plaats van blok voor blok te oefenen (Rohrer & Taylor 2007).
//  3. Retrieval practice / het testeffect: actief het antwoord ophalen (of
//     typen) beklijft beter dan herlezen (Karpicke & Roediger 2008) — vandaar
//     de "actief typen"-modus naast de herken-modus.
//  4. Mastery-based herhaling binnen een sessie: een fout beantwoord woord
//     verlaat de sessie niet, maar komt een paar kaarten later terug — net
//     zo lang tot het goed gaat. Vanaf de 3e poging op datzelfde woord
//     schakelt de app naar meerkeuze, zodat je niet vast blijft zitten op
//     een woord dat via vrij ophalen niet lukt (scaffolding).

const STORAGE_KEY = 'parla-italian-flashcards-v2';
const LEGACY_STORAGE_KEY = 'parla-italian-flashcards-v1';

// Leitner-boxen 1 t/m 5: aantal dagen tot de volgende herhaling nadat een
// kaart in die box terechtkomt. Box 0 = nog nooit geoefend.
const BOX_INTERVALS_DAYS = [1, 3, 7, 16, 35];
const MAX_BOX = BOX_INTERVALS_DAYS.length; // 5
const KNOWN_BOX_THRESHOLD = 3; // vanaf hier telt een kaart als "onder de knie"

const DAILY_MAX_NEW = 10;
const DAILY_MAX_TOTAL = 40;

const CHOICE_OPTION_COUNT = 4;
const CHOICE_AFTER_MISSES = 2; // vanaf de 3e poging (2 eerdere missers) -> meerkeuze

/** Virtuele "mix"-deck die willekeurig door alle categorieën heen gaat. */
const MIX_DECK = {
  id: 'mix',
  name: 'Alles door elkaar',
  emoji: '🎲',
  color: '#16171b',
  isVirtual: true,
  get cards() {
    return DECKS.flatMap(d => d.cards);
  }
};

/** Virtuele "kernwoorden"-deck: de hoogfrequente/essentiële woorden (tier 1)
 *  uit alle categorieën samen — het beste startpunt volgens
 *  frequentie-onderzoek naar woordenschatverwerving (Nation, 2001): een
 *  kleine kern van de meest voorkomende woorden dekt verreweg de meeste
 *  dagelijkse taal. */
const CORE_DECK = {
  id: 'kernwoorden',
  name: 'Kernwoorden',
  emoji: '⭐',
  color: '#FBBF24',
  isVirtual: true,
  isCore: true,
  get cards() {
    return DECKS.flatMap(d => d.cards.filter(c => c.tier === 1));
  }
};

function allDecks() {
  return [CORE_DECK, ...DECKS, MIX_DECK];
}

/* ---------------- State (localStorage) ---------------- */

function emptyState() {
  return { cardStatus: {}, streak: { lastVisit: null, count: 0 }, mode: 'recognize' };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        cardStatus: parsed.cardStatus || {},
        streak: parsed.streak || { lastVisit: null, count: 0 },
        mode: parsed.mode === 'type' ? 'type' : 'recognize'
      };
    }
    // Migreer oude v1-data (status was 'known' | 'practice' | 'new' als platte string)
    // naar het nieuwe box-model, zodat bestaande voortgang niet verloren gaat.
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const migrated = emptyState();
      migrated.streak = legacy.streak || migrated.streak;
      const today = todayStr();
      Object.entries(legacy.cardStatus || {}).forEach(([id, status]) => {
        if (status === 'known') migrated.cardStatus[id] = { box: 3, due: today };
        else if (status === 'practice') migrated.cardStatus[id] = { box: 1, due: today };
      });
      return migrated;
    }
    return emptyState();
  } catch (e) {
    // Corrupte/onleesbare opslag (bv. een afgebroken write, of data uit een
    // toekomstige/andere versie) mag nooit stilletjes je hele voortgang
    // wissen. We zetten de rauwe inhoud opzij onder een backup-sleutel
    // (terug te vinden in devtools) en starten met een lege state in
    // plaats van te crashen.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(STORAGE_KEY + '-corrupt-backup', raw);
    } catch (e2) { /* opslag zelf niet beschikbaar/vol — dan is er niets meer te backuppen */ }
    console.warn(
      `Parla!: kon opgeslagen voortgang niet lezen, start met een lege state. ` +
      `De rauwe data (indien nog aanwezig) staat onder "${STORAGE_KEY}-corrupt-backup".`,
      e
    );
    return emptyState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Bv. QuotaExceededError, of localStorage helemaal niet beschikbaar
    // (sommige browsers in privénavigatie). De app blijft gewoon werken met
    // de in-memory state — alleen het bewaren naar de volgende keer lukt
    // dan niet, en dat melden we in de console in plaats van te crashen.
    console.warn('Parla!: kon voortgang niet opslaan (opslag vol of niet beschikbaar).', e);
  }
}

// Let op: localStorage is per browser/device — er is geen automatische sync
// tussen bv. je telefoon en laptop. Gebruik je de app op meerdere devices,
// dan houdt elk device zijn eigen voortgang bij.

const state = loadState();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function bumpStreak() {
  const today = todayStr();
  const { lastVisit, count } = state.streak;
  if (lastVisit === today) return;
  if (!lastVisit) {
    state.streak = { lastVisit: today, count: 1 };
  } else {
    const diffDays = Math.round((new Date(today) - new Date(lastVisit)) / 86400000);
    state.streak = { lastVisit: today, count: diffDays === 1 ? count + 1 : 1 };
  }
  saveState();
}

function cardId(deckId, card) {
  return `${deckId}::${card.it}`;
}

/** Huidige box + vervaldatum van een kaart. Nooit geoefend => box 0. */
function statusOf(deckId, card) {
  return state.cardStatus[cardId(deckId, card)] || { box: 0, due: null };
}

/** Verwerk een antwoord in het Leitner-systeem: goed = box omhoog (tot max),
 *  fout = terug naar box 1. De volgende vervaldatum volgt uit BOX_INTERVALS_DAYS. */
function markStatus(deckId, card, correct) {
  const prev = statusOf(deckId, card);
  const newBox = correct ? Math.min(prev.box + 1, MAX_BOX) : 1;
  const due = addDaysToToday(BOX_INTERVALS_DAYS[newBox - 1]);
  state.cardStatus[cardId(deckId, card)] = { box: newBox, due };
  saveState();
}

function isDue(deckId, card, today) {
  const s = statusOf(deckId, card);
  return s.box > 0 && s.due <= today;
}

function isNew(deckId, card) {
  return statusOf(deckId, card).box === 0;
}

// Let op: deck.id klopt alleen voor "echte" categorieën. Voor virtuele decks
// (kernwoorden, mix) is de voortgang opgeslagen onder de broncategorie van
// elke kaart — vandaar ownerDeckId() hieronder in plaats van deck.id.
function deckKnownCount(deck) {
  return deck.cards.filter(c => statusOf(ownerDeckId(deck, c), c).box >= KNOWN_BOX_THRESHOLD).length;
}

function deckDueCount(deck, today) {
  return deck.cards.filter(c => isDue(ownerDeckId(deck, c), c, today)).length;
}

function totalWordCount() {
  return DECKS.reduce((sum, d) => sum + d.cards.length, 0);
}

function totalKnownCount() {
  return DECKS.reduce((sum, d) => sum + deckKnownCount(d), 0);
}

function totalDueCount() {
  const today = todayStr();
  return DECKS.reduce((sum, d) => sum + deckDueCount(d, today), 0);
}

/* ---------------- Owner lookup (voor virtuele decks) ---------------- */

// Voor virtuele decks (mix, kernwoorden, dagelijkse oefening) moet de
// voortgang per kaart worden opgeslagen onder de écht bijbehorende categorie,
// zodat "% onder de knie" per categorie ook klopt na een sessie in zo'n deck.
const OWNER_BY_CARD = new Map();
DECKS.forEach(d => d.cards.forEach(c => OWNER_BY_CARD.set(c, d.id)));

function ownerDeckId(deck, card) {
  if (deck.isVirtual) return OWNER_BY_CARD.get(card) || deck.id;
  return deck.id;
}

/* ---------------- Typ-modus: antwoord controleren ---------------- */

function normalizeAnswer(s) {
  return s.toLowerCase().trim().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
}

/** Sommige kaarten hebben meerdere geldige vormen, geschreven als "a / b". */
function acceptedVariants(card) {
  return card.it.includes(' / ') ? card.it.split(' / ') : [card.it];
}

function checkTypedAnswer(card, input) {
  const norm = normalizeAnswer(input);
  if (!norm) return false;
  return acceptedVariants(card).some(v => normalizeAnswer(v) === norm);
}

/* ---------------- Meerkeuze: opties samenstellen ---------------- */

/** Bouwt CHOICE_OPTION_COUNT opties (1 correct + afleiders), door elkaar
 *  gehusseld. `field` is 'it' (Italiaans, bij typ-modus) of 'nl' (Nederlands,
 *  bij herken-modus) — de richting volgt de actieve oefenmodus, zodat een
 *  afgezwakte meerkeuzevraag hetzelfde test als waar hij vandaan komt. */
function buildChoiceOptions(card, field) {
  const correctText = card[field];
  const pool = DECKS.flatMap(d => d.cards).filter(c => c !== card && c[field] !== correctText);
  const distractors = shuffle(pool).slice(0, CHOICE_OPTION_COUNT - 1).map(c => c[field]);
  return shuffle([correctText, ...distractors]);
}

/* ---------------- DOM refs ---------------- */

const viewHome = document.getElementById('view-home');
const viewStudy = document.getElementById('view-study');
const viewSummary = document.getElementById('view-summary');
const deckGrid = document.getElementById('deck-grid');

const streakCountEl = document.getElementById('streak-count');
const knownCountEl = document.getElementById('known-count');
const totalCountEl = document.getElementById('total-count');
const dueCountEl = document.getElementById('due-count');

const dailyDueBadge = document.getElementById('daily-due-badge');
const dailySubEl = document.getElementById('daily-sub');
const btnDailySession = document.getElementById('btn-daily-session');
const modeButtons = document.querySelectorAll('.mode-btn');

const studyEmojiEl = document.getElementById('study-emoji');
const studyDeckNameEl = document.getElementById('study-deck-name');
const studyIndexEl = document.getElementById('study-index');
const studyTotalEl = document.getElementById('study-total');
const studyProgressEl = document.getElementById('study-progress');
const boxBadgeEl = document.getElementById('box-badge');
const kbdHintEl = document.getElementById('kbd-hint');

const flashcardEl = document.getElementById('flashcard');
const cardFrontWordEl = document.getElementById('card-front-word');
const cardPhoneticEl = document.getElementById('card-phonetic');
const cardBackSourceEl = document.getElementById('card-back-source');
const cardBackWordEl = document.getElementById('card-back-word');
const cardExampleEl = document.getElementById('card-example');

const recognizeStage = document.getElementById('recognize-stage');
const typeStage = document.getElementById('type-stage');
const typePromptEl = document.getElementById('type-prompt');
const typeInputEl = document.getElementById('type-input');
const typeFeedbackEl = document.getElementById('type-feedback');
const btnTypeCheck = document.getElementById('btn-type-check');

const revealStage = document.getElementById('reveal-stage');
const revealPromptEl = document.getElementById('reveal-prompt');
const btnRevealShow = document.getElementById('btn-reveal-show');
const revealAnswerBox = document.getElementById('reveal-answer-box');
const revealAnswerWordEl = document.getElementById('reveal-answer-word');
const revealPhoneticEl = document.getElementById('reveal-phonetic');
const revealExampleEl = document.getElementById('reveal-example');

const choiceStage = document.getElementById('choice-stage');
const choiceLabelEl = document.getElementById('choice-label');
const choicePromptEl = document.getElementById('choice-prompt');
const choicePhoneticEl = document.getElementById('choice-phonetic');
const choiceOptionsEl = document.getElementById('choice-options');
const choiceFeedbackEl = document.getElementById('choice-feedback');
const btnChoiceNext = document.getElementById('btn-choice-next');

const answerButtons = document.getElementById('answer-buttons');
const btnPractice = document.getElementById('btn-practice');
const btnKnow = document.getElementById('btn-know');
const btnBackHome = document.getElementById('btn-back-home');

const summaryEmojiEl = document.getElementById('summary-emoji');
const summaryTitleEl = document.getElementById('summary-title');
const summaryTextEl = document.getElementById('summary-text');
const summaryBarFillEl = document.getElementById('summary-bar-fill');
const btnRetryHard = document.getElementById('btn-retry-hard');
const btnRestartDeck = document.getElementById('btn-restart-deck');
const btnToHome = document.getElementById('btn-to-home');

const confettiLayer = document.getElementById('confetti-layer');

/* ---------------- View switching ---------------- */

const VIEW_NAMES = new Map([[viewHome, 'home'], [viewStudy, 'study'], [viewSummary, 'summary']]);

function showView(view) {
  [viewHome, viewStudy, viewSummary].forEach(v => v.classList.add('hidden'));
  view.classList.remove('hidden');
  document.body.dataset.view = VIEW_NAMES.get(view) || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Home / deck grid ---------------- */

function renderHome() {
  const today = todayStr();
  streakCountEl.textContent = state.streak.count || 0;
  knownCountEl.textContent = totalKnownCount();
  totalCountEl.textContent = totalWordCount();
  const due = totalDueCount();
  dueCountEl.textContent = due;

  const dailyPool = buildDailyPool();
  dailyDueBadge.textContent = dailyPool.length;
  dailyDueBadge.classList.toggle('hidden', dailyPool.length === 0);
  btnDailySession.disabled = dailyPool.length === 0;
  btnDailySession.classList.toggle('is-empty', dailyPool.length === 0);
  dailySubEl.textContent = dailyPool.length === 0
    ? 'Niks te herhalen nu — kom morgen terug! 🎉'
    : 'Herhaalt wat je bijna vergeet + een paar nieuwe woorden, lekker door elkaar';

  modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.mode));

  deckGrid.innerHTML = '';
  allDecks().forEach(deck => {
    const card = document.createElement('button');
    card.className = 'deck-card' + (deck.id === 'mix' ? ' mix-card' : '') + (deck.isCore ? ' core-card' : '');

    const known = deckKnownCount(deck);
    const total = deck.cards.length;
    const pct = total ? Math.round((known / total) * 100) : 0;
    const dueN = deckDueCount(deck, today);

    card.innerHTML = `
      <div class="deck-card-top">
        <span class="deck-emoji" style="background:${deck.color}33">${deck.emoji}</span>
        <span class="deck-count-badge">${total} woorden</span>
      </div>
      <span class="deck-name">${deck.name}${deck.isCore ? ' <span class="core-tag">aanbevolen start</span>' : ''}</span>
      <div class="deck-progress-track">
        <div class="deck-progress-fill" style="width:${pct}%;background:${deck.color}"></div>
      </div>
      <div class="deck-card-bottom">
        <span class="deck-progress-label">${pct}% onder de knie${deck.id === 'mix' ? ' (totaal)' : ''}</span>
        ${dueN > 0 ? `<span class="due-badge">🔔 ${dueN}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => startSession(deck));
    deckGrid.appendChild(card);
  });
}

/* ---------------- Dagelijkse oefening (spaced repetition + interleaving) ---------------- */

/** Alle kaarten die vandaag "due" zijn (spaced repetition), aangevuld met een
 *  beperkt aantal nieuwe kaarten (cognitieve belasting blijft behapbaar),
 *  door elkaar gehusseld (interleaving). */
function buildDailyPool() {
  const today = todayStr();
  const due = [];
  const fresh = [];
  DECKS.forEach(deck => {
    deck.cards.forEach(card => {
      if (isDue(deck.id, card, today)) due.push(card);
      else if (isNew(deck.id, card)) fresh.push(card);
    });
  });
  const pickedFresh = shuffle(fresh).slice(0, DAILY_MAX_NEW);
  let pool = shuffle([...due, ...pickedFresh]);
  if (pool.length > DAILY_MAX_TOTAL) pool = pool.slice(0, DAILY_MAX_TOTAL);
  return pool;
}

function startDailySession() {
  const cards = buildDailyPool();
  if (cards.length === 0) return; // niets te doen — knop is dan uitgeschakeld
  const deck = {
    id: 'daily',
    name: 'Dagelijkse oefening',
    emoji: '📅',
    color: '#FF6B4A',
    isVirtual: true,
    cards
  };
  startSession(deck, cards);
}

/* ---------------- Study session ---------------- */

// session = {
//   deck,
//   pending: [{ card, misses }, ...],   // volgende kaart staat vooraan
//   totalDistinct,                      // aantal unieke woorden in de sessie
//   masteredCount,                      // hoeveel daarvan al goed beantwoord zijn
//   sessionKnown: [card, ...],          // in 1 keer goed
//   sessionPractice: [card, ...]        // had een herhaling (en/of meerkeuze) nodig
// }
let session = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startSession(deck, cardsOverride) {
  const cards = cardsOverride || deck.cards;
  session = {
    deck,
    pending: shuffle(cards).map(card => ({ card, misses: 0 })),
    totalDistinct: cards.length,
    masteredCount: 0,
    sessionKnown: [],
    sessionPractice: []
  };
  bumpStreak();
  studyEmojiEl.textContent = deck.emoji;
  studyDeckNameEl.textContent = deck.name;
  showView(viewStudy);
  renderCurrentCard();
}

function currentEntry() {
  return session.pending[0];
}

/** In typ-modus vallen kaarten met meerdere/onvolledige vormen (noType) terug
 *  op de "reveal"-weergave (zelfde kaartstijl als typen, geen 3D-flip) in
 *  plaats van de herken-modus flip-kaart — zo blijft typ-modus overal
 *  hetzelfde ogen, ook voor woorden die je niet kunt typen. Vanaf
 *  CHOICE_AFTER_MISSES missers op hetzelfde woord (binnen deze sessie)
 *  schakelt elke modus over naar meerkeuze. */
function activeStageForCurrentCard() {
  const entry = currentEntry();
  if (!entry) return null;
  if (entry.misses >= CHOICE_AFTER_MISSES) return 'choice';
  if (state.mode === 'type') return entry.card.noType ? 'reveal' : 'type';
  return 'recognize';
}

/** Verwerkt het resultaat van één poging op de huidige (voorste) kaart.
 *  Bij goed: telt mee als "gekend" en verlaat de sessie definitief. Bij
 *  fout: komt een paar kaarten verderop terug (spreiding, ook binnen de
 *  sessie). De Leitner-box wordt maar één keer per kaart per sessie
 *  bijgewerkt — pas zodra de kaart uiteindelijk goed gaat — en telt dan als
 *  "correct" alleen als dat al in de allereerste poging lukte. Zo blijft de
 *  spaced-repetition-voortgang eerlijk: een woord dat na wat oefenen alsnog
 *  lukt, is voor de langere termijn nog niet "onder de knie". */
function resolveAttempt(correct) {
  const entry = session.pending[0];
  if (correct) {
    const firstTry = entry.misses === 0;
    markStatus(ownerDeckId(session.deck, entry.card), entry.card, firstTry);
    (firstTry ? session.sessionKnown : session.sessionPractice).push(entry.card);
    session.masteredCount += 1;
    session.pending.shift();
  } else {
    entry.misses += 1;
    session.pending.shift();
    const insertAt = Math.min(session.pending.length, 2 + Math.floor(Math.random() * 2));
    session.pending.splice(insertAt, 0, entry);
  }
}

function advance() {
  if (session.pending.length === 0) finishSession();
  else renderCurrentCard();
}

function renderCurrentCard() {
  const entry = currentEntry();
  if (!entry) return;
  const card = entry.card;
  const deckId = ownerDeckId(session.deck, card);
  const box = statusOf(deckId, card).box;

  studyIndexEl.textContent = session.masteredCount;
  studyTotalEl.textContent = session.totalDistinct;
  const pct = Math.round((session.masteredCount / session.totalDistinct) * 100);
  studyProgressEl.style.width = `${pct}%`;
  boxBadgeEl.textContent = box === 0 ? '🆕 Nieuw' : `📦 Box ${box}/${MAX_BOX}`;

  const stage = activeStageForCurrentCard();
  recognizeStage.classList.toggle('hidden', stage !== 'recognize');
  typeStage.classList.toggle('hidden', stage !== 'type');
  revealStage.classList.toggle('hidden', stage !== 'reveal');
  choiceStage.classList.toggle('hidden', stage !== 'choice');
  // De reveal-kaart toont "answer-buttons" pas na "Toon antwoord" (zie
  // showRevealAnswer) — bij een nieuwe kaart moet 'ie dus weer verborgen zijn.
  answerButtons.classList.toggle('hidden', stage !== 'recognize');

  // Toetsenbord alleen laten zakken als de nieuwe kaart écht geen typveld
  // heeft — anders klapt het na élke kaart open en dicht ("whiplash").
  if (stage !== 'type') typeInputEl.blur();

  const hints = {
    recognize: 'Spatie = draaien · ← nog oefenen · → ken ik',
    type: 'Enter = controleren / volgende',
    reveal: 'Toon het antwoord en beoordeel jezelf',
    choice: 'Kies het juiste antwoord'
  };
  kbdHintEl.textContent = hints[stage] || '';

  if (stage === 'recognize') renderRecognizeStage(card);
  else if (stage === 'type') renderTypeStage(card);
  else if (stage === 'reveal') renderRevealStage(card);
  else if (stage === 'choice') renderChoiceStage(card);
}

function renderRecognizeStage(card) {
  flashcardEl.classList.remove('flipped');
  cardFrontWordEl.textContent = card.it;
  const hint = `[${italianPhoneticHint(card.it)}]`;
  cardPhoneticEl.textContent = hint;
  // Op de achterkant (het moment dat je je antwoord checkt) herhalen we het
  // Italiaanse woord + fonetiek — op de voorkant zie je 'm maar heel even.
  cardBackSourceEl.textContent = `${card.it} · ${hint}`;
  cardBackWordEl.textContent = card.nl;
  cardExampleEl.textContent = card.ex ? `„${card.ex.it}” — ${card.ex.nl}` : '';
  cardExampleEl.classList.toggle('hidden', !card.ex);
}

function renderTypeStage(card) {
  typePromptEl.textContent = card.nl;
  typeInputEl.value = '';
  typeFeedbackEl.textContent = '';
  typeFeedbackEl.className = 'type-feedback';
  btnTypeCheck.textContent = 'Controleer';
  btnTypeCheck.dataset.stage = 'check';
  typeInputEl.focus();
}

/** Reveal-kaart: voor typ-modus-kaarten die niet betrouwbaar te typen zijn
 *  (meerdere/onvolledige vormen). Zelfde kaartstijl als typen/meerkeuze
 *  (geen 3D-flip) — je probeert het antwoord te herinneren, toont 'm dan
 *  zelf, en beoordeelt jezelf net als bij de herken-modus. */
function renderRevealStage(card) {
  revealPromptEl.textContent = card.nl;
  revealAnswerWordEl.textContent = card.it;
  revealPhoneticEl.textContent = `[${italianPhoneticHint(card.it)}]`;
  revealExampleEl.textContent = card.ex ? `„${card.ex.it}” — ${card.ex.nl}` : '';
  revealExampleEl.classList.toggle('hidden', !card.ex);
  revealAnswerBox.classList.add('hidden');
  btnRevealShow.classList.remove('hidden');
  answerButtons.classList.add('hidden');
}

function showRevealAnswer() {
  revealAnswerBox.classList.remove('hidden');
  btnRevealShow.classList.add('hidden');
  answerButtons.classList.remove('hidden');
}

/** Richting van de meerkeuzevraag volgt de actieve oefenmodus: in
 *  herken-modus zie je het Italiaans en kies je de Nederlandse betekenis
 *  (zoals bij flip-kaarten); in typ-modus zie je het Nederlands en kies je
 *  het Italiaanse woord (zoals bij typen) — dezelfde testrichting, alleen
 *  met scaffolding in plaats van vrij ophalen. */
function renderChoiceStage(card) {
  const promptIsItalian = state.mode !== 'type';
  const field = promptIsItalian ? 'nl' : 'it';

  choiceLabelEl.textContent = promptIsItalian ? 'Italiaans' : 'Nederlands';
  choicePromptEl.textContent = promptIsItalian ? card.it : card.nl;
  choicePhoneticEl.textContent = promptIsItalian ? `[${italianPhoneticHint(card.it)}]` : '';
  choicePhoneticEl.classList.toggle('hidden', !promptIsItalian);

  const options = buildChoiceOptions(card, field);
  const correctText = card[field];
  choiceOptionsEl.innerHTML = '';
  options.forEach(optionText => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-option';
    btn.textContent = optionText;
    btn.addEventListener('click', () => handleChoiceAnswer(optionText, correctText, card));
    choiceOptionsEl.appendChild(btn);
  });
  choiceFeedbackEl.textContent = '';
  choiceFeedbackEl.className = 'type-feedback';
  btnChoiceNext.classList.add('hidden');
}

function handleChoiceAnswer(chosenText, correctText, card) {
  const correct = chosenText === correctText;
  [...choiceOptionsEl.children].forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === correctText) btn.classList.add('correct');
    else if (btn.textContent === chosenText) btn.classList.add('incorrect');
  });
  // Als het juiste antwoord het Italiaanse woord zelf is (typ-modus-richting),
  // tonen we ook meteen de fonetiek — niet alleen op de prompt hierboven.
  const hint = correctText === card.it ? ` [${italianPhoneticHint(card.it)}]` : '';
  choiceFeedbackEl.textContent = (correct ? '✅ Corretto!' : `❌ Het juiste antwoord was: ${correctText}`) + hint;
  choiceFeedbackEl.className = 'type-feedback ' + (correct ? 'correct' : 'incorrect');

  resolveAttempt(correct);
  btnChoiceNext.textContent = session.pending.length === 0 ? 'Klaar' : 'Volgende →';
  btnChoiceNext.classList.remove('hidden');
}

function flipCard() {
  if (activeStageForCurrentCard() !== 'recognize') return;
  flashcardEl.classList.toggle('flipped');
}

function answerCard(correct) {
  resolveAttempt(correct);
  advance();
}

function submitTypedAnswer() {
  if (btnTypeCheck.dataset.stage === 'check') {
    const entry = currentEntry();
    const correct = checkTypedAnswer(entry.card, typeInputEl.value);
    const hint = `[${italianPhoneticHint(entry.card.it)}]`;
    typeFeedbackEl.textContent = correct ? `✅ Corretto! ${hint}` : `❌ Was: ${entry.card.it} ${hint}`;
    typeFeedbackEl.className = 'type-feedback ' + (correct ? 'correct' : 'incorrect');

    resolveAttempt(correct);
    btnTypeCheck.textContent = session.pending.length === 0 ? 'Klaar' : 'Volgende →';
    btnTypeCheck.dataset.stage = 'next';
    // Bewust NIET het invoerveld disablen/blurren hier: dat joeg het
    // toetsenbord op mobiel elke keer open én dicht tussen twee kaarten in
    // typ-modus. Het veld blijft nu gewoon actief en in focus; de volgende
    // kaart reset de waarde toch (renderTypeStage), en pas als de kaart
    // écht geen typveld nodig heeft, laat renderCurrentCard 'm zakken.
  } else {
    advance();
  }
}

function finishSession() {
  const total = session.totalDistinct;
  const knownN = session.sessionKnown.length;
  const pct = total ? Math.round((knownN / total) * 100) : 0;

  studyIndexEl.textContent = total;
  studyProgressEl.style.width = '100%';

  const messages = [
    [90, '🏆', 'Perfetto!'],
    [70, '🎉', 'Fantastico!'],
    [45, '💪', 'Bella prova!'],
    [0, '🌱', 'Goed begin!']
  ];
  const [, emoji, title] = messages.find(([min]) => pct >= min);

  summaryEmojiEl.textContent = emoji;
  summaryTitleEl.textContent = title;
  summaryTextEl.textContent = `Je kende ${knownN} van de ${total} woordjes meteen goed (${pct}%).`;
  summaryBarFillEl.style.width = '0%';
  requestAnimationFrame(() => { summaryBarFillEl.style.width = `${pct}%`; });

  btnRetryHard.classList.toggle('hidden', session.sessionPractice.length === 0);

  if (pct >= 70) launchConfetti();

  showView(viewSummary);
  renderHome(); // stats/voortgang alvast bijwerken voor als de gebruiker teruggaat
}

/* ---------------- Confetti ---------------- */

function launchConfetti() {
  const emojis = ['🎉', '✨', '🇮🇹', '⭐', '🍕'];
  for (let i = 0; i < 26; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    confettiLayer.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}

/* ---------------- Event wiring ---------------- */

flashcardEl.addEventListener('click', flipCard);
btnPractice.addEventListener('click', () => answerCard(false));
btnKnow.addEventListener('click', () => answerCard(true));
btnBackHome.addEventListener('click', () => { renderHome(); showView(viewHome); });
btnToHome.addEventListener('click', () => { renderHome(); showView(viewHome); });

btnRestartDeck.addEventListener('click', () => startSession(session.deck));
btnRetryHard.addEventListener('click', () => startSession(session.deck, session.sessionPractice));

btnDailySession.addEventListener('click', startDailySession);

btnTypeCheck.addEventListener('click', submitTypedAnswer);
// Klikken/tikken op een <button> verplaatst de focus daar standaard naartoe
// (weg van #type-input) — op mobiel blurt dat het typveld en klapt het
// schermtoetsenbord dicht, om bij de volgende kaart weer open te klappen.
// preventDefault() op mousedown voorkomt die focusverschuiving (de click
// zelf blijft gewoon werken), zodat het toetsenbord tijdens een hele
// reeks typ-kaarten gewoon open blijft staan.
btnTypeCheck.addEventListener('mousedown', (e) => e.preventDefault());
typeInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitTypedAnswer(); }
});

btnChoiceNext.addEventListener('click', advance);
btnRevealShow.addEventListener('click', showRevealAnswer);

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    saveState();
    renderHome();
  });
});

document.addEventListener('keydown', (e) => {
  if (viewStudy.classList.contains('hidden')) return;
  if (activeStageForCurrentCard() !== 'recognize') return; // typen/meerkeuze handelen eigen toetsen af
  if (e.code === 'Space') { e.preventDefault(); flipCard(); }
  if (e.code === 'ArrowRight') answerCard(true);
  if (e.code === 'ArrowLeft') answerCard(false);
});

/* ---------------- Boot ---------------- */

renderHome();
showView(viewHome);
