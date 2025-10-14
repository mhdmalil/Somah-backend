// Simple in-memory cache implementation
// In production, replace with Redis

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
    this.maxSize = 1000; // Maximum number of items
  }

  set(key, value, ttlSeconds = 300) {
    // Remove oldest items if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.delete(firstKey);
    }

    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const expiry = this.ttl.get(key);
    if (expiry && Date.now() > expiry) {
      this.delete(key);
      return null;
    }

    return this.cache.get(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  size() {
    return this.cache.size;
  }

  // Clean expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.ttl.entries()) {
      if (now > expiry) {
        this.delete(key);
      }
    }
  }
}

// Create cache instance
const cache = new MemoryCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);

// Cache key generators
const cacheKeys = {
  stores: (category, query) => `stores:${category || 'all'}:${query || 'all'}`,
  products: (storeId, category, query) => `products:${storeId || 'all'}:${category || 'all'}:${query || 'all'}`,
  cart: (userId) => `cart:${userId}`,
  user: (userId) => `user:${userId}`,
  store: (storeId) => `store:${storeId}`,
  product: (productId) => `product:${productId}`
};

// Cache middleware
const cacheMiddleware = (keyGenerator, ttl = 300) => {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const cached = cache.get(key);
    
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }
    
    // Store original res.json
    const originalJson = res.json.bind(res);
    
    // Override res.json to cache the response
    res.json = (data) => {
      cache.set(key, data, ttl);
      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };
    
    next();
  };
};

// Cache invalidation helpers
const invalidateCache = {
  stores: () => {
    for (const key of cache.cache.keys()) {
      if (key.startsWith('stores:')) {
        cache.delete(key);
      }
    }
  },
  products: (storeId) => {
    for (const key of cache.cache.keys()) {
      if (key.startsWith('products:') && (!storeId || key.includes(storeId))) {
        cache.delete(key);
      }
    }
  },
  cart: (userId) => {
    cache.delete(cacheKeys.cart(userId));
  },
  user: (userId) => {
    cache.delete(cacheKeys.user(userId));
  }
};

module.exports = {
  cache,
  cacheKeys,
  cacheMiddleware,
  invalidateCache
};
