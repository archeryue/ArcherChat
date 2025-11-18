# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Philosophy

**Mission**: Build a clean, professional AI agent that serves both English and Chinese-speaking family members with intelligent memory, personalization, and agentic capabilities.

## Essential Commands

```bash
# Development
npm run dev                    # Start dev server (default port 8080)
PORT=8080 npm run dev          # Explicitly set port 8080
npm run build                  # Production build with strict TypeScript checking
npm run start                  # Start production server
npm run lint                   # ESLint checks

# Unit Testing (145+ tests, 100% pass rate)
npx jest                       # Run all tests
npx jest --watch              # Watch mode for TDD
npx jest --coverage           # Coverage report
npx jest path/to/file.test.ts # Run specific test file

# Testing specific modules
npx jest src/__tests__/lib/memory/         # Memory system (14 tests)
npx jest src/__tests__/lib/web-search/     # Web search (6 tests)
npx jest src/__tests__/lib/context-engineering/  # Context orchestration (8 tests)
npx jest src/__tests__/lib/agent/          # Agent system (58 tests)

# E2E Testing (26 tests using Playwright)
npm run test:e2e               # Run all E2E tests (headless)
npm run test:e2e:ui            # Interactive UI mode
npm run test:e2e:headed        # Run with visible browser
npm run test:e2e:debug         # Debug mode with inspector
```

## CI/CD Pipeline (GitHub Actions)

**Status**: ✅ Fully operational and tested (Branch protection enforced on `main`)

**Automated checks run on every push to any branch and all pull requests:**

### 5 Security & Quality Gates:

1. **Secret Scanning** (Gitleaks) ✅ TESTED & WORKING
   - Detects API keys, passwords, tokens in commits
   - Scans changed files in each commit
   - Custom rules for Google API keys, Firebase keys, OAuth secrets
   - **Config**: `gitleaks.toml` (root directory, NO leading dot)
   - **IMPORTANT**: Google API keys must match pattern `AIza[0-9A-Za-z-_]{35}` (39 chars total)
   - Successfully tested: Blocks commits containing fake API keys

2. **ESLint** (Code Quality)
   - Enforces code style and best practices
   - Must pass before merge

3. **TypeScript Build** (Type Safety)
   - Runs `npm run build` to catch type errors
   - Prevents broken deployments
   - Catches issues that `npm run dev` might miss

4. **Jest Tests** (Functionality)
   - All 145+ tests must pass (100% pass rate required)
   - Generates coverage reports
   - Uploaded to Codecov (optional)

5. **NPM Security Audit**
   - Checks for vulnerable dependencies
   - Flags moderate+ severity issues

### Workflow Files:
- `.github/workflows/ci.yml` - Main CI/CD pipeline (runs on ALL branches)
- `gitleaks.toml` - Secret scanning configuration (auto-detected by Gitleaks)
- `.github/BRANCH_PROTECTION.md` - Setup guide for branch protection

### Branch Protection (ACTIVE):

**Status**: ✅ Enabled on `main` branch

- ✅ Cannot push directly to `main` (must use PRs)
- ✅ All 5 checks must pass before merging
- ✅ Tested and verified working
- ✅ Even administrators must pass checks

**Setup**: Classic branch protection rule on `main` branch
- See `.github/BRANCH_PROTECTION.md` for detailed setup instructions

### Important Notes:

**Gitleaks Gotchas** (learned through testing):
1. Config file MUST be named `gitleaks.toml` (not `.gitleaks.toml`)
2. Gitleaks scans **changed files in each commit**, not all files
3. Google API key regex: Requires exactly 39 characters (`AIza` + 35 more)
4. Allowlist regex `example` will skip files with "example" in content
5. The action automatically detects `gitleaks.toml` in repo root

**Testing the Pipeline**:
- Create a feature branch
- Make changes and push
- CI runs automatically (no PR needed)
- View results at: `https://github.com/archeryue/WhimCraft/actions`
- Create PR to merge to `main` → Branch protection enforces all checks

