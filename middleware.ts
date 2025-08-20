import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createCsrfMiddleware } from '@edge-csrf/nextjs';

// Create CSRF middleware
const csrfMiddleware = createCsrfMiddleware({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    httpOnly: true,
  },
});

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public routes that don't require authentication
  const publicRoutes = [
    '/login',
    '/register',
    '/api/auth',
  ];

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Check authentication for protected routes
  if (!isPublicRoute) {
    const token = await getToken({ req: request });
    
    if (!token) {
      // Redirect to login for page requests
      if (!pathname.startsWith('/api/')) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      
      // Return 401 for API requests
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
  }

  // Apply CSRF protection to state-changing requests
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    return csrfMiddleware(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protected API routes
    '/api/social/:path*',
    '/api/stripe/:path*',
    // Protected pages
    '/schedule/:path*',
    '/settings/:path*',
    // Exclude static files and public routes
    '/((?!_next/static|_next/image|favicon.ico|login|register|api/auth).*)',
  ],
};