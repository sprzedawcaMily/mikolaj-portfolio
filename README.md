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

Skopiuj swoje screeny do `public/images/` według struktury (folder = projekt / sekcja):

```
public/images/
  profile/          # hero, paleta (o mnie), strzałka kontaktu
  transitrank/      # autobus.svg + screeny mobile
  forkfull/         # widelec.svg + screeny mobile
  kamochi/          # sprej.svg + screeny sklepu
  legitcheck/       # lupa.svg (mesh karty LegitCheck)
  stylerank/        # pierscionek.svg + screeny web
  experience/       # oko2.svg (mesh Doświadczenie + Umiejętności)
```

Ścieżki mesh SVG są scentralizowane w `src/data/meshAssets.ts`.

Możesz też wrzucić pliki do folderu `zdjecia/` i uruchomić:

```powershell
.\scripts\setup-images.ps1
```

## Struktura kodu

```
src/
  components/
    animation/       # FlyingMeshDots, flyingDotEngine, KamochiEye, mesh/
    debug/           # MeshPerfMonitor (?perf=1 / dev)
    emds/            # Card, Button, Badge… (EMDS)
    layout/          # nagłówek, hue picker
    portfolio/       # sekcje strony
  data/              # CV, projekty, meshAssets (ścieżki SVG)
  hooks/             # meshScrollEngine, meshAnimationLoop, perf
  theme/             # tokeny light/dark + React Native export
```

## Animacja scroll-morph

Jedna warstwa canvas (`FlyingMeshDots`) morphuje kropki między strefami po scrollu:

1. **Hero** — twarz z kropek  
2. **Paleta** — siatka kolorów (Studio)  
3. **Projekty** — autobus → widelec → sprej → lupa → pierścionek  
4. **Kariera / umiejętności** — oko Kamochi  
5. **Kontakt** — strzałka  

| Warstwa | Plik |
|---------|------|
| React + canvas | `src/components/animation/FlyingMeshDots.tsx` |
| Silnik lotu / paint | `src/components/animation/flyingDotEngine.ts` |
| Strefy scrolla | `src/hooks/meshScrollEngine.ts` |
| Pętla RAF | `src/hooks/meshAnimationLoop.ts` |
| SVG / atlas | `src/components/animation/mesh/` |

Zasady stabilności: `.cursor/rules/scroll-morph-stability.mdc`

### Tryby wydajności (URL)

- `?full=1` — pełne 60 FPS, bez auto-lite  
- `?lite=1` — mniej efektów  
- `?slow=1` — symulacja słabego PC  
- `?perf=1` — monitor FPS (prod)

## Motywy

- **Dzień** — tokeny EMDS Assembless Earth (`#F6F4F0` / `#FFFFFF`)
- **Noc** — ciemny fiolet z jaśniejszą powierzchnią (surface > background)

Przełącznik w prawym górnym rogu; wybór zapisywany w `localStorage`.

## React Native

Tokeny do aplikacji mobilnej: `src/theme/reactNativeTokens.ts`
