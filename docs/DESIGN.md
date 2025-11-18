# WhimCraft - AI Agent Design Document

## Overview
WhimCraft is a bilingual (English/Chinese) AI agent with advanced memory, personalization, and agentic capabilities, powered by Google's Gemini 2.5 Flash. The application features Google Account authentication with whitelist-based access control, automatic memory extraction, native image generation, and intelligent conversation personalization.

**Key Features:**
- 🧠 **Intelligent Memory System**: Automatic extraction and tiered retention (CORE/IMPORTANT/CONTEXT)
- 🎨 **Native Image Generation**: Built-in Gemini 2.0 Flash image generation
- 🌏 **Bilingual Support**: Full English and Chinese support with 175+ keywords
- 📎 **File Attachments**: Upload and analyze images, PDFs
- 🎯 **Smart Personalization**: AI remembers preferences and context
- ⚙️ **Dynamic Prompts**: Admin-configurable system prompts
- 📊 **Progress Tracking**: Real-time visual feedback during AI response generation
- 🔍 **Web Search**: Intelligent web search with rate limiting and global usage tracking
- 🌐 **Web Scraping**: AI-powered content extraction from top search results for detailed answers
- 🤖 **Agentic Architecture**: ReAct pattern with autonomous tool usage (IMPLEMENTED 2025-11-17)

**Target Cost**: < $30/month for family use (5-10 users, ~1000 messages/month)
**Actual Cost**: $8-18/month (well under budget)

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
- **Provider**: Google Gemini API (tiered model strategy)
  - **Main Model**: Gemini 2.5 Flash
    - Context: 1M tokens, Output: 65K tokens
    - Input: $0.30 / 1M tokens, Output: $2.50 / 1M tokens
    - Use case: User-facing chat conversations
  - **Image Model**: Gemini 2.5 Flash Image
    - Native image generation capabilities
    - Same pricing as main model
    - Use case: Image generation requests
  - **Lite Model**: Gemini 2.5 Flash-Lite
    - Input: $0.075 / 1M tokens, Output: $0.30 / 1M tokens (25% cheaper)
    - Use case: Memory extraction, background processing
  - **Cost Savings**: 7-15% overall savings vs single model
- **SDK**: @google/generative-ai 0.21.0 (official Node.js SDK)
- **Abstraction**: IAIProvider interface for multi-provider support

### Infrastructure (GCP)
- **Compute**: Cloud Run (single instance)
  - Containerized Next.js app
  - Auto-scaling (min: 0, max: 3)
  - Pay per use (~$5-10/month for family traffic)
- **Database**: Firestore (serverless, likely FREE tier)
- **Secrets**: Environment variables (simple) or Secret Manager
- **DNS/SSL**: Cloud Run custom domains (free SSL)
- **CI/CD**: Manual docker build + deploy (simplest) or Cloud Build

## Advanced Features

### Memory System Architecture

WhimCraft includes an intelligent memory system that learns from conversations and provides personalized responses.

**Hybrid Triggering:**
- **Keyword-based**: Immediate extraction when user says "remember that", "my name is", etc. (138 triggers)
- **Conversation-based**: Automatic extraction after 5+ messages and 2+ minutes of conversation

**Tiered Retention Strategy:**
| Tier | Max Facts | Retention | Use Case | Examples |
|------|-----------|-----------|----------|----------|
| CORE | 8 | Permanent | Profile info | Name, occupation, family |
| IMPORTANT | 12 | 90 days | Preferences, technical | Languages, tools, habits |
| CONTEXT | 6 | 30 days | Temporary info | Current projects, tasks |

**Total Memory Budget**: 26 facts, ~500 tokens

**Intelligent Features:**
- Deduplication: Filters similar/duplicate facts
- Confidence scoring: Only stores facts with ≥0.6 confidence
- Language preference tracking: English, Chinese, or Hybrid
- Automatic cleanup: Removes expired and low-value facts
- User control: View and delete facts via /profile page

