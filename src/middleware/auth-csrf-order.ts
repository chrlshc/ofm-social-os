import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createCsrfMiddleware } from '@edge-csrf/nextjs';

// Create CSRF middleware instance
const csrfMiddleware = createCsrfMiddleware({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    httpOnly: true,
  },
});

export async function authCsrfMiddleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // 1. Check authentication FIRST
  const token = await getToken({ req: request });
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register', '/api/auth'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  if (!isPublicRoute && !token) {
    // Return 401 for API routes, redirect for pages
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // 2. Apply CSRF protection ONLY for authenticated state-changing requests
  if (token && request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    try {
      return await csrfMiddleware(request);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid CSRF token' },
        { status: 403 }
      );
    }
  }
  
  return NextResponse.next();
}