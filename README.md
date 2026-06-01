# Trypup — web (Astro)

Marketing landing + blog + Zásady ochrany / Podmínky pro **trypup.life**.
Samostatný projekt (vlastní `package.json` i git) — s mobilní appkou nesdílí závislosti.

## Lokálně
```bash
cd trypup-web
npm install
npm run dev      # http://localhost:4321
npm run build    # výstup do dist/
```

## Deploy na Vercel
1. Dej `trypup-web/` do **vlastního git repa** a pushni na GitHub:
   ```bash
   cd trypup-web
   git init && git add -A && git commit -m "Trypup web"
   # vytvoř repo na GitHubu (např. trypup-web) a:
   git remote add origin git@github.com:<ty>/trypup-web.git
   git push -u origin main
   ```
2. https://vercel.com → **Add New → Project** → importuj repo `trypup-web`.
   - Framework Preset: **Astro** (autodetekce). Build: `astro build`, output: `dist`. Nech default.
3. Po prvním deployi: **Settings → Domains → Add** → `trypup.life`.

## Připojení domény trypup.life (registrátor vedos.cz)
Ve Vercelu po přidání domény uvidíš přesné hodnoty. Typicky u vedos v DNS přidáš:
- **A** záznam: `@` → `76.76.21.21`
- **CNAME**: `www` → `cname.vercel-dns.com`

(Vercel ti u každé domény ukáže aktuální cílové hodnoty — řiď se jimi, výše je obvyklý default. SSL certifikát Vercel vystaví automaticky.)

Alternativa: přesměruj nameservery domény na Vercel/Cloudflare a spravuj DNS tam.

## Struktura
- `src/pages/index.astro` — landing
- `src/pages/o-aplikaci.astro` — O aplikaci
- `src/pages/blog/` — blog (Markdown v `src/content/blog/`)
- `src/pages/zasady-ochrany.astro`, `podminky.astro` — právní (URL pro App Store submit)
- `src/layouts/Base.astro`, `src/styles/global.css` — layout a styly

## Přidání blog postu
Vytvoř `src/content/blog/<slug>.md` s frontmatter: `title`, `description`, `date`, volitelně `tag`. Hotovo — objeví se v `/blog/` i na homepage.
