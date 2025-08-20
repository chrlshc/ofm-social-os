import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const REDDIT_REDIRECT_URI = process.env.REDDIT_REDIRECT_URI || 'http://localhost:3000/api/auth/reddit/callback';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }
  
  if (!REDDIT_CLIENT_ID) {
    return res.status(500).json({ error: 'Reddit client ID not configured' });
  }

  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString('base64url');
  
  // Store state in a cookie (in production, use a database or session store)
  res.setHeader('Set-Cookie', [
    `reddit_oauth_state=${state}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax`,
    `reddit_oauth_user=${user_id}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax`
  ]);

  // Build Reddit OAuth URL
  const params = new URLSearchParams({
    client_id: REDDIT_CLIENT_ID,
    response_type: 'code',
    state: state,
    redirect_uri: REDDIT_REDIRECT_URI,
    duration: 'permanent',
    scope: 'identity submit read'
  });

  const authUrl = `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  
  // Redirect to Reddit
  res.redirect(302, authUrl);
}