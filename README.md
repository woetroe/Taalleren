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

De studielogica is gebaseerd op principes uit onderzoek naar taal-/
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
- **Mastery binnen de sessie + scaffolding.** Een fout beantwoord woord
  verdwijnt niet uit de sessie: het komt een paar kaarten verderop terug,
  net zo lang tot je het goed hebt. Vanaf de 3e poging op hetzelfde woord
  schakelt de app automatisch naar **meerkeuze** (4 opties, dezelfde
  testrichting als de actieve modus) — zo blijf je niet vastzitten op een
  woord dat via vrij ophalen niet lukt, maar bouw je stap voor stap meer
  steun in totdat het lukt. De Leitner-box wordt pas bijgewerkt zodra een
  woord definitief lukt, en telt alleen als volle "correct" als dat al in de
  allereerste poging lukte — een woord dat via herhaling/meerkeuze uiteindelijk
  lukt, is voor de langere termijn nog niet "onder de knie" en komt morgen
  eerder terug.
- **Frequentie-gebaseerde woordenschat.** Het **"Kernwoorden ⭐"**-deck bevat
  de ~57 hoogfrequente/essentiële woorden (begroetingen, cijfers 1–10,
  vraagwoorden, voornaamwoorden, de belangrijkste werkwoorden én hun meest
  gebruikte vervoeging) als aanbevolen startpunt — in lijn met Nation's
  onderzoek naar woordfrequentie: een kleine kern van de meest voorkomende
  woorden dekt verreweg het grootste deel van dagelijkse taal.
- **Elaborative encoding.** Kernwoorden en het werkwoorden-deck hebben een
  voorbeeldzin (Italiaans + Nederlands) op de achterkant van de kaart, voor
  context in plaats van geïsoleerde woordparen.

Deze uitleg staat ook, kort, in de app zelf onder "🧠 Waarom werkt dit zo?".

## Fonetische hint

Bij elk Italiaans woord staat een fonetische leeshulp, bv. **Ciao** *[tsjao]*.
Dit is **geen officiële IPA-transcriptie**, maar een regelgebaseerde,
vereenvoudigde uitspraakhulp (`phonetics.js`) die de bekende Italiaanse
spellingsregels toepast — Italiaans is voor Nederlandstalige lezers namelijk
grotendeels fonetisch regelmatig (heel anders dan bv. Engels of Frans), dus
in plaats van 305 handmatige transcripties (foutgevoelig en niet te
verifiëren zonder audio) worden regels als "c/g zacht vóór e/i", "gli", "gn",
"sc(i/e)", "gh/ch" en de stomme "i" na een zachte c/g/sc (zoals in "ciao",
"giorno") programmatisch toegepast. Dat werkt automatisch ook voor elk woord
dat later aan `data.js` wordt toegevoegd.

Bewuste, eerlijk benoemde beperkingen:
- **Klemtoon** wordt alleen getoond waar het Italiaans zelf al een accent
  heeft (bv. "perché"). Bij onbeklemtoonde spelling bestaat er geen
  betrouwbare regel om de klemtoon te raden.
- Een enkele **"z"** kan stemhebbend of stemloos zijn, afhankelijk van het
  woord — niet uit de spelling af te leiden. We kiezen steeds de
  benadering "ts".

Leestekens (".", "?", "!", ",", ";", ":") worden vóór het toepassen van de
regels uit de tekst gefilterd — anders belandde bv. de "..." van
sjabloonkaarten als "Mi chiamo..." letterlijk in de hint. Verdubbelde
"cc"/"gg" vlak vóór een zachte e/i (zoals in "faccio", "oggi") krijgen ook
een eigen regel, zodat ze niet per ongeluk als hard + zacht na elkaar
klinken (bv. "fattsjo" i.p.v. het onjuiste "faktsjo").

De hint staat niet alleen even op de voorkant van een kaart, maar komt ook
terug op het moment dat je je antwoord checkt: op de achterkant van de
flip-kaart (samen met het Italiaanse woord), in de feedback na het typen of
na een meerkeuzevraag, en op de reveal-kaart (zie hieronder).

