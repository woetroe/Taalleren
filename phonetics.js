// Vereenvoudigde, regelgebaseerde uitspraakhulp voor Italiaanse woorden.
//
// Dit is GEEN officiële IPA-transcriptie — Italiaanse spelling is voor
// Nederlandstalige lezers grotendeels regelmatig (in tegenstelling tot
// bijvoorbeeld Engels of Frans), dus in plaats van 292 handmatige
// transcripties (foutgevoelig, niet te verifiëren zonder audio) passen we
// een klein setje bekende Italiaanse uitspraakregels programmatisch toe.
// Dat werkt automatisch ook voor elk woord dat later aan data.js wordt
// toegevoegd.
//
// Bekende, bewuste beperkingen (liever eerlijk benoemd dan verborgen):
//  - Klemtoon wordt alleen aangegeven waar het Italiaans zelf al een accent
//    heeft (bv. "perché", "città"). Bij onbeklemtoonde spelling is er geen
//    betrouwbare regel om de klemtoon te raden (het merendeel van de
//    Italiaanse woorden heeft de klemtoon op de voorlaatste lettergreep,
//    maar er zijn te veel uitzonderingen om dat blind aan te nemen).
//  - Een enkele "z" kan stemhebbend (/dz/) of stemloos (/ts/) zijn — dat is
//    per woord vastgelegd, niet uit de spelling af te leiden. We kiezen
//    steeds "ts" als benadering.
//  - Klinker-glijklanken (bv. de "ia" in "piano") worden niet apart
//    gemodelleerd, behalve het specifieke geval van een stomme "i" na een
//    zachte c/g/sc (bv. "ciao", "giorno", "sciarpa") — dat is wél een harde,
//    voorspelbare spellingsregel.

const IT_E = new Set(['e', 'è', 'é']);
const IT_I = new Set(['i', 'ì', 'í', 'î']);
const IT_VOWEL = new Set(['a', 'à', 'e', 'è', 'é', 'i', 'ì', 'í', 'î', 'o', 'ò', 'ó', 'u', 'ù', 'ú']);

function italianPhoneticHint(text) {
  const s = String(text).toLowerCase();
  const at = (i, k) => s[i + k];
  let out = '';
  let i = 0;

  while (i < s.length) {
    const c0 = s[i], c1 = at(i, 1), c2 = at(i, 2), c3 = at(i, 3);

    // --- 4 tekens: "glia/glie/glio/gliu" en "scia/scio/sciu" (stomme i) ---
    if (c0 === 'g' && c1 === 'l' && c2 === 'i' && IT_VOWEL.has(c3) && c3 !== 'i') {
      out += 'lj' + c3; i += 4; continue;
    }
    if (c0 === 's' && c1 === 'c' && c2 === 'i' && c3 && (c3 === 'a' || c3 === 'o' || c3 === 'u')) {
      out += 'sj' + c3; i += 4; continue;
    }

    // --- 3 tekens ---
    if (c0 === 'g' && c1 === 'l' && c2 === 'i') { out += 'lji'; i += 3; continue; } // "gli" los
    if (c0 === 'c' && c1 === 'i' && c2 && (c2 === 'a' || c2 === 'o' || c2 === 'u')) { out += 'tsj' + c2; i += 3; continue; }
    if (c0 === 'g' && c1 === 'i' && c2 && (c2 === 'a' || c2 === 'o' || c2 === 'u')) { out += 'dzj' + c2; i += 3; continue; }
    if (c0 === 'c' && c1 === 'q' && c2 === 'u') { out += 'kw'; i += 3; continue; }
    if (c0 === 'g' && c1 === 'u' && c2 && IT_VOWEL.has(c2)) { out += 'gw' + c2; i += 3; continue; }
    if (c0 === 's' && c1 === 'c' && c2 && (IT_E.has(c2) || IT_I.has(c2))) { out += 'sj' + c2; i += 3; continue; }
    if (c0 === 'c' && c1 === 'h' && c2 && (IT_E.has(c2) || IT_I.has(c2))) { out += 'k' + c2; i += 3; continue; }
    if (c0 === 'g' && c1 === 'h' && c2 && (IT_E.has(c2) || IT_I.has(c2))) { out += 'g' + c2; i += 3; continue; }
    // Weggelaten klinker met weglatingsteken (bv. "c'è"): de klinker erna
    // bepaalt nog steeds of de c/g zacht is, ook al zit de apostrof ertussen.
    if (c0 === 'c' && c1 === "'" && c2 && (IT_E.has(c2) || IT_I.has(c2))) { out += "tsj'" + c2; i += 3; continue; }
    if (c0 === 'g' && c1 === "'" && c2 && (IT_E.has(c2) || IT_I.has(c2))) { out += "dzj'" + c2; i += 3; continue; }

    // --- 2 tekens ---
    if (c0 === 'g' && c1 === 'n') { out += 'nj'; i += 2; continue; }
    if (c0 === 'q' && c1 === 'u') { out += 'kw'; i += 2; continue; }
    if (c0 === 'z' && c1 === 'z') { out += 'ts'; i += 2; continue; }
    if (c0 === 'c' && (IT_E.has(c1) || IT_I.has(c1))) { out += 'tsj' + c1; i += 2; continue; }
    if (c0 === 'g' && (IT_E.has(c1) || IT_I.has(c1))) { out += 'dzj' + c1; i += 2; continue; }

    // --- 1 teken ---
    if (c0 === 'c') { out += 'k'; i += 1; continue; }
    if (c0 === 'g') { out += 'g'; i += 1; continue; }
    if (c0 === 'z') { out += 'ts'; i += 1; continue; }
    if (c0 === 'h') { i += 1; continue; } // stomme h (buiten ch/gh/sch, hierboven al afgevangen)

    out += c0; i += 1;
  }

  return out;
}
