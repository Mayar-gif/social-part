import { createClient } from 'redis';
import { config } from '../../config/config.service.js';

class RedisService {
  private readonly client = createClient({ url: config.redisUrl });

  connect = async () => {
    this.client.on('error', (err) => console.error('Redis error:', err));
    await this.client.connect();
    console.log('Redis connected');
  };

  set = async (key: string, value: string, ttlSeconds?: number) => {
    await this.client.set(key, value, ttlSeconds ? { EX: ttlSeconds } : undefined);
  };

  get = (key: string) => this.client.get(key);

  del = async (...keys: string[]) => {
    if (keys.length) await this.client.del(keys);
  };

  exists = async (key: string) => (await this.client.exists(key)) === 1;

  ttl = (key: string) => this.client.ttl(key);

  incr = async (key: string, ttlSeconds: number) => {
    const value = await this.client.incr(key);
    if (value === 1) await this.client.expire(key, ttlSeconds);
    return value;
  };

  deleteByPattern = async (pattern: string) => {
    const keys: string[] = [];
    for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key as unknown as string);
    }
    await this.del(...keys);
  };
}

export const redisService = new RedisService();