### Git Workflow (develop → main):

**IMPORTANT**: This project uses a **two-branch workflow**: `develop` and `main`

**Mandatory Workflow**:
1. **ALWAYS** commit to `develop` branch first
2. **ALWAYS** push to `develop` and wait for CI checks to complete
3. **ALWAYS** verify all CI checks passed using:
   ```bash
   gh run list --branch develop --limit 1
   gh run view <run-id>
   ```
4. **ONLY THEN** merge `develop` → `main`:
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

**Why this workflow**:
- `develop` branch: Development and testing
- `main` branch: Production-ready code only
- CI runs on both branches
- `main` requires all checks to pass before merge

**Never create feature branches** - Work directly on `develop`, then merge to `main` after CI passes.

## Critical Architecture Patterns

### 1. Intelligent Analysis Pipeline (Current Production System)

**Feature Flag**: `NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS=true` (enabled in production)

The system uses **AI-powered intent analysis** instead of keyword matching:

```
User Input → PromptAnalyzer → ContextOrchestrator → AI Response
                ↓                      ↓
          (analyzes intent)    (web search, memory, model selection)
```

**Key Files**:
- `src/lib/prompt-analysis/analyzer.ts` - Uses Gemini Flash Lite to analyze user intent
- `src/lib/context-engineering/orchestrator.ts` - Coordinates web search, memory retrieval, model selection
- `src/app/api/chat/route.ts` lines 146-270 - Main integration point

**What it does**:
1. Analyzes user input to determine: intent, required actions (web search, memory, image gen), language
2. Executes web search if needed (conservative mode - only for time-sensitive queries)
3. Retrieves relevant memories from Firestore
4. Selects appropriate model (Flash vs Image)
5. Builds final context and streams response

**Cost**: ~$0.000002 per analysis (~50 tokens with Flash Lite)

### 2. Lazy Initialization Pattern (Firebase Admin)

`src/lib/firebase-admin.ts` uses **Proxy pattern** to defer initialization:

```typescript
export const db = new Proxy({} as Firestore, {
  get(_target, prop) {
    if (!firestoreInstance) {
      getFirebaseApp();
      firestoreInstance = getFirestore();
    }
    return (firestoreInstance as any)[prop];
  }
});
```

**Why**: Required for Docker build compatibility. Never initialize services that need runtime env vars at module import time.

### 3. Provider Abstraction Layer

All AI providers implement `IAIProvider` interface (`src/types/ai-providers.ts`):

```typescript
// Usage
const provider = ProviderFactory.createDefaultProvider(modelName);
await provider.streamResponse(messages, systemPrompt, temperature, files);
```

**Model Configuration**: Centralized in `src/config/models.ts`
- `ModelTier.MAIN`: Gemini 2.5 Flash (chat)
- `ModelTier.IMAGE`: Gemini 2.5 Flash Image (image generation)
- `ModelTier.LITE`: Gemini 2.5 Flash Lite (analysis, memory extraction)

### 4. Memory System Architecture

**Three-tier retention**:
- `CORE`: Never expire (name, birthday, allergies)
- `IMPORTANT`: 90 days (preferences, technical context)
- `CONTEXT`: 30 days (current projects, temporary info)

**Triggering Modes**:
1. **AI Analysis** (primary): PromptAnalyzer extracts facts immediately during analysis
2. **Keyword fallback** (deprecated): Only when `NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS=false`

**Key Files**:
- `src/lib/memory/storage.ts` - CRUD operations
- `src/lib/memory/extractor.ts` - AI-powered extraction (legacy, replaced by PromptAnalyzer)
- `src/lib/memory/loader.ts` - Load memories for chat context
- `src/lib/memory/cleanup.ts` - Automatic cleanup, 500-token budget

### 5. Web Search Integration

**Provider**: Google Custom Search API
**Rate Limits**: 20/hour, 100/day per user
**Conservative Mode**: Only triggers for time-sensitive queries (latest news, stock prices, recent products)

