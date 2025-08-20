import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { pool } from '@/server/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// POST /api/stripe/connect - Create Express account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, email, return_url } = body;
    
    if (!user_id || !email) {
      return NextResponse.json(
        { error: 'user_id and email are required' },
        { status: 400 }
      );
    }
    
    // Check if user already has a Stripe account
    const existingResult = await pool.query(
      `SELECT stripe_account_id, stripe_onboarding_complete 
       FROM users 
       WHERE id = $1`,
      [user_id]
    );
    
    if (existingResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const user = existingResult.rows[0];
    let accountId = user.stripe_account_id;
    
    // Create Express account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          product_description: 'Content creation and social media services',
        },
      });
      
      accountId = account.id;
      
      // Save account ID
      await pool.query(
        `UPDATE users 
         SET stripe_account_id = $1, 
             updated_at = NOW() 
         WHERE id = $2`,
        [accountId, user_id]
      );
    }
    
    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${return_url || process.env.NEXT_PUBLIC_URL}/settings/payments?refresh=true`,
      return_url: `${return_url || process.env.NEXT_PUBLIC_URL}/settings/payments?success=true`,
      type: 'account_onboarding',
    });
    
    return NextResponse.json({
      success: true,
      onboarding_url: accountLink.url,
      account_id: accountId,
      expires_at: accountLink.expires_at,
    });
    
  } catch (error: any) {
    console.error('Stripe Connect error:', error);
    return NextResponse.json(
      { error: 'Failed to create Connect account', message: error.message },
      { status: 500 }
    );
  }
}

// GET /api/stripe/connect - Get account status
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');
  
  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }
  
  try {
    // Get user's Stripe account ID
    const userResult = await pool.query(
      `SELECT stripe_account_id, stripe_onboarding_complete 
       FROM users 
       WHERE id = $1`,
      [parseInt(userId)]
    );
    
    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const user = userResult.rows[0];
    
    if (!user.stripe_account_id) {
      return NextResponse.json({
        success: true,
        has_account: false,
        onboarding_complete: false,
      });
    }
    
    // Get account details from Stripe
    const account = await stripe.accounts.retrieve(user.stripe_account_id);
    
    // Check if onboarding is complete
    const isComplete = account.charges_enabled && account.payouts_enabled;
    
    // Update database if status changed
    if (isComplete && !user.stripe_onboarding_complete) {
      await pool.query(
        `UPDATE users 
         SET stripe_onboarding_complete = true, 
             updated_at = NOW() 
         WHERE id = $1`,
        [parseInt(userId)]
      );
    }
    
    return NextResponse.json({
      success: true,
      has_account: true,
      account_id: account.id,
      onboarding_complete: isComplete,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      requirements: account.requirements,
      business_profile: account.business_profile,
      created: account.created,
    });
    
  } catch (error: any) {
    console.error('Failed to get Connect status:', error);
    return NextResponse.json(
      { error: 'Failed to get account status', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/stripe/connect - Disconnect account
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id } = body;
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }
    
    // Get user's Stripe account ID
    const userResult = await pool.query(
      `SELECT stripe_account_id FROM users WHERE id = $1`,
      [user_id]
    );
    
    if (userResult.rows.length === 0 || !userResult.rows[0].stripe_account_id) {
      return NextResponse.json(
        { error: 'No Stripe account found' },
        { status: 404 }
      );
    }
    
    const accountId = userResult.rows[0].stripe_account_id;
    
    // Delete account in Stripe (optional - accounts can be left inactive)
    // await stripe.accounts.del(accountId);
    
    // Remove from database
    await pool.query(
      `UPDATE users 
       SET stripe_account_id = NULL, 
           stripe_onboarding_complete = false,
           updated_at = NOW() 
       WHERE id = $1`,
      [user_id]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Stripe account disconnected successfully',
    });
    
  } catch (error: any) {
    console.error('Failed to disconnect account:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect account', message: error.message },
      { status: 500 }
    );
  }
}