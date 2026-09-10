// Uitgebreide smoke- en logica-tests voor Parla!
// Draait de echte app in een headless browser en controleert zowel de UI
// als de onderliggende state (localStorage) na interacties.
const { chromium } = require('playwright');

const BASE = 'http://localhost:8934/index.html';
let failures = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✅', msg); }
  else { failures++; console.log('  ❌', msg); }
}

// In deze headless testomgeving heeft het Chromium-proces zelf geen
// uitgaande netwerktoegang (alleen tools zoals curl gaan via de
// geconfigureerde agent-proxy) — daardoor faalt de Google Fonts-load hier
// altijd met ERR_CONNECTION_RESET. Dat is een sandbox-artefact, geen bug:
// in een echte browser met normale internettoegang laadt het font gewoon.
// We filteren die specifieke, verwachte melding daarom uit de testresultaten.
const KNOWN_SANDBOX_NOISE = /ERR_CONNECTION_RESET/;

async function freshContext(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !KNOWN_SANDBOX_NOISE.test(msg.text())) errors.push('console: ' + msg.text());
  });
  return { ctx, page, errors };
}

/** Beantwoordt in de browser de kaart die nu vooraan staat: 'know' -> goed,
 *  'practice' -> fout. Werkt voor herken-, typ- en reveal-modus (niet voor
 *  meerkeuze, die gebruikt de losse choice-optieknoppen). */