**Categories:**
- PROFILE: Personal information (name, job, interests)
- PREFERENCE: Likes, dislikes, habits
- TECHNICAL: Programming languages, tools, frameworks
- PROJECT: Current work, ongoing projects

### Image Generation

Native image generation powered by Gemini 2.5 Flash Image model.

**Features:**
- Keyword detection in 2 languages (37 triggers in English + Chinese)
- Automatic model switching to image-capable model
- Inline image display in chat
- Fallback to descriptive text if generation unavailable

**Trigger Examples:**
- English: "create an image", "draw a picture", "generate an image"
- Chinese: "生成图片", "画一幅图", "创建图像"

### Bilingual Support (中英文双语)

Full support for both English and Chinese speakers.

**Keyword System:**
- 138 memory trigger keywords (English + Chinese)
- 37 image generation keywords (English + Chinese)
- Centralized configuration in `src/config/keywords.ts`
- Smart matching with word boundaries and context awareness

**Language Preference:**
- Automatically detected from conversation patterns
- Three modes: English, Chinese, Hybrid
- Stored in user's memory profile
- Influences AI response style

### File Attachments

Upload and analyze files with multimodal AI.

**Supported Formats:**
- Images: PNG, JPG, GIF, WebP
- Documents: PDF
- Base64 encoding for transmission
- Thumbnail generation for images

**Processing:**
- Sent to Gemini API as inline data
- AI can analyze and discuss file contents
- Metadata stored in Firestore (without base64 data for efficiency)

### Provider Abstraction Layer

Extensible architecture for multiple AI providers.

**Interface**: `IAIProvider`
```typescript
interface IAIProvider {
  generateChatResponse(messages, options): AsyncGenerator<string>
  generateImage(prompt, options): Promise<string | null>
  supportsImageGeneration(): boolean
}
```

**Current Implementations:**
- GeminiProvider (fully implemented)

**Benefits:**
- Easy to add OpenAI, Anthropic, etc.
- Consistent API across providers
- Provider-specific optimizations
- Fallback mechanisms

### Dynamic Prompt Management

Admin-configurable system prompts stored in Firestore.

**Features:**
- Multiple prompt configurations
- Active/inactive toggle
- Temperature control
- Real-time updates without code changes
- Version history

**Collection**: `prompts`
- Default prompt created on first run
- Editable via /admin page
- Memory context automatically injected

### Agentic Architecture (ReAct Pattern)

**Status**: ✅ IMPLEMENTED (2025-11-17)

WhimCraft uses the ReAct (Reason-Act-Observe) pattern for autonomous AI behavior.

**Feature Flag**: `NEXT_PUBLIC_USE_AGENTIC_MODE=true`

**Architecture**:
```
User Input → Agent Loop (max 5 iterations)
                ↓
           REASON → ACT → OBSERVE → (repeat if needed)
                ↓
           Final Response
```

**Available Tools**:
- `web_search` - Search with sourceCategory for reliable sources
- `web_fetch` - Fetch and extract content from URLs
- `memory_retrieve` - Get relevant user memories
- `memory_save` - Save new facts to memory
- `get_current_time` - Get current date/time

**sourceCategory Parameter** (reduces 403 errors):
- `encyclopedia`: Wikipedia, Britannica
- `programming`: StackOverflow, GitHub, MDN
- `finance`: Reuters, Bloomberg, SEC
- `government`: *.gov sites
- `academic`: arXiv, PubMed

**Key Files**:
- `src/lib/agent/core/agent.ts` - Agent class with ReAct loop
- `src/lib/agent/tools/` - Tool implementations
- `src/lib/agent/core/prompts.ts` - Agent system prompts

**Test Coverage**: 58 unit tests (100% pass rate)

See `docs/AGENTIC_ARCHITECTURE.md` for complete documentation.

