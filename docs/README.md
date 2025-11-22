# WhimCraft Documentation

Comprehensive documentation for WhimCraft - a bilingual AI agent with advanced memory, personalization, and agentic capabilities.

---

## 📚 Core Documentation

### 🎯 [DESIGN.md](./DESIGN.md)
**Complete system architecture and design**

- Technology stack and architecture
- All features (Memory, Image Generation, Agentic Mode, Bilingual Support)
- Provider abstraction layer
- Database schema (Firestore)
- API design
- Cost estimation (~$8-18/month)
- Security considerations

### 🤖 [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md)
**DEFAULT PRODUCTION SYSTEM - ReAct Pattern**

- Reason-Act-Observe autonomous behavior
- Tool system (web_search, web_fetch, memory, get_current_time)
- Agent core with configurable iterations (default 5)
- Source categories for reliable searches
- 58 comprehensive unit tests
- **Status**: ✅ Enabled by default in production

### 📝 [CONTENT_ARCHITECTURE.md](./CONTENT_ARCHITECTURE.md)
**Content formats, storage, and display**

- Markdown as source of truth
- Storage layer (Firestore structure)
- Display systems (ReactMarkdown for Chat, TipTap for Whim)
- Conversion pipeline (conversation → whim)
- AI-powered title generation
- Future improvement options

### 🧠 [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)
**Intelligent memory system**

- Three-tier retention (CORE/IMPORTANT/CONTEXT)
- Memory categories (PROFILE/PREFERENCE/TECHNICAL/PROJECT)
- AI-powered extraction
- 500-token budget with automatic cleanup
- Cost impact (~$0.50-1/month)
- User control via /profile page

### 🔍 [WEB_SEARCH_DESIGN.md](./WEB_SEARCH_DESIGN.md)
**Web search integration**

- Provider: Google Custom Search API
- Rate limiting (20/hour, 100/day per user)
- Conservative trigger mode (time-sensitive queries only)
- Cost: FREE within 3,000 searches/month
- **Status**: ✅ Implemented

### 📊 [PROGRESS_TRACKING.md](./PROGRESS_TRACKING.md)
**Real-time progress feedback**

- Single updating badge UI
- Server → client streaming protocol
- [PROGRESS] and [CONTENT] prefixes
- 7 progress steps tracked
- **Status**: ✅ Implemented

---

## 🚀 Operations

### 📦 [DEPLOYMENT.md](./DEPLOYMENT.md)
**Complete deployment guide for Google Cloud Run**

- Docker setup (WSL2)
- gcloud CLI configuration
- Environment variables
- AMD64 image building
- Cloud Run deployment
- OAuth configuration
- Troubleshooting
- Cost optimization
- Production checklist (14 items)

### 🧪 [TESTING.md](./TESTING.md)
**Complete testing guide**

- **Unit Tests**: 145+ tests with Jest (100% pass rate)
- **E2E Tests**: 17+ tests with Playwright
- Test structure and organization
- Running tests (unit + E2E)
- Mock authentication system (triple-guard security)
- CI/CD integration
- Debugging guide
- **Status**: ✅ Fully automated testing

### 🔐 [SECURITY_ANALYSIS_TEST_AUTH.md](./SECURITY_ANALYSIS_TEST_AUTH.md)
**Security analysis for test authentication**

- Triple-guard protection system
- Localhost-only validation
- Runtime security checks
- Risk assessment
- **Verdict**: ✅ SAFE for automated testing

---

## 🔧 Development

### 🔌 [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)
**Guide for adding AI providers**

- Implement IAIProvider interface
- Add OpenAI, Anthropic, or custom providers
- Handle streaming responses
- Implement image generation
- Testing procedures
- **Current**: GeminiProvider fully implemented

### 🚀 [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)
**Planned enhancements**

- High priority features
- Medium priority features
- Low priority nice-to-haves
- Implementation approaches
- Effort estimates

---

## 🎯 Quick Start

1. **New to WhimCraft?** → [../README.md](../README.md) for local setup
2. **Understanding architecture?** → [DESIGN.md](./DESIGN.md)
3. **How does agentic mode work?** → [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md)
4. **Ready to deploy?** → [DEPLOYMENT.md](./DEPLOYMENT.md)
5. **Need to test?** → [TESTING.md](./TESTING.md)
6. **Understanding memory?** → [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)
7. **Adding AI providers?** → [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)

---

## ✅ Key Features

### Production Features (All Implemented)
- **Agentic Mode**: ReAct pattern with autonomous tool use (DEFAULT)
- **Memory System**: Automatic extraction, tiered retention
- **Image Generation**: Native Gemini 2.5 Flash Image
- **Web Search**: Conservative mode with rate limiting
- **File Attachments**: Images and PDFs with multimodal processing
- **Bilingual Support**: English and Chinese (equal quality)
- **Progress Tracking**: Real-time visual feedback
- **Testing**: 145+ unit tests, 17+ E2E tests (100% pass rate)

### Tech Stack
- Next.js 14 (App Router, TypeScript)
- Firestore (NoSQL database)
- NextAuth.js (Google OAuth + whitelist)
- Google Gemini (3-tier model policy)
- Tailwind CSS + shadcn/ui
- Jest + Playwright (testing)
- Cloud Run (deployment)

---

## 💡 Common Tasks

**Cost concerns?** → See [DESIGN.md](./DESIGN.md) cost breakdown

**Deployment issues?** → Check [DEPLOYMENT.md](./DEPLOYMENT.md) troubleshooting

**Test failures?** → See [TESTING.md](./TESTING.md) debugging guide

**Memory questions?** → Full details in [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)

**Planning features?** → Track in [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)

---

## 🔗 External Resources

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Google Gemini API](https://ai.google.dev/)
- [Firebase/Firestore Docs](https://firebase.google.com/docs/firestore)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google Cloud Run](https://cloud.google.com/run/docs)

---

**Last Updated**: November 22, 2025
**Test Summary**: 145+ unit tests, 17+ E2E tests (100% pass rate)
**Documentation Status**: ✅ Current and maintained