**Architecture**:
- `src/lib/web-search/google-search.ts` - Search API client
- `src/lib/web-search/rate-limiter.ts` - Per-user rate limiting
- `src/lib/web-search/content-fetcher.ts` - Fetch top 3 results
- `src/lib/web-search/content-extractor.ts` - AI-powered content extraction

**Enable**: `NEXT_PUBLIC_USE_WEB_SEARCH=true` (set in `cloudbuild.yaml`)

### 6. Progress Tracking System

Real-time visual feedback during AI response generation:

```
[PROGRESS]{...event...}\n    ← Server-Sent Events protocol
[CONTENT]chunk\n             ← Actual response content
```

**Key Files**:
- `src/lib/progress/emitter.ts` - Server-side event emitter
- `src/lib/progress/types.ts` - ProgressStep enum
- `src/components/chat/ProgressMessage.tsx` - Client-side UI

**Steps**: Analyzing → Searching → Retrieving Memory → Building Context → Generating

### 7. Agentic Architecture (ReAct Pattern)

**Feature Flag**: `NEXT_PUBLIC_USE_AGENTIC_MODE=true`

Implements the ReAct (Reason-Act-Observe) pattern for autonomous AI behavior:

```
User Input → Agent Loop (max 5 iterations)
                ↓
           REASON → ACT → OBSERVE → (repeat if needed)
                ↓
           Final Response
```

**Key Files**:
- `src/lib/agent/core/agent.ts` - Agent class with ReAct loop
- `src/lib/agent/tools/` - Tool implementations (web_search, memory, etc.)
- `src/lib/agent/core/prompts.ts` - Agent system prompts
- `src/lib/agent/core/context-manager.ts` - Context compression and scratchpad

**Available Tools**:
- `web_search` - Search with sourceCategory for reliable sources (Wikipedia, StackOverflow, etc.)
- `web_fetch` - Fetch and extract content from URLs
- `memory_retrieve` - Get relevant user memories
- `memory_save` - Save new facts to memory
- `get_current_time` - Get current date/time

**sourceCategory Parameter**: Targets reliable sources to reduce 403 errors:
- `encyclopedia`: Wikipedia, Britannica
- `programming`: StackOverflow, GitHub, MDN
- `finance`: Reuters, Bloomberg, SEC
- `government`: *.gov sites
- `academic`: arXiv, PubMed

**Enable**: Set `NEXT_PUBLIC_USE_AGENTIC_MODE=true` in environment or cloudbuild.yaml

---

## 🔴 CRITICAL RULES - NEVER VIOLATE THESE

### 1. 🚀 DEPLOYMENT: Production Deployment Guide

**Production URL**: `https://archerchat-697285727061.us-central1.run.app`

#### Deployment Rules
- **NEVER** deploy code to production (Google Cloud Run) unless the user explicitly asks
- **ALWAYS** wait for user to say "deploy", "ship online", or similar explicit commands
- **NEVER** assume deployment is wanted after committing code
- **ALWAYS** ask for confirmation before deploying if unclear
- **EXCEPTION**: Only deploy when user explicitly requests it

#### Proper Deployment Workflow
1. **Get credentials from .env.local**:
   ```bash
   cat .env.local  # ALWAYS use actual values from this file
   ```
2. **Build and test locally first**:
   ```bash
   npm run build   # Catch TypeScript errors
   npx jest        # Ensure all tests pass
   ```
3. **Deploy using Cloud Build** (Preferred method):
   ```bash
   gcloud builds submit --config cloudbuild.yaml --project=archerchat-3d462
   ```
4. **Deploy with gcloud run** (use actual env vars from .env.local):
   ```bash
   gcloud run deploy archerchat \
     --image us-central1-docker.pkg.dev/archerchat-3d462/cloud-run-source-deploy/archerchat:latest \
     --region us-central1 \
     --project archerchat-3d462 \
     --set-env-vars "[USE_VALUES_FROM_ENV_LOCAL]"
   ```
