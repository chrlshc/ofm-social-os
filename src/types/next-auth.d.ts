import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    stripeOnboardingComplete?: boolean;
  }

  interface Session {
    user: {
      id: string;
      stripeOnboardingComplete?: boolean;
    } & DefaultSession['user'];
  }
}