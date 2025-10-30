# ArcherChat - Implementation Plan

## Project Overview
Building a ChatGPT-like AI chatbot for family use with:
- Next.js 14 (TypeScript, App Router)
- Firestore (database)
- Google OAuth (authentication)
- Gemini 1.5 Flash (AI)
- Tailwind CSS + shadcn/ui (styling)
- Cloud Run (deployment)

**Target**: Under $30/month for 5-10 users

## Implementation Phases

### Phase 1: Project Setup & Foundation (Day 1)
**Goal**: Create Next.js project with TypeScript, Tailwind, and basic structure

**Tasks**:
1. Initialize Next.js project with TypeScript
   ```bash
   npx create-next-app@latest archerchat --typescript --tailwind --app
   ```

2. Install core dependencies:
   ```bash
   npm install next-auth @google/generative-ai firebase-admin
   npm install @radix-ui/react-* class-variance-authority clsx tailwind-merge
   npm install react-markdown remark-gfm rehype-highlight
   npm install -D @types/node
   ```

3. Setup project structure:
   ```
   src/
   ├── app/
   │   ├── api/
   │   ├── chat/
   │   ├── admin/
   │   ├── layout.tsx
   │   └── page.tsx
   ├── components/
   ├── lib/
   └── types/
   ```

4. Configure Tailwind with shadcn/ui base setup

5. Create `.env.local.example` with all required env vars

**Deliverables**:
- ✅ Next.js project running on localhost:3000
- ✅ Basic folder structure
- ✅ Tailwind CSS working

---

### Phase 2: Firebase/Firestore Setup (Day 1)
**Goal**: Connect to Firestore database

**Tasks**:
1. Create `src/lib/firebase-admin.ts`:
   - Initialize Firebase Admin SDK
   - Export Firestore instance
   - Handle authentication with service account

2. Create TypeScript types in `src/types/index.ts`:
   ```typescript
   export interface User {
     email: string;
     name: string;
     avatar_url: string;
     is_admin: boolean;
     created_at: Date;
     last_login: Date;
   }

   export interface Conversation {
     user_id: string;
     title: string;
     model: string;
     created_at: Date;
     updated_at: Date;
   }

   export interface Message {
     role: 'user' | 'assistant';
     content: string;
     created_at: Date;
   }

   export interface WhitelistEntry {
     added_by: string;
     added_at: Date;
     notes?: string;
   }
   ```

3. Test Firestore connection with simple read/write

**Deliverables**:
- ✅ Firestore connected
- ✅ Type definitions created
- ✅ Can read/write test data

---

### Phase 3: Authentication (NextAuth.js) (Day 2)
**Goal**: Implement Google OAuth with whitelist check

**Tasks**:
1. Create `src/lib/auth.ts`:
   - Configure NextAuth with Google provider
   - Add session callback to include user info
   - Add signIn callback to check whitelist

2. Create `src/app/api/auth/[...nextauth]/route.ts`:
   - Export NextAuth handlers

3. Create whitelist middleware:
   - Check if user email is in Firestore whitelist
   - Check if user email matches ADMIN_EMAIL env var
   - Allow admin automatically
   - Deny non-whitelisted users

4. Create `src/app/login/page.tsx`:
   - Simple login page with Google sign-in button
   - Show error message for non-whitelisted users

5. Wrap app with SessionProvider

**Deliverables**:
- ✅ Google OAuth working
- ✅ Whitelist check working
- ✅ Admin auto-whitelisted
- ✅ Login page functional

---

### Phase 4: Gemini API Integration (Day 2)
**Goal**: Connect to Gemini API and implement streaming

**Tasks**:
1. Create `src/lib/gemini.ts`:
   - Initialize Gemini API client
   - Export function to send message and stream response
   - Handle errors gracefully

2. Create `src/app/api/chat/route.ts`:
   - POST endpoint to send messages
   - Accept: conversationId, message
   - Check authentication
   - Send to Gemini API
   - Stream response back to client
   - Save user message and AI response to Firestore

3. Test streaming with simple fetch in browser console

**Deliverables**:
- ✅ Gemini API connected
- ✅ Streaming working
- ✅ Messages saved to Firestore

---

### Phase 5: Chat UI - Basic (Day 3)
**Goal**: Build main chat interface

**Tasks**:
1. Create `src/components/chat/ChatMessage.tsx`:
   - Display user/assistant messages
   - Different styling for each role
   - Support markdown rendering
   - Syntax highlighting for code blocks