4. **Update traffic routing if needed**:
   ```bash
   gcloud run services update-traffic archerchat \
     --to-revisions=REVISION_NAME=100 \
     --region=us-central1 \
     --project=archerchat-3d462
   ```

#### Critical: Dual URL Issue
Google Cloud Run creates TWO URLs for the same service:
1. **Project-based URL**: `https://archerchat-697285727061.us-central1.run.app` (ACTIVE)
2. **Generated URL**: `https://archerchat-er7tpljqpa-uc.a.run.app` (alternate)

**IMPORTANT**:
- NEXTAUTH_URL must match the URL configured in Google OAuth redirect
- Current configuration uses: `https://archerchat-697285727061.us-central1.run.app`
- Authentication will fail if URLs don't match!

#### Feature Flags (Build-time Configuration)
- Feature flags (`NEXT_PUBLIC_*`) are configured in `cloudbuild.yaml` as build args
- Changes to feature flags require rebuilding and redeploying (not just env var updates)
- Current settings in `cloudbuild.yaml`:
  - `NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS=true` (intelligent memory extraction)
  - `NEXT_PUBLIC_USE_WEB_SEARCH=true` (web search ENABLED ✅)
  - `NEXT_PUBLIC_USE_AGENTIC_MODE=true` (agentic ReAct pattern)

### 2. 🔐 SECURITY: Never Share Private Keys
- **NEVER** commit API keys, private keys, or credentials to the repository
- **NEVER** expose sensitive environment variables in client-side code
- **NEVER** log or display private keys, passwords, or tokens
- **NEVER** include actual API keys in commit messages (even in deployment notes)
- **NEVER** include actual API keys in documentation files (use placeholders like [REDACTED] or [Set in Cloud Run])
- **NEVER** expose ANY sensitive credentials in commits, messages, or docs
- **ALWAYS** use environment variables for all sensitive configuration
- **ALWAYS** add sensitive files to `.gitignore` before committing
- **ALWAYS** rotate keys immediately if accidentally exposed
- **ALWAYS** use Firebase Admin SDK only on the server-side, never client-side

**Examples of what NEVER to commit or document:**
- `FIREBASE_PRIVATE_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_SEARCH_API_KEY`
- `NEXTAUTH_SECRET`
- Service account JSON files
- `.env` files with real values
- Actual API key values in commit messages
- Actual API key values in documentation (even in docs/ folder)

### 3. 📁 DOCUMENTATION: Only README.md and CLAUDE.md in Root
- **ALWAYS** place documentation in the `docs/` directory
- **EXCEPTION**: Only `README.md` and `CLAUDE.md` belong in the project root
- **NEVER** create `*.md` files in the root directory (except the two exceptions above)
- **ALWAYS** move documentation files to `docs/` immediately after creation
- **ALWAYS** update `docs/README.md` when adding new documentation

### 4. 💰 COST EFFICIENCY: Choose Affordable Solutions
- **ALWAYS** consider cost implications when choosing services or features
- **PREFER** free tier services when possible (Firebase Spark plan, Gemini free tier)
- **OPTIMIZE** API calls to minimize costs:
  - Cache responses when appropriate
  - Batch operations to reduce request counts
  - Use cheaper models for simple tasks (e.g., Gemini Flash vs Pro)
- **MONITOR** usage regularly to avoid surprise bills
- **SET** spending limits on all cloud services
- **AVOID** expensive features unless critical for user experience
- **EXAMPLE**: Use Gemini 2.0 Flash (free tier) instead of GPT-4 (expensive)

### 5. 🛡️ SECURITY: Always Protect the Website
- **AUTHENTICATION**: Always verify user authentication before accessing protected resources
- **AUTHORIZATION**: Implement proper authorization checks (e.g., admin-only routes)
- **INPUT VALIDATION**: Validate and sanitize all user inputs before processing
- **OUTPUT ENCODING**: Prevent XSS by properly encoding outputs
- **RATE LIMITING**: Implement rate limiting on API endpoints to prevent abuse
- **FIRESTORE RULES**: Maintain strict Firestore security rules
- **HTTPS ONLY**: Enforce HTTPS in production environments
- **CSRF PROTECTION**: Use NextAuth's built-in CSRF protection
- **CONTENT SECURITY POLICY**: Set appropriate CSP headers
- **DEPENDENCY UPDATES**: Regularly update dependencies to patch security vulnerabilities

