import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { mockItems } from "../src/lib/steam/mock-data.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function generatePriceHistory(basePrice: number, days: number) {
  const points = [];
  let price = basePrice * (0.7 + Math.random() * 0.3);

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(12, 0, 0, 0);

    // Random walk with slight upward bias
    const change = (Math.random() - 0.48) * basePrice * 0.08;
    price = Math.max(0.03, price + change);

    points.push({
      price: Math.round(price * 100) / 100,
      volume: Math.floor(Math.random() * 50) + 1,
      timestamp: date,
    });
  }

  return points;
}

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.pricePoint.deleteMany();
  await prisma.item.deleteMany();

  for (const item of mockItems) {
    const priceHistory = generatePriceHistory(item.currentPrice, 90);

    await prisma.item.create({
      data: {
        name: item.name,
        slug: item.slug,
        description: item.description,
        type: item.type,
        rarity: item.rarity,
        imageUrl: item.imageUrl,
        marketUrl: item.marketUrl,
        currentPrice: item.currentPrice,
        lowestPrice: item.lowestPrice,
        medianPrice: item.medianPrice,
        volume: item.volume,
        priceChange24h: item.priceChange24h,
        isLimited: item.isLimited,
        priceHistory: {
          create: priceHistory,
        },
      },
    });
  }

  console.log(`Seeded ${mockItems.length} items with price history.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
