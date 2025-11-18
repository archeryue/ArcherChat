# ArcherChat Documentation

This directory contains comprehensive documentation for ArcherChat, a bilingual AI chatbot with advanced memory and personalization features.

## 📚 Documentation Files

### 📘 [DESIGN.md](./DESIGN.md)
**Complete system architecture and design document.**

Learn about:
- System architecture and technology choices
- Advanced features (Memory System, Image Generation, Bilingual Support, File Attachments)
- Provider abstraction layer
- Database schema (Firestore collections)
- API design (all endpoints)
- Project structure
- Cost estimation ($8-18/month for family use)
- Security considerations
- Future enhancements

**Key Topics:**
- Tiered Gemini models (2.5 Flash, Image, Lite)
- Memory system with hybrid triggering
- Native image generation
- 175+ bilingual keywords
- Dynamic prompt management

### 🤖 [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md)
**Agentic architecture with ReAct pattern - IMPLEMENTED**

**IMPLEMENTED**: Major architecture upgrade (2025-11-17)

Learn about:
- ReAct (Reason-Act-Observe) pattern implementation
- Tool system (web_search, web_fetch, memory_save, memory_retrieve, get_current_time)
- Agent core with configurable iterations (default 5)
- Source categories for reliable web searches (Wikipedia, StackOverflow, Reuters)
- Progress tracking integration
- 58 comprehensive unit tests

**Key Features:**
- Agent autonomously decides when to use tools vs respond directly
- Iterative search for better results
- sourceCategory parameter for targeted reliable sources
- Graceful error handling

**Status**: ✅ Implemented and tested - Enable with `USE_AGENTIC_MODE=true`

### 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md)
**Step-by-step deployment guide to Google Cloud Run.**

Covers:
- Docker installation (WSL2)
- gcloud CLI setup
- Environment variable configuration
- AMD64 image building
- Artifact Registry setup
- Cloud Run deployment
- OAuth configuration
- Testing new features (memory, images, files)
- Troubleshooting common issues
- Cost optimization tips
- Billing alerts setup

**Production Checklist:** Complete 14-item checklist before going live

### 🔐 [GITLEAKS_TROUBLESHOOTING.md](./GITLEAKS_TROUBLESHOOTING.md)
**Complete troubleshooting guide for Gitleaks secret scanning.**

**NEW**: Based on real testing and debugging experience (2025-11-03)

Learn how to:
- Fix common Gitleaks configuration issues
- Properly format regex patterns for API keys
- Test secret detection with fake keys
- Understand why secrets might be missed
- Configure allowlists correctly
- Debug Gitleaks failures

**Key Gotchas:**
- Config file must be `gitleaks.toml` (not `.gitleaks.toml`)
- Google API keys: Must be exactly 39 characters (`AIza` + 35 more)
- Gitleaks only scans changed files in each commit
- Allowlist patterns can be too broad

**Includes**: Step-by-step testing guide with fake secrets

### 📊 [DEPLOYMENT_STATUS.md](./DEPLOYMENT_STATUS.md)
**Current production deployment status and configuration.**

Includes:
- Live environment variables and feature flags
- Deployment commands and procedures
- Monitoring and logging commands
- Cost tracking and rate limits
- Recent changes and updates
- Testing checklist for deployments

**Status**: ✅ All systems operational (Last updated: 2025-11-03)

### ✅ [TESTING_PLAN.md](./TESTING_PLAN.md)
**Comprehensive testing strategy with detailed test cases.**

**Status**: Phase 2+ Complete ✅
- 145+ unit tests passing (100% pass rate) - includes 58 new agent tests
- 26/26 E2E tests (22 passed, 2 minor failures, 2 skipped)
- Jest + TypeScript infrastructure (unit tests)
- Playwright (E2E tests)
- Comprehensive coverage of memory system, agent core, and tools

Includes:
- Test coverage by module (Memory, Prompt Analysis, Chat API, Web Search)
- Testing infrastructure setup (Jest, Firestore Emulator, Playwright)
- Implementation phases (Phase 1-6 roadmap)
- Success metrics and quality gates

### 🎭 [E2E_TESTING.md](./E2E_TESTING.md)
**End-to-end testing with Playwright - complete guide.**

**NEW**: Based on progress tracking fixes (2025-11-11)

Learn how to:
- Run E2E tests in different modes (headless, UI, headed, debug)
- Write new E2E tests following best practices
- Test authentication flows
- Debug failing tests with screenshots and videos
- Integrate E2E tests into CI/CD pipeline
- Troubleshoot common issues