**Security Checklist for New Features:**
- [ ] Does this expose any sensitive data?
- [ ] Is authentication required and enforced?
- [ ] Are inputs validated and sanitized?
- [ ] Are API endpoints rate-limited?
- [ ] Are Firestore rules updated if needed?
- [ ] Can this be exploited for DoS attacks?
- [ ] Are error messages safe (no stack traces to users)?

### 6. 🤖 MODEL CONFIGURATION: Never Change Models Without Permission
- **NEVER** change AI model configuration (Gemini models, model tiers) in `src/config/models.ts` without explicit user request
- **NEVER** hardcode model names anywhere in the codebase - ALWAYS import from `src/config/models.ts`
- **ALWAYS** use `GEMINI_MODELS[ModelTier.MAIN]`, `GEMINI_MODELS[ModelTier.IMAGE]`, or `GEMINI_MODELS[ModelTier.LITE]` when referencing models
- **CAN** suggest model improvements but ALWAYS ask first
- **TRUST** current model configuration is intentional and tested
- Current models: `gemini-2.5-flash` (main), `gemini-2.5-flash-image` (image), `gemini-2.5-flash-lite` (lite/background tasks)

### 7. 🧪 TESTING: Always Run Tests and Build Before Deployment
- **ALWAYS** run the test suite after making code changes
- **NEVER** commit code without verifying tests still pass
- **ALWAYS** run `npx jest` before committing changes
- **ALWAYS** ensure all tests pass (100% pass rate required)
- **ALWAYS** fix failing tests immediately - don't leave them broken
- **ALWAYS** add new tests when adding new features or fixing bugs

**CRITICAL: Always run `npm run build` before deploying to production**
- **ALWAYS** run `npm run build` locally before deploying to Cloud Run
- **WHY**: `npm run dev` is lenient with TypeScript errors, but `npm run build` does strict type checking
- **RESULT**: Catches all TypeScript type errors before wasting Cloud Build resources
- **WORKFLOW**: Develop → `npm run build` → `npx jest` → Commit → Deploy

**Proper Deployment Workflow:**
```bash
# 1. Make code changes with npm run dev
npm run dev

# 2. Build to catch TypeScript errors
npm run build

# 3. Run tests to verify functionality
npx jest

# 4. Only if both succeed → commit and deploy
git add -A
git commit -m "Your message"
git push
# Then deploy to Cloud Run (only if user explicitly requests)
```
- **EXCEPTION**: Quick typo fixes in documentation may skip tests

**Testing Workflow:**
1. Make code changes
2. Run `npx jest` to verify all tests pass
3. If tests fail, fix the code or update tests
4. Only commit when all tests are green ✅
5. Run `npx jest --coverage` periodically to check coverage

**Why This Matters:**
- Prevents breaking existing functionality
- Catches bugs before they reach production
- Maintains code quality and confidence
- Documents expected behavior through tests
- Makes refactoring safer

**Test Commands:**
```bash
npx jest                 # Run all tests
npx jest --watch        # Run tests in watch mode
npx jest --coverage     # Run with coverage report
npx jest path/to/file   # Run specific test file
```

### 8. ✅ VERIFICATION: Always Verify Code Changes Before Reporting Success
- **ALWAYS** wait for the dev server to recompile after making code changes
- **ALWAYS** check the server logs to confirm successful compilation
- **NEVER** tell the user changes are ready without verifying first
- **ALWAYS** look for `✓ Compiled` messages in the logs
- **ALWAYS** check there are no new syntax or compilation errors
- **ALWAYS** wait at least 5-10 seconds after saving files for webpack to finish

