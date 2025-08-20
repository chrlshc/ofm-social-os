import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/server/db';
import { requireAuth } from '@/lib/auth';
import { validateRequest, deleteAccountSchema } from '@/lib/validation';

// GET /api/social/accounts - List connected accounts
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  
  const userId = authResult.id;
  
  try {
    const result = await pool.query(
      `SELECT 
        id,
        platform,
        username,
        external_id,
        scopes,
        expires_at,
        meta_json,
        created_at,
        updated_at
      FROM social_publisher.platform_accounts
      WHERE user_id = $1
      ORDER BY platform, created_at DESC`,
      [userId]
    );
    
    // Group by platform and add status
    const accounts = result.rows.map(account => ({
      ...account,
      is_expired: account.expires_at ? new Date(account.expires_at) < new Date() : false,
      expires_in_hours: account.expires_at 
        ? Math.max(0, Math.floor((new Date(account.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)))
        : null
    }));
    
    return NextResponse.json({
      success: true,
      accounts: accounts,
      platforms_connected: [...new Set(accounts.map(a => a.platform))],
      total: accounts.length
    });
    
  } catch (error: any) {
    console.error('Failed to list accounts:', error);
    return NextResponse.json(
      { error: 'Failed to list accounts', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/social/accounts - Disconnect an account
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    
    const body = await request.json();
    const validation = await validateRequest(deleteAccountSchema, body);
    if ('error' in validation) return validation.error;
    
    const { account_id } = validation.data;
    const user_id = authResult.id;
    
    // Delete the account (with ownership check)
    const result = await pool.query(
      `DELETE FROM social_publisher.platform_accounts
       WHERE id = $1 AND user_id = $2
       RETURNING platform, username`,
      [account_id, user_id]
    );
    
    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Account not found or unauthorized' },
        { status: 404 }
      );
    }
    
    const deletedAccount = result.rows[0];
    
    // Log the disconnection
    await pool.query(
      `INSERT INTO social_publisher.post_logs 
       (level, message, details)
       VALUES ('INFO', 'account_disconnected', $1)`,
      [JSON.stringify({
        user_id,
        account_id,
        platform: deletedAccount.platform,
        username: deletedAccount.username
      })]
    );
    
    return NextResponse.json({
      success: true,
      message: `Disconnected ${deletedAccount.platform} account @${deletedAccount.username}`,
      platform: deletedAccount.platform
    });
    
  } catch (error: any) {
    console.error('Failed to delete account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account', message: error.message },
      { status: 500 }
    );
  }
}