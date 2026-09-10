// Parla! — kleine, dependency-vrije flashcards-app.
// Alles draait client-side; voortgang wordt bewaard in localStorage.
//
// De studielogica is gebaseerd op drie principes uit taalverwervingsonderzoek:
//  1. Spaced repetition (Leitner-boxen): kaarten komen terug vlak voordat je ze
//     zou vergeten, met steeds langere tussenpozen naarmate je ze beter kent
//     (Ebbinghaus' vergeetcurve; Cepeda e.a. 2006 over het spacing-effect).
//  2. Interleaving: de dagelijkse oefening husselt categorieën door elkaar in
//     plaats van blok voor blok te oefenen (Rohrer & Taylor 2007).
//  3. Retrieval practice / het testeffect: actief het antwoord ophalen (of
//     typen) beklijft beter dan herlezen (Karpicke & Roediger 2008) — vandaar
//     de "actief typen"-modus naast de herken-modus.

const STORAGE_KEY = 'parla-italian-flashcards-v2';
const LEGACY_STORAGE_KEY = 'parla-italian-flashcards-v1';

// Leitner-boxen 1 t/m 5: aantal dagen tot de volgende herhaling nadat een
// kaart in die box terechtkomt. Box 0 = nog nooit geoefend.
const BOX_INTERVALS_DAYS = [1, 3, 7, 16, 35];
const MAX_BOX = BOX_INTERVALS_DAYS.length; // 5
const KNOWN_BOX_THRESHOLD = 3; // vanaf hier telt een kaart als "onder de knie"

const DAILY_MAX_NEW = 10;
const DAILY_MAX_TOTAL = 40;

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
    return emptyState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

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

const flashcardEl = document.getElementById('flashcard');
const cardFrontWordEl = document.getElementById('card-front-word');
const cardBackWordEl = document.getElementById('card-back-word');
const cardExampleEl = document.getElementById('card-example');

const recognizeStage = document.getElementById('recognize-stage');
const typeStage = document.getElementById('type-stage');
const typePromptEl = document.getElementById('type-prompt');
const typeInputEl = document.getElementById('type-input');
const typeFeedbackEl = document.getElementById('type-feedback');
const btnTypeCheck = document.getElementById('btn-type-check');

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

function showView(view) {
  [viewHome, viewStudy, viewSummary].forEach(v => v.classList.add('hidden'));
  view.classList.remove('hidden');
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

let session = null; // { deck, queue, index, sessionKnown, sessionPractice }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startSession(deck, cardsOverride) {
  const cards = cardsOverride || shuffle(deck.cards);
  session = { deck, queue: cards, index: 0, sessionKnown: [], sessionPractice: [] };
  bumpStreak();
  studyEmojiEl.textContent = deck.emoji;
  studyDeckNameEl.textContent = deck.name;
  studyTotalEl.textContent = cards.length;
  showView(viewStudy);
  renderCurrentCard();
}

function currentCard() {
  return session.queue[session.index];
}

/** In typ-modus vallen kaarten met meerdere/onvolledige vormen (noType) terug
 *  op de herken-weergave, zodat elke due kaart alsnog geoefend wordt. */
function activeModeForCurrentCard() {
  const card = currentCard();
  return state.mode === 'type' && !card.noType ? 'type' : 'recognize';
}

function renderCurrentCard() {
  const card = currentCard();
  const deckId = ownerDeckId(session.deck, card);
  const box = statusOf(deckId, card).box;

  flashcardEl.classList.remove('flipped');
  cardFrontWordEl.textContent = card.it;
  cardBackWordEl.textContent = card.nl;
  cardExampleEl.textContent = card.ex ? `„${card.ex.it}” — ${card.ex.nl}` : '';
  cardExampleEl.classList.toggle('hidden', !card.ex);

  studyIndexEl.textContent = session.index + 1;
  const pct = Math.round((session.index / session.queue.length) * 100);
  studyProgressEl.style.width = `${pct}%`;
  boxBadgeEl.textContent = box === 0 ? '🆕 Nieuw' : `📦 Box ${box}/${MAX_BOX}`;

  const mode = activeModeForCurrentCard();
  recognizeStage.classList.toggle('hidden', mode !== 'recognize');
  typeStage.classList.toggle('hidden', mode !== 'type');
  answerButtons.classList.toggle('hidden', mode !== 'recognize');

  if (mode === 'type') {
    typePromptEl.textContent = card.nl;
    typeInputEl.value = '';
    typeFeedbackEl.textContent = '';
    typeFeedbackEl.className = 'type-feedback';
    typeInputEl.disabled = false;
    btnTypeCheck.textContent = 'Controleer';
    btnTypeCheck.dataset.stage = 'check';
    typeInputEl.focus();
  }
}

function flipCard() {
  if (activeModeForCurrentCard() !== 'recognize') return;
  flashcardEl.classList.toggle('flipped');
}

function answerCard(correct) {
  const card = currentCard();
  const deckId = ownerDeckId(session.deck, card);
  markStatus(deckId, card, correct);

  if (correct) session.sessionKnown.push(card);
  else session.sessionPractice.push(card);

  if (session.index + 1 < session.queue.length) {
    session.index += 1;
    renderCurrentCard();
  } else {
    finishSession();
  }
}

function submitTypedAnswer() {
  const card = currentCard();
  if (btnTypeCheck.dataset.stage === 'check') {
    const correct = checkTypedAnswer(card, typeInputEl.value);
    typeInputEl.disabled = true;
    if (correct) {
      typeFeedbackEl.textContent = '✅ Corretto!';
      typeFeedbackEl.className = 'type-feedback correct';
    } else {
      typeFeedbackEl.textContent = `❌ Was: ${card.it}`;
      typeFeedbackEl.className = 'type-feedback incorrect';
    }
    markStatus(ownerDeckId(session.deck, card), card, correct);
    if (correct) session.sessionKnown.push(card);
    else session.sessionPractice.push(card);

    const isLast = session.index + 1 >= session.queue.length;
    btnTypeCheck.textContent = isLast ? 'Klaar' : 'Volgende →';
    btnTypeCheck.dataset.stage = 'next';
  } else {
    if (session.index + 1 < session.queue.length) {
      session.index += 1;
      renderCurrentCard();
    } else {
      finishSession();
    }
  }
}

function finishSession() {
  const total = session.queue.length;
  const knownN = session.sessionKnown.length;
  const pct = total ? Math.round((knownN / total) * 100) : 0;

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
  summaryTextEl.textContent = `Je kende ${knownN} van de ${total} woordjes (${pct}%).`;
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
btnRetryHard.addEventListener('click', () => startSession(session.deck, shuffle(session.sessionPractice)));

btnDailySession.addEventListener('click', startDailySession);

btnTypeCheck.addEventListener('click', submitTypedAnswer);
typeInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitTypedAnswer(); }
});

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    saveState();
    renderHome();
  });
});

document.addEventListener('keydown', (e) => {
  if (viewStudy.classList.contains('hidden')) return;
  if (activeModeForCurrentCard() === 'type') return; // typeveld handelt eigen toetsen af
  if (e.code === 'Space') { e.preventDefault(); flipCard(); }
  if (e.code === 'ArrowRight') answerCard(true);
  if (e.code === 'ArrowLeft') answerCard(false);
});

/* ---------------- Boot ---------------- */

renderHome();
showView(viewHome);
