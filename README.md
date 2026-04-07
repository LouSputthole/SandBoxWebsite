# S&box Skins Marketplace

A CSGOskins.gg-style marketplace website for **S&box** (Steam AppID 590830) skins. Browse, search, and track prices for S&box cosmetic items on the Steam Community Market.

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Database:** PostgreSQL + Prisma ORM
- **Charts:** Recharts (price history)
- **Icons:** Lucide React

## Features (MVP)

- Browse all S&box marketplace skins with grid view
- Search items by name
- Filter by type, rarity, and price range
- Sort by price, name, popularity
- Item detail pages with price history charts
- Price tracking and trends (24h change, historical data)
- Dark gaming-themed UI
- Fully responsive design

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL

# Run database migrations
npx prisma migrate dev

# Seed with mock data
npx prisma db seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   ├── items/              # Browse & item detail pages
│   └── page.tsx            # Homepage
├── components/
│   ├── layout/             # Navbar, footer, search
│   ├── items/              # Item cards, grid, filters
│   ├── charts/             # Price history charts
│   └── ui/                 # shadcn/ui components
├── lib/
│   ├── db.ts               # Prisma client
│   └── steam/              # Steam Market API client & mock data
└── prisma/
    ├── schema.prisma       # Database schema
    └── seed.ts             # Mock data seeder
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `STEAM_API_KEY` | Steam Web API key (optional, for future live data) |

## Deployment (Vercel)

### Prerequisites

- A PostgreSQL database (e.g., [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app))
- (Optional) A Redis instance (e.g., [Upstash](https://upstash.com)) — the app works without Redis, caching is just skipped

### Environment Variables

Set these in your Vercel project settings:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | No | Redis connection string (caching is skipped if unset) |
| `STEAM_API_KEY` | No | Steam Web API key (for future live data) |
| `CRON_SECRET` | Yes | Secret token to protect the `/api/sync` cron endpoint |

### Deploy Steps

1. Push this repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Set the environment variables above in the Vercel dashboard
4. Vercel will automatically run `vercel-build` which runs Prisma migrations then builds
5. Seed your database: run `npx prisma db seed` locally against your production DATABASE_URL, or use the sync API

### Cron Jobs

`vercel.json` configures an automatic sync every 6 hours via `POST /api/sync`. The endpoint is protected by the `CRON_SECRET` env var — Vercel sends this automatically for cron-triggered requests.

## License

Private project.