## Data Models (Firestore Collections)

### Firestore Structure
```
/users/{userId}
/whitelist/{email}
/conversations/{conversationId}
/conversations/{conversationId}/messages/{messageId}
/memory/{userId}
/prompts/{promptId}
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
  model: string;                 // "gemini-2.5-flash"
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
  image_url?: string;            // Generated image URL (for assistant messages)
  image_data?: string;           // Base64 image data (stripped before save)
  files?: FileAttachment[];      // Attached files
  created_at: Timestamp;
}

interface FileAttachment {
  name: string;                  // File name
  type: string;                  // MIME type
  size: number;                  // File size in bytes
  data?: string;                 // Base64 data (not persisted)
}
```

**Note**: Messages are stored as subcollections under conversations for efficient querying and automatic deletion when conversation is deleted. File base64 data is not persisted to reduce Firestore costs.

### Memory Document
**Collection**: `memory`
**Document ID**: User ID

```typescript
interface UserMemory {
  user_id: string;
  facts: MemoryFact[];
  language_preference?: 'english' | 'chinese' | 'hybrid';
  stats: {
    total_facts: number;
    token_usage: number;
    last_cleanup: Date;
  };
  updated_at: Date;
}

interface MemoryFact {
  id: string;
  fact: string;                  // The actual fact
  category: 'PROFILE' | 'PREFERENCE' | 'TECHNICAL' | 'PROJECT';
  tier: 'CORE' | 'IMPORTANT' | 'CONTEXT';
  confidence: number;            // 0.0 - 1.0
  source_conversation?: string;  // Conversation ID
  created_at: Date;
  expires_at?: Date;             // For IMPORTANT and CONTEXT tiers
  last_used?: Date;              // For importance scoring
  usage_count: number;           // How many times referenced
}
```

### Prompt Document
**Collection**: `prompts`
**Document ID**: Auto-generated ID