## Layout op mobiel

De studeerweergave gebruikt op smalle schermen een flex-layout die de
beschikbare hoogte vult (met `dvh` zodat het meebeweegt als het toetsenbord
in typ-modus open- of dichtklapt), in plaats van bovenaan opgepropt te staan
met dode ruimte eronder. De toetsenbord-sneltoetsen en de footer worden
tijdens het studeren op mobiel verborgen (geen fysiek toetsenbord, geen
ruimte te verspillen) en de kaarthoogte schaalt vloeiend mee met het scherm.

Het typveld in "Actief typen" wordt na het controleren niet meer
uitgeschakeld of geblurd — dat joeg het schermtoetsenbord vroeger elke kaart
open en weer dicht ("whiplash"). Het veld blijft nu gewoon in focus zolang je
in typ-modus blijft, en klapt pas dicht zodra een kaart écht geen typveld
nodig heeft (reveal- of meerkeuzekaarten).

## Overhoren i.p.v. flashcards voor niet-typbare woorden

In **Actief typen** vallen woorden met een onvolledige vorm (bv. de
sjabloonzin "Mi chiamo...") niet meer terug op de 3D-flip-flashcard van de
herken-modus — dat voelde inconsistent tussen kaarten binnen dezelfde
sessie. In plaats daarvan gebruiken ze de **reveal-kaart**: dezelfde
kaartstijl als typen/meerkeuze, met een "Toon antwoord"-knop in plaats van
een flip-animatie, en daarna dezelfde "Ken ik" / "Nog even oefenen"-knoppen.

## Geen samengevoegde woordparen

Woordparen die eigenlijk twee losse Italiaanse woorden zijn (bv. mannelijk/
vrouwelijk: "il cugino"/"la cugina", of twee synoniemen: "cosa"/"che cosa")
staan niet langer samen op één kaart met een "/" ertussen (zoals voorheen
"Lui / Lei" → "Hij / Zij"). Dat dwong je bij het typen of bij een dubbelzinnig
"Hij / Zij"-promptje na te denken over welke van de twee bedoeld werd, of om
zelf een "/" te typen. Elk zo'n woord is nu een eigen kaart met een
eenduidig antwoord. Vertalingen waarbij hetzelfde Italiaanse woord gewoon
meerdere Nederlandse betekenissen heeft (bv. "Ciao" = "Hoi / Doei") blijven
wél als "/" op de kaart staan — daar is niets te splitsen, het is écht één
Italiaans woord.

## Vervoegingen naast de hele werkwoorden

Naast de infinitief (bv. "Essere" → "Zijn") staat nu ook de meest gebruikte
vervoeging — de ik-vorm — als eigen kaart in het werkwoorden-deck (bv.
"Sono" → "Ik ben (vervoeging van 'essere')"), voor de zeven kernwerkwoorden
plus "piacere" ("mi piace"). Die vorm gebruik je in de praktijk veel vaker
dan de infinitief zelf, en hij komt vanzelf "af en toe" tussen de andere
kaarten door in elke sessie — er is geen aparte modus voor nodig.

## Voortgang & geheugen

Voortgang, streak en gekozen oefenmodus staan in `localStorage`, per browser
op dit device — er is **geen automatische sync tussen devices** (telefoon en
laptop houden dus elk hun eigen voortgang bij). Wat wél is gehard:
- Corrupte of onleesbare opslag (bv. een afgebroken write) wordt nooit
  stilletjes gewist: de rauwe data gaat opzij onder een `-corrupt-backup`-
  sleutel (terug te vinden in de devtools) en de app start gewoon met een
  lege state in plaats van te crashen.
- Als opslaan zelf mislukt (volle opslag, of `localStorage` niet
  beschikbaar zoals in sommige privénavigatie-modi), blijft de app gewoon
  werken met de in-memory state — alleen het bewaren naar de volgende keer
  lukt dan niet, gemeld via een console-waarschuwing i.p.v. een crash.

