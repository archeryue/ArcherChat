# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Mission

Build a clean, professional AI agent serving English and Chinese-speaking family members with intelligent memory, personalization, and agentic capabilities.

## Essential Commands

```bash
# Development
npm run dev                    # Start dev server (port 8080)
npm run build                  # Production build (strict TypeScript)
npm run lint                   # ESLint checks

# Testing (see docs/TESTING.md for complete guide)
npx jest                       # Run all unit tests (145+)
npx jest --watch              # Watch mode for TDD
npm run test:e2e              # Run E2E tests (17+)
npm run test:e2e:ui           # Interactive E2E test UI

# Deployment (see docs/DEPLOYMENT.md for complete guide)
# NEVER deploy unless user explicitly asks
```

## Git Workflow

**Two-branch workflow:** `develop` → `main`

1. Work on `develop` branch
2. Push and wait for CI checks to pass
3. Create PR to merge to `main` (branch protection enforced)
4. Never push directly to `main`

```bash
# Verify CI passed before merging
gh run list --branch develop --limit 1
gh run view <run-id>
```

**CI/CD:** 5 automated checks run on every push:
- Secret Scanning (Gitleaks)
- ESLint (code quality)
- TypeScript Build (type safety)
- Jest Tests (145+ tests)
- NPM Security Audit

## Key Architecture

### 1. Agentic Mode (ReAct Pattern) - DEFAULT PRODUCTION SYSTEM
```
User Input → Agent Loop → REASON → ACT → OBSERVE → Response
```
- **Status**: ENABLED BY DEFAULT in production
- **Flag**: `NEXT_PUBLIC_USE_AGENTIC_MODE=true` (default)
- **Files**: `src/lib/agent/core/agent.ts`, `src/lib/agent/tools/*`
- Tools: web_search, web_fetch, memory_retrieve, memory_save, get_current_time

**Note**: There's also a legacy *Intelligent Analysis Pipeline* (PromptAnalyzer → ContextOrchestrator) that serves as a fallback when Agentic Mode is disabled. However, Agentic Mode is the default and recommended system.

### 2. Memory System
- **Three-tier retention**: CORE (never expire), IMPORTANT (90 days), CONTEXT (30 days)
- **Files**: `src/lib/memory/storage.ts`, `src/lib/memory/loader.ts`
- AI-powered extraction via Agent tools

### 3. Web Search Integration
- **Provider**: Google Custom Search API
- **Rate Limits**: 20/hour, 100/day per user
- **Flag**: `NEXT_PUBLIC_USE_WEB_SEARCH=true`
- Conservative mode: only for time-sensitive queries

### 4. Model Configuration
Centralized in `src/config/models.ts`:
- `ModelTier.MAIN`: Gemini 2.5 Flash (chat)
- `ModelTier.IMAGE`: Gemini 2.5 Flash Image
- `ModelTier.LITE`: Gemini 2.5 Flash Lite (analysis)

### 5. Whim Architecture
```
Conversation → /save command → AI Title + JSON Blocks → Whim (TipTap Editor)
```
- **Storage**: TipTap JSON blocks (Notion-like structure)
- **Editing**: WYSIWYG editor with block-based operations
- **Conversion**: `/save` or `/whim` commands convert chat to whim
- **Title Generation**: AI-powered using Gemini Flash Lite (~$0.000002/title)
- **Files**:
  - `src/components/whim/WhimEditor.tsx` - TipTap editor
  - `src/lib/whim/converter.ts` - Conversation → Whim conversion
  - `src/app/api/whims/route.ts` - CRUD operations
- **Features**: Bold, italic, headings, lists, code blocks, todo lists, auto-save

**Note**: See `docs/CONTENT_ARCHITECTURE.md` for detailed content format strategy.

## 🔴 CRITICAL RULES

### 1. 🔐 SECURITY: Never Expose Credentials
- **NEVER** commit API keys, private keys, or credentials
- **NEVER** include actual keys in commits, messages, or docs
- **ALWAYS** use environment variables for sensitive config
- **ALWAYS** use Firebase Admin SDK server-side only

### 2. 🧪 TESTING: Test-Driven Development
**Before Implementation:**
- Think: How will I test this feature?
- Design test scenarios first

**After Implementation:**
```bash
npm run build      # TypeScript check
npx jest           # Unit tests (145+)
npm run test:e2e   # E2E tests (17+)
```
- **NEVER** commit until all tests pass (100% pass rate required)
- **NEVER** skip E2E tests for user-facing features
- **ALWAYS** add tests for new features