2. Create `src/components/chat/ChatInput.tsx`:
   - Textarea with auto-resize
   - Send button
   - Handle Enter key (Shift+Enter for new line)
   - Disable while waiting for response

3. Create `src/app/chat/page.tsx`:
   - Main chat page
   - Load existing conversation or create new
   - Display messages
   - Handle sending messages
   - Stream responses in real-time

4. Add loading states and error handling

**Deliverables**:
- ✅ Can send messages
- ✅ Can receive streaming responses
- ✅ Messages display correctly
- ✅ Markdown and code rendering works

---

### Phase 6: Conversation Management (Day 4)
**Goal**: Add sidebar with conversation history

**Tasks**:
1. Create `src/app/api/conversations/route.ts`:
   - GET: List user's conversations
   - POST: Create new conversation

2. Create `src/app/api/conversations/[id]/route.ts`:
   - GET: Get conversation with messages
   - DELETE: Delete conversation

3. Create `src/components/chat/ConversationList.tsx`:
   - List conversations in sidebar
   - Show title and last updated time
   - Highlight active conversation
   - Delete button

4. Create `src/components/chat/ChatSidebar.tsx`:
   - Sidebar container
   - "New Chat" button
   - User profile info
   - Logout button
   - Admin panel link (if admin)

5. Update `src/app/chat/[id]/page.tsx`:
   - Load specific conversation by ID
   - Show messages from that conversation

6. Implement auto-generated titles:
   - After first user message
   - Use first 50 chars or Gemini to generate title
   - Update conversation title in Firestore

**Deliverables**:
- ✅ Sidebar with conversation list
- ✅ Can create new conversations
- ✅ Can switch between conversations
- ✅ Can delete conversations
- ✅ Auto-generated titles

---

### Phase 7: Admin Panel (Day 5)
**Goal**: Build admin interface for whitelist management

**Tasks**:
1. Create `src/app/api/admin/whitelist/route.ts`:
   - GET: List all whitelisted emails
   - POST: Add email to whitelist
   - DELETE: Remove email from whitelist
   - Check if user is admin

2. Create `src/app/api/admin/users/route.ts`:
   - GET: List all users with stats
   - Include: email, name, message count, last active

3. Create `src/components/admin/WhitelistManager.tsx`:
   - Table of whitelisted emails
   - Add email form
   - Remove button for each email
   - Show who added and when

4. Create `src/components/admin/UserStats.tsx`:
   - Table of all users
   - Show stats: message count, last active

5. Create `src/app/admin/page.tsx`:
   - Check if user is admin (redirect if not)
   - Render WhitelistManager
   - Render UserStats

**Deliverables**:
- ✅ Admin can view whitelist
- ✅ Admin can add/remove emails
- ✅ Admin can view user stats
- ✅ Non-admins cannot access

---

### Phase 8: Polish & UX Improvements (Day 6)
**Goal**: Improve user experience and add missing features

**Tasks**:
1. Add loading skeletons:
   - While loading conversations
   - While loading messages
   - While waiting for AI response

2. Add error handling:
   - Show error messages to user
   - Retry failed requests
   - Handle rate limits

3. Add empty states:
   - No conversations yet
   - No messages in conversation
   - No whitelisted users

4. Add confirmation dialogs:
   - Before deleting conversation
   - Before removing user from whitelist

5. Improve styling:
   - Consistent spacing
   - Better colors
   - Hover states
   - Focus states

6. Add keyboard shortcuts:
   - Cmd/Ctrl+K: New chat
   - Cmd/Ctrl+/: Focus input

7. Add welcome message for first-time users

**Deliverables**:
- ✅ Better loading states
- ✅ Error handling
- ✅ Polished UI
- ✅ Keyboard shortcuts

---

### Phase 9: Testing & Bug Fixes (Day 7)
**Goal**: Test all features and fix bugs

**Tasks**:
1. Test authentication flow:
   - Admin login
   - Whitelisted user login
   - Non-whitelisted user login

2. Test chat functionality:
   - Send messages
   - Receive responses
   - Streaming works
   - Multiple conversations
   - Delete conversations

3. Test admin panel:
   - Add/remove whitelist
   - View stats
   - Non-admin access blocked

4. Test edge cases:
   - Very long messages
   - Empty messages
   - Network errors
   - Concurrent users

5. Fix any bugs found

6. Add basic rate limiting (simple implementation)

**Deliverables**:
- ✅ All features tested
- ✅ Major bugs fixed
- ✅ Ready for deployment

---

### Phase 10: Deployment to GCP (Day 8)
**Goal**: Deploy to Cloud Run

**Tasks**:
1. Create Dockerfile:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