**Mandatory Verification Workflow:**
1. Make code changes and save files
2. **WAIT** 5-10 seconds for webpack hot reload to complete
3. **CHECK** `BashOutput` for the dev server logs
4. **VERIFY** you see `✓ Compiled` with no errors
5. **CONFIRM** latest HTTP requests return 200 status (not 500)
6. **ONLY THEN** tell the user the changes are ready to test

**Example of proper verification:**
```bash
# After making changes, check logs:
BashOutput → Look for:
  ✓ Compiled /chat in 2.4s (2108 modules)
  GET /chat 200 in 2599ms
```

**What NOT to do:**
- ❌ Make changes → immediately tell user "it's fixed"
- ❌ Assume webpack compiled successfully without checking
- ❌ Ignore compilation errors in the logs
- ❌ Tell user it works when you see 500 errors

**Why This Matters:**
- Prevents wasting user's time with broken code
- Catches syntax errors immediately
- Builds trust through reliability
- Ensures professional development practices
- Respects user's time and patience

---

## Development Principles

### Multi-language Support (中英文双语)
- **Language detection**: PromptAnalyzer auto-detects language preference (English, Chinese, Hybrid)
- **Bilingual keywords**: `src/config/keywords.ts` contains 175+ keywords in both languages (legacy system)
- **Inclusive design**: Both language speakers have equal experience quality

### Code Organization
- **Centralized configuration**: `src/config/models.ts`, `src/config/keywords.ts`, `src/config/feature-flags.ts`
- **Documentation**: All docs in `docs/` directory (see `docs/README.md` for index)
- **Modular architecture**: Separate concerns (providers, memory, UI components)
- **Next.js conventions**: App Router, API routes, server/client components

### UI Design Guidelines
- **Color palette**: Tailwind slate throughout
- **Spacing**: Generous padding (e.g., `px-6 py-6` instead of `p-4`)
- **Subtlety**: Avoid flashy elements, blend UI naturally
- **Responsive**: Works on all screen sizes

### Error Handling
- **User-facing**: Never show raw error messages or stack traces
- **Server-side logging**: Detailed console.log with context
- **Graceful degradation**: Provide fallbacks (e.g., if image gen fails, return text description)
- **Validation**: Validate data before Firestore writes (no undefined values)

## Tech Stack

- **Framework**: Next.js 14 (App Router, SSR, API routes)
- **Language**: TypeScript (strict mode)
- **Database**: Firestore (NoSQL, real-time)
- **Auth**: NextAuth.js (Google OAuth, whitelist control)
- **AI**: Google Gemini (cost-effective, multimodal, native image generation)
- **Styling**: Tailwind CSS + shadcn/ui
- **Testing**: Jest + TypeScript (145+ tests)
- **Deployment**: Cloud Run (GCP, scales to zero)

## Common Development Tasks

### Modifying Intent Analysis Behavior
1. Update analysis prompt in `src/lib/prompt-analysis/analyzer.ts` (lines 39-257)
2. Adjust web search conservatism, memory extraction triggers, etc.
3. Test with various conversation patterns
4. Run tests: `npx jest src/__tests__/lib/context-engineering/`

### Modifying Memory Extraction
1. Update PromptAnalyzer prompt to change extraction rules (lines 67-78 in analyzer.ts)
2. Modify storage logic in `src/lib/memory/storage.ts` if needed
3. Update UI in `src/app/profile/page.tsx` for display changes
4. Run tests: `npx jest src/__tests__/lib/memory/`

### Adding a New AI Provider
1. Implement `IAIProvider` interface in `src/types/ai-providers.ts`
2. Create provider class in `src/lib/providers/` (see `gemini.provider.ts` example)
3. Add to `ProviderFactory` in `src/lib/providers/provider-factory.ts`
4. Add env vars and configuration
5. See `docs/ADDING_PROVIDERS.md` for detailed guide

### Modifying Progress Tracking Steps
1. Add new step to `ProgressStep` enum in `src/lib/progress/types.ts`
2. Emit events in orchestrator or chat route
3. Update UI in `src/components/chat/ProgressMessage.tsx` for display

