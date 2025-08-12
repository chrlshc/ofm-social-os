/**
 * Token Bucket Rate Limiting
 * Conservative rate limiting for Instagram automation
 */

export interface TokenBucketOptions {
  capacity: number;        // Max tokens
  refillEveryMs: number;   // Refill interval in milliseconds
  refillAmount: number;    // Tokens to add per refill
}

export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillEveryMs: number;
  private readonly refillAmount: number;
  private lastRefill: number;

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity;
    this.refillEveryMs = options.refillEveryMs;
    this.refillAmount = options.refillAmount;
    this.tokens = options.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= this.refillEveryMs) {
      const refills = Math.floor(elapsed / this.refillEveryMs);
      const tokensToAdd = refills * this.refillAmount;
      
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Take n tokens from bucket, waiting if necessary
   */
  async take(n = 1): Promise<void> {
    this.refill();
    
    while (this.tokens < n) {
      const waitMs = this.refillEveryMs - (Date.now() - this.lastRefill);
      await new Promise(resolve => setTimeout(resolve, Math.max(50, waitMs)));
      this.refill();
    }
    
    this.tokens -= n;
  }

  /**
   * Check available tokens without consuming
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Check if tokens are available without consuming
   */
  canTake(n = 1): boolean {
    this.refill();
    return this.tokens >= n;
  }
}