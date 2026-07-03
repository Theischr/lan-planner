# LAN_PLANNER

Statisk webapp til at stemme om LAN-datoer, tildele lokation og tælle ned til den aftalte dato.
Bygget til Cloudflare Pages (gratis tier) — ingen server at drive, ingen build-step.

## Sådan hænger det sammen

- `index.html`, `style.css`, `app.js` — selve appen, serveret som statiske filer.
- `functions/api/data.js` — en Cloudflare Pages Function (kører på Workers-runtime) der læser/skriver de delte data i en KV-namespace.
- Data (personer, datoer, stemmer, aftalt dato) ligger i én JSON-blob i KV under nøglen `lan-planner-data`.
- Adgang styres af en simpel adgangskode (miljøvariabel `ACCESS_CODE`), så I tre er de eneste der kan se/ændre data.

## Deploy — via Cloudflare-dashboardet (nemmest)

1. **Læg koden på GitHub.** Opret et nyt repo, f.eks. `Theischr/lan-planner`, og push denne mappe til det.
   ```bash
   cd lan-planner
   git init
   git add .
   git commit -m "Initial LAN planner"
   git branch -M main
   git remote add origin https://github.com/Theischr/lan-planner.git
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

8. Cloudflare giver jer en URL som `https://lan-planner.pages.dev` — den kan I dele med hinanden. Vil I have et pænere navn, kan I under **Custom domains** koble et underdomæne på, hvis du har et domæne liggende (f.eks. `lan.dintdomæne.dk`).

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
- `spotify-callback.html` skal ligge i repo-roden ved siden af `index.html` — det er filen der matcher jeres registrerede redirect-URI `https://lan-plan.pages.dev/spotify-callback` (Cloudflare Pages matcher automatisk extensionless URL'er til den tilsvarende `.html`-fil).
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
