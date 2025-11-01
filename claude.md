# ArcherChat Development Principles

This document outlines the core principles and guidelines for developing ArcherChat. Follow these principles when making changes or adding new features.

## Project Philosophy

**Mission**: Build a clean, professional AI chatbot that serves both English and Chinese-speaking family members with intelligent memory and personalization.

---

## 🔴 CRITICAL RULES - NEVER VIOLATE THESE

### 1. 🚀 DEPLOYMENT: Never Deploy Without Explicit Permission
- **NEVER** deploy code to production (Google Cloud Run) unless the user explicitly asks
- **ALWAYS** wait for user to say "deploy", "ship online", or similar explicit commands
- **NEVER** assume deployment is wanted after committing code
- **ALWAYS** ask for confirmation before deploying if unclear
- **EXCEPTION**: Only deploy when user explicitly requests it

### 2. 🔐 SECURITY: Never Share Private Keys
- **NEVER** commit API keys, private keys, or credentials to the repository
- **NEVER** expose sensitive environment variables in client-side code
- **NEVER** log or display private keys, passwords, or tokens
- **ALWAYS** use environment variables for all sensitive configuration
- **ALWAYS** add sensitive files to `.gitignore` before committing
- **ALWAYS** rotate keys immediately if accidentally exposed
- **ALWAYS** use Firebase Admin SDK only on the server-side, never client-side

**Examples of what NEVER to commit:**
- `FIREBASE_PRIVATE_KEY`
- `GEMINI_API_KEY`
- `NEXTAUTH_SECRET`
- Service account JSON files
- `.env` files with real values

### 3. 📁 DOCUMENTATION: Only README.md and claude.md in Root
- **ALWAYS** place documentation in the `docs/` directory
- **EXCEPTION**: Only `README.md` and `claude.md` belong in the project root
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

---

## Core Principles

### 1. Clean and Professional UI
- **Consistency**: Use the Tailwind slate color palette throughout the application
- **Subtlety**: Avoid overly prominent elements; blend UI components naturally
- **Spacing**: Generous padding and margins for breathing room (e.g., `px-6 py-6` instead of `p-4`)
- **Visual hierarchy**: Use shadows, gradients, and transitions to guide attention
- **Responsive design**: Ensure the interface works well on all screen sizes

### 2. Code Organization
- **Centralized configuration**: Abstract shared logic into dedicated config files (e.g., `src/config/keywords.ts`)
- **Documentation**: Keep all documentation in the `docs/` directory
- **Modular architecture**: Separate concerns (providers, memory, UI components)
- **Clear file structure**: Follow Next.js conventions and keep related files together

### 3. Multi-language Support (中英文双语)
- **Bilingual keywords**: All keyword-based triggers must support both English and Chinese
- **Language preference**: Remember and respect user's language preference (English, Chinese, Hybrid)
- **Automatic detection**: Use conversation analysis to infer language preference
- **Inclusive design**: Ensure both language speakers have equal experience quality

### 4. User Privacy and Control
- **Transparent memory**: Users can see exactly what the system remembers about them
- **Granular control**: Allow deletion of individual memory facts, not just bulk clear
- **Data isolation**: Each user's memory is private and isolated
- **Minimal data collection**: Only remember what's truly useful for personalization

### 5. Build and Deployment
- **Build-time compatibility**: Never initialize services that require runtime environment variables during build
- **Lazy initialization**: Use Proxy patterns or lazy loading for services (e.g., Firebase Admin SDK)
- **Environment awareness**: Distinguish between development, build, and production environments
- **Docker optimization**: Use multi-stage builds to minimize image size

### 6. Git Workflow
- **Commit frequently**: Commit logical units of work with clear messages
- **Descriptive commits**: Include context about what was changed and why
- **Push after milestones**: Push to remote after completing features or fixes
- **Organized documentation**: Keep documentation in sync with code changes

### 7. Memory System Design
- **Hybrid triggering**: Support both keyword-based (immediate) and conversation-based (automatic after 5+ messages, 2+ minutes) memory extraction
- **Tiered retention**:
  - Core facts: Never expire (profile information)
  - Important facts: 90 days (preferences, technical context)
  - Context facts: 30 days (current projects, temporary info)
- **Deduplication**: Automatically filter out duplicate or highly similar facts
- **Confidence scoring**: Only store facts with confidence ≥ 0.6
- **Categories**: Organize facts into profile, preference, technical, and project categories

### 8. AI Provider Integration
- **Provider abstraction**: Use the IAIProvider interface for all AI services
- **Graceful fallbacks**: Handle API failures with descriptive error messages
- **Model flexibility**: Support multiple models per provider (e.g., Gemini 2.0 Flash, Flash Experimental)
- **Feature detection**: Automatically detect capabilities like image generation

