import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  return new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null; // Stop retrying after 3 attempts
      return Math.min(times * 200, 2000);
    },
  });
}

export const redis: Redis | null = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production" && redis) globalForRedis.redis = redis;
