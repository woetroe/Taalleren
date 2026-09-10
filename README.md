# Parla! 🇮🇹 — Italiaans flashcards

Een kleurrijke, speelse flashcardsapp om Italiaans te leren. Gebouwd in vanilla
HTML/CSS/JS (geen dependencies, geen build-stap), in een gedurfde
"Momkai"-achtige stijl: dikke zwarte outlines, felle kleurvlakken, harde
offset-shadows en organische blob-decoraties.

## Gebruiken

Open `index.html` gewoon in een browser, of serveer de map met een simpele
static server, bijvoorbeeld:

```bash
python3 -m http.server 8000
```

en ga naar `http://localhost:8000`.

De app werkt ook direct als GitHub Pages-site: zet Pages aan voor deze branch/map
en er is verder niets te configureren.

### Deployen naar Vercel

`vercel.json` schakelt de install- en buildstap van Vercel expliciet uit en wijst
de repo-root aan als statische output. Dat is nodig omdat er wél een
`package.json` in de repo staat (voor de Playwright-tests in `test.js`) — zonder
deze override probeert Vercel standaard `npm install` te draaien, wat de
Playwright-browserdownload kan triggeren en de build kan laten mislukken
(zichtbaar als een `404: NOT_FOUND` op de live URL, omdat er dan nooit een
geslaagde deployment ontstaat). Met `vercel.json` erbij is er niets te
installeren of te bouwen: Vercel serveert `index.html` gewoon direct.

## De leermethode

De studielogica is gebaseerd op drie principes uit onderzoek naar taal-/
woordenschatverwerving, niet alleen op "kaartjes omdraaien":

- **Spaced repetition (Leitner-boxen).** Elke kaart heeft een box (1–5). Een
  goed antwoord verhoogt de box en zet de volgende hoeveelheid dagen tot
  herhaling op 1 → 3 → 7 → 16 → 35; een fout antwoord zet 'm terug naar box 1.
  Dat volgt het spacing-effect uit Ebbinghaus' vergeetcurve en de meta-analyse
  van Cepeda e.a. (2006): kaarten komen terug net voordat je ze zou vergeten,
  wat beter beklijft dan alles blokgewijs herhalen.
- **Interleaving.** De knop **"Dagelijkse oefening"** op het startscherm
  verzamelt alle kaarten die vandaag "due" zijn plus een beperkt aantal nieuwe
  kaarten (max. 10, sessie gecapt op 40), en husselt ze door elkaar over alle
  categorieën heen — in plaats van blok voor blok één categorie af te werken
  (Rohrer & Taylor, 2007).
- **Retrieval practice / het testeffect.** Naast de klassieke flip-kaarten
  ("Herkennen") is er een **"Actief typen"**-modus: je typt zelf het Italiaanse
  woord in plaats van het te herkennen. Zelf actief het antwoord ophalen
  beklijft aantoonbaar beter dan herlezen (Karpicke & Roediger, 2008).
- **Frequentie-gebaseerde woordenschat.** Het **"Kernwoorden ⭐"**-deck bevat
  de ~47 hoogfrequente/essentiële woorden (begroetingen, cijfers 1–10,
  vraagwoorden, voornaamwoorden, de belangrijkste werkwoorden) als aanbevolen
  startpunt — in lijn met Nation's onderzoek naar woordfrequentie: een kleine
  kern van de meest voorkomende woorden dekt verreweg het grootste deel van
  dagelijkse taal.
- **Elaborative encoding.** Kernwoorden en het werkwoorden-deck hebben een
  voorbeeldzin (Italiaans + Nederlands) op de achterkant van de kaart, voor
  context in plaats van geïsoleerde woordparen.

Deze uitleg staat ook, kort, in de app zelf onder "🧠 Waarom werkt dit zo?".

## Wat zit erin

- **292 woorden/zinnen in 17 categorieën**: begroetingen, eten & drinken,
  getallen, reizen, familie, tijd & dagen, maanden & seizoenen, kleuren,
  basiswoorden, huis, gevoelens, werkwoorden, lichaam, kleding, weer,
  winkelen & uit eten, en vraagwoorden & voornaamwoorden — plus de virtuele
  "Kernwoorden ⭐"- en "Alles door elkaar 🎲"-decks.
  Daarvan zijn 47 gemarkeerd als kernwoord (tier 1).
- **Twee oefenmodi**: Herkennen (flip-kaart) en Actief typen (met tolerante
  matching voor hoofdletters/spaties/leestekens, en meerdere geldige vormen
  bij kaarten als "Il cugino / la cugina").
- **Leitner spaced repetition** met zichtbare box-badge per kaart en due-
  badges per categorie, plus een 🔔-teller in de topbar.
- **"Dagelijkse oefening"**-knop die automatisch due + nieuwe kaarten
  samenstelt en door elkaar husselt.
- **"Herhaal moeilijke kaarten"** aan het einde van een sessie.
- Voortgang, streak en gekozen oefenmodus blijven bewaard in `localStorage`
  (met automatische migratie van het oudere v1-formaat).
- Volledig responsive (getest vanaf 390px breed) en met toetsenbordbediening.

## Bestanden

- `index.html` — structuur van de app (start-, studeer- en samenvattingsscherm)
- `style.css` — de Momkai-achtige visuele stijl
- `script.js` — app-logica (Leitner-SRS, dagelijkse sessie, typ-modus, localStorage, confetti)
- `data.js` — de woordenlijsten per categorie (incl. tier- en voorbeeldzin-velden)
- `test.js` — Playwright end-to-end tests (zie hieronder)
- `vercel.json` — Vercel-config (schakelt install/build uit, zie "Deployen naar Vercel")

Alles is losstaand en zonder framework, dus makkelijk uit te breiden: voeg een
nieuwe categorie toe in `data.js` en hij verschijnt automatisch in het
overzicht en in "Alles door elkaar". Zet `tier: 1` op een kaart om 'm aan
"Kernwoorden" toe te voegen, en `ex: { it, nl }` voor een voorbeeldzin.

## Testen

Er is een uitgebreide Playwright end-to-end testsuite (`test.js`) die de
Leitner-boxlogica, de typ-modus (incl. meerdere geldige vormen en de
noType-fallback), de samenstelling van de dagelijkse oefening, de
v1→v2-datamigratie, en alle 17 categorieën los doorloopt — telkens met een
check op afwezigheid van console-/paginafouten.

```bash
npm install        # installeert playwright (devDependency)
python3 -m http.server 8000 &   # serveer de app lokaal
# pas in test.js de BASE-constante aan als je een andere poort gebruikt
npm test
```
