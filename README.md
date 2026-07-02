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

## Kommer senere

- **Galleri/meme-slideshow**: kræver en beslutning om billedopbevaring (base64 i jeres eksisterende KV vs. en ny R2-bucket).
- **Spotify-styring**: kræver at du opretter en Spotify Developer-app på developer.spotify.com og giver et Client ID.
