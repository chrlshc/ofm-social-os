import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/server/db';
import { z } from 'zod';

// Schema de validation
const waitlistSchema = z.object({
  email: z.string().email(),
  instagram: z.string().optional(),
  niche: z.string().optional(),
  timezone: z.string().optional(),
  consent: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Valider les données
    const validation = waitlistSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: 'Invalid data provided' },
        { status: 400 }
      );
    }
    
    const { email, instagram, niche, timezone, consent } = validation.data;
    
    // Vérifier si l'email existe déjà
    const existing = await pool.query(
      'SELECT id FROM waitlist WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { message: 'You are already on the waitlist!' },
        { status: 400 }
      );
    }
    
    // Insérer dans la base de données
    await pool.query(
      `INSERT INTO waitlist (email, instagram_handle, niche, timezone, marketing_consent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [email, instagram, niche, timezone, consent]
    );
    
    // Envoyer l'email de bienvenue avec AWS SES
    try {
      const { sendWelcomeEmail } = await import('@/services/ses-email');
      await sendWelcomeEmail(email);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Continue anyway - don't fail the signup
    }
    
    // Log pour debug
    console.log('New waitlist signup:', { email, instagram, niche });
    
    return NextResponse.json({
      success: true,
      message: 'Successfully joined the waitlist!'
    });
    
  } catch (error: any) {
    console.error('Waitlist error:', error);
    return NextResponse.json(
      { message: 'Failed to join waitlist' },
      { status: 500 }
    );
  }
}