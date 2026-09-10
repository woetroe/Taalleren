// Uitgebreide smoke- en logica-tests voor Parla!
// Draait de echte app in een headless browser en controleert zowel de UI
// als de onderliggende state (localStorage) na interacties.
const { chromium } = require('playwright');
const assert = require('assert');

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

async function freshContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !KNOWN_SANDBOX_NOISE.test(msg.text())) errors.push('console: ' + msg.text());
  });
  return { ctx, page, errors };
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

    const firstTile = page.locator('.deck-card.core-card');
    ok(await firstTile.count() === 1, 'er is precies 1 "kernwoorden" (core) tegel');

    const heroEnabled = await page.locator('#btn-daily-session').isEnabled();
    ok(heroEnabled, 'dagelijkse-oefening knop is actief bij verse start (er is nieuw materiaal)');

    ok(errors.length === 0, `geen console/page errors (${errors.length} gevonden: ${JSON.stringify(errors)})`);
    await page.screenshot({ path: 'shot-home-v2.png', fullPage: true });
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n2) Leitner-boxlogica: correct antwoord verhoogt box, fout antwoord zet terug naar 1');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Kies de "Begroetingen"-deck expliciet.
    await page.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page.waitForTimeout(150);

    ok(await page.locator('#box-badge').innerText() === '🆕 Nieuw', 'eerste kaart toont "Nieuw"-badge');

    // Beantwoord de hele deck met "Ken ik!" en volg de doosjes.
    const deckLen = await page.evaluate(() => DECKS.find(d => d.id === 'begroetingen').cards.length);
    for (let i = 0; i < deckLen; i++) {
      await page.locator('#flashcard').click();
      await page.waitForTimeout(60);
      await page.locator('#btn-know').click();
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);

    const boxesAfterOnce = await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'begroetingen');
      return deck.cards.map(c => statusOf('begroetingen', c).box);
    });
    ok(boxesAfterOnce.every(b => b === 1), `alle kaarten staan na 1x "ken ik" op box 1 (gevonden: ${[...new Set(boxesAfterOnce)]})`);

    const duesAfterOnce = await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'begroetingen');
      const today = todayStr();
      return deck.cards.map(c => statusOf('begroetingen', c).due > today);
    });
    ok(duesAfterOnce.every(Boolean), 'vervaldatum ligt na 1x "ken ik" in de toekomst (niet vandaag weer due)');

    // Nog een keer de hele set doen -> box moet naar 2.
    await page.locator('#btn-restart-deck').click();
    await page.waitForTimeout(150);
    for (let i = 0; i < deckLen; i++) {
      await page.locator('#flashcard').click();
      await page.waitForTimeout(40);
      await page.locator('#btn-know').click();
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
    const boxesAfterTwice = await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'begroetingen');
      return deck.cards.map(c => statusOf('begroetingen', c).box);
    });
    ok(boxesAfterTwice.every(b => b === 2), `alle kaarten staan na 2x "ken ik" op box 2 (gevonden: ${[...new Set(boxesAfterTwice)]})`);

    // Eén kaart fout beantwoorden -> terug naar box 1.
    // Let op: de sessie wordt bij elke start opnieuw geshuffled, dus we lezen
    // de daadwerkelijk getoonde kaart uit session.queue[0] i.p.v. aan te nemen
    // dat dit deck.cards[0] is.
    await page.locator('#btn-restart-deck').click();
    await page.waitForTimeout(150);
    const shownCardIt = await page.evaluate(() => session.queue[0].it);
    await page.locator('#flashcard').click();
    await page.waitForTimeout(60);
    await page.locator('#btn-practice').click(); // "nog even oefenen" op de getoonde kaart
    await page.waitForTimeout(150);
    const shownCardBoxAfterFail = await page.evaluate((it) => {
      const deck = DECKS.find(d => d.id === 'begroetingen');
      const card = deck.cards.find(c => c.it === it);
      return statusOf('begroetingen', card).box;
    }, shownCardIt);
    ok(shownCardBoxAfterFail === 1, `kaart terug naar box 1 na "nog even oefenen" (gevonden: ${shownCardBoxAfterFail})`);

    ok(errors.length === 0, `geen console/page errors tijdens box-test (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n3) Typ-modus: correct/foutief antwoord, meerdere geldige vormen, noType-fallback');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });

    await page.locator('.mode-btn[data-mode="type"]').click();
    await page.waitForTimeout(100);
    ok(await page.locator('.mode-btn[data-mode="type"]').evaluate(el => el.classList.contains('active')), 'typ-modus knop wordt actief na klikken');

    // Lichaam-deck heeft geen slash- of ellips-kaarten: schone testcase.
    await page.locator('.deck-card', { hasText: 'Lichaam' }).first().click();
    await page.waitForTimeout(150);

    ok(await page.locator('#type-stage').isVisible(), 'typ-kaart is zichtbaar in typ-modus');
    ok(await page.locator('#recognize-stage').isVisible() === false, 'flip-kaart is verborgen in typ-modus');

    const firstIt = await page.evaluate(() => session.queue[0].it);
    await page.locator('#type-input').fill(firstIt.toUpperCase() + '  '); // hoofdletters + spaties moeten oké zijn
    await page.locator('#btn-type-check').click();
    await page.waitForTimeout(100);
    ok(await page.locator('#type-feedback').innerText() === '✅ Corretto!', 'correct (ongeacht hoofdletters/spaties) geeft groen "Corretto!"');
    const boxAfterCorrectType = await page.evaluate(() => statusOf('lichaam', session.queue[0]).box);
    ok(boxAfterCorrectType === 1, `box gaat naar 1 na correct getypt antwoord (gevonden: ${boxAfterCorrectType})`);

    await page.locator('#btn-type-check').click(); // "Volgende"
    await page.waitForTimeout(150);
    const secondIt = await page.evaluate(() => session.queue[1].it);
    await page.locator('#type-input').fill('dit is helemaal fout');
    await page.locator('#btn-type-check').click();
    await page.waitForTimeout(100);
    const feedback = await page.locator('#type-feedback').innerText();
    ok(feedback.includes(secondIt), `fout antwoord toont het juiste woord (${feedback})`);
    const boxAfterWrongType = await page.evaluate(() => statusOf('lichaam', session.queue[1]).box);
    ok(boxAfterWrongType === 1, 'box blijft/gaat naar 1 na fout getypt antwoord');

    await ctx.close();

    // Familie-deck bevat een kaart met twee geldige vormen ("Il cugino / la cugina").
    const { ctx: ctx2, page: page2 } = await freshContext(browser);
    await page2.goto(BASE, { waitUntil: 'networkidle' });
    await page2.locator('.mode-btn[data-mode="type"]').click();
    await page2.locator('.deck-card', { hasText: 'Familie' }).first().click();
    await page2.waitForTimeout(150);

    // Loop net zolang tot we de "cugino/cugina"-kaart tegenkomen (mag geskipt worden
    // door "Volgende" bij andere kaarten), test dan beide geaccepteerde varianten los.
    const variantAccepted = await page2.evaluate(async (variant) => {
      const idx = session.queue.findIndex(c => c.it.includes('cugino'));
      return { idx, ok: checkTypedAnswer(session.queue[idx], variant) };
    }, 'la cugina');
    ok(variantAccepted.ok, `alternatieve vorm "la cugina" wordt geaccepteerd voor "${'Il cugino / la cugina'}"`);

    // noType-fallback: "Mi chiamo..." moet ondanks typ-modus als flip-kaart tonen.
    await ctx2.close();
    const { ctx: ctx3, page: page3, errors: errors3 } = await freshContext(browser);
    await page3.goto(BASE, { waitUntil: 'networkidle' });
    await page3.locator('.mode-btn[data-mode="type"]').click();
    await page3.locator('.deck-card', { hasText: 'Begroetingen' }).first().click();
    await page3.waitForTimeout(150);

    const deckLen = await page3.evaluate(() => DECKS.find(d => d.id === 'begroetingen').cards.length);
    let sawNoTypeFallback = false;
    for (let i = 0; i < deckLen; i++) {
      const isNoType = await page3.evaluate(() => currentCard().noType === true);
      const recognizeVisible = await page3.locator('#recognize-stage').isVisible();
      const typeVisible = await page3.locator('#type-stage').isVisible();
      if (isNoType) {
        sawNoTypeFallback = true;
        ok(recognizeVisible && !typeVisible, `noType-kaart "${await page3.evaluate(() => currentCard().it)}" valt terug op flip-weergave in typ-modus`);
        await page3.locator('#flashcard').click();
        await page3.waitForTimeout(40);
        await page3.locator('#btn-know').click();
      } else {
        ok(typeVisible && !recognizeVisible, 'normale kaart toont typ-weergave in typ-modus');
        await page3.locator('#type-input').fill(await page3.evaluate(() => currentCard().it));
        await page3.locator('#btn-type-check').click();
        await page3.waitForTimeout(40);
        await page3.locator('#btn-type-check').click();
      }
      await page3.waitForTimeout(60);
    }
    ok(sawNoTypeFallback, 'minstens één noType-kaart is tijdens de sessie tegengekomen en getest');
    ok(errors3.length === 0, `geen console/page errors tijdens typ-modus-test (${JSON.stringify(errors3)})`);
    await ctx3.close();
  }

  // ---------------------------------------------------------------
  console.log('\n4) Dagelijkse oefening: mix van due + max. nieuwe kaarten, interleaving');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Verse state: alles is "nieuw", dus de pool moet exact DAILY_MAX_NEW kaarten zijn.
    const poolFresh = await page.evaluate(() => buildDailyPool().length);
    ok(poolFresh === 10, `bij verse start bevat de dagpool 10 nieuwe kaarten (gevonden: ${poolFresh})`);

    // Simuleer: 5 kaarten zijn al "due" (vervaldatum in het verleden), 3 kaarten
    // zijn geleerd maar nog niet due, de rest is ongezien.
    await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'kleuren');
      const past = '2000-01-01';
      const future = '2999-01-01';
      state.cardStatus[cardId('kleuren', deck.cards[0])] = { box: 2, due: past };
      state.cardStatus[cardId('kleuren', deck.cards[1])] = { box: 2, due: past };
      state.cardStatus[cardId('kleuren', deck.cards[2])] = { box: 2, due: past };
      state.cardStatus[cardId('kleuren', deck.cards[3])] = { box: 2, due: past };
      state.cardStatus[cardId('kleuren', deck.cards[4])] = { box: 2, due: past };
      state.cardStatus[cardId('kleuren', deck.cards[5])] = { box: 3, due: future };
      saveState();
    });
    const pool = await page.evaluate(() => buildDailyPool());
    ok(pool.length === 15, `dagpool = 5 due + 10 nieuwe = 15 kaarten (gevonden: ${pool.length})`);
    const dueInPool = await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'kleuren');
      const pool = buildDailyPool();
      return deck.cards.slice(0, 5).every(c => pool.includes(c));
    });
    ok(dueInPool, 'alle 5 due kaarten zitten daadwerkelijk in de dagpool');
    const notDueExcluded = await page.evaluate(() => {
      const deck = DECKS.find(d => d.id === 'kleuren');
      const pool = buildDailyPool();
      return !pool.includes(deck.cards[5]); // box 3, due in de toekomst -> hoort er niet bij
    });
    ok(notDueExcluded, 'een geleerde maar nog niet vervallen kaart zit niet in de dagpool');

    // UI: badge op home + op de kleuren-tegel moet 5 tonen.
    await page.reload({ waitUntil: 'networkidle' });
    const heroBadge = await page.locator('#daily-due-badge').innerText();
    ok(Number(heroBadge) === 15, `hero-badge toont 15 (gevonden: ${heroBadge})`);
    const kleurenDue = await page.locator('.deck-card', { hasText: 'Kleuren' }).first().locator('.due-badge').innerText();
    ok(kleurenDue.includes('5'), `Kleuren-tegel toont 🔔5 due (gevonden: "${kleurenDue}")`);

    // Start de dagelijkse oefening en check dat de sessie echt 15 kaarten bevat
    // en dat antwoorden bij de juíste broncategorie worden weggeschreven.
    await page.locator('#btn-daily-session').click();
    await page.waitForTimeout(150);
    const sessionTotal = await page.locator('#study-total').innerText();
    ok(Number(sessionTotal) === 15, `dagsessie heeft 15 kaarten (gevonden: ${sessionTotal})`);
    ok(await page.locator('#study-deck-name').innerText() === 'Dagelijkse oefening', 'sessie-titel is "Dagelijkse oefening"');

    await page.locator('#flashcard').click();
    await page.waitForTimeout(60);
    await page.locator('#btn-know').click();
    await page.waitForTimeout(100);
    const ownerWasCorrect = await page.evaluate(() => {
      // Elke aangeraakte kaart moet terug te vinden zijn onder zijn ECHTE deck-id,
      // niet onder "daily".
      return Object.keys(state.cardStatus).every(k => !k.startsWith('daily::'));
    });
    ok(ownerWasCorrect, 'voortgang uit de dagsessie wordt bij de echte broncategorie opgeslagen (niet onder "daily")');

    ok(errors.length === 0, `geen console/page errors tijdens dagsessie-test (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n5) Lege dagpool: hero-knop schakelt zichzelf uit');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const future = '2999-01-01';
      DECKS.forEach(deck => {
        deck.cards.forEach(c => {
          state.cardStatus[cardId(deck.id, c)] = { box: 5, due: future };
        });
      });
      saveState();
    });
    await page.reload({ waitUntil: 'networkidle' });
    const poolLen = await page.evaluate(() => buildDailyPool().length);
    ok(poolLen === 0, `dagpool is leeg als alles geleerd en niets due is (gevonden: ${poolLen})`);
    const disabled = await page.locator('#btn-daily-session').isDisabled();
    ok(disabled, 'hero-knop is uitgeschakeld als de dagpool leeg is');
    const subText = await page.locator('#daily-sub').innerText();
    ok(subText.includes('Niks te herhalen'), `subtekst meldt dat er niets te doen is (gevonden: "${subText}")`);
    const knownPct = await page.locator('.deck-card', { hasText: 'Kleuren' }).first().locator('.deck-progress-label').innerText();
    ok(knownPct.includes('100%'), `Kleuren-tegel toont 100% onder de knie (gevonden: "${knownPct}")`);
    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await page.screenshot({ path: 'shot-empty-daily.png' });
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n6) Migratie van oude v1-data naar het nieuwe boxmodel');
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
  console.log('\n7) Kernwoorden-deck bevat alleen tier-1 kaarten uit alle categorieën');
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
  console.log('\n8) Mobiel viewport (390px): geen horizontale scroll, hero/toggle/grid leesbaar');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    ok(!hasHScroll, 'geen horizontale scroll op 390px breed');
    await page.screenshot({ path: 'shot-home-mobile-v2.png', fullPage: true });

    await page.locator('.mode-btn[data-mode="type"]').click();
    await page.locator('.deck-card', { hasText: 'Weer' }).first().click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: 'shot-type-mobile.png' });
    const hasHScrollStudy = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    ok(!hasHScrollStudy, 'geen horizontale scroll in typ-modus op 390px breed');

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n9) Volledige recognize-sessie incl. samenvatting, "herhaal moeilijke kaarten" en confetti');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.deck-card', { hasText: 'Weer' }).first().click();
    await page.waitForTimeout(150);
    const total = Number(await page.locator('#study-total').innerText());

    // Beantwoord de eerste kaart fout, de rest goed -> < 100% maar >= 70% voor confetti.
    await page.locator('#flashcard').click();
    await page.locator('#btn-practice').click();
    for (let i = 1; i < total; i++) {
      await page.waitForTimeout(30);
      await page.locator('#flashcard').click();
      await page.locator('#btn-know').click();
    }
    await page.waitForTimeout(400);

    ok(await page.locator('#view-summary').isVisible(), 'samenvatting-view is zichtbaar na de laatste kaart');
    const summaryText = await page.locator('#summary-text').innerText();
    ok(summaryText.includes(`${total - 1} van de ${total}`), `samenvatting telt correct (${summaryText})`);
    ok(await page.locator('#btn-retry-hard').isVisible(), '"herhaal moeilijke kaarten" is zichtbaar (er was 1 fout antwoord)');
    const confettiCount = await page.locator('.confetti-piece').count();
    ok(confettiCount > 0, `confetti verschijnt bij een hoge score (${confettiCount} stukjes)`);

    await page.locator('#btn-retry-hard').click();
    await page.waitForTimeout(150);
    ok(await page.locator('#study-total').innerText() === '1', 'retry-sessie bevat precies de 1 foute kaart');

    ok(errors.length === 0, `geen console/page errors (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  // ---------------------------------------------------------------
  console.log('\n10) Alle 17 categorieën zijn los doorlopen: flip + antwoorden werkt overal zonder crash');
  {
    const { ctx, page, errors } = await freshContext(browser);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const deckNames = await page.evaluate(() => DECKS.map(d => d.name));
    for (const name of deckNames) {
      await page.locator('.deck-card', { hasText: name }).first().click();
      await page.waitForTimeout(80);
      await page.locator('#flashcard').click();
      await page.waitForTimeout(40);
      const backText = await page.locator('#card-back-word').innerText();
      ok(backText.length > 0, `${name}: achterkant toont een vertaling ("${backText}")`);
      await page.locator('#btn-know').click();
      await page.waitForTimeout(40);
      await page.locator('#btn-back-home').click();
      await page.waitForTimeout(60);
    }
    ok(errors.length === 0, `geen console/page errors tijdens doorloop van alle categorieën (${JSON.stringify(errors)})`);
    await ctx.close();
  }

  await browser.close();

  console.log(`\n${'='.repeat(60)}\n${passed} geslaagd, ${failures} gefaald\n${'='.repeat(60)}`);
  process.exit(failures > 0 ? 1 : 0);
})();
