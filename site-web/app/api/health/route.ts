import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check database connection if needed
    // const db = await checkDatabaseConnection();
    
    return NextResponse.json({
      status: 'healthy',
      service: 'frontend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      service: 'frontend',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}