async function answerCurrent(page, correct) {
  const stage = await page.evaluate(() => activeStageForCurrentCard());
  if (stage === 'recognize') {
    await page.locator('#flashcard').click();
    await page.waitForTimeout(20);
    await page.locator(correct ? '#btn-know' : '#btn-practice').click();
  } else if (stage === 'type') {
    const card = await page.evaluate(() => session.pending[0].card);
    await page.locator('#type-input').fill(correct ? card.it : '___fout___');
    await page.locator('#btn-type-check').click();
    await page.waitForTimeout(20);
    await page.locator('#btn-type-check').click();
  } else if (stage === 'reveal') {
    await page.locator('#btn-reveal-show').click();
    await page.waitForTimeout(20);
    await page.locator(correct ? '#btn-know' : '#btn-practice').click();
  } else if (stage === 'choice') {
    const correctText = await page.evaluate(() => {
      const entry = session.pending[0];
      const promptIsItalian = state.mode !== 'type';
      return promptIsItalian ? entry.card.nl : entry.card.it;
    });
    if (correct) {
      await page.locator('.choice-option', { hasText: correctText }).first().click();
    } else {
      // kies gewoon de eerste optie die niet de juiste tekst heeft
      const handles = await page.$$('.choice-option');
      for (const h of handles) {
        const t = await h.textContent();
        if (t !== correctText) { await h.click(); break; }
      }
    }
    await page.waitForTimeout(20);
    await page.locator('#btn-choice-next').click();
  }
  await page.waitForTimeout(20);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  // ---------------------------------------------------------------
  console.log('\n1) Home laadt schoon, alle decks + kernwoorden + mix zichtbaar');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const deckCount = await page.locator('.deck-card').count();
    const dataDeckCount = await page.evaluate(() => DECKS.length);
    ok(deckCount === dataDeckCount + 2, `grid toont ${deckCount} tegels (verwacht ${dataDeckCount} categorieën + kernwoorden + mix = ${dataDeckCount + 2})`);

    const total = await page.locator('#total-count').innerText();
    const expectedTotal = await page.evaluate(() => DECKS.reduce((s, d) => s + d.cards.length, 0));
    ok(Number(total) === expectedTotal, `totaal aantal woorden klopt (${total} === ${expectedTotal})`);

    ok(await page.locator('#btn-daily-session').isEnabled(), 'dagelijkse-oefening knop is actief bij verse start');
    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n2) Herhalen tot goed: een fout beantwoord woord verlaat de sessie niet');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);

    const target = await page.evaluate(() => session.pending[0].card.it);
    ok(await page.evaluate((t) => session.pending.some(e => e.card.it === t), target) === true, `doelwoord "${target}" zit in de pending-lijst`);

    // 1x fout beantwoorden -> mag NIET meteen de sessie beëindigen, en moet
    // nog steeds ergens in "pending" staan (opnieuw ingepland, niet weggegooid).
    await answerCurrent(page, false);
    const stillThere = await page.evaluate((t) => session.pending.some(e => e.card.it === t), target);
    ok(stillThere, 'na 1x fout staat het woord nog steeds in de wachtrij (niet weggegooid)');
    const sessionStillOpen = await page.locator('#view-study').isVisible();
    ok(sessionStillOpen, 'sessie is nog niet afgerond na 1 fout antwoord');

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n3) Meerkeuze vanaf de 3e poging op hetzelfde woord');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);
    const target = await page.evaluate(() => session.pending[0].card.it);

    // Elke andere kaart meteen goed wegwerken, het doelwoord tot 2x toe fout
    // beantwoorden, dan moet de 3e keer meerkeuze zijn.
    let guard = 0;
    while (true) {
      guard++;
      if (guard > 500) { ok(false, 'veiligheidslimiet bereikt in meerkeuze-test'); break; }
      const { isTarget, misses, stage } = await page.evaluate((t) => ({
        isTarget: session.pending[0].card.it === t,
        misses: session.pending[0].misses,
        stage: activeStageForCurrentCard()
      }), target);
      if (isTarget && misses >= 2) {
        ok(stage === 'choice', `bij misses=${misses} op het doelwoord is de actieve stage "choice" (gevonden: "${stage}")`);
        break;
      }
      await answerCurrent(page, isTarget ? false : true);
    }

    const optionTexts = await page.locator('.choice-option').allTextContents();
    ok(optionTexts.length === 4, `meerkeuze toont 4 opties (gevonden: ${optionTexts.length})`);
    ok(new Set(optionTexts).size === 4, 'de 4 opties zijn onderling uniek');
    const targetNl = await page.evaluate((t) => DECKS.flatMap(d => d.cards).find(c => c.it === t).nl, target);
    ok(optionTexts.includes(targetNl), `het juiste antwoord ("${targetNl}") zit tussen de opties`);

    // Fonetische hint hoort bij een Italiaans prompt (herken-modus is actief mode).
    const phoneticShown = await page.locator('#choice-phonetic').innerText();
    ok(phoneticShown.startsWith('[') && phoneticShown.endsWith(']'), `fonetische hint zichtbaar bij het meerkeuze-prompt (gevonden: "${phoneticShown}")`);

    // Verkeerde optie kiezen -> woord blijft in de wachtrij, moet weer choice zijn.
    const handles = await page.$$('.choice-option');
    let clicked = false;
    for (const h of handles) {
      const t = await h.textContent();
      if (t !== targetNl) { await h.click(); clicked = true; break; }
    }
    ok(clicked, 'een foute meerkeuze-optie is aangeklikt');
    await page.waitForTimeout(50);
    const feedbackWrong = await page.locator('#choice-feedback').innerText();
    ok(feedbackWrong.includes(targetNl), `feedback bij fout antwoord toont het juiste antwoord (${feedbackWrong})`);
    await page.locator('#btn-choice-next').click();
    await page.waitForTimeout(50);

    guard = 0;
    while (true) {
      guard++;
      if (guard > 500) { ok(false, 'veiligheidslimiet (2)'); break; }
      const { isTarget, stage } = await page.evaluate((t) => ({
        isTarget: session.pending[0].card.it === t,
        stage: activeStageForCurrentCard()
      }), target);
      if (isTarget) {
        ok(stage === 'choice', `blijft meerkeuze na een gemiste meerkeuze-poging (gevonden: "${stage}")`);
        break;
      }
      await answerCurrent(page, true);
    }

    // Nu het juiste antwoord kiezen -> woord verdwijnt uit de wachtrij, box
    // wordt bijgewerkt als "niet in 1x goed" (dus box=1, ongeacht eerdere box).
    const correctHandles = await page.$$('.choice-option');
    for (const h of correctHandles) {
      const t = await h.textContent();
      if (t === targetNl) { await h.click(); break; }
    }
    await page.waitForTimeout(50);
    await page.locator('#btn-choice-next').click();
    await page.waitForTimeout(100);
    const stillPending = await page.evaluate((t) => session.pending.some(e => e.card.it === t), target);
    ok(!stillPending, 'na een correct meerkeuze-antwoord verdwijnt het woord definitief uit de wachtrij');
    const box = await page.evaluate((t) => statusOf('begroetingen', DECKS.flatMap(d => d.cards).find(c => c.it === t)).box, target);
    ok(box === 1, `box is 1 omdat het woord niet in 1x goed ging, ondanks uiteindelijk succes (gevonden: ${box})`);

    ok(errors.length === 0, `geen console/page errors tijdens meerkeuze-test (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n3b) Box-eerlijkheid: hoge box zakt terug als een woord vandaag hapert, ook al lukt het uiteindelijk');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'begroetingen');
      state.cardStatus[cardId('begroetingen', deck.cards[0])] = { box: 4, due: '2000-01-01' };
      saveState();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);
    const targetIt = await page.evaluate(() => DECKS.find(d => d.id === 'begroetingen').cards[0].it);

    let guard = 0, failedOnce = false;
    while (true) {
      guard++;
      if (guard > 500) { ok(false, 'veiligheidslimiet in box-eerlijkheid-test'); break; }
      const { isTarget, stillPending } = await page.evaluate((t) => ({
        isTarget: session.pending.length > 0 && session.pending[0].card.it === t,
        stillPending: session.pending.some(e => e.card.it === t)
      }), targetIt);
      if (!stillPending) break; // definitief gemasterd
      if (isTarget && !failedOnce) {
        // Eerst bewust 1x fout — de box mag dan NOG NIET wijzigen: de
        // Leitner-status wordt pas bijgewerkt zodra het woord deze sessie
        // écht gemasterd is, niet bij elke losse (foute) poging.
        await answerCurrent(page, false);
        failedOnce = true;
        const boxRightAfterMiss = await page.evaluate((t) => statusOf('begroetingen', DECKS.find(d => d.id === 'begroetingen').cards.find(c => c.it === t)).box, targetIt);
        ok(boxRightAfterMiss === 4, `box blijft ongewijzigd (4) direct na 1 fout antwoord, nog niet "afgestraft" (gevonden: ${boxRightAfterMiss})`);
      } else if (isTarget) {
        await answerCurrent(page, true); // nu wel goed -> woord is gemasterd, maar niet in 1x
      } else {
        await answerCurrent(page, true);
      }
    }
    const boxAfterMastery = await page.evaluate((t) => statusOf('begroetingen', DECKS.find(d => d.id === 'begroetingen').cards.find(c => c.it === t)).box, targetIt);
    ok(boxAfterMastery === 1, `zodra het woord alsnog lukt (na 1 miss) zakt de box alsnog van 4 naar 1 (gevonden: ${boxAfterMastery})`);

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n4) Typ-modus blijft werken met het nieuwe sessiemodel (incl. noType-fallback)');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.mode-btn[data-mode="type"]').click();
    await page.locator('.deck-card', { hasText: 'Lichaam' }).first().click();
    await page.waitForTimeout(150);

    ok(await page.locator('#type-stage').isVisible(), 'typ-kaart zichtbaar in typ-modus');
    const card = await page.evaluate(() => session.pending[0].card);
    await page.locator('#type-input').fill(card.it.toUpperCase() + '  ');
    await page.locator('#btn-type-check').click();
    await page.waitForTimeout(80);
    const feedbackText = await page.locator('#type-feedback').innerText();
    ok(feedbackText.startsWith('✅ Corretto!'), `correct (ongeacht hoofdletters/spaties) geeft groen "Corretto!" (gevonden: "${feedbackText}")`);
    const expectedTypeHint = await page.evaluate((it) => `[${italianPhoneticHint(it)}]`, card.it);
    ok(feedbackText.includes(expectedTypeHint), `feedback bij typen toont ook de fonetische hint (gevonden: "${feedbackText}")`);
    const stillFocused = await page.evaluate(() => document.activeElement && document.activeElement.id === 'type-input');
    ok(stillFocused, 'typveld blijft in focus na het controleren (geen toetsenbord-whiplash tussen kaarten)');
    const stillEnabled = await page.locator('#type-input').isEnabled();
    ok(stillEnabled, 'typveld wordt niet meer uitgeschakeld na het controleren');
    const boxAfter = await page.evaluate((it) => statusOf('lichaam', DECKS.find(d => d.id === 'lichaam').cards.find(c => c.it === it)).box, card.it);
    ok(boxAfter === 1, `box gaat naar 1 na correct getypt antwoord in 1x (gevonden: ${boxAfter})`);
    await page.locator('#btn-type-check').click();
    await page.waitForTimeout(80);

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();

    // noType-fallback: "Mi chiamo..." moet ondanks typ-modus NIET als 3D-flip-kaart
    // tonen (dat voelde als "gewoon flashcards" i.p.v. overhoren), maar als
    // reveal-kaart in dezelfde stijl als typen — en mag na 2 missers gewoon
    // naar meerkeuze gaan (geen typ-probleem daar).
    const { ctx: ctx2, page: page2, errors: errors2 } = await freshContext(browser);
    await page2.goto(BASE, { waitUntil: 'networkidle' });
    await page2.locator('.mode-btn[data-mode="type"]').click();
    await page2.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page2.waitForTimeout(150);

    let sawNoTypeRevealFallback = false;
    let sawNoTypeAsFlipCard = false;
    let guard = 0;
    while (true) {
      guard++;
      if (guard > 500) { ok(false, 'veiligheidslimiet in noType-test'); break; }
      const info = await page2.evaluate(() => ({
        it: session.pending[0].card.it,
        noType: session.pending[0].card.noType === true,
        stage: activeStageForCurrentCard()
      }));
      if (info.noType && info.stage === 'reveal') sawNoTypeRevealFallback = true;
      if (info.noType && info.stage === 'recognize') sawNoTypeAsFlipCard = true;
      const stillHasNoType = await page2.evaluate(() => session.pending.some(e => e.card.noType));
      if (!stillHasNoType) break;
      await answerCurrent(page2, true);
    }
    ok(sawNoTypeRevealFallback, 'een noType-kaart wordt in typ-modus getoond als reveal-kaart (niet als flip-kaart)');
    ok(!sawNoTypeAsFlipCard, 'een noType-kaart verschijnt in typ-modus nooit meer als de 3D-flip-flashcard');

    ok(errors2.length === 0, `geen console/page errors tijdens noType-test (${JSON.stringify(errors2)})`);
    await ctx2.close();
  }

  // ---------------------------------------------------------------
  console.log('\n5) Fonetische hint: zichtbaar op de kaart, en geen crashes over de hele dataset');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const fuzz = await page.evaluate(() => {
      let crashes = 0, empty = 0, total = 0;
      DECKS.forEach(d => d.cards.forEach(c => {
        total++;
        try {
          const h = italianPhoneticHint(c.it);
          if (!h || !h.trim()) empty++;
        } catch (e) { crashes++; }
      }));
      return { crashes, empty, total };
    });
    ok(fuzz.crashes === 0, `italianPhoneticHint() crasht niet op alle ${fuzz.total} woorden (crashes: ${fuzz.crashes})`);
    ok(fuzz.empty === 0, `geen enkele hint is leeg (leeg: ${fuzz.empty})`);

    const spotChecks = await page.evaluate(() => ({
      ciao: italianPhoneticHint('Ciao'),
      buongiorno: italianPhoneticHint('Buongiorno'),
      famiglia: italianPhoneticHint('La famiglia'),
      apostrofo: italianPhoneticHint("Non c'è di che")
    }));
    ok(spotChecks.ciao === 'tsjao', `"Ciao" -> "tsjao" (gevonden: "${spotChecks.ciao}")`);
    ok(spotChecks.buongiorno === 'buondzjorno', `"Buongiorno" -> "buondzjorno" (gevonden: "${spotChecks.buongiorno}")`);
    ok(spotChecks.famiglia === 'la familja', `"La famiglia" -> "la familja" (gevonden: "${spotChecks.famiglia}")`);
    ok(spotChecks.apostrofo === "non tsj'è di ke", `apostrof-elisie blijft zacht ("c'è") (gevonden: "${spotChecks.apostrofo}")`);

    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);
    const shownHint = await page.locator('#card-phonetic').innerText();
    ok(shownHint.startsWith('[') && shownHint.endsWith(']') && shownHint.length > 2, `fonetische hint zichtbaar op de kaart-voorkant (gevonden: "${shownHint}")`);

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n6) Dagelijkse oefening: samenstelling ongewijzigd, werkt met het nieuwe sessiemodel');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const poolFresh = await page.evaluate(() => buildDailyPool().length);
    ok(poolFresh === 10, `bij verse start bevat de dagpool 10 nieuwe kaarten (gevonden: ${poolFresh})`);

    await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'kleuren');
      const past = '2000-01-01';
      for (let i = 0; i < 5; i++) state.cardStatus[cardId('kleuren', deck.cards[i])] = { box: 2, due: past };
      saveState();
    });
    const pool = await page.evaluate(() => buildDailyPool().length);
    ok(pool === 15, `dagpool = 5 due + 10 nieuwe = 15 kaarten (gevonden: ${pool})`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#btn-daily-session').click();
    await page.waitForTimeout(150);
    ok(await page.locator('#study-total').innerText() === '15', 'dagsessie heeft 15 unieke kaarten (study-total)');
    ok(await page.locator('#study-index').innerText() === '0', 'nog 0 gemasterd bij start (study-index)');

    await answerCurrent(page, true);
    const ownerWasCorrect = await page.evaluate(() => Object.keys(state.cardStatus).every(k => !k.startsWith('daily::')));
    ok(ownerWasCorrect, 'voortgang uit de dagsessie wordt bij de echte broncategorie opgeslagen (niet onder "daily")');

    ok(errors.length === 0, `geen console/page errors tijdens dagsessie-test (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n7) Volledige sessie zonder fouten: samenvatting, confetti, "herhaal moeilijke" verborgen');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.deck-card', { hasText: 'Weer' }).first().click();
    await page.waitForTimeout(150);
    const total = Number(await page.locator('#study-total').innerText());

    for (let i = 0; i < total; i++) await answerCurrent(page, true);
    await page.waitForTimeout(300);

    ok(await page.locator('#view-summary').isVisible(), 'samenvatting-view zichtbaar na de laatste kaart');
    const summaryText = await page.locator('#summary-text').innerText();
    ok(summaryText.includes(`${total} van de ${total}`), `iedereen in 1x goed -> ${total}/${total} (${summaryText})`);
    ok(await page.locator('#btn-retry-hard').isVisible() === false, '"herhaal moeilijke kaarten" is verborgen (niemand had een 2e poging nodig)');
    const confettiCount = await page.locator('.confetti-piece').count();
    ok(confettiCount > 0, `confetti verschijnt bij 100% (${confettiCount} stukjes)`);

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n8) Sessie met een gemist woord: "herhaal moeilijke kaarten" bevat precies dat woord');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.deck-card', { hasText: 'Weer' }).first().click();
    await page.waitForTimeout(150);
    const total = Number(await page.locator('#study-total').innerText());
    const target = await page.evaluate(() => session.pending[0].card.it);

    // Doelwoord 1x fout, daarna alles (incl. het doelwoord bij terugkomst) goed.
    let guard = 0, failedOnce = false;
    while (true) {
      guard++;
      if (guard > 500) { ok(false, 'veiligheidslimiet in sessie-met-fout-test'); break; }
      const stillPending = await page.evaluate(() => session.pending.length > 0);
      if (!stillPending) break;
      const isTarget = await page.evaluate((t) => session.pending[0].card.it === t, target);
      if (isTarget && !failedOnce) { await answerCurrent(page, false); failedOnce = true; }
      else await answerCurrent(page, true);
    }
    await page.waitForTimeout(300);

    const summaryText = await page.locator('#summary-text').innerText();
    ok(summaryText.includes(`${total - 1} van de ${total}`), `1 woord had een 2e poging nodig -> ${total - 1}/${total} (${summaryText})`);
    ok(await page.locator('#btn-retry-hard').isVisible(), '"herhaal moeilijke kaarten" is zichtbaar');

    await page.locator('#btn-retry-hard').click();
    await page.waitForTimeout(150);
    ok(await page.locator('#study-total').innerText() === '1', 'retry-sessie bevat precies 1 kaart');
    const retryCard = await page.evaluate(() => session.pending[0].card.it);
    ok(retryCard === target, `retry-sessie bevat het juiste (eerder gemiste) woord (gevonden: "${retryCard}")`);

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n9) Mobiel (390px): layout, geen horizontale scroll, footer/kbd-hint verborgen tijdens studeren');
  {
    const { ctx, page, errors } = await freshContext(browser, { width: 390, height: 844 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const hasHScrollHome = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    ok(!hasHScrollHome, 'geen horizontale scroll op het startscherm (390px)');

    await page.locator('.deck-card', { hasText: 'Kleuren' }).first().click();
    await page.waitForTimeout(200);

    const layout = await page.evaluate(() => ({
      hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      footerHidden: getComputedStyle(document.querySelector('.footer')).display === 'none',
      kbdHintHidden: getComputedStyle(document.getElementById('kbd-hint')).display === 'none',
      cardWidth: document.getElementById('flashcard').getBoundingClientRect().width,
      viewStudyHeight: document.getElementById('view-study').getBoundingClientRect().height,
      viewportHeight: window.innerHeight
    }));
    ok(!layout.hasHScroll, 'geen horizontale scroll in de studeerweergave (390px)');
    ok(layout.footerHidden, 'footer is verborgen tijdens studeren op mobiel (ruimte voor de kaart)');
    ok(layout.kbdHintHidden, 'toetsenbord-hint is verborgen tijdens studeren op mobiel');
    ok(layout.cardWidth > 300, `flashcard is volledig breed, geen kapotte/smalle kaart (gevonden: ${layout.cardWidth}px)`);
    ok(layout.viewStudyHeight > layout.viewportHeight * 0.7, `studeerweergave vult het grootste deel van het scherm i.p.v. opgepropt bovenaan te staan (${layout.viewStudyHeight}px van ${layout.viewportHeight}px)`);

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n10) Migratie van oude v1-data naar het nieuwe boxmodel blijft werken');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('parla-italian-flashcards-v1', JSON.stringify({
        cardStatus: { 'begroetingen::Ciao': 'known', 'begroetingen::Grazie': 'practice' },
        streak: { lastVisit: '2020-01-01', count: 7 }
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    const migrated = await page.evaluate(() => ({
      ciao: state.cardStatus['begroetingen::Ciao'],
      grazie: state.cardStatus['begroetingen::Grazie'],
      streak: state.streak.count
    }));
    ok(migrated.ciao && migrated.ciao.box === 3, `"known" migreert naar box 3 (gevonden: ${JSON.stringify(migrated.ciao)})`);
    ok(migrated.grazie && migrated.grazie.box === 1, `"practice" migreert naar box 1 (gevonden: ${JSON.stringify(migrated.grazie)})`);
    ok(migrated.streak === 7, `streak-telling blijft behouden (gevonden: ${migrated.streak})`);
    ok(errors.length === 0, `geen console/page errors tijdens migratie (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n11) Kernwoorden-deck bevat alleen tier-1 kaarten uit alle categorieën');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const check = await page.evaluate(() => {
      const expected = DECKS.reduce((s, d) => s + d.cards.filter(c => c.tier === 1).length, 0);
      return { coreLen: CORE_DECK.cards.length, expected, allTier1: CORE_DECK.cards.every(c => c.tier === 1) };
    });
    ok(check.coreLen === check.expected, `kernwoorden-deck heeft ${check.coreLen} kaarten (verwacht ${check.expected})`);
    ok(check.allTier1, 'alle kaarten in kernwoorden-deck hebben tier 1');
    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n12) Alle 17 categorieën zijn los doorlopen: flip + antwoorden werkt overal zonder crash');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const deckNames = await page.evaluate(() => DECKS.map(d => d.name));
    for (const name of deckNames) {
      await page.locator('.deck-card', { hasText: name }).first().click();
      await page.waitForTimeout(60);
      await page.locator('#flashcard').click();
      await page.waitForTimeout(30);
      const backText = await page.locator('#card-back-word').innerText();
      ok(backText.length > 0, `${name}: achterkant toont een vertaling ("${backText}")`);
      await page.locator('#btn-know').click();
      await page.waitForTimeout(30);
      await page.locator('#btn-back-home').click();
      await page.waitForTimeout(40);
    }
    ok(errors.length === 0, `geen console/page errors tijdens doorloop van alle categorieën (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n13) Fonetiek zichtbaar op het moment dat je een antwoord geeft (niet alleen heel even op de voorkant)');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Herken-modus: de achterkant van de flip-kaart herhaalt het Italiaanse
    // woord + fonetiek, niet alleen de Nederlandse vertaling.
    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);
    const frontIt = await page.evaluate(() => session.pending[0].card.it);
    await page.locator('#flashcard').click();
    await page.waitForTimeout(150);
    const backSource = await page.locator('#card-back-source').innerText();
    ok(backSource.includes(frontIt) && backSource.includes('['), `flip-kaart achterkant herhaalt het Italiaanse woord + fonetiek (gevonden: "${backSource}")`);
    await page.locator('#btn-back-home').click();
    await page.waitForTimeout(60);

    // Reveal-stage (noType in typ-modus): fonetiek zichtbaar zodra je "Toon
    // antwoord" klikt.
    await page.locator('.mode-btn[data-mode="type"]').click();
    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);
    let guard = 0, sawReveal = false, revealHint = '';
    while (!sawReveal) {
      guard++;
      if (guard > 500) { ok(false, 'veiligheidslimiet bij reveal-fonetiek-test'); break; }
      const stage = await page.evaluate(() => activeStageForCurrentCard());
      if (stage === 'reveal') {
        await page.locator('#btn-reveal-show').click();
        await page.waitForTimeout(60);
        revealHint = await page.locator('#reveal-phonetic').innerText();
        sawReveal = true;
        await page.locator('#btn-know').click();
        break;
      }
      await answerCurrent(page, true);
    }
    ok(sawReveal, 'reveal-stage is bereikt in deze test');
    ok(revealHint.startsWith('[') && revealHint.endsWith(']'), `fonetische hint zichtbaar op de reveal-kaart na "Toon antwoord" (gevonden: "${revealHint}")`);

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();

    // Meerkeuze in typ-modus-richting: de feedback bij het antwoord toont
    // ook de fonetiek van het Italiaanse woord (niet alleen op de prompt).
    const { ctx: ctx3, page: page3, errors: errors3 } = await freshContext(browser);
    await page3.goto(BASE, { waitUntil: 'networkidle' });
    await page3.locator('.mode-btn[data-mode="type"]').click();
    await page3.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page3.waitForTimeout(150);
    const target3 = await page3.evaluate(() => session.pending[0].card.it);

    let guard3 = 0;
    while (true) {
      guard3++;
      if (guard3 > 500) { ok(false, 'veiligheidslimiet bij choice-fonetiek-test'); break; }
      const { isTarget, stage } = await page3.evaluate((t) => ({
        isTarget: session.pending[0].card.it === t,
        stage: activeStageForCurrentCard()
      }), target3);
      if (isTarget && stage === 'choice') break;
      await answerCurrent(page3, isTarget ? false : true);
    }
    const handles3 = await page3.$$('.choice-option');
    for (const h of handles3) {
      const t = await h.textContent();
      if (t !== target3) { await h.click(); break; } // bewust fout, feedback toont dan het juiste antwoord + fonetiek
    }
    await page3.waitForTimeout(60);
    const choiceFeedback = await page3.locator('#choice-feedback').innerText();
    ok(choiceFeedback.includes(target3) && choiceFeedback.includes('['), `meerkeuze-feedback (typ-richting) toont ook fonetiek bij het juiste antwoord (gevonden: "${choiceFeedback}")`);

    ok(errors3.length === 0, `geen console/page errors (${JSON.stringify(errors3)})`);
    await ctx3.close();
  }

  // ---------------------------------------------------------------
  console.log('\n14) Robuustheid: corrupte/onleesbare opslag crasht de app niet en verliest voortgang niet stilletjes');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('parla-italian-flashcards-v2', '{not valid json {{{');
    });
    await page.reload({ waitUntil: 'networkidle' });

    const afterReload = await page.evaluate(() => ({
      total: totalWordCount(),
      knownCount: totalKnownCount(),
      backup: localStorage.getItem('parla-italian-flashcards-v2-corrupt-backup')
    }));
    ok(afterReload.total > 0, 'app laadt gewoon door na corrupte opslag (woordenlijst intact)');
    ok(afterReload.knownCount === 0, 'corrupte voortgang wordt niet als "gekend" geteld, maar de app crasht niet en start leeg');
    ok(afterReload.backup === '{not valid json {{{', 'de rauwe corrupte data wordt weggezet onder een backup-sleutel i.p.v. stilletjes weggegooid');

    // De app moet daarna gewoon weer normaal opslaan.
    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);
    await answerCurrent(page, true);
    const savedAgain = await page.evaluate(() => JSON.parse(localStorage.getItem('parla-italian-flashcards-v2')).cardStatus);
    ok(Object.keys(savedAgain).length > 0, 'na de corrupte-data-fallback wordt nieuwe voortgang weer gewoon opgeslagen');

    ok(errors.length === 0, `geen console/page errors tijdens robuustheidstest (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  await browser.close();

  console.log(`\n${'='.repeat(60)}\n${passed} geslaagd, ${failures} gefaald\n${'='.repeat(60)}`);
  process.exit(failures > 0 ? 1 : 0);
})();
