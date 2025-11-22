import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_TEST_AUTH: process.env.ENABLE_TEST_AUTH,
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    VERCEL_URL: process.env.VERCEL_URL,
    RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL,
    RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  });
}