### 9. Error Handling
- **User-friendly errors**: Never show raw error messages to users
- **Detailed logging**: Log errors server-side with full context for debugging
- **Graceful degradation**: When features fail, provide alternatives (e.g., image generation → descriptive text)
- **Validation**: Validate data structures before saving to Firestore

### 10. Testing and Quality
- **Test before deployment**: Verify changes work locally before pushing to Cloud Run
- **Manual testing**: Test critical user flows after major changes
- **Type safety**: Use TypeScript types consistently throughout the codebase
- **Linting**: Follow ESLint rules for code quality

## Technical Stack Decisions

### Why Next.js 14?
- Server-side rendering for better SEO and performance
- App Router for modern routing patterns
- API routes for backend functionality
- Built-in optimization (images, fonts, code splitting)

### Why Firebase?
- Real-time updates for chat conversations
- Secure authentication with Google OAuth
- Flexible NoSQL database (Firestore) for unstructured data
- Easy deployment and scaling

### Why Tailwind CSS?
- Utility-first approach for rapid UI development
- Consistent design system through configuration
- Minimal custom CSS needed
- Excellent responsive design utilities

### Why Google Gemini?
- **Cost-effective**: Free tier with generous limits (60 requests/minute for Gemini 2.0 Flash)
- **Native image generation**: Gemini 2.0 Flash has built-in image generation capabilities
- **Competitive pricing**: Much cheaper than GPT-4 for paid usage ($0.075/1M input tokens vs $2.50/1M)
- **Multimodal support**: Single API for text + images
- **Fast inference times**: Quick responses for real-time chat
- **No vendor lock-in**: Easy to add other providers later thanks to abstraction layer

## Common Patterns

### Adding a New Feature
1. Plan the feature with clear requirements
2. Update relevant documentation in `docs/`
3. Implement with proper TypeScript types
4. Test locally with `npm run dev`
5. Commit with descriptive message
6. Push to GitHub
7. Deploy to Cloud Run for production testing

### Adding New Keywords
1. Add to appropriate category in `src/config/keywords.ts`
2. Include both English and Chinese variants
3. Update any related documentation
4. Test with sample conversations

### Modifying Memory Behavior
1. Update extraction prompt in `src/lib/memory/extractor.ts` if needed
2. Modify storage logic in `src/lib/memory/storage.ts` if needed
3. Update UI in `src/app/profile/page.tsx` to reflect changes
4. Test memory extraction with various conversation patterns

## Anti-Patterns to Avoid

> **Note**: Critical security and cost anti-patterns are covered in the [CRITICAL RULES](#-critical-rules---never-violate-these) section above.

❌ **Don't**: Initialize services at module import time if they need runtime config
✅ **Do**: Use lazy initialization with Proxy patterns

❌ **Don't**: Hardcode keywords throughout the codebase
✅ **Do**: Centralize keywords in `src/config/keywords.ts`

❌ **Don't**: Make UI elements overly prominent or flashy
✅ **Do**: Keep UI clean, professional, and subtle

❌ **Don't**: Assume all users speak English
✅ **Do**: Support both English and Chinese equally

❌ **Don't**: Save undefined values to Firestore
✅ **Do**: Conditionally include optional fields only when defined

❌ **Don't**: Store sensitive data in memory facts
✅ **Do**: Filter out credentials, passwords, API keys from memory extraction

## Code Style

### TypeScript
- Use explicit types for function parameters and return values
- Prefer interfaces over types for object shapes
- Use enums for fixed sets of values (e.g., `MemoryTier`, `MemoryCategory`)
- Avoid `any` type; use `unknown` and type guards instead

### React Components
- Use functional components with hooks
- Extract reusable logic into custom hooks
- Keep components focused on single responsibility
- Use proper TypeScript props interfaces

### File Naming
- Components: PascalCase (e.g., `ChatMessage.tsx`)
- Utilities: camelCase (e.g., `firebase-admin.ts`)
- Types: PascalCase (e.g., `memory.ts` exports `MemoryFact`)
- Config: lowercase (e.g., `keywords.ts`)

## Future Considerations

### Planned Enhancements
- Enhanced keyword matching (word boundaries, negation detection, context awareness)
- Memory analytics dashboard for users
- Export/import memory data
- Memory sharing between family members (opt-in)
- Voice input support for Chinese
- Multi-model AI provider support (OpenAI, Anthropic, etc.)

### Performance Optimizations
- Implement caching for frequently accessed memory
- Optimize Firestore queries with composite indexes
- Add Redis for session management
- Implement rate limiting for API endpoints

---

**Last Updated**: 2025-10-30
**Maintained By**: Archer & Claude Code

This is a living document. Update it as the project evolves and new patterns emerge.
