# ArcherChat - AI Chatbot

A ChatGPT-like AI chatbot powered by Google Gemini, built with Next.js and deployed on Google Cloud Platform.

## Features

- 🤖 AI-powered chat using Google Gemini 1.5 Flash
- 🔐 Google OAuth authentication
- 👥 Whitelist-based access control
- 💬 Conversation history management
- 👨‍💼 Admin panel for user management
- 📊 User statistics tracking
- 🎨 Clean, modern UI with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: Firestore (serverless)
- **Authentication**: NextAuth.js (Google OAuth)
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS + shadcn/ui
- **Deployment**: Cloud Run (GCP)

## Local Development Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Google Cloud Platform account
- Firebase project

### Step 1: Install Dependencies

\`\`\`bash
npm install
\`\`\`

### Step 2: Setup Environment Variables

Create a \`.env.local\` file in the root directory:

\`\`\`env
# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Google OAuth (Get from GCP Console)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Gemini API (Get from https://ai.google.dev/)
GEMINI_API_KEY=your-gemini-api-key

# Firebase/Firestore
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="your-firebase-private-key"
FIREBASE_CLIENT_EMAIL=your-firebase-client-email

# Admin Email
ADMIN_EMAIL=archeryue7@gmail.com
\`\`\`

### Step 3: Get API Keys and Credentials

#### 1. Gemini API Key
1. Go to [https://ai.google.dev/](https://ai.google.dev/)
2. Click "Get API Key"
3. Create a new API key
4. Copy the key to \`GEMINI_API_KEY\` in \`.env.local\`

#### 2. Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable Firestore Database (Native mode)
4. Go to Project Settings → Service Accounts
5. Click "Generate new private key"
6. Download the JSON file
7. Copy values to \`.env.local\`:
   - \`project_id\` → \`FIREBASE_PROJECT_ID\`
   - \`private_key\` → \`FIREBASE_PRIVATE_KEY\`
   - \`client_email\` → \`FIREBASE_CLIENT_EMAIL\`

#### 3. Google OAuth Credentials
1. Go to [GCP Console](https://console.cloud.google.com/)
2. Navigate to APIs & Services → Credentials
3. Click "Create Credentials" → "OAuth 2.0 Client ID"
4. Application type: Web application
5. Add authorized redirect URI: \`http://localhost:3000/api/auth/callback/google\`
6. Copy Client ID and Client Secret to \`.env.local\`

### Step 4: Run Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 5: First Login

1. Click "Get Started" → "Sign in with Google"
2. Sign in with your Google account (archeryue7@gmail.com)
3. You'll be automatically whitelisted as admin
4. Start chatting!

## Project Structure

\`\`\`
src/
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # NextAuth endpoints
│   │   ├── chat/         # Chat endpoint
│   │   ├── conversations/# Conversation management
│   │   └── admin/        # Admin endpoints
│   ├── chat/             # Main chat interface
│   ├── admin/            # Admin panel
│   ├── login/            # Login page
│   └── layout.tsx
├── components/
│   ├── chat/             # Chat components
│   ├── admin/            # Admin components
│   ├── ui/               # UI components
│   └── providers/        # Context providers
├── lib/
│   ├── firebase-admin.ts # Firestore setup
│   ├── gemini.ts         # Gemini API client
│   ├── auth.ts           # NextAuth config
│   └── utils.ts          # Utility functions
└── types/
    └── index.ts          # TypeScript types
\`\`\`

## Admin Features

As an admin, you can:

1. **Manage Whitelist**: Add/remove emails that can access the app
2. **View User Stats**: See all users, message counts, and last active times
3. **Access Admin Panel**: Click "Admin Panel" in the sidebar

## Cost Estimation

For family use (5-10 users, ~1000 messages/month):

- Firestore: **FREE** (within free tier)
- Cloud Run: **$5-10/month**
- Gemini API: **$2-5/month**
- **Total: $8-18/month**

## Deployment

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) Phase 10 for deployment instructions.

## Troubleshooting

### "Unauthorized" error when testing
- Make sure all environment variables are set correctly
- Check that Firebase credentials are valid
- Verify that your email is set as \`ADMIN_EMAIL\`

### Firestore permission denied
- Make sure you're using Firebase Admin SDK (not client SDK)
- Check that the service account has proper permissions

### Chat not streaming
- Verify Gemini API key is correct
- Check browser console for errors
- Make sure you're not hitting rate limits

## License

MIT

## Support

For issues or questions, please create an issue on GitHub.
