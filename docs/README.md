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

### ✅ [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
**Comprehensive testing checklist for all features.**

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

### 📋 [MEMORY_SYSTEM_STATUS.md](./MEMORY_SYSTEM_STATUS.md)
**Memory system implementation status and roadmap.**

## 🚀 Quick Start

1. **New to ArcherChat?** Start with [../README.md](../README.md) for local setup
2. **Understanding the system?** Read [DESIGN.md](./DESIGN.md)
3. **Ready to deploy?** Follow [DEPLOYMENT.md](./DEPLOYMENT.md)
4. **Testing your deployment?** Use [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md)
5. **Learning about memory?** See [MEMORY_SYSTEM_COMPLETE.md](./MEMORY_SYSTEM_COMPLETE.md)
6. **Adding AI providers?** Check [ADDING_PROVIDERS.md](./ADDING_PROVIDERS.md)

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

**Last Updated**: 2025-11-01
**Documentation Status**: ✅ Complete and up-to-date
