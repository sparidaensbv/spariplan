# Spariplan — Sparidaens BV

Planningsapp voor Sparidaens BV. Gebouwd met React + Supabase + Vercel.

## Eerste keer opzetten

### 1. Code naar GitHub

1. Maak een nieuwe repository op GitHub: `spariplan`
2. Upload deze map als de inhoud van die repo
   - Ofwel via web (drag & drop alle bestanden)
   - Of via terminal (zie onderaan)

### 2. Deploy op Vercel

1. Ga naar [vercel.com/new](https://vercel.com/new)
2. Importeer je GitHub repository `spariplan`
3. Voor "Framework Preset" kies **Vite**
4. Voeg deze **Environment Variables** toe (Settings → Environment Variables):

   | Naam | Waarde |
   |------|--------|
   | `VITE_SUPABASE_URL` | `https://dgqnupehuntihmvjqmte.supabase.co` |
   | `VITE_SUPABASE_KEY` | `sb_publishable_DcvyT7WdVFmslHOJnA1hLA_iT3zurdc` |

5. Klik **Deploy**

### 3. Gebruikers aanmaken in Supabase

In Supabase ga naar **Authentication → Users** en klik op **Add user → Create new user**:

| Email | Wachtwoord | Voor |
|-------|-----------|------|
| `rik@sparidaensbv.nl` | (kies wachtwoord) | Rik |
| `twan@sparidaensbv.nl` | (kies wachtwoord) | Twan |
| `emar@sparidaensbv.nl` | (kies wachtwoord) | Emar |

Vink "Auto Confirm User" aan zodat ze direct kunnen inloggen.

### 4. Lokaal draaien (optioneel)

Maak een `.env` bestand aan met:

```
VITE_SUPABASE_URL=https://dgqnupehuntihmvjqmte.supabase.co
VITE_SUPABASE_KEY=sb_publishable_DcvyT7WdVFmslHOJnA1hLA_iT3zurdc
```

Daarna:

```bash
npm install
npm run dev
```

## Wat zit er in

- **Dashboard** — KPIs uit echte database
- **Planning** — placeholder voor weekgrid
- **Klanten** — alle 148 klanten zoekbaar en filterbaar
- **Taken** — 181 taken voor week 18+19 met filter per week

## Wat komt nog

- Auto-planning logica
- Mobiele app voor Emar (PWA)
- Klantportaal met live ETA
- Drag & drop planning grid
- Snelstart koppeling
- WhatsApp notificaties

## Code via terminal naar GitHub

```bash
cd spariplan-app
git init
git add .
git commit -m "Eerste versie Spariplan"
git branch -M main
git remote add origin https://github.com/JOUWUSER/spariplan.git
git push -u origin main
```