```typescript
interface PromptConfig {
  name: string;                  // Prompt name/description
  systemPrompt: string;          // The system prompt text
  temperature: number;           // 0.0 - 2.0
  isActive: boolean;             // Only one active at a time
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
- `POST /api/chat` - Send message and stream response (supports files, triggers memory/image)

### Memory Endpoints
- `GET /api/memory` - Get user's memory facts
- `POST /api/memory` - Add memory fact manually
- `DELETE /api/memory` - Clear all memory facts
- `DELETE /api/memory/[id]` - Delete specific memory fact

### Admin Endpoints
- `GET /api/admin/whitelist` - List whitelisted emails
- `POST /api/admin/whitelist` - Add email to whitelist
- `DELETE /api/admin/whitelist` - Remove from whitelist
- `GET /api/admin/users` - List all users with stats
- `GET /api/admin/prompts` - Get all prompt configurations
- `POST /api/admin/prompts` - Create or update prompt
- `POST /api/admin/prompts/reset` - Reset to default prompt
- `POST /api/admin/cleanup-conversations` - Cleanup utility

## Project Structure (Next.js Fullstack)

```
/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API Routes (Backend)
│   │   │   ├── auth/          # NextAuth endpoints
│   │   │   │   └── [...nextauth]/route.ts
│   │   │   ├── conversations/ # Conversation management
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── chat/          # Chat streaming endpoint
│   │   │   │   └── route.ts
│   │   │   ├── memory/        # Memory system
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   └── admin/         # Admin endpoints
│   │   │       ├── whitelist/route.ts
│   │   │       ├── users/route.ts
│   │   │       ├── prompts/route.ts
│   │   │       └── cleanup-conversations/route.ts
│   │   ├── chat/              # Main chat UI
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── admin/             # Admin panel
│   │   │   └── page.tsx
│   │   ├── profile/           # User memory profile
│   │   │   └── page.tsx
│   │   ├── login/             # Login page
│   │   │   └── page.tsx
│   │   ├── layout.tsx         # Root layout with providers
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   ├── chat/              # Chat components
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatSidebar.tsx
│   │   │   ├── ChatTopBar.tsx
│   │   │   └── ConversationList.tsx
│   │   ├── admin/             # Admin components
│   │   │   ├── WhitelistManager.tsx
│   │   │   ├── UserStats.tsx
│   │   │   └── PromptManager.tsx
│   │   ├── ui/                # UI components (shadcn)
│   │   │   ├── button.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   └── loading.tsx
│   │   └── providers/
│   │       └── SessionProvider.tsx
│   ├── lib/
│   │   ├── firebase-admin.ts  # Firestore connection (lazy init)
│   │   ├── gemini.ts          # Legacy Gemini client
│   │   ├── auth.ts            # NextAuth config
│   │   ├── prompts.ts         # Dynamic prompt management
│   │   ├── utils.ts           # Utility functions
│   │   ├── providers/         # AI provider abstraction
│   │   │   ├── provider-factory.ts
│   │   │   └── gemini.provider.ts
│   │   ├── agent/             # Agentic architecture (ReAct pattern)
│   │   │   ├── core/          # Agent loop and prompts
│   │   │   │   ├── agent.ts
│   │   │   │   ├── prompts.ts
│   │   │   │   └── context-manager.ts
│   │   │   └── tools/         # Tool implementations
│   │   │       ├── base.ts
│   │   │       ├── index.ts
│   │   │       ├── web-search.ts
│   │   │       ├── web-fetch.ts
│   │   │       ├── memory-retrieve.ts
│   │   │       ├── memory-save.ts
│   │   │       └── get-current-time.ts
│   │   ├── memory/            # Memory system
│   │   │   ├── index.ts
│   │   │   ├── storage.ts
│   │   │   ├── extractor.ts
│   │   │   ├── loader.ts
│   │   │   └── cleanup.ts
│   │   └── keywords/          # Keyword trigger system (legacy)
│   │       ├── system.ts
│   │       └── triggers.ts
│   ├── config/                # Configuration
│   │   ├── models.ts          # Gemini model tiering
│   │   └── keywords.ts        # Bilingual keywords
│   └── types/                 # TypeScript types
│       ├── index.ts           # Main types
│       ├── memory.ts          # Memory types
│       ├── prompts.ts         # Prompt types
│       ├── file.ts            # File attachment types
│       ├── ai-providers.ts    # Provider interfaces
│       ├── agent.ts           # Agent types
│       └── next-auth.d.ts     # NextAuth extensions
├── docs/                      # Documentation
│   ├── DESIGN.md
│   ├── DEPLOYMENT.md
│   ├── TESTING_CHECKLIST.md
│   ├── TESTING_PLAN.md
│   ├── MEMORY_SYSTEM_COMPLETE.md
│   ├── AGENTIC_ARCHITECTURE.md
│   ├── WEB_SEARCH_DESIGN.md
│   ├── PROGRESS_TRACKING.md
│   ├── ADDING_PROVIDERS.md
│   └── README.md
├── scripts/                   # Utility scripts
│   ├── check-active-prompt.ts
│   └── fix-language-preference.ts
├── .env.local                 # Environment variables
├── Dockerfile                 # Multi-stage Docker build
├── package.json
├── next.config.js
├── CLAUDE.md                  # Development principles (CRITICAL)
└── README.md                  # Project documentation
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
  - 1GB storage (plenty for text + memory)
  - Estimate: $0/month ✅

- **Cloud Run**: **~$5-10/month**
  - Min instances: 0 (scales to zero when idle)
  - ~10 hours of active usage/month
  - 512Mi RAM, 1 vCPU
  - Estimate: $5-10/month ✅

