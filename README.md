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

## Deployment

- **Frontend:** Vercel
- **Database:** Railway or Supabase (PostgreSQL)

## License

Private project.
