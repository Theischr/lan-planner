# Husrådet – notifikations-worker

En lille, selvstændig Cloudflare Worker der kører hvert 5. minut og sender
en push-notifikation **pr. begivenhed**, tæt på det tidspunkt den faktisk
sker — godkendte aftaler, vigtige datoer og ferie-bookinger. Den er bevidst
adskilt fra selve Husrådet Pages-projektet, fordi tidsstyrede jobs (cron
triggers) kun understøttes af "rigtige" Workers — ikke af Pages Functions.

## Hvorfor er dette en separat ting, og hvorfor kræver det mere end de andre ændringer?

Alt andet i Husrådet er bygget sådan at du bare pusher til GitHub, og
Cloudflare Pages bygger og deployer automatisk. Denne del er anderledes:
den skal deployes med kommandolinje-værktøjet `wrangler`, fordi den bruger
et npm-pakke (`web-push`) der skal bundles, og fordi cron-jobs hører til
Workers, ikke Pages. Det er et engangs-setup — bagefter kører den af sig selv.

## Forudsætninger

- Node.js installeret lokalt (du har det allerede via dine andre projekter)
- Adgang til en terminal

## 1. Installér afhængigheder

```bash
cd husraadet-notifier
npm install
```

## 2. Brug samme KV-namespace som Husrådet-appen

Dette er vigtigt: denne worker skal læse og skrive i **det samme**
KV-namespace som jeres Pages-projekt (`HUSRAADET_KV`), ellers kan den ikke
se jeres data.

1. Cloudflare-dashboard → **Workers & Pages** → **KV** → find det
   eksisterende `husraadet`-namespace → kopiér dets **id**.
2. Åbn `wrangler.toml` i denne mappe og sæt `id` under `[[kv_namespaces]]`
   til det id.

## 3. Sæt VAPID-nøgler

VAPID-nøglerne er allerede genereret og sat ind i appens `index.html`
(den offentlige nøgle). Den private nøgle må **kun** leve som secret her —
del den aldrig i klientkode.

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
# indsæt: BGZLJ7c7VSWvOPqyqhupB2hjoDwoaoX5NVlckjOTt574ipLz-eikd3MoQR0IuX-TrqgKbZQOS6sBQ5C35VjfIpQ

npx wrangler secret put VAPID_PRIVATE_KEY
# indsæt: w2XTgYwoumoujb2gCe2V2wKWXHS1iBEMm7Shgs2TA_c

npx wrangler secret put VAPID_SUBJECT
# indsæt: mailto:din-mail@example.com   (bruges kun til at identificere jer over for browserens push-tjeneste, vises aldrig i selve notifikationen)
```

**Vigtigt:** Den offentlige nøgle her skal matche `VAPID_PUBLIC_KEY`-linjen i
Husrådets `index.html` præcist. Hvis I nogensinde genererer et nyt
nøglepar, skal begge steder opdateres samtidig, ellers stopper
notifikationerne med at virke (uden fejl der er synlige for jer — browseren
afviser bare push'et).

## 4. Deploy

```bash
npx wrangler deploy
```

Det opretter workeren og aktiverer cron-triggeren fra `wrangler.toml`
(kører hver dag kl. 06:00 UTC — juster selv i `wrangler.toml` hvis I vil
have et andet tidspunkt; husk UTC vs. dansk tid/sommertid).

## 5. Test det

Workeren har også en almindelig `fetch`-handler, så du kan teste den uden
at vente på cron: åbn bare den URL Wrangler viser efter deploy (noget i
stil med `husraadet-notifier.dit-navn.workers.dev`) i browseren. Det kører
det samme som cron-jobbet ville gøre, med det samme.

Tjek loggen for fejl:
```bash
npx wrangler tail
```

## Sådan virker det i praksis

- Workeren kører hvert 5. minut og regner ud, præcis hvornår hver
  begivenhed skal påmindes:
  - Har den et klokkeslæt (fx en aftale kl. 19:00), påmindes I som
    standard **60 minutter før** (styres af `REMINDER_MINUTES` i
    `wrangler.toml`).
  - Har den intet klokkeslæt (en heldagsbegivenhed), påmindes I **kl. 8**
    samme dag, dansk tid (styres af `ALL_DAY_HOUR`).
- Hver begivenhed giver sin **egen** notifikation, i stedet for én samlet
  daglig besked — I ser med det samme hvilken aftale det gælder.
- Kilderne er `date-requests-list` (kun godkendte), `fixed-dates-list`
  (inkl. årligt tilbagevendende — de påmindes igen hvert år) og
  `itinerary-list`.
- En lille "allerede påmindet"-liste i KV (`notified-events`) sikrer at
  hver begivenhed kun giver én notifikation, selvom workeren tjekker igen
  hvert 5. minut. Den ryddes automatisk op efter et par dage.
- Tidszone- og sommertids-beregningen er håndtestet mod begge
  sommertidsskift (marts/oktober), så påmindelser rammer korrekt hele
  året, ikke kun i normal-tid.
- Døde abonnementer (fx hvis nogen sletter appen fra hjemmeskærmen) fjernes
  automatisk fra KV, næste gang der forsøges sendt til dem.

## Begrænsninger, I bør kende

- Der er **ét fast tidspunkt for alle** (60 min før / kl. 8 for
  heldagsbegivenheder) — ikke en valgfri påmindelsestid pr. begivenhed.
  I kan ændre standardtallene i `wrangler.toml`, men det gælder så alle
  begivenheder ens. Individuel påmindelsestid pr. aftale er en udvidelse,
  hvis behovet opstår.
- Der sendes **ikke** en notifikation med det samme, når en aftale
  foreslås eller godkendes — kun som en tidsbaseret påmindelse op til
  begivenheden. Det er en anden, separat funktion, hvis I får brug for den.
- **iPhone/iOS:** Push-notifikationer virker kun hvis Husrådet er "føjet til
  hjemmeskærmen" (Del-ikonet → "Føj til hjemmeskærm") og åbnes derfra — ikke
  hvis I bare har den som et faneblad i Safari. Det er en begrænsning i iOS
  selv, ikke noget vi kan omgå.
- **Android/Chrome/desktop:** virker uden installation, men er mest
  pålideligt som installeret PWA der også.
- Cron kører hvert 5. minut — det er langt inden for Cloudflares gratis
  kvote (der er tale om ca. 288 kørsler i døgnet).
