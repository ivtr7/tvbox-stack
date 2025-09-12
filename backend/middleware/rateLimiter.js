import { supabase } from '../config/database.js';

const requests = new Map();

export const rateLimiter = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `rate_limit_${ip}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 1000; // requests per window

  try {
    // Get current request count
    const current = requests.get(key) || { count: 0, resetTime: now + windowMs };

    // Reset if window expired
    if (now > current.resetTime) {
      current.count = 0;
      current.resetTime = now + windowMs;
    }

    // Increment count
    current.count++;
    requests.set(key, current);

    // Check limit
    if (current.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        resetTime: current.resetTime
      });
    }

    // Add headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - current.count),
      'X-RateLimit-Reset': Math.ceil(current.resetTime / 1000)
    });

    next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    next(); // Don't block requests on rate limiter errors
  }
};

// Cleanup expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requests.entries()) {
    if (now > value.resetTime) {
      requests.delete(key);
    }
  }
}, 60 * 60 * 1000);