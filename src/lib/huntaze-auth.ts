import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/server/db';
import { cookies } from 'next/headers';

interface HuntazeUser {
  id: number;
  email: string;
  stripe_onboarding_complete: boolean;
  stripe_account_id?: string;
}

/**
 * Vérifie la session Huntaze existante
 * Remplace l'authentification NextAuth par la session Huntaze
 */
export async function getHuntazeSession(): Promise<HuntazeUser | null> {
  try {
    // Récupérer le token de session Huntaze depuis les cookies
    const cookieStore = cookies();
    const sessionToken = cookieStore.get('huntaze_session')?.value;
    
    if (!sessionToken) {
      return null;
    }
    
    // Vérifier la session dans la DB Huntaze
    const result = await pool.query(
      `SELECT 
        u.id,
        u.email,
        u.stripe_onboarding_complete,
        u.stripe_account_id
      FROM users u
      INNER JOIN sessions s ON s.user_id = u.id
      WHERE s.token = $1 
        AND s.expires_at > NOW()
        AND s.is_valid = true`,
      [sessionToken]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Huntaze session error:', error);
    return null;
  }
}

/**
 * Middleware pour protéger les routes Social OS
 * Vérifie que l'utilisateur est connecté à Huntaze
 */
export async function requireHuntazeAuth() {
  const user = await getHuntazeSession();
  
  if (!user) {
    return NextResponse.json(
      { error: 'Please login to Huntaze first' },
      { status: 401 }
    );
  }
  
  return user;
}

/**
 * Vérifie que l'utilisateur a complété Stripe Connect
 */
export async function requireHuntazeStripeOnboarding() {
  const user = await getHuntazeSession();
  
  if (!user) {
    return NextResponse.json(
      { error: 'Please login to Huntaze first' },
      { status: 401 }
    );
  }
  
  if (!user.stripe_onboarding_complete) {
    return NextResponse.json(
      { error: 'Please complete Stripe onboarding in Huntaze first' },
      { status: 403 }
    );
  }
  
  return user;
}

/**
 * Helper pour obtenir l'URL de retour vers Huntaze
 */
export function getHuntazeReturnUrl(path?: string): string {
  const baseUrl = process.env.HUNTAZE_URL || 'https://huntaze.com';
  return path ? `${baseUrl}${path}` : baseUrl;
}