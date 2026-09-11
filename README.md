# Husrådet

Fælles husstands-app: prioriteringsliste, datogodkendelse med kalenderstatus,
projekter som Kanban-tavle, ferieplanlægning (krav, idé-tavle, pakkeliste,
budget, tidslinje), madplan koblet til indkøbslisten, og husets manual.
Statisk side (`index.html`) + en lille Cloudflare Pages Function
(`functions/api/kv.js`) der bruger Workers KV som datalager.

## 1. Læg koden på GitHub

```bash
cd husraadet-cf
git init
git add .
git commit -m "Første udgave af Husrådet"
git remote add origin https://github.com/Theischr/husraadet.git
git push -u origin main
```

(Opret repoet på GitHub først, fx som privat repo — der er ingen login på
siden, så den bør ikke være helt offentligt linket.)

## 2. Opret Pages-projektet

1. Cloudflare-dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → vælg `husraadet`-repoet.
2. Build settings:
   - Framework preset: **None**
   - Build command: *(tom)*
   - Build output directory: `/`
3. Deploy. Du får en URL som `husraadet.pages.dev`.

## 3. Opret KV-namespace og bind den

1. **Workers & Pages** → **KV** → **Create namespace** → navngiv den fx `husraadet`.
2. Gå tilbage til dit Pages-projekt → **Settings** → **Functions** →
   **KV namespace bindings** → **Add binding**:
   - Variable name: `HUSRAADET_KV`
   - KV namespace: den du lige oprettede
3. **Redeploy** projektet (Settings-ændringer kræver et nyt deploy for at slå igennem).

## 4. (Anbefalet) Begræns adgang til jer to

Siden har ingen login indbygget. Da det er jeres private husstandsdata, er det
værd at lægge et lag foran med **Cloudflare Access** (gratis for op til 50
brugere):

1. **Zero Trust**-dashboard → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Peg den på jeres `*.pages.dev`-domæne (eller jeres eget domæne, se nedenfor).
3. Lav en adgangspolitik der kun tillader jeres to e-mailadresser (login via
   engangskode på mail, eller Google-login).

Så skal I logge ind med jeres egen mail, før siden overhovedet vises.

## 5. (Valgfrit) Eget domæne

Under Pages-projektet → **Custom domains** kan I pege fx
`husraadet.jeresdomæne.dk` på siden, hvis I har et domæne liggende i Cloudflare.

## 6. Kalendersync (sat på pause)

Kalenderabonnement til Google/Proton er droppet for nu — koden ligger
stadig, blot udkommenteret, i `functions/api/calendar.ics.js`. Skulle
behovet opstå senere: fjern kommentarblokken i den fil, og genskab et
`CALENDAR_FEED_TOKEN` i Pages-projektets miljøvariabler.

## 7. Push-notifikationer

Appen kan sende jer en push-notifikation pr. aftale, tæt på det faktiske
tidspunkt — godkendte aftaler, vigtige datoer og ferie-bookinger. Selve
tilmeldingen sker i appen (menu →
Notifikationer → Slå til), men afsendelsen kræver at I deployer en lille
separat worker med et engangs-setup — se `husraadet-notifier/README.md` i
den mappe. Uden den worker gemmes jeres tilmelding fint, men der bliver
ikke sendt noget, før workeren er deployet.

## Lokal udvikling

```bash
npx wrangler pages dev . --kv HUSRAADET_KV
```

(Kræver at du har sat et rigtigt namespace-id i `wrangler.toml`, eller brug
`--kv HUSRAADET_KV` alene for et midlertidigt lokalt KV-lager.)

## App-ikoner

`icon-192.png` og `icon-512.png` samt `manifest.json` gør at siden kan
"Føjes til hjemmeskærm" på både iOS og Android og derefter åbner uden
browser-UI, ligesom en rigtig app. De ligger i repo-roden ved siden af
`index.html`, så de skal ikke flyttes.

## Datamodel

Nøgler i KV, hver en JSON-liste (undtagen `meal-plan`, som er ét objekt):
- `priorities-list` — den fælles prioriteringsliste
- `date-requests-list` — datoforslag og deres godkendelse/afvisning
- `projects-list` — husets opgaver (Kanban-status, prioritetsvægt, tildeling, dato)
- `shopping-list` — indkøbslisten
- `vacations-list` — idé-tavle (titel, gruppe, ca. pris, beskrivelse, links, favoritter)
- `vacation-groups` — de redigerbare grupper/faner i idé-tavlen (fx "All
  inclusive", "No inclusive", "Andet") — oprettes automatisk med disse tre
  som standard, hvis listen er tom
- `push-subscriptions` — browser-push-abonnementer (skrives af
  `functions/api/push-subscribe.js`/`push-unsubscribe.js`, læses af den
  separate notifikations-worker, se punkt 7 ovenfor)
- `vacation-requirements-list` — enkeltstående ferie-krav (temperatur, rejseform, periode, andet)
- `house-manual-list` — husets manual (wifi-kode, serienumre m.m.)
- `packing-list` — fælles pakkeliste
- `budget-list` — budgetposter (udgifter og evt. et samlet budget-loft)
- `itinerary-list` — tidslinje/itinerary (fly, hotel, aktiviteter med dato/tid/adresse)
- `meal-plan` — ét objekt med ret + ingredienser pr. ugedag (mon–sun)
- `loft-image` — det uploadede loftsbillede som base64 (komprimeres til maks.
  1000px bredde i browseren før upload, typisk et par hundrede KB)
- `loft-zones` — liste af områder på loftsbilledet (x/y i procent, navn, ting)
- `freezer-drawers` — ét objekt med indhold for skuffe 1–7 (label + varer)
- `fixed-dates-list` — vigtige datoer der ikke skal godkendes (fødselsdage,
  frister m.m.), med valgfri årlig gentagelse

Dit navn (til at vise hvem der har foreslået/meldt sig på noget) gemmes lokalt
i browseren (`localStorage`), ikke i KV — så det er pr. enhed, ikke delt.

`functions/api/calendar.ics.js` er sat på pause (se punkt 6 ovenfor) — hele
funktionen er udkommenteret, men rører intet i KV, når/hvis den genaktiveres.

Cloudflares gratis KV-plan har plads til 1 GB i alt, så selv med flere
loftsbilleder over tid er der rigelig plads — men undgå at uploade meget
store originalbilleder direkte, da komprimeringen sker i browseren, ikke på
serveren.