- **Gemini API (2.5 Flash + Lite)**: **~$2-5/month**
  - Chat (2.5 Flash):
    - 1000 messages × 600 tokens avg (with memory) = 600K tokens
    - Input: 600K × $0.30/1M = $0.18
    - Output: 600K × $2.50/1M = $1.50
  - Memory extraction (2.5 Flash-Lite):
    - 100 extractions × 3K tokens = 300K tokens
    - Input: 300K × $0.075/1M = $0.02
    - Output: 300K × $0.30/1M = $0.09
  - Image generation (occasional):
    - ~10 images/month = ~$0.50
  - Total with buffer: ~$2-5/month ✅

- **Other (networking, etc.)**: **~$1-3/month**
  - Egress bandwidth
  - Cloud Logging (basic)

**Total: $8-18/month** ✅ **Well under $30!**

**Breakdown by Feature:**
- Base chat: ~$6-12/month
- Memory system: +$0.50-1/month
- Image generation: +$0.50-2/month
- File attachments: included (no extra cost)

### If Usage Grows (50 users, 10K messages/month)
- Firestore: Still likely FREE or ~$5-10
- Cloud Run: ~$15-25
- Gemini API: ~$20-35 (with memory + images)
- **Total**: ~$40-70/month (still reasonable)

### Cost Optimization Tips
1. **Tiered models**: Use 2.5 Flash-Lite for background tasks (25% cheaper)
2. **Min instances = 0**: Service scales to zero when idle
3. **Memory budget**: 500-token limit keeps costs predictable
4. **Efficient storage**: Don't persist file base64 data to Firestore
5. **Client-side caching**: Reduce Firestore reads
6. **Monitor usage**: GCP Console + billing alerts at $20, $30
7. **Keyword optimization**: Minimize unnecessary memory extractions

## Future Enhancements

### ✅ Already Implemented
- ✅ File uploads (PDFs, images)
- ✅ Memory system with automatic extraction
- ✅ Image generation (native Gemini)
- ✅ Bilingual support (English/Chinese)
- ✅ Code syntax highlighting
- ✅ Prompt management
- ✅ User statistics
- ✅ Provider abstraction layer

### 🎯 Planned Features
1. **Multi-Model Support**:
   - OpenAI API integration
   - Anthropic Claude integration
   - Self-hosted models (Ollama, vLLM)
   - Model selection in UI
2. **Advanced Features**:
   - Conversation sharing
   - Conversation search
   - Message regeneration
   - Conversation export (JSON, Markdown)
   - Voice input support
3. **UI Improvements**:
   - Dark mode
   - Markdown tables support
   - Mobile app / responsive mobile UI
   - File preview in chat
4. **Memory Enhancements**:
   - Memory search
   - Memory analytics dashboard
   - Shared family memories (opt-in)
   - Memory export/import
5. **Administration**:
   - Usage analytics dashboard
   - Cost tracking per user
   - User management (ban, limits, quotas)
   - Audit logs
6. **Performance**:
   - Redis caching for memory/prompts
   - CDN for static assets
   - WebSocket for real-time updates
   - Conversation pagination

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
2. **Architecture**: Next.js 14 fullstack (single deployment, cheaper)
3. **AI Model**: Gemini 2.5 Flash (tiered: Main/Image/Lite for cost optimization)
4. **Deployment**: Single Cloud Run instance (no separate backend)
5. **Repository**: Monorepo (simpler for family project)
6. **Admin Email**: archeryue7@gmail.com (via ADMIN_EMAIL env var)
7. **Conversation Titles**: Auto-generated from first user message
8. **Admin Panel**: Whitelist + user stats + prompt management
9. **Memory System**: Automatic extraction with 500-token budget
10. **Image Generation**: Native Gemini 2.5 Flash Image
11. **Bilingual**: Full English/Chinese support (175+ keywords)
12. **Provider Abstraction**: IAIProvider interface for extensibility
13. **UI**: Light mode only (dark mode planned for future)
14. **Mobile**: Desktop-focused, mobile support later

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
