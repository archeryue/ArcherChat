# WhimCraft - AI Agent

A bilingual (English/Chinese) AI agent with advanced memory, personalization, and agentic capabilities, powered by Google Gemini 2.5 Flash.

## Features

- 🤖 **Agentic Architecture**: ReAct (Reason-Act-Observe) pattern for autonomous AI behavior
- 🧠 **Intelligent Memory System**: Automatic extraction with tiered retention (CORE/IMPORTANT/CONTEXT)
- 🔍 **Web Search Integration**: Real-time web search with Google Custom Search API
- 📊 **Progress Tracking**: Real-time visual feedback during AI response generation
- 🎨 **Native Image Generation**: Built-in Gemini 2.5 Flash Image generation
- 🌏 **Bilingual Support**: Full English and Chinese support (175+ keywords)
- 📎 **File Attachments**: Upload and analyze images, PDFs with multimodal AI
- 💬 **Streaming Responses**: Real-time AI chat with syntax highlighting and LaTeX support
- 🔐 **Google OAuth**: Secure authentication with whitelist control
- 📝 **Conversation Management**: Auto-generated titles, full history
- 👨‍💼 **Admin Panel**: User management, whitelist, prompt configuration
- 🎯 **Smart Personalization**: AI remembers your preferences and context
- ⚙️ **Dynamic Prompts**: Admin-configurable system prompts
- 🎨 **Clean UI**: Modern interface with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: Firestore (serverless)
- **Authentication**: NextAuth.js (Google OAuth)
- **AI**: Google Gemini API (2.5 Flash, Image, Lite)
- **Styling**: Tailwind CSS + shadcn/ui
- **Unit Testing**: Jest + TypeScript (145+ tests, 100% pass rate)
- **E2E Testing**: Playwright (26 tests)
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
NEXTAUTH_URL=http://localhost:8080
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

# Google Custom Search (for web search feature)
GOOGLE_SEARCH_API_KEY=your-google-search-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Admin Email
ADMIN_EMAIL=archeryue7@gmail.com

# Feature Flags (optional, all default to false)
NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS=true
NEXT_PUBLIC_USE_WEB_SEARCH=true
NEXT_PUBLIC_USE_AGENTIC_MODE=true
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
5. Add authorized redirect URI: \`http://localhost:8080/api/auth/callback/google\`
6. Copy Client ID and Client Secret to \`.env.local\`

### Step 4: Run Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Step 5: First Login

1. Click "Get Started" → "Sign in with Google"
2. Sign in with your Google account (archeryue7@gmail.com)
3. You'll be automatically whitelisted as admin
4. Start chatting!

## Project Structure

```
src/
  app/
    api/                  # API routes
      auth/               # NextAuth endpoints
      chat/               # Chat streaming endpoint
      conversations/      # Conversation management
      memory/             # Memory system API
      admin/              # Admin endpoints (whitelist, users, prompts, cleanup)
    chat/                 # Main chat interface
    admin/                # Admin panel
    profile/              # User memory profile page
    whim/                 # Whim management page
    login/                # Login page
    layout.tsx            # Root layout with providers
  components/
    chat/                 # Chat components (input, message, sidebar, topbar, progress)
    admin/                # Admin components (whitelist, stats, prompts)
    ui/                   # UI components (shadcn/ui)
    providers/            # Context providers
  lib/
    firebase-admin.ts     # Firestore setup (lazy initialization)
    auth.ts               # NextAuth config
    prompts.ts            # Dynamic prompt management
    providers/            # AI provider abstraction
      provider-factory.ts
      gemini.provider.ts
    agent/                # Agentic architecture (ReAct pattern)
      core/               # Agent core, context manager, prompts
      tools/              # Tool implementations (web_search, memory, etc.)
    prompt-analysis/      # AI-powered intent analysis
      analyzer.ts         # PromptAnalyzer using Gemini Flash Lite
    context-engineering/  # Context orchestration
      orchestrator.ts     # Coordinates web search, memory, model selection
    web-search/           # Web search integration
      google-search.ts    # Google Custom Search API client
      rate-limiter.ts     # Per-user rate limiting
      content-fetcher.ts  # Fetch and extract web content
    progress/             # Progress tracking system
      emitter.ts          # Server-side event emitter
      types.ts            # Progress step types
    memory/               # Memory system
      storage.ts          # CRUD operations
      extractor.ts        # AI-powered extraction
      loader.ts           # Memory loading for chat
      cleanup.ts          # Automatic cleanup
    keywords/             # Keyword trigger system (legacy)
      system.ts
      triggers.ts
  config/
    models.ts             # Gemini model tiering
    keywords.ts           # Bilingual keywords (175+ triggers)
    feature-flags.ts      # Feature toggles
  types/
    index.ts              # Main types
    memory.ts             # Memory system types
    prompts.ts            # Prompt types
    file.ts               # File attachment types
    ai-providers.ts       # Provider interfaces
    agent.ts              # Agent types
    prompt-analysis.ts    # Analysis types
  __tests__/              # Jest unit tests (145+ tests)
