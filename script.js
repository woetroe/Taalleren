// Parla! — kleine, dependency-vrije flashcards-app.
// Alles draait client-side; voortgang wordt bewaard in localStorage.

const STORAGE_KEY = 'parla-italian-flashcards-v1';

/** Virtuele "mix"-deck die willekeurig door alle categorieën heen gaat. */
const MIX_DECK = {
  id: 'mix',
  name: 'Alles door elkaar',
  emoji: '🎲',
  color: '#16171b',
  isMix: true,
  get cards() {
    return DECKS.flatMap(d => d.cards.map(c => ({ ...c, sourceEmoji: d.emoji, sourceName: d.name })));
  }
};

function allDecks() {
  return [...DECKS, MIX_DECK];
}

/* ---------------- State (localStorage) ---------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cardStatus: {}, streak: { lastVisit: null, count: 0 } };
    const parsed = JSON.parse(raw);
    return {
      cardStatus: parsed.cardStatus || {},
      streak: parsed.streak || { lastVisit: null, count: 0 }
    };
  } catch (e) {
    return { cardStatus: {}, streak: { lastVisit: null, count: 0 } };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const state = loadState();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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

function markStatus(deckId, card, status) {
  state.cardStatus[cardId(deckId, card)] = status;
  saveState();
}

function statusOf(deckId, card) {
  return state.cardStatus[cardId(deckId, card)] || 'new';
}

function deckKnownCount(deck) {
  return deck.cards.filter(c => statusOf(deck.id, c) === 'known').length;
}

function totalWordCount() {
  return DECKS.reduce((sum, d) => sum + d.cards.length, 0);
}

function totalKnownCount() {
  return DECKS.reduce((sum, d) => sum + deckKnownCount(d), 0);
}

/* ---------------- DOM refs ---------------- */

const viewHome = document.getElementById('view-home');
const viewStudy = document.getElementById('view-study');
const viewSummary = document.getElementById('view-summary');
const deckGrid = document.getElementById('deck-grid');

const streakCountEl = document.getElementById('streak-count');
const knownCountEl = document.getElementById('known-count');
const totalCountEl = document.getElementById('total-count');

const studyEmojiEl = document.getElementById('study-emoji');
const studyDeckNameEl = document.getElementById('study-deck-name');
const studyIndexEl = document.getElementById('study-index');
const studyTotalEl = document.getElementById('study-total');
const studyProgressEl = document.getElementById('study-progress');

const flashcardEl = document.getElementById('flashcard');
const cardFrontWordEl = document.getElementById('card-front-word');
const cardBackWordEl = document.getElementById('card-back-word');

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
  streakCountEl.textContent = state.streak.count || 0;
  knownCountEl.textContent = totalKnownCount();
  totalCountEl.textContent = totalWordCount();

  deckGrid.innerHTML = '';
  allDecks().forEach(deck => {
    const card = document.createElement('button');
    card.className = 'deck-card' + (deck.isMix ? ' mix-card' : '');
    card.style.setProperty('--deck-color', deck.color);

    const known = deck.isMix ? totalKnownCount() : deckKnownCount(deck);
    const total = deck.cards.length;
    const pct = total ? Math.round((known / total) * 100) : 0;

    card.innerHTML = `
      <div class="deck-card-top">
        <span class="deck-emoji" style="background:${deck.color}33">${deck.emoji}</span>
        <span class="deck-count-badge">${total} woorden</span>
      </div>
      <span class="deck-name">${deck.name}</span>
      <div class="deck-progress-track">
        <div class="deck-progress-fill" style="width:${pct}%;background:${deck.color}"></div>
      </div>
      <span class="deck-progress-label">${pct}% onder de knie${deck.isMix ? ' (totaal)' : ''}</span>
    `;
    card.addEventListener('click', () => startSession(deck));
    deckGrid.appendChild(card);
  });
}

/* ---------------- Study session ---------------- */

let session = null; // { deck, queue: [card,...], index, sessionKnown: [], sessionPractice: [] }

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
  session = {
    deck,
    queue: cards,
    index: 0,
    sessionKnown: [],
    sessionPractice: []
  };
  bumpStreak();
  studyEmojiEl.textContent = deck.emoji;
  studyDeckNameEl.textContent = deck.name;
  studyTotalEl.textContent = cards.length;
  showView(viewStudy);
  renderCurrentCard();
}

function currentDeckIdFor(card) {
  // Voor de mix-deck moet de status per bron-categorie worden opgeslagen,
  // zodat voortgang ook zichtbaar is in de losse decks.
  if (session.deck.isMix) {
    const owner = DECKS.find(d => d.cards.some(c => c.it === card.it && c.nl === card.nl));
    return owner ? owner.id : session.deck.id;
  }
  return session.deck.id;
}

function renderCurrentCard() {
  const card = session.queue[session.index];
  flashcardEl.classList.remove('flipped');
  cardFrontWordEl.textContent = card.it;
  cardBackWordEl.textContent = card.nl;
  studyIndexEl.textContent = session.index + 1;
  const pct = Math.round((session.index / session.queue.length) * 100);
  studyProgressEl.style.width = `${pct}%`;
}

function flipCard() {
  flashcardEl.classList.toggle('flipped');
}

function answerCard(status) {
  const card = session.queue[session.index];
  const deckId = currentDeckIdFor(card);
  markStatus(deckId, card, status);

  if (status === 'known') session.sessionKnown.push(card);
  else session.sessionPractice.push(card);

  if (session.index + 1 < session.queue.length) {
    session.index += 1;
    renderCurrentCard();
  } else {
    finishSession();
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
btnPractice.addEventListener('click', () => answerCard('practice'));
btnKnow.addEventListener('click', () => answerCard('known'));
btnBackHome.addEventListener('click', () => { renderHome(); showView(viewHome); });
btnToHome.addEventListener('click', () => { renderHome(); showView(viewHome); });

btnRestartDeck.addEventListener('click', () => startSession(session.deck));
btnRetryHard.addEventListener('click', () => startSession(session.deck, shuffle(session.sessionPractice)));

document.addEventListener('keydown', (e) => {
  if (viewStudy.classList.contains('hidden')) return;
  if (e.code === 'Space') { e.preventDefault(); flipCard(); }
  if (e.code === 'ArrowRight') answerCard('known');
  if (e.code === 'ArrowLeft') answerCard('practice');
});

/* ---------------- Boot ---------------- */

renderHome();
showView(viewHome);