## Important Patterns & Anti-Patterns

### ✅ DO:
- Use lazy initialization with Proxy for services needing runtime env vars
- Use PromptAnalyzer for intent detection (not keywords)
- Validate data structures before Firestore writes (no undefined values)
- Keep UI clean and subtle (Tailwind slate, generous spacing)
- Support both English and Chinese equally
- Use explicit TypeScript types (avoid `any`)

### ❌ DON'T:
- Initialize services at module import time if they need runtime config
- Hardcode keywords or magic strings (use `src/config/` files)
- Save undefined values to Firestore (conditionally include fields)
- Store sensitive data in memory facts
- Show raw error messages or stack traces to users
- Change model configuration without explicit permission

## File Naming Conventions

- **Components**: PascalCase (`ChatMessage.tsx`)
- **Utilities**: camelCase (`firebase-admin.ts`)
- **Types**: PascalCase (`memory.ts` exports `MemoryFact`)
- **Config**: lowercase (`keywords.ts`, `models.ts`)

## Deprecated Systems (Still in Code)

### Keyword-based Triggers (Legacy)
**Status**: Deprecated, only runs when `NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS=false`

**Files** (still in codebase but not used in production):
- `src/lib/keywords/system.ts` - Keyword detection engine
- `src/lib/keywords/triggers.ts` - Registered triggers
- `src/config/keywords.ts` - 175+ bilingual keywords
- `src/lib/memory/extractor.ts` - Old memory extraction (replaced by PromptAnalyzer)

**Why deprecated**: AI-powered PromptAnalyzer is more accurate, flexible, and doesn't require maintaining keyword lists.

## Project Structure

```
src/
  app/
    api/
      chat/route.ts              # Main chat endpoint (intelligent analysis integration)
      conversations/route.ts     # Conversation CRUD
      memory/route.ts            # Memory API
      admin/                     # Admin endpoints
    chat/page.tsx                # Main chat UI
    admin/page.tsx               # Admin panel
    profile/page.tsx             # User memory profile
  lib/
    prompt-analysis/analyzer.ts  # PromptAnalyzer (intent analysis)
    context-engineering/orchestrator.ts  # Context orchestration
    providers/                   # AI provider abstraction
    memory/                      # Memory system
    web-search/                  # Web search integration
    progress/                    # Progress tracking
    keywords/                    # Legacy keyword system
  config/
    models.ts                    # Model tier configuration
    feature-flags.ts             # Feature toggles
    keywords.ts                  # Legacy keyword lists
  types/
    ai-providers.ts              # Provider interfaces
    prompt-analysis.ts           # Analysis types
    memory.ts                    # Memory types
    agent.ts                     # Agent types
  __tests__/                     # Jest tests (145+ tests)
```

## Cost Estimation (Family Use, 5-10 users, ~1000 messages/month)

- **Firestore**: FREE (within free tier)
- **Cloud Run**: $5-10/month (scales to zero)
- **Gemini API**: $2-5/month (tiered models, free tier first)
  - Chat (2.5 Flash): ~$1.70
  - Analysis (2.5 Flash Lite): ~$0.50
  - Image generation (occasional): ~$0.50
  - Web search content extraction: ~$1.00
- **Google Custom Search**: FREE (within 100 queries/day)
- **Total**: ~$8-18/month

## Documentation

See `docs/README.md` for comprehensive documentation index:
- `docs/DESIGN.md` - System architecture
- `docs/DEPLOYMENT.md` - Cloud Run deployment guide
- `docs/TESTING_PLAN.md` - Testing strategy
- `docs/MEMORY_SYSTEM_COMPLETE.md` - Memory system details
- `docs/WEB_SEARCH_DESIGN.md` - Web search integration
- `docs/PROGRESS_TRACKING.md` - Progress tracking system
- `docs/AGENTIC_ARCHITECTURE.md` - Agentic ReAct pattern (implemented)

---

**Last Updated**: 2025-11-17
**Maintained By**: Archer & Claude Code