e2e/                      # Playwright E2E tests (26 tests)
```

## Key Features Explained

### 🧠 Memory System

The AI automatically learns from your conversations:
- **Hybrid Triggering**: Keywords ("remember that") or automatic after 5+ messages
- **Tiered Retention**: CORE (permanent), IMPORTANT (90 days), CONTEXT (30 days)
- **Smart Cleanup**: Removes low-value facts to stay under 500-token budget
- **User Control**: View and delete facts at `/profile`

### 🎨 Image Generation

Generate images directly in chat:
- **English**: "create an image of a sunset"
- **Chinese**: "生成一幅图片，描绘星空"
- Native Gemini 2.5 Flash Image model
- Inline display in conversation

### 📎 File Attachments

Upload and analyze files:
- **Images**: PNG, JPG, GIF, WebP
- **Documents**: PDF
- AI can analyze and discuss file contents
- Multimodal processing with Gemini

### 🌏 Bilingual Support

Full Chinese and English support:
- 138 memory trigger keywords (both languages)
- 37 image generation keywords (both languages)
- Language preference auto-detection
- Hybrid mode for mixed conversations

### 🤖 Agentic Architecture

ReAct (Reason-Act-Observe) pattern for autonomous AI:
- **Iterative loop**: Up to 5 iterations per request
- **Available tools**: web_search, web_fetch, memory_save, memory_retrieve, get_current_time
- **sourceCategory**: Target reliable sources (Wikipedia, StackOverflow, Reuters, etc.)
- Agent autonomously decides when to use tools vs respond directly
- Enable with `NEXT_PUBLIC_USE_AGENTIC_MODE=true`

### 🔍 Web Search

Real-time web search integration:
- **Provider**: Google Custom Search API
- **Rate limits**: 20/hour, 100/day per user
- **Content extraction**: AI-powered extraction from top 3 results
- Conservative mode: Only triggers for time-sensitive queries
- Enable with `NEXT_PUBLIC_USE_WEB_SEARCH=true`

### 📊 Progress Tracking

Real-time visual feedback during AI responses:
- **Steps**: Analyzing → Searching → Retrieving Memory → Building Context → Generating
- Single updating badge shows current progress
- Server-Sent Events protocol for streaming updates

## Admin Features

As an admin, you can:

1. **Manage Whitelist**: Add/remove emails that can access the app
2. **View User Stats**: See all users, message counts, and last active times
3. **Configure Prompts**: Edit system prompts and temperature settings
4. **Access Admin Panel**: Click "Admin Panel" in the sidebar

## Cost Estimation

For family use (5-10 users, ~1000 messages/month):

- **Firestore**: FREE (within free tier)
- **Cloud Run**: $5-10/month (scales to zero when idle)
- **Gemini API**: $2-5/month (tiered models for optimization)
  - Chat (2.5 Flash): ~$1.70
  - Memory extraction (2.5 Flash-Lite): ~$0.50
  - Image generation (occasional): ~$0.50
- **Total: $8-18/month** ✅ Well under $30 budget!

**Cost per feature:**
- Base chat: ~$6-12/month
- Memory system: +$0.50-1/month
- Image generation: +$0.50-2/month
- File attachments: included (no extra cost)

## Testing

WhimCraft has comprehensive test coverage with Jest (unit) and Playwright (E2E).

### Unit Tests (Jest + TypeScript)

```bash
# Run all tests
npx jest

# Run with coverage
npx jest --coverage

# Run specific suite
npx jest src/__tests__/lib/memory/cleanup.test.ts

# Watch mode
npx jest --watch
```

**Current Status**: 145+ tests passing (100% pass rate)
- Memory system (42 tests): cleanup, extraction, loading, storage
- Agent system (58 tests): core, tools, context manager
- Web search (6 tests): search, rate limiting
- Context orchestration (8 tests)
- Prompt analysis (31 tests)

### E2E Tests (Playwright)

```bash
# Run all E2E tests (headless)
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed

# Debug mode with inspector
npm run test:e2e:debug
```

**Current Status**: 26 tests (22 passed, 2 minor failures, 2 skipped)
- Application basics, login page, performance
- SEO, accessibility, error handling
- Progress tracking (requires auth)

See [docs/TESTING_PLAN.md](./docs/TESTING_PLAN.md) for detailed testing strategy.

## Deployment

For complete deployment instructions to Google Cloud Run, see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

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
