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

## Wat zit erin

- **10 categorieën** (~130 woorden): begroetingen, eten & drinken, getallen,
  reizen, familie, tijd & dagen, kleuren, basiswoorden, huis en gevoelens —
  plus een "Alles door elkaar"-mix.
- **Flip-kaarten**: klik/tik of druk op spatie om de vertaling te onthullen.
- **Zelf-score per kaart**: "Nog even oefenen" of "Ken ik!" (ook via ← / →).
- **Voortgang per categorie** wordt bewaard in `localStorage` (percentage
  "onder de knie" per deck, plus een algemene score en dagstreak 🔥).
- **"Herhaal moeilijke kaarten"** aan het einde van een sessie, om precies de
  woorden die je nog niet kende terug te zien.
- Volledig responsive (getest vanaf 390px breed) en met toetsenbordbediening.

## Bestanden

- `index.html` — structuur van de app (drie views: overzicht, studeren, samenvatting)
- `style.css` — de Momkai-achtige visuele stijl
- `script.js` — app-logica (state, sessies, localStorage, confetti)
- `data.js` — de woordenlijsten per categorie

Alles is losstaand en zonder framework, dus makkelijk uit te breiden: voeg een
nieuwe categorie toe in `data.js` en hij verschijnt automatisch in het
overzicht en in de "Alles door elkaar"-mix.
