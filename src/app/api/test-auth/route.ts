/**
 * Test-only authentication bypass endpoint
 * ONLY works in development mode
 * DO NOT deploy to production
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // SECURITY: Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  try {
    const { userId, email, name } = await req.json();

    // Create a session token for testing
    // In a real implementation, this would create a proper NextAuth session
    // For E2E tests, we'll use a simple approach

    const sessionData = {
      user: {
        id: userId || 'test-user-e2e',
        email: email || process.env.ADMIN_EMAIL,
        name: name || 'E2E Test User',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    };

    // Note: This is a simplified version
    // Real NextAuth sessions are more complex
    return NextResponse.json({
      success: true,
      session: sessionData,
      message: 'Test session created. This only works in development.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create test session' },
      { status: 500 }
    );
  }
}
