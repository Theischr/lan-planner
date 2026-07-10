# LAN_PLANNER

Statisk webapp til at stemme om LAN-datoer, tildele lokation og tælle ned til den aftalte dato.
Bygget til Cloudflare Pages (gratis tier) — ingen server at drive, ingen build-step.

> **Før du gør repoet offentligt:** denne README er renset for navne, brugernavne og jeres rigtige domæne. Men hvis I nogensinde har skrevet jeres faktiske `ACCESS_CODE` direkte ind i en committet fil (fx en tidligere version af `wrangler.toml`), ligger den stadig i commit-historikken, selvom I retter filen nu — se afsnittet **"Fjerne tidligere versioner/historik"** nederst for hvordan I renser det, og skift adgangskoden bagefter under Cloudflare → Settings → Environment variables.

## Sådan hænger det sammen

- `index.html`, `style.css`, `app.js` — selve appen, serveret som statiske filer.
- `functions/api/data.js` — en Cloudflare Pages Function (kører på Workers-runtime) der læser/skriver de delte data i en KV-namespace.
- Data (personer, datoer, stemmer, aftalt dato) ligger i én JSON-blob i KV under nøglen `lan-planner-data`.
- Adgang styres af en simpel adgangskode (miljøvariabel `ACCESS_CODE`), så I tre er de eneste der kan se/ændre data.

## Deploy — via Cloudflare-dashboardet (nemmest)

1. **Læg koden på GitHub.** Opret et nyt repo, f.eks. `DIT-GITHUB-BRUGERNAVN/lan-planner`, og push denne mappe til det.
   ```bash
   cd lan-planner
   git init
   git add .
   git commit -m "Initial LAN planner"
   git branch -M main
   git remote add origin https://github.com/DIT-GITHUB-BRUGERNAVN/lan-planner.git
   git push -u origin main
   ```

2. **Opret et Cloudflare-konto** (gratis) på https://dash.cloudflare.com hvis du ikke allerede har en.

3. **Opret KV-namespace:**
   - Gå til **Workers & Pages → KV** i sidemenuen.
   - Klik **Create namespace**, kald den f.eks. `lan-planner-kv`.

4. **Opret Pages-projektet:**
   - Gå til **Workers & Pages → Create → Pages → Connect to Git**.
   - Vælg dit `lan-planner` repo.
   - Build-indstillinger: lad **Build command** stå tomt, og **Build output directory** = `/` (roden). Der er ingen build-proces nødvendig.
   - Klik **Save and Deploy**.

5. **Bind KV-namespace til projektet:**
   - Gå til det nye projekt → **Settings → Functions → KV namespace bindings**.
   - Tilføj en binding: Variable name = `DATA_KV`, KV namespace = `lan-planner-kv`.

6. **Sæt en adgangskode:**
   - Samme sted: **Settings → Environment variables**.
   - Tilføj `ACCESS_CODE` = jeres valgte kode (f.eks. `lanhygge2026`), for både **Production** og **Preview**.

7. **Redeploy** projektet én gang (Settings-ændringer kræver en ny deployment for at slå igennem — gå til **Deployments** og klik **Retry deployment**, eller push en tom commit).

8. Cloudflare giver jer en URL som `https://dit-projekt.pages.dev` — den kan I dele med hinanden. Vil I have et pænere navn, kan I under **Custom domains** koble et underdomæne på, hvis du har et domæne liggende (f.eks. `lan.dintdomæne.dk`).

## Deploy — via Wrangler CLI (alternativ)

Hvis du hellere vil deploye fra din Codespace/terminal:

```bash
npm install -g wrangler
wrangler login
wrangler kv namespace create lan-planner-kv
# Kopiér det udskrevne namespace-id ind i wrangler.toml
wrangler pages deploy . --project-name=lan-planner
```

Sæt derefter `ACCESS_CODE` og KV-bindingen som beskrevet i punkt 5-6 ovenfor (dashboardet er nemmest til dette, selv ved CLI-deploy).

## Efter deploy

- Send URL + adgangskode til de to andre. Første gang de åbner den, bliver de bedt om koden (gemmes i browseren, så de kun skal taste den én gang), og derefter om deres navn.
- Alt gemmes centralt i KV, så I altid ser samme kalender, stemmer og aftalt dato, uanset hvem der åbner den.
- Appen poller automatisk hvert 20. sekund og har en manuel opdater-knap (↻) i toppen.

## Nye faner (v2)

Appen har nu faner: **Kalender, Drinks, Spil, Mad, Point, Tjekliste**. Alt sammen ligger stadig i den samme KV-blob — ingen nye Cloudflare-ressourcer eller ekstra opsætning krævet, bare de samme filer opdateret.

- **Drinks**: Bestil noget, andre ser det live (op til 15 sek. forsinkelse via polling). Klik "slå notifikationer til" for at få en browser-notifikation når nogen bestiller — virker så længe du har fanen åben et sted, også i baggrunden. Kræver ikke noget setup fra dig, det er indbygget i browseren.
- **Spil**: Tilføj spilnavn + valgfrit link til et ikon/cover-billede (fx fra Steam eller Google-billeder). Virker linket ikke, falder den tilbage til et 🎮-ikon.
- **Mad**: Tre lister (Snacks/Frokost/Aftensmad), alle kan tilføje og fjerne punkter.
- **Point**: Registrér en sejr (spil + vinder + antal point), se automatisk opdateret stilling.
- **Tjekliste**: Standard-punkter (PC, skærm, mus, tastatur, musemåtte, kabler) er forudfyldt. Hver person har sit eget flueben — I deler listen, men ikke hinandens afkrydsninger.

Efter du har pushet disse filer til dit GitHub-repo (bare erstat `index.html`, `style.css`, `app.js` — `functions/api/data.js` og `wrangler.toml` er uændrede), skal Cloudflare automatisk redeploye.

## Spotify-styring

Ny fane **Musik** lader jer styre afspilning via Spotify Connect (play/pause/skift nummer/lydstyrke + vælg hvilken enhed, fx jeres Google-højtaler, der spiller).