## Wat zit erin

- **305 woorden/zinnen in 17 categorieën**: begroetingen, eten & drinken,
  getallen, reizen, familie, tijd & dagen, maanden & seizoenen, kleuren,
  basiswoorden, huis, gevoelens, werkwoorden, lichaam, kleding, weer,
  winkelen & uit eten, en vraagwoorden & voornaamwoorden — plus de virtuele
  "Kernwoorden ⭐"- en "Alles door elkaar 🎲"-decks.
  Daarvan zijn 57 gemarkeerd als kernwoord (tier 1).
- **Drie oefenvormen**: Herkennen (flip-kaart), Actief typen (met tolerante
  matching voor hoofdletters/spaties/leestekens, en een reveal-kaart i.p.v.
  typen bij sjabloonkaarten met een onvolledige vorm zoals "Mi chiamo..."),
  en automatische **meerkeuze** vanaf de 3e poging op een woord.
- **Fonetische hint** bij elk Italiaans woord, ook bij het geven van je
  antwoord (zie hierboven).
- **Leitner spaced repetition** met zichtbare box-badge per kaart en due-
  badges per categorie, plus een 🔔-teller in de topbar. Herhaling binnen een
  sessie loopt door tot een woord écht gekend is.
- **"Dagelijkse oefening"**-knop die automatisch due + nieuwe kaarten
  samenstelt en door elkaar husselt.
- **"Herhaal moeilijke kaarten"** aan het einde van een sessie.
- Voortgang, streak en gekozen oefenmodus blijven bewaard in `localStorage`
  (met automatische migratie van het oudere v1-formaat).
- Volledig responsive (getest vanaf 390px breed), met een layout die zich
  aanpast aan de studeersituatie op mobiel, en met toetsenbordbediening.

## Bestanden

- `index.html` — structuur van de app (start-, studeer- en samenvattingsscherm)
- `style.css` — de Momkai-achtige visuele stijl
- `script.js` — app-logica (Leitner-SRS, mastery-herhaling + meerkeuze, dagelijkse sessie, typ-modus, localStorage, confetti)
- `data.js` — de woordenlijsten per categorie (incl. tier- en voorbeeldzin-velden)
- `phonetics.js` — de regelgebaseerde fonetische-hint-generator
- `test.js` — Playwright end-to-end tests (zie hieronder)
- `vercel.json` — Vercel-config (schakelt install/build uit, zie "Deployen naar Vercel")

Alles is losstaand en zonder framework, dus makkelijk uit te breiden: voeg een
nieuwe categorie toe in `data.js` en hij verschijnt automatisch in het
overzicht, in "Alles door elkaar" én krijgt automatisch een fonetische hint.
Zet `tier: 1` op een kaart om 'm aan "Kernwoorden" toe te voegen, en
`ex: { it, nl }` voor een voorbeeldzin.

## Testen

Er is een uitgebreide Playwright end-to-end testsuite (`test.js`) die o.a. de
Leitner-boxlogica, het herhaal-tot-goed-mechanisme binnen een sessie, het
omslagpunt naar meerkeuze bij de 3e poging, de fonetische hints (incl. een
fuzz-test over alle 305 woorden en de zichtbaarheid ervan bij het geven van
een antwoord — flip-kaart-achterkant, typ-feedback, meerkeuze-feedback en de
reveal-kaart), de typ-modus (meerdere geldige vormen, geen toetsenbord-
whiplash tussen kaarten, en de reveal-kaart-fallback i.p.v. de flip-kaart),
de mobiele layout, de samenstelling van de dagelijkse oefening, de
v1→v2-datamigratie, robuustheid bij corrupte `localStorage`-data, en alle 17
categorieën los doorloopt — telkens met een check op afwezigheid van
console-/paginafouten.

```bash
npm install        # installeert playwright (devDependency)
python3 -m http.server 8000 &   # serveer de app lokaal
# pas in test.js de BASE-constante aan als je een andere poort gebruikt
npm test
```