### 3. ✅ VERIFICATION: Verify Before Reporting Success
1. Make code changes
2. **WAIT** 5-10 seconds for webpack to recompile
3. **CHECK** logs for `✓ Compiled` with no errors
4. **CONFIRM** HTTP requests return 200 (not 500)
5. **ONLY THEN** tell user it's ready

### 4. 🚀 DEPLOYMENT: Deploy Only When Asked
- **NEVER** deploy unless user explicitly requests it
- **ALWAYS** run `npm run build` and `npx jest` first
- **ALWAYS** read `docs/DEPLOYMENT.md` for steps
- Production URL: `https://archerchat-697285727061.us-central1.run.app`

### 5. 🤖 MODEL CONFIG: Never Change Without Permission
- **NEVER** modify `src/config/models.ts` without explicit user request
- **NEVER** hardcode model names (always import from config)
- Current: gemini-2.5-flash, gemini-2.5-flash-image, gemini-2.5-flash-lite

### 6. 📁 DOCUMENTATION: Root Files Limited
- **ONLY** `README.md` and `CLAUDE.md` in project root
- **ALWAYS** place other docs in `docs/` directory
- **ALWAYS** update `docs/README.md` when adding docs

### 7. 💰 COST EFFICIENCY: Choose Affordable Solutions
- **PREFER** free tier services (Firebase, Gemini)
- **OPTIMIZE** API calls (cache, batch, use cheaper models)
- **MONITOR** usage to avoid surprise bills
- Estimated cost: ~$8-18/month for family use

### 8. 🛡️ SECURITY: Protect the Website
**Always enforce:**
- Authentication and authorization
- Input validation and sanitization
- Rate limiting on API endpoints
- Strict Firestore security rules
- HTTPS only in production

**Security checklist for new features:**
- [ ] Sensitive data exposure risk?
- [ ] Authentication enforced?
- [ ] Inputs validated?
- [ ] API endpoints rate-limited?
- [ ] Firestore rules updated?
- [ ] DoS attack vectors?
- [ ] Error messages safe (no stack traces)?

## Development Guidelines

### Tech Stack
- Next.js 14 (App Router, TypeScript strict mode)
- Firestore (NoSQL database)
- NextAuth.js (Google OAuth + whitelist)
- Google Gemini (AI provider)
- Tailwind CSS + shadcn/ui
- Jest + Playwright (testing)
- Cloud Run (deployment)

### Multi-language Support
- Auto-detect language (English, Chinese, Hybrid)
- Equal experience quality for both languages
- PromptAnalyzer handles language detection

### Code Patterns

**✅ DO:**
- Use lazy initialization (Proxy pattern) for runtime env vars
- Use PromptAnalyzer for intent detection
- Validate data before Firestore writes (no undefined)
- Keep UI clean and subtle (Tailwind slate, generous spacing)
- Use explicit TypeScript types (avoid `any`)

**❌ DON'T:**
- Initialize services at module import if they need runtime config
- Hardcode magic strings (use `src/config/` files)
- Show raw errors or stack traces to users
- Store sensitive data in memory facts

### UI Design
- Color: Tailwind slate palette
- Spacing: Generous padding (`px-6 py-6` not `p-4`)
- Style: Subtle, blend naturally, no flashy elements
- Responsive: Works on all screen sizes

### File Naming
- Components: PascalCase (`ChatMessage.tsx`)
- Utilities: camelCase (`firebase-admin.ts`)
- Types: PascalCase exports from camelCase files
- Config: lowercase (`models.ts`, `keywords.ts`)

## Project Structure

```
src/
  app/api/chat/route.ts          # Main chat endpoint
  lib/
    prompt-analysis/              # Intent analysis
    context-engineering/          # Context orchestration
    agent/                        # Agentic tools
    memory/                       # Memory system
    web-search/                   # Web search
    providers/                    # AI provider abstraction
  config/
    models.ts                     # Model configuration
    feature-flags.ts              # Feature toggles
  __tests__/                      # Jest tests (145+)
  tests/                          # E2E tests (17+)
```

## Documentation

See `docs/README.md` for comprehensive docs:
- `DEPLOYMENT.md` - Cloud Run deployment
- `TESTING.md` - Testing guide
- `DESIGN.md` - System architecture
- `MEMORY_SYSTEM_COMPLETE.md` - Memory details
- `AGENTIC_ARCHITECTURE.md` - ReAct pattern
- `WEB_SEARCH_DESIGN.md` - Web search integration

---

**Last Updated**: November 22, 2025
**Maintained By**: Archer & Claude Code