**Sådan virker det:**
- Bruger PKCE-login direkte fra browseren — intet Client Secret involveret, kun det offentlige Client ID.
- `spotify-callback.html` skal ligge i repo-roden ved siden af `index.html` — det er filen der matcher jeres registrerede redirect-URI `https://dit-projekt.pages.dev/spotify-callback` (Cloudflare Pages matcher automatisk extensionless URL'er til den tilsvarende `.html`-fil).
- Login/tokens gemmes kun lokalt i hver persons egen browser (ikke i den delte KV) — hver af jer logger ind med sin egen Spotify-konto.
- Kræver Spotify Premium på den konto der skal styre afspilningen, og at Spotify-appen er åben/cast'et til jeres Google-højtaler mindst én gang, så den dukker op i enhedslisten.

**Vigtigt ved deploy:** sørg for at `spotify-callback.html` også bliver pushet til GitHub-repoet sammen med de andre filer, og at `spotify.js` er inkluderet — ellers virker Musik-fanen ikke.

## Kommer senere

- **Galleri/meme-slideshow**: droppet for nu, kan tages op igen senere.

## Endnu flere faner (v3)

- **Drinkmenu + hjul**: Under Drinks kan I nu bygge en menu med navn, beskrivelse og billede pr. drink. "🎡 Snurr hjulet" vælger tilfældigt en drink fra menuen og bestiller den automatisk.
- **Lyde**: Nyt soundboard. Tilføj jeres egne klip via link eller en kort upload (under ~350 KB, gemmes direkte i jeres delte data). **Vigtigt:** vi leverer ikke selv nogen lyde her — de skal komme fra jer, da spil-/meme-lyde typisk er ophavsretligt beskyttede.
- **Timer**: Stopur med lap-funktion, og en nedtælling/alarm med et indbygget bip (ingen lydfil nødvendig). Rent lokal i browseren, deles ikke mellem jer.
- **Speedtest**: Gimmick-måling af downloadhastighed og ping mod jeres egen Cloudflare-deployment. Bruger to nye Functions: `functions/api/speedtest.js` (leverer en tilfældig byte-payload) og `functions/api/ping.js` (måler round-trip). Begge er beskyttet af samme `ACCESS_CODE` som resten af appen — ingen ny opsætning nødvendig ud over at pushe filerne.

**Husk ved deploy:** disse to nye filer skal også med til GitHub:
```
functions/api/speedtest.js
functions/api/ping.js
```
Sammen med de opdaterede `index.html`, `style.css`, `app.js`, `timer.js`. Tjek som altid under Functions-fanen efter deploy at `/api/speedtest` og `/api/ping` dukker op som routes.

## v4: Grupperet navigation, ingredienser, aim trainer

- **Faner er nu grupperet** i tre kategorier via en ny knaprække øverst: 📋 Planlægning (Kalender, Mad, Indkøb, Tjekliste), 🎉 Fest (Drinks, Spil, Point), 🛠️ Værktøjer (Musik, Lyde, Timer, Speedtest, Aim Trainer). Løser pladsproblemet fra de mange faner.
- **Automatiske ingredienser til drinkmenuen**: Skriver du et kendt cocktailnavn (fx "Espresso Martini", "Mojito", "Old Fashioned" — se `drink-recipes.js` for hele listen), udfyldes ingredienserne automatisk og lander i Indkøb. Ukendte navne får ingen automatiske ingredienser, men kan redigeres manuelt via "✎ Rediger" på drink-kortet.
- **Aim Trainer** (under Værktøjer): 20 sekunders klik-målene-så-hurtigt-som-muligt minispil, med et delt highscore-board (bedste antal ramt pr. person, med præcision og reaktionstid).
- **`.wrap` er udvidet til 900px** (fra 700px) for mere albuerum, plus generelle overflow-sikringer så billeder og lange tekster ikke skubber siden ud i vandret scroll.

**Nye filer at pushe:** `drink-recipes.js`, `aimtrainer.js` — husk dem sammen med de opdaterede `index.html`, `app.js`, `style.css`.

## v5: Installerbar app (PWA) på Android (og iPhone)

Siden er nu en "Progressive Web App" — det betyder Android (og iOS) kan installere den som en rigtig app-genvej med eget ikon, uden at gå gennem Play Store.

**Sådan installerer man den (Android/Chrome):**
1. Åbn `https://dit-projekt.pages.dev` i Chrome på telefonen.
2. Tryk på de tre prikker øverst til højre → **"Føj til startskærm"** / **"Installer app"**.
3. Den lander nu som et almindeligt app-ikon, åbner i fuldskærm uden browser-bjælke.

**Sådan virker det teknisk:**
- `manifest.json` beskriver appens navn, ikoner og farver (mørkt tema, matcher siden).
- `icons/` indeholder de genererede app-ikoner (192px, 512px, samt en "maskable" variant til Androids adaptive ikoner).
- `sw.js` er en service worker der cacher app-filerne netværk-først (opdateringer slår igennem med det samme, men appen virker stadig delvist offline hvis wifi'en driller til LAN'et). Den rører **aldrig** `/api/`-kald, så data er altid friske.

**Nye filer at pushe:** `manifest.json`, `sw.js`, og hele `icons/`-mappen (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`).

**Vil du have en rigtig .apk / Play Store-app i stedet?** Det kræver et ekstra lag oven på det her:
- Nemmeste vej: [PWABuilder.com](https://www.pwabuilder.com) — indsæt jeres URL, og det genererer en installerbar `.apk` baseret på `manifest.json`, som I kan side-loade uden Play Store.
- For en rigtig Play Store-udgivelse: samme værktøj kan pakke det som en "Trusted Web Activity", men det kræver en Google Play-udviklerkonto (engangsgebyr på $25) og en `assetlinks.json`-fil på domænet der beviser I ejer siden. Sig til hvis det er noget I vil forfølge — det er en overkommelig proces, men adskilt fra selve webappen.

## v6: Arena — lille realtids multiplayer-shooter

**Vigtigt om ophavsret:** dette er et originalt, generisk arena-shooter-spil (bevæg dig, sigt, skyd), ikke en kopi af Counter-Strike — intet navn, ingen assets eller lyde derfra er brugt.

### Hvorfor det er en anden slags deploy end alt det forrige

Realtids-multiplayer kræver en vedvarende forbindelse (WebSocket), hvilket jeres nuværende opsætning (KV + polling hvert 15. sek) ikke understøtter. Det kræver **Cloudflare Durable Objects**, og Cloudflare tillader ikke Durable Objects i selve Pages-projektet — de skal ligge i en **separat Worker**. Derfor er der en helt ny mappe: `game-server/`, som er et selvstændigt projekt der skal deployes for sig, ved siden af (ikke i stedet for) jeres eksisterende Pages-deploy.

### Deploy game-server/ (kør i din Codespace)

1. Åbn `game-server/wrangler.toml` og ret `ACCESS_CODE` til **samme kode** som I bruger på selve LAN_PLANNER-siden.
2. I terminalen:
   ```bash
   cd game-server
   npx wrangler login    # hvis ikke allerede logget ind
   npx wrangler deploy
   ```
3. Wrangler udskriver en URL i stil med:
   ```
   https://lan-arena-game.dit-brugernavn.workers.dev
   ```
   Notér den — I skal bruge WebSocket-varianten af den (se næste trin).

### Kobl siden til game-serveren

1. Åbn `game-arena.js` i hovedprojektet.
2. Øverst, ret:
   ```js
   const ARENA_SERVER_URL = 'wss://lan-arena-game.YOUR-SUBDOMAIN.workers.dev/room';
   ```
   til jeres rigtige URL (bemærk `wss://` i stedet for `https://`, og `/room` til sidst).
3. Push `game-arena.js`, det opdaterede `index.html` og `style.css` til jeres GitHub-repo som normalt — Cloudflare Pages redeployer automatisk.

### Sådan spiller I

- Gå til fanen **Arena** under 🎉 Fest.
- Tryk **"Deltag i kampen"** — WASD for at bevæge sig, mus for at sigte, klik eller mellemrum for at skyde.
- Én spiller trykker **"Start runde"** og sætter antal kills der skal til for at vinde.
- Vinderen tilføjes automatisk til jeres delte **Point**-fane (3 point, spillet navngivet "Arena 🎯").

### Begrænsninger at kende til

- **Ingen persistens**: spillets tilstand nulstilles hvis alle forlader og game-serveren går i dvale — det er tilsigtet, det er kun selve runden der er midlertidig, ikke jeres LAN_PLANNER-data.
- **Simpelt v1**: ingen vægge/forhindringer, ingen liv/skade (ét hit = kill), samme våben til alle. Sig til hvis I vil bygge videre på det.
- **To adskilte deploys at huske på** fremover: `lan-planner` (Pages) og `lan-arena-game` (Worker) — de deler ikke automatisk opdateringer, så game-server-ændringer kræver `npx wrangler deploy` fra `game-server/`-mappen, ikke et almindeligt GitHub-push.

## v7: Spil-kategorier med drag-and-drop

Under **Spil** er kortene nu delt i tre kolonner: **🔀 Ikke sorteret** (hvor nye forslag lander), **🆓 Har dem (gratis)** og **💰 Skal købes**. Træk et spilkort (i det lille ⠿-håndtag øverst til venstre) mellem kolonnerne for at sortere det.

Det er bygget med Pointer Events i stedet for native HTML5 drag-and-drop, så det virker lige godt med mus **og** touch — vigtigt, da native HTML5-drag typisk fejler stille på mobil, hvor I sandsynligvis bruger appen mest.

Kategorien gemmes pr. spil i den delte KV-data, så alle ser samme opdeling. Stemmer fungerer uændret inden for hver kolonne.

## Gør repoet offentligt: fjerne tidligere versioner/historik

At rette en fil løser kun hvordan den ser ud **nu** — gamle commits med tidligere indhold (inkl. en evt. rigtig adgangskode, hvis den nogensinde blev skrevet direkte i en fil) ligger stadig tilgængelige i historikken, så længe repoet er offentligt.

**Nemmeste og mest robuste løsning: start historikken forfra.** Til et lille personligt projekt som dette er det klart at foretrække frem for at forsøge at rense enkelte commits:

```bash
cd lan-planner
git checkout --orphan clean-main   # ny gren uden nogen historik
git add -A
git commit -m "Initial public version"
git branch -D main                 # slet den gamle gren med historik
git branch -m main                 # omdøb den nye gren til main
git push -f origin main            # overskriv historikken på GitHub
```

Bagefter er der kun én commit tilbage på GitHub — al tidligere historik er væk.

**Vigtigt bagefter:**
1. **Skift `ACCESS_CODE`** i Cloudflare (Settings → Environment variables, og i `game-server/wrangler.toml` hvis den bruges der) til en ny værdi — også selvom I ikke tror den gamle lækkede, er det billigt at være sikker.
2. Hvis nogen af jer har **forket eller clonet** repoet lokalt før historik-oprydningen, ligger den gamle historik stadig i den kopi — de skal slette og klone på ny.
3. GitHub kan i sjældne tilfælde have cachet gamle commits kortvarigt efter en force-push. Har I på noget tidspunkt committet en rigtig hemmelighed (adgangskode, token), er det sikreste stadig at rotere den — historik-oprydning er godt håndværk, men bør ikke stå alene som eneste sikkerhedsforanstaltning.
4. Alternativt kan I gøre det endnu enklere: **slet repoet på GitHub og opret et helt nyt** med de rensede filer — samme effekt, ingen kommandolinje nødvendig.
