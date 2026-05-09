import { Request, Response, NextFunction } from 'express';
import Redis from "ioredis";

export const ipRateLimit = (redis: Redis) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress || 'unknown';
    const rateKey = `ratelimit:{${clientIp}}:purchase`;
    try {
      const count = await redis.incr(rateKey);
      if (count === 1) await redis.pexpire(rateKey, 1000);
      if (count > 10) {
        return res.status(429).json({
          success: false,
          message: 'TOO_MANY_REQUESTS_FROM_THIS_IP'
        });
      }
      next();
    } catch (error) {
      next();
    }
  };
};