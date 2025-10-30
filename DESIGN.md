# ArcherChat - AI Chatbot Design Document

## Overview
ArcherChat is a ChatGPT-like AI chatbot website that uses Google's Gemini API as the primary AI provider. The application features Google Account authentication with whitelist-based access control, deployed on Google Cloud Platform (GCP).

**Target Cost**: < $30/month for family use (5-10 users, ~1000 messages/month)

## System Architecture

### High-Level Architecture (Cost-Optimized)
```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS
       │
┌──────▼────────────────────────┐
│   Cloud Run                   │
│   Next.js Fullstack           │
│   (Frontend + API Routes)     │
└──┬───────────┬────────────────┘
   │           │
   │           │
   ▼           ▼
┌─────────┐ ┌──────────┐
│Firestore│ │ Gemini   │
│(NoSQL)  │ │   API    │
└─────────┘ └──────────┘
```

**Why this architecture?**
- Single Cloud Run instance (saves ~$30-50/month vs separate backend)
- Firestore serverless (FREE tier for family use vs $30-50/month for Cloud SQL)
- No always-on database server
- Total cost: ~$10-20/month

## Technology Stack

### Application Framework
- **Framework**: Next.js 14+ (App Router)
  - React-based, server-side rendering
  - Built-in API routes for backend
  - Fullstack in single deployment
- **Language**: TypeScript
  - Type safety throughout
  - Better maintainability
- **UI Library**:
  - Tailwind CSS for styling
  - shadcn/ui for components
  - React Markdown for message rendering
  - Syntax highlighting for code blocks
- **State Management**: React Context API (simple, no extra deps)

### Database
- **Firestore** (NoSQL, serverless)
  - FREE tier: 50K reads/day, 20K writes/day, 1GB storage
  - Auto-scales to zero cost when idle
  - Real-time capabilities
  - Simple SDK (Firebase Admin SDK)
  - Perfect for family use case

### Authentication
- **Provider**: Google OAuth 2.0
- **Implementation**: NextAuth.js (Auth.js)
  - Built for Next.js
  - Google provider built-in
  - Session management included
- **Session Storage**: JWT tokens (no database session needed)

### AI Provider
- **Primary**: Google Gemini API
  - **Model**: Gemini 1.5 Flash (cheaper, fast)
    - Input: $0.075 / 1M tokens
    - Output: $0.30 / 1M tokens
    - ~1000 messages/month = ~$2-5/month
- **SDK**: @google/generative-ai (official Node.js SDK)

### Infrastructure (GCP)
- **Compute**: Cloud Run (single instance)
  - Containerized Next.js app
  - Auto-scaling (min: 0, max: 3)
  - Pay per use (~$5-10/month for family traffic)
- **Database**: Firestore (serverless, likely FREE tier)
- **Secrets**: Environment variables (simple) or Secret Manager
- **DNS/SSL**: Cloud Run custom domains (free SSL)
- **CI/CD**: Manual docker build + deploy (simplest) or Cloud Build

## Data Models (Firestore Collections)

### Firestore Structure
```
/users/{userId}
/whitelist/{email}
/conversations/{conversationId}
/conversations/{conversationId}/messages/{messageId}
```

### User Document
**Collection**: `users`
**Document ID**: User's Google ID

```typescript
interface User {
  email: string;                 // Google email
  name: string;                  // Display name
  avatar_url: string;            // Google profile picture
  is_admin: boolean;             // Can manage whitelist
  created_at: Timestamp;
  last_login: Timestamp;
}
```

### Whitelist Document
**Collection**: `whitelist`
**Document ID**: Email address (e.g., "user@example.com")

```typescript
interface WhitelistEntry {
  added_by: string;              // Admin user_id
  added_at: Timestamp;
  notes?: string;                // Optional notes
}
```

### Conversation Document
**Collection**: `conversations`
**Document ID**: Auto-generated ID

```typescript
interface Conversation {
  user_id: string;               // Reference to user
  title: string;                 // Auto-generated from first message
  model: string;                 // "gemini-1.5-flash"
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

### Message Document (Subcollection)
**Collection**: `conversations/{conversationId}/messages`
**Document ID**: Auto-generated ID

```typescript
interface Message {
  role: 'user' | 'assistant';    // Message sender
  content: string;               // Message text
  created_at: Timestamp;
}
```

**Note**: Messages are stored as subcollections under conversations for efficient querying and automatic deletion when conversation is deleted.

## API Design (Next.js API Routes)

### Authentication Endpoints (NextAuth.js)
- `GET/POST /api/auth/*` - NextAuth.js handles all auth routes
  - `/api/auth/signin` - Google sign-in
  - `/api/auth/signout` - Sign out
  - `/api/auth/session` - Get current session

### Chat Endpoints
- `GET /api/conversations` - List user's conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/[id]` - Get conversation with messages
- `DELETE /api/conversations/[id]` - Delete conversation
- `POST /api/chat` - Send message and stream response

### Admin Endpoints
- `GET /api/admin/whitelist` - List whitelisted emails
- `POST /api/admin/whitelist` - Add email to whitelist
- `DELETE /api/admin/whitelist` - Remove from whitelist
- `GET /api/admin/users` - List all users

## Project Structure (Next.js Fullstack)

```
/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API Routes (Backend)
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts
│   │   │   ├── conversations/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts
│   │   │   ├── chat/
│   │   │   │   └── route.ts
│   │   │   └── admin/
│   │   │       ├── whitelist/
│   │   │       │   └── route.ts
│   │   │       └── users/
│   │   │           └── route.ts
│   │   ├── (auth)/            # Auth pages
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── chat/              # Main chat UI
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── admin/             # Admin panel
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatSidebar.tsx
│   │   │   └── ConversationList.tsx
│   │   ├── auth/
│   │   │   └── SignInButton.tsx
│   │   └── admin/
│   │       └── WhitelistManager.tsx
│   ├── lib/
│   │   ├── firebase-admin.ts  # Firestore connection
│   │   ├── gemini.ts          # Gemini API client
│   │   ├── auth.ts            # NextAuth config
│   │   └── utils.ts
│   └── types/
│       └── index.ts           # TypeScript types
├── .env.local                 # Environment variables
├── Dockerfile
├── package.json
└── next.config.js
```

## Security Considerations

### Authentication & Authorization
1. **Google OAuth 2.0**: Secure, industry-standard authentication
2. **Whitelist Check**: Middleware validates user email against whitelist
3. **JWT Tokens**: Short-lived tokens (1h), refresh mechanism
4. **HTTPS Only**: All traffic encrypted via Cloud Run
5. **CORS**: Restricted to frontend domain only

### API Security
1. **Rate Limiting**: Prevent abuse (e.g., 100 requests/15min per user)
2. **Input Validation**: Sanitize all user inputs
3. **Firestore Security Rules**: Server-side validation with Firebase Admin SDK
4. **XSS Protection**: Sanitize rendered messages (React handles most)

### Secret Management
- Environment variables in Cloud Run (simplest)
- Or use GCP Secret Manager for sensitive keys
- Never commit secrets to Git

## Deployment Strategy

### Simple Deployment Workflow
```
Local Dev → Docker Build → Push to GCR → Deploy to Cloud Run
```

### GCP Setup Steps
1. **Create GCP Project**
2. **Enable APIs**:
   - Cloud Run API
   - Firestore API
   - Artifact Registry API (for Docker images)
3. **Create Firestore Database**
   - Select "Native mode"
   - Choose region (e.g., us-central1)
4. **Setup Firebase Admin**
   - Create service account
   - Download JSON key for local dev
5. **Configure Google OAuth**
   - Create OAuth 2.0 Client ID in GCP Console
   - Add authorized redirect URIs
6. **Get Gemini API Key**
   - Enable Generative AI API
   - Create API key

### Deployment Configuration

#### Cloud Run Service
- **Service Name**: archerchat
- **Min Instances**: 0 (scales to zero = $0 when idle)
- **Max Instances**: 3 (enough for family use)
- **CPU**: 1 vCPU
- **Memory**: 512Mi
- **Port**: 3000 (Next.js default)
- **Region**: us-central1 (or nearest to you)

#### Environment Variables
```env
NEXTAUTH_URL=https://your-app.run.app
NEXTAUTH_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GEMINI_API_KEY=your-gemini-api-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
ADMIN_EMAIL=archeryue7@gmail.com
```

### Manual Deployment (Simplest)
```bash
# Build Docker image
docker build -t gcr.io/YOUR_PROJECT_ID/archerchat .

# Push to Google Container Registry
docker push gcr.io/YOUR_PROJECT_ID/archerchat

# Deploy to Cloud Run
gcloud run deploy archerchat \
  --image gcr.io/YOUR_PROJECT_ID/archerchat \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NEXTAUTH_URL=...,GEMINI_API_KEY=..."
```

## Monitoring & Logging
- **Logging**: Cloud Logging (automatic with Cloud Run)
- **Monitoring**: Cloud Monitoring
- **Alerts**: Set up alerts for errors, high latency
- **Metrics to Track**:
  - API response times
  - Gemini API errors
  - User activity
  - Cost per user

## Cost Estimation (Monthly)

### Family Use (5-10 users, ~1000 messages/month)
**Optimized for under $30/month**

- **Firestore**: **FREE**
  - 50K reads/day = 1.5M/month (way more than needed)
  - 20K writes/day = 600K/month (way more than needed)
  - 1GB storage (plenty for text messages)
  - Estimate: $0/month ✅

- **Cloud Run**: **~$5-10/month**
  - Min instances: 0 (scales to zero when idle)
  - ~10 hours of active usage/month
  - Minimal CPU/memory usage
  - Estimate: $5-10/month ✅

- **Gemini API (1.5 Flash)**: **~$2-5/month**
  - 1000 messages × ~500 tokens avg = 500K tokens
  - Input: 500K × $0.075/1M = $0.04
  - Output: 500K × $0.30/1M = $0.15
  - Total with buffer: ~$2-5/month ✅

- **Other (networking, etc.)**: **~$1-3/month**
  - Egress bandwidth
  - Cloud Logging (basic)

**Total: $8-18/month** ✅ **Well under $30!**

### If Usage Grows (50 users, 10K messages/month)
- Firestore: Still likely FREE or ~$5-10
- Cloud Run: ~$15-25
- Gemini API: ~$20-30
- **Total**: ~$40-65/month (still reasonable)

### Cost Optimization Tips
1. Use Gemini Flash instead of Pro (4x cheaper)
2. Keep min instances at 0
3. Implement client-side caching to reduce Firestore reads
4. Monitor usage in GCP Console
5. Set up billing alerts at $20, $30

## Future Enhancements (Post-MVP)
1. **Multi-Model Support**:
   - OpenAI API integration
   - Self-hosted models (Ollama, vLLM)
   - Model selection in UI
2. **Advanced Features**:
   - File uploads (PDFs, images)
   - Conversation sharing
   - Conversation search
   - Message regeneration
   - Conversation export
3. **UI Improvements**:
   - Dark mode
   - Code syntax highlighting
   - Markdown tables support
   - Mobile app
4. **Administration**:
   - Usage analytics dashboard
   - Cost tracking per user
   - User management (ban, limits)
5. **Performance**:
   - Redis caching
   - CDN for static assets
   - WebSocket for real-time updates

## Local Development Setup

### What You'll Need to Test Locally

1. **Gemini API Key** (Required)
   - Go to: https://ai.google.dev/
   - Click "Get API Key"
   - Free tier: 60 requests/minute
   - Cost: FREE for development/testing

2. **Google OAuth Credentials** (Required for auth)
   - GCP Console → APIs & Services → Credentials
   - Create OAuth 2.0 Client ID
   - Add `http://localhost:3000` to authorized origins
   - Add `http://localhost:3000/api/auth/callback/google` to redirect URIs
   - Free, no cost

3. **Firebase/Firestore Project** (Required for database)
   - Firebase Console → Create project
   - Enable Firestore (Native mode)
   - Download service account JSON key
   - Free tier (plenty for local dev)

4. **Node.js** (Required)
   - Version 20+ recommended
   - Install from nodejs.org

### Local Setup Steps
```bash
# 1. Clone and install
git clone <your-repo>
cd archerchat
npm install

# 2. Create .env.local file
cat > .env.local << EOF
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=any-random-string-for-dev
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GEMINI_API_KEY=your-gemini-api-key
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="your-private-key-from-json"
FIREBASE_CLIENT_EMAIL=your-client-email
ADMIN_EMAIL=archeryue7@gmail.com
EOF

# 3. Run dev server
npm run dev

# 4. Open browser
# http://localhost:3000
```

### Testing Without Full Setup
If you just want to see the UI without backend:
- You can build UI components first
- Mock the Gemini responses with sample data
- Add real API integration later

**Total Cost for Local Dev: $0** (all free tiers)

## Development Phases

### Phase 1: MVP (2-3 weeks)
- [ ] Setup GCP project and services
- [ ] Backend API with Gemini integration
- [ ] Google OAuth authentication
- [ ] Whitelist management
- [ ] Basic chat UI
- [ ] Conversation history
- [ ] Deploy to Cloud Run

### Phase 2: Polish (1 week)
- [ ] UI/UX improvements
- [ ] Error handling
- [ ] Loading states
- [ ] Admin panel
- [ ] Testing

### Phase 3: Production Ready (1 week)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Monitoring setup
- [ ] Documentation
- [ ] Launch

## Design Decisions Summary

### ✅ Decided (Based on Requirements)
1. **Database**: Firestore (serverless, FREE tier for family use)
2. **Architecture**: Next.js fullstack (single deployment, cheaper)
3. **AI Model**: Gemini 1.5 Flash (4x cheaper than Pro, still great quality)
4. **Deployment**: Single Cloud Run instance (no separate backend)
5. **Repository**: Monorepo (simpler for family project)
6. **Admin Email**: archeryue7@gmail.com (via ADMIN_EMAIL env var)
7. **Conversation Titles**: Auto-generated from first user message
8. **Admin Panel**: Whitelist management + user stats (message count, last active)
9. **UI**: Light mode only (no dark mode for MVP)
10. **Mobile**: Desktop-focused, mobile support later

### How Admin Works
- Admin email is set via `ADMIN_EMAIL` environment variable
- When `archeryue7@gmail.com` logs in, they automatically get admin privileges
- Admin can access `/admin` page to:
  - View all registered users
  - Add/remove emails from whitelist
  - See user statistics (message count, last active)
- Admin user is also automatically whitelisted

### Whitelist Flow
1. First time: Only admin email can log in
2. Admin adds family emails to whitelist via admin panel
3. Whitelisted users can log in with Google
4. Non-whitelisted users see "Access Denied" message
