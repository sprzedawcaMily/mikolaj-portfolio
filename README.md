# Portfolio — Mikołaj Mikołajczuk

Strona portfolio w **React + TypeScript (Vite)** z design systemem **EMDS**, motywem dziennym (Assembless Earth) i nocnym (neonowy ciemny fiolet), animacją twarzy z kropek oraz sekcjami projektów.

## Uruchomienie

```bash
npm install
npm run dev
```

Produkcja: `npm run build` → folder `dist/`

## Publikacja na GitHub

Repozytorium jest gotowe lokalnie (branch `main`). Jednorazowo zaloguj się i wypchnij:

```powershell
cd "e:\gitbun\moja prezentacja"
gh auth login
gh repo create mikolaj-portfolio --public --source=. --remote=origin --push
```

Jeśli repo już istnieje na GitHubie:

```powershell
git remote add origin https://github.com/TWOJ_USER/mikolaj-portfolio.git
git push -u origin main
```

## Zrzuty ekranów aplikacji

Skopiuj swoje screeny do `public/images/` według struktury:

```
public/images/
  transitrank/
    dashboard.png
    reviews.png
    add-review.png
    planner.png
    more.png
  forkfull/
    home.png
    meal.png
    breakdown.png
    plan.png
    settings.png
  kamochi/
    store.png
```

Możesz też wrzucić pliki do folderu `zdjecia/` i uruchomić:

```powershell
.\scripts\setup-images.ps1
```

## Struktura kodu

```
src/
  animation/       # siatka twarzy, DotReveal przy scrollu
  components/
    emds/          # Card, Button, Badge… (EMDS)
    layout/        # nagłówek, przełącznik motywu
    portfolio/     # sekcje strony
  data/            # CV, projekty, umiejętności
  hooks/
  theme/           # tokeny light/dark + React Native export
```

## Motywy

- **Dzień** — tokeny EMDS Assembless Earth (`#F6F4F0` / `#FFFFFF`)
- **Noc** — ciemny fiolet z jaśniejszą powierzchnią (zgodnie z zasadą EMDS: surface > background)

Przełącznik w prawym górnym rogu; wybór zapisywany w `localStorage`.

## Animacja scroll-morph (twarz → strzałka → projekty)

Mesh w portalu (`#mesh-portal-root`) morphuje się po scrollu przez sekcje:

1. **Hero** — twarz z kropek  
2. **Paleta** — twarz → strzałka (scroll trigger, animacja czasowa)  
3. **TransitRank / Forkfull / Kamochi** — strzałka → autobus → widelec → sprej  

Logika: `src/hooks/usePortraitScrollMorph.ts`  
Canvas: `src/components/animation/AnimatedNeonPortrait.tsx`

Zasady stabilności (dla AI i maintainerów): `.cursor/rules/scroll-morph-stability.mdc`

## React Native

Tokeny do aplikacji mobilnej: `src/theme/reactNativeTokens.ts`