**Test Coverage:**
- Application basics (loading, errors, networking)
- Login page (Google OAuth, responsiveness)
- Performance metrics (Core Web Vitals)
- SEO and accessibility
- Error handling (404, offline mode)
- Progress tracking (requires auth)

**Commands:**
```bash
npm run test:e2e         # Run all E2E tests
npm run test:e2e:ui      # Interactive UI mode
npm run test:e2e:debug   # Debug with inspector
```

### ✅ [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
**Manual testing checklist for all features.**

Test categories:
- Pre-testing setup
- Authentication (admin, whitelist, non-whitelisted users)
- Chat functionality (basic chat, streaming, error handling)
- Conversation management
- **Memory System** (automatic extraction, keyword triggers, profile page)
- **Image Generation** (English/Chinese triggers, display, model switching)
- **File Attachments** (upload, processing, display)
- **Bilingual Support** (keyword detection, language preference)
- **Prompt Management** (admin configuration)
- Admin panel features
- UI/UX (loading states, empty states, responsive design)
- Edge cases
- Performance
- Security
- Browser compatibility

### 🧠 [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)
**Complete memory system documentation.**

Details:
- System behavior and architecture
- Hybrid triggering (keyword-based + conversation-based)
- Tiered retention strategy (CORE/IMPORTANT/CONTEXT)
- Memory categories (PROFILE/PREFERENCE/TECHNICAL/PROJECT)
- Cost impact (~$0.50-1/month additional)
- Testing procedures
- Configuration options
- API usage examples
- Future enhancements

**Key Features:**
- 138 bilingual trigger keywords
- 500-token memory budget
- Automatic cleanup
- User control via /profile page

### 🔍 [WEB_SEARCH_DESIGN.md](./WEB_SEARCH_DESIGN.md)
**Web search integration - complete design and implementation.**

Covers:
- Architecture and implementation approach (Hybrid: Smart + User Control)
- Cost comparison (Google Custom Search vs Tavily vs Gemini Grounding)
- Setup and configuration (Google Custom Search API)
- Rate limiting (20/hour, 100/day per user)
- Testing procedures
- Production deployment
- Cost impact analysis (mostly FREE within 3,000 searches/month)

**Provider**: Google Custom Search API
**Status**: Implemented ✅

### 📊 [PROGRESS_TRACKING.md](./PROGRESS_TRACKING.md)
**Real-time progress tracking system for AI responses.**

Details:
- User experience (single updating badge)
- System architecture (emitter, types, UI)
- Data flow (server → client streaming)
- Protocol design ([PROGRESS] and [CONTENT] prefixes)
- JSON encoding for preserving newlines
- Implementation details (server/client code)
- Known issues and future improvements

**Status**: Implemented ✅
**Known Issue**: Badge transitions too fast (~500ms steps hard to read)

### 🚀 [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)
**Planned enhancements and improvement roadmap.**

Tracks:
- **Low Priority**: Progress badge UX improvements
- **Ideas**: Memory analytics, voice input, multi-model support
- Detailed implementation approaches
- Effort estimates
- Related documentation links

**Purpose**: Central tracker for future work and nice-to-have features

### 🔌 [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)
**Guide for extending ArcherChat with additional AI providers.**

Learn how to:
- Implement the IAIProvider interface
- Add OpenAI, Anthropic, or custom providers
- Handle streaming responses
- Implement image generation
- Test provider implementations
- Configure provider-specific features

**Current Providers:**
- GeminiProvider (fully implemented)

## 🚀 Quick Start

