import { Redis } from "@upstash/redis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return new Redis({ url, token });
}

export const redis: Redis | null = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production" && redis) globalForRedis.redis = redis;