2. Add `.dockerignore`:
   - node_modules
   - .env.local
   - .git

3. Setup GCP:
   - Create project
   - Enable required APIs
   - Setup Firestore
   - Create OAuth credentials
   - Get Gemini API key

4. Build and push Docker image:
   ```bash
   docker build -t gcr.io/PROJECT_ID/archerchat .
   docker push gcr.io/PROJECT_ID/archerchat
   ```

5. Deploy to Cloud Run:
   ```bash
   gcloud run deploy archerchat \
     --image gcr.io/PROJECT_ID/archerchat \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "..."
   ```

6. Test production deployment

7. Setup custom domain (optional)

**Deliverables**:
- ✅ App deployed to Cloud Run
- ✅ All environment variables configured
- ✅ Production app working
- ✅ Cost monitoring enabled

---

## Development Guidelines

### Code Style
- Use TypeScript strictly (no `any` types)
- Use functional components with hooks
- Use async/await (not .then/.catch)
- Add comments for complex logic
- Use descriptive variable names

### File Organization
- One component per file
- Co-locate related files
- Use barrel exports (index.ts) for cleaner imports
- Keep files under 200 lines when possible

### Error Handling
- Always handle promise rejections
- Show user-friendly error messages
- Log errors to console for debugging
- Don't expose sensitive info in errors

### Performance
- Use React Server Components where possible
- Lazy load heavy components
- Optimize Firestore queries (limit, indexes)
- Stream AI responses for better UX

### Security
- Never expose API keys in client code
- Validate all inputs on server side
- Check authentication on every API route
- Use HTTPS only in production

---

## Environment Variables Reference

### Required for Local Development
```env
# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Gemini API
GEMINI_API_KEY=your-gemini-api-key

# Firebase/Firestore
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="your-firebase-private-key"
FIREBASE_CLIENT_EMAIL=your-firebase-client-email

# Admin
ADMIN_EMAIL=archeryue7@gmail.com
```

### Required for Production
Same as above, but:
- NEXTAUTH_URL should be your Cloud Run URL
- NEXTAUTH_SECRET should be a strong random string
- Firebase credentials from service account JSON

---

## Testing Checklist

### Authentication
- [ ] Admin can log in
- [ ] Whitelisted user can log in
- [ ] Non-whitelisted user sees access denied
- [ ] Logout works
- [ ] Session persists on refresh

### Chat
- [ ] Can send messages
- [ ] Receives AI responses
- [ ] Streaming works smoothly
- [ ] Messages saved to database
- [ ] Can create new conversation
- [ ] Can switch conversations
- [ ] Can delete conversation
- [ ] Conversation titles auto-generated

### Admin Panel
- [ ] Admin can access /admin
- [ ] Non-admin redirected from /admin
- [ ] Can add email to whitelist
- [ ] Can remove email from whitelist
- [ ] User stats display correctly
- [ ] Message counts accurate

### UI/UX
- [ ] Loading states work
- [ ] Error messages display
- [ ] Empty states look good
- [ ] Markdown renders correctly
- [ ] Code blocks have syntax highlighting
- [ ] Keyboard shortcuts work

### Production
- [ ] Deploys successfully
- [ ] Environment variables set correctly
- [ ] Domain works (if custom domain)
- [ ] HTTPS enabled
- [ ] Costs within budget

---

## Next Steps After MVP

### Future Enhancements (Priority Order)
1. **Mobile responsive design**
   - Make UI work on phones/tablets
   - Touch-friendly interface

2. **Message search**
   - Search across all conversations
   - Full-text search in Firestore

3. **Conversation export**
   - Export as Markdown
   - Export as PDF

4. **Dark mode**
   - Toggle in settings
   - Persist preference

5. **Multi-model support**
   - Add OpenAI API option
   - Let users choose model

6. **File uploads**
   - Images
   - PDFs
   - Use Gemini vision capabilities

7. **Conversation sharing**
   - Share conversation with link
   - View-only mode

8. **Rate limiting per user**
   - Prevent abuse
   - Set limits in admin panel

9. **Cost tracking**
   - Track API costs per user
   - Show in admin panel

10. **Message reactions**
    - Like/dislike messages
    - Feedback for improvement

---

## Estimated Timeline

**Total**: 8 days for MVP

- Days 1-2: Setup, Firebase, Auth (25%)
- Days 3-4: Chat UI, Conversations (25%)
- Days 5-6: Admin panel, Polish (25%)
- Days 7-8: Testing, Deployment (25%)

**Working ~4-6 hours per day**

Ready to start coding whenever you are!