1. **New to ArcherChat?** Start with [../README.md](../README.md) for local setup
2. **Understanding the system?** Read [DESIGN.md](./DESIGN.md)
3. **Planning agentic refactor?** See [AGENTIC_ARCHITECTURE.md](./AGENTIC_ARCHITECTURE.md)
4. **Ready to deploy?** Follow [DEPLOYMENT.md](./DEPLOYMENT.md)
5. **Testing your deployment?** Use [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
6. **Learning about memory?** See [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)
7. **Understanding progress tracking?** Check [PROGRESS_TRACKING.md](./PROGRESS_TRACKING.md)
8. **Adding AI providers?** Check [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)
9. **Planning future work?** See [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)

## 🎯 Key Features Documented

### ✅ Fully Documented Features
- **Memory System**: Automatic extraction, tiered retention, bilingual triggers
- **Image Generation**: Native Gemini 2.5 Flash Image, bilingual keywords
- **File Attachments**: Images and PDFs with multimodal processing
- **Bilingual Support**: 175+ keywords in English and Chinese
- **Provider Abstraction**: Extensible IAIProvider interface
- **Prompt Management**: Dynamic admin-configurable prompts
- **Admin Features**: Whitelist, user stats, prompt configuration
- **Cost Optimization**: Tiered models, $8-18/month for family use
- **Progress Tracking**: Real-time visual feedback during AI response generation
- **Web Search**: Intelligent web search with rate limiting and caching

## 💡 Tips

- **Cost concerns?** See cost breakdowns in [DESIGN.md](./DESIGN.md#cost-estimation-monthly)
- **Deployment issues?** Check troubleshooting in [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)
- **Feature not working?** Use [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) to verify
- **Memory questions?** Full details in [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)

## 🆘 Getting Help

If you encounter issues:

1. **Check documentation**:
   - [DEPLOYMENT.md](./DEPLOYMENT.md) - Troubleshooting section
   - [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) - Verify feature implementation
   - [DESIGN.md](./DESIGN.md) - Understand system architecture

2. **Review logs**:
   - Cloud Run logs in GCP Console
   - Browser console for frontend errors
   - Firestore console for data issues

3. **Verify configuration**:
   - All environment variables set correctly
   - OAuth redirect URIs configured
   - Firestore security rules in place
   - Billing alerts configured

4. **Test locally first**:
   - Use `npm run dev` to test changes
   - Check `.env.local` configuration
   - Verify API keys are valid

## 📝 Contributing to Documentation

When updating documentation:
- Keep DESIGN.md in sync with code changes
- Update TESTING_CHECKLIST.md when adding features
- Document new features in relevant files
- Update cost estimates when adding expensive features
- Follow markdown formatting conventions
- Include code examples where helpful

## 🔗 External Resources

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Google Gemini API](https://ai.google.dev/)
- [Firebase/Firestore Docs](https://firebase.google.com/docs/firestore)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Google Cloud Run](https://cloud.google.com/run/docs)

---

**Last Updated**: 2025-11-17
**Documentation Status**: ✅ Complete and up-to-date

**Test Summary**: 145+ unit tests (87 original + 58 agent tests), 26 E2E tests

## Recent Updates

### 2025-11-17 - Agentic Architecture Implementation
- ✅ **AGENTIC_ARCHITECTURE.md**: Fully implemented ReAct pattern
- ✅ **Agent Core**: Iterative Reason-Act-Observe loop with configurable iterations (default 5)
- ✅ **Tool System**: web_search, web_fetch, memory_save, memory_retrieve, get_current_time
- ✅ **sourceCategory Enhancement**: Target reliable sources (Wikipedia, StackOverflow, etc.) to reduce 403 errors
- ✅ **58 Unit Tests**: Comprehensive test coverage for agent core and tools
- ✅ **Feature Flag**: `NEXT_PUBLIC_USE_AGENTIC_MODE=true`
- ✅ **Performance**: Query times reduced from 30-45s to ~10s with source targeting

### 2025-11-03 (Evening) - Production Deployment
- ✅ **Code Quality Improvements**: Replaced all `any` types with proper TypeScript interfaces
- ✅ **TypeScript Build Errors Fixed**: Resolved production build type conflicts (Date vs Timestamp, LanguagePreference)
- ✅ **Production Deployment Complete**: Deployed to Cloud Run with all features enabled
- ✅ **Web Search Enabled in Production**: Added Google Search API credentials to Cloud Run environment
- ✅ **All Systems Operational**: Intelligent analysis + web search + content extraction fully working

### 2025-11-03 (Earlier)
- ✅ **Progress Badge Visibility Fixed**: Added 150ms delays between events for smooth transitions
- ✅ **Conservative Web Search Mode**: AI now only triggers search for truly time-sensitive queries
- ✅ **Model Configuration Centralized**: All models now use single source of truth (models.ts)
- ✅ **Documentation Consolidated**: Removed outdated INTELLIGENT_CONTEXT_ARCHITECTURE.md
- ✅ **All Tests Passing**: 87/87 tests ✅ including web scraping integration

### 2025-11-02
- ✅ **Web Scraping Implemented**: AI-powered content extraction from top 3 search results
- ✅ **Progress Tracking Implemented**: Real-time visual feedback during AI responses
- ✅ **New Documentation**: PROGRESS_TRACKING.md with complete architecture
- ✅ **Future Improvements Tracker**: FUTURE_IMPROVEMENTS.md for enhancement planning

### 2025-11-01
- ✅ **Phase 2 Testing Complete**: 53/53 tests passing, comprehensive Jest infrastructure
- ✅ **Web Search Documentation**: Consolidated into single WEB_SEARCH_DESIGN.md file
- ✅ **Removed Outdated Files**: MEMORY_SYSTEM_STATUS.md (superseded by MEMORY_SYSTEM_COMPLETE.md)
- ✅ **Updated TESTING_PLAN.md**: Marked Phase 2 complete with actual results
