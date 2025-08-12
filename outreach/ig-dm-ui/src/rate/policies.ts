/**
 * Rate Limiting Policies for Instagram Automation
 * Conservative quotas to avoid detection
 */

import { TokenBucket } from "./tokenBucket.ts";

// DM Rate Limiting - Very conservative
export const dmBucket = new TokenBucket({
  capacity: 5,              // 5 DM burst capacity
  refillEveryMs: 10 * 60 * 1000,  // Refill every 10 minutes
  refillAmount: 1           // Add 1 token per refill
});

// Search Rate Limiting - More permissive for user searches
export const searchBucket = new TokenBucket({
  capacity: 10,             // 10 search burst capacity
  refillEveryMs: 2 * 60 * 1000,   // Refill every 2 minutes
  refillAmount: 2           // Add 2 tokens per refill
});

// Like Rate Limiting - For pre-engagement (2 likes max per session)
export const likeBucket = new TokenBucket({
  capacity: 2,              // 2 likes max per session pre-DM
  refillEveryMs: 30 * 60 * 1000,  // Refill every 30 minutes  
  refillAmount: 1           // Add 1 token per refill
});

// Navigation Rate Limiting - For profile visits
export const navBucket = new TokenBucket({
  capacity: 20,             // 20 navigation burst capacity
  refillEveryMs: 5 * 60 * 1000,   // Refill every 5 minutes
  refillAmount: 5           // Add 5 tokens per refill
});

/**
 * Rate limiting summary for monitoring
 */
export function getRateLimitStatus() {
  return {
    dm: {
      available: dmBucket.getTokens(),
      capacity: 5
    },
    search: {
      available: searchBucket.getTokens(),
      capacity: 10
    },
    likes: {
      available: likeBucket.getTokens(),
      capacity: 2
    },
    navigation: {
      available: navBucket.getTokens(),
      capacity: 20
    },
    timestamp: new Date().toISOString()
  };
}