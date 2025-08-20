import { JWT } from 'next-auth/jwt';

const MAX_COOKIE_SIZE = 4096; // 4KB limit
const SAFETY_MARGIN = 512; // Keep 512 bytes margin

export function checkJWTSize(token: JWT): { 
  size: number; 
  isValid: boolean; 
  warning?: string;
  recommendation?: string;
} {
  const tokenString = JSON.stringify(token);
  const size = new TextEncoder().encode(tokenString).length;
  const isValid = size < (MAX_COOKIE_SIZE - SAFETY_MARGIN);
  
  const result: any = { size, isValid };
  
  if (!isValid) {
    result.warning = `JWT size (${size} bytes) exceeds safe limit`;
    result.recommendation = 'Remove non-essential data from JWT';
  } else if (size > MAX_COOKIE_SIZE * 0.75) {
    result.warning = `JWT size (${size} bytes) approaching limit`;
  }
  
  return result;
}

// NextAuth callback to keep JWT minimal
export const minimalJWTCallback = {
  async jwt({ token, user, account }: any) {
    if (user) {
      // Store only essential data
      token.id = user.id;
      token.stripeOnboardingComplete = user.stripeOnboardingComplete;
      // Don't store large objects like profile images, permissions arrays, etc.
    }
    
    // Monitor size in development
    if (process.env.NODE_ENV === 'development') {
      const sizeCheck = checkJWTSize(token);
      if (sizeCheck.warning) {
        console.warn('⚠️ JWT Size Warning:', sizeCheck);
      }
    }
    
    return token;
  }
};