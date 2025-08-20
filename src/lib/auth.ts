import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextRequest, NextResponse } from 'next/server';

export async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return null;
  }
  
  return {
    id: parseInt(session.user.id),
    email: session.user.email!,
    stripeOnboardingComplete: session.user.stripeOnboardingComplete || false
  };
}

export async function requireAuth() {
  const user = await getAuthenticatedUser();
  
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  
  return user;
}

export async function requireStripeOnboarding() {
  const user = await getAuthenticatedUser();
  
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  
  if (!user.stripeOnboardingComplete) {
    return NextResponse.json(
      { error: 'Stripe onboarding required' },
      { status: 403 }
    );
  }
  
  return user;
}