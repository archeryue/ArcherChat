# Testing Checklist for WhimCraft

## Pre-Testing Setup

- [ ] All environment variables set in `.env.local`
- [ ] Firebase project created and configured
- [ ] Google OAuth credentials configured
- [ ] Gemini API key obtained
- [ ] Dependencies installed (`npm install`)
- [ ] Dev server starts without errors (`npm run dev`)

## Authentication Tests

### Admin Login
- [ ] Admin email (archeryue7@gmail.com) can log in
- [ ] Admin is automatically whitelisted
- [ ] Admin can access /admin page
- [ ] Admin session persists on page refresh

### Non-Whitelisted User
- [ ] Non-whitelisted user sees "Access Denied" message
- [ ] Error message displays correctly
- [ ] User cannot access chat or admin pages

### Whitelisted User (After Admin Adds)
- [ ] Whitelisted user can log in successfully
- [ ] User can access chat page
- [ ] User cannot access admin page
- [ ] Logout works correctly

## Chat Functionality

### Basic Chat
- [ ] Can send a message
- [ ] AI responds with streaming
- [ ] User messages display correctly
- [ ] AI messages display correctly
- [ ] Markdown rendering works (try **bold**, *italic*, `code`)
- [ ] Code blocks with syntax highlighting work

### Message Handling
- [ ] Long messages display correctly
- [ ] Empty messages are not sent
- [ ] Input is disabled while waiting for response
- [ ] Enter key sends message
- [ ] Shift+Enter creates new line
- [ ] Messages auto-scroll to bottom

### Error Handling
- [ ] Graceful error if Gemini API fails
- [ ] Network error handling
- [ ] Error messages display to user

## Conversation Management

### Conversation List
- [ ] New conversation created on first visit
- [ ] Conversations appear in sidebar
- [ ] Conversation titles auto-generate from first message
- [ ] Active conversation is highlighted
- [ ] Can switch between conversations
- [ ] Messages load correctly when switching

### Conversation Actions
- [ ] "New Chat" button creates new conversation
- [ ] Old messages preserved when switching
- [ ] Can delete a conversation
- [ ] Deletion requires confirmation
- [ ] After deleting active conversation, new one is created
- [ ] Conversations sorted by most recent

## Admin Panel

### Access Control
- [ ] Only admin can access /admin
- [ ] Non-admin redirected to /chat
- [ ] "Admin Panel" link appears in sidebar for admin only

### Whitelist Management
- [ ] Can view all whitelisted emails
- [ ] Can add new email to whitelist
- [ ] Email validation works (rejects invalid emails)
- [ ] Cannot add duplicate email
- [ ] Can remove email from whitelist
- [ ] Cannot remove admin email
- [ ] Removal requires confirmation

### User Statistics
- [ ] Can view all users
- [ ] User names display correctly
- [ ] Message counts are accurate
- [ ] Last active time displays correctly
- [ ] Total users count is correct
- [ ] Total messages count is correct

## UI/UX

### Loading States
- [ ] Loading spinner shows while authenticating
- [ ] Loading state shows while creating conversation
- [ ] Loading state shows while sending message
- [ ] Loading state shows in admin panel

### Empty States
- [ ] Empty state shows when no messages
- [ ] Empty state shows when no conversations
- [ ] Empty state shows when no whitelist entries
- [ ] Empty state shows when no users

### Responsive Behavior
- [ ] Textarea auto-resizes with content
- [ ] Long conversation titles truncate
- [ ] Long emails truncate in tables
- [ ] Sidebar scrolls when many conversations

### Visual Polish
- [ ] User avatars display (Google profile pic)
- [ ] AI avatar displays
- [ ] Hover states work on buttons
- [ ] Focus states work on inputs
- [ ] Colors and spacing consistent

## Edge Cases

### Authentication
- [ ] Session expires gracefully
- [ ] Refresh token works
- [ ] Multiple tabs stay in sync

### Chat
- [ ] Very long messages (1000+ chars) work
- [ ] Special characters in messages work
- [ ] Code with backticks renders correctly
- [ ] Multiple consecutive messages work

### Conversations
- [ ] Can handle 50+ conversations
- [ ] Can handle 100+ messages in a conversation
- [ ] Conversation with only user messages (no AI response)

### Admin
- [ ] Adding email with spaces (should trim)
- [ ] Adding email with uppercase (should normalize)
- [ ] Viewing stats with 0 messages

## Performance

- [ ] Initial page load < 3 seconds
- [ ] Conversation switch < 1 second
- [ ] Message send/response feels instant
- [ ] No memory leaks (check dev tools)
- [ ] No console errors in browser

## Data Persistence

- [ ] Messages saved to Firestore
- [ ] Conversations persist after logout/login
- [ ] Whitelist persists
- [ ] User stats update correctly

## Security

- [ ] Cannot access API without authentication
- [ ] Cannot access other users' conversations
- [ ] Cannot access admin endpoints without admin role
- [ ] Environment variables not exposed to client
- [ ] No sensitive data in browser console

## Browser Compatibility

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)

## Memory System

### Automatic Extraction
- [ ] Chat for 5+ messages over 2+ minutes
- [ ] Memory facts automatically extracted
- [ ] Facts appear in /profile page
- [ ] Facts categorized correctly (PROFILE, PREFERENCE, TECHNICAL, PROJECT)
- [ ] Facts assigned correct tier (CORE, IMPORTANT, CONTEXT)
- [ ] Confidence scores ≥ 0.6

### Keyword Triggers (English)
- [ ] "remember that" triggers immediate extraction
- [ ] "my name is" triggers immediate extraction
- [ ] "i prefer" triggers immediate extraction
- [ ] "don't forget" triggers immediate extraction

### Keyword Triggers (Chinese)
- [ ] "记住" triggers immediate extraction
- [ ] "我叫" triggers immediate extraction
- [ ] "我喜欢" triggers immediate extraction
- [ ] "别忘了" triggers immediate extraction

### Memory Profile Page
- [ ] Can access /profile page
- [ ] All memory facts displayed
- [ ] Facts grouped by category
- [ ] Can delete individual facts
- [ ] Can clear all memory
- [ ] Deletion requires confirmation
- [ ] Stats display correctly (total facts, token usage)
- [ ] Language preference shown

### Memory Integration
- [ ] AI references memory in responses
- [ ] Memory context loaded into chat
- [ ] New facts don't duplicate existing ones
- [ ] Old/low-value facts cleaned up automatically
- [ ] Memory budget stays under 500 tokens

## Image Generation

### English Triggers
- [ ] "create an image" generates image
- [ ] "draw a picture" generates image
- [ ] "generate an image" generates image
- [ ] "make an image" generates image

### Chinese Triggers
- [ ] "生成图片" generates image
- [ ] "画一幅图" generates image
- [ ] "创建图像" generates image
- [ ] "制作图片" generates image

### Image Display
- [ ] Generated images display inline in chat
- [ ] Images have proper formatting
- [ ] Image URLs are valid
- [ ] Fallback text shown if generation fails

### Model Switching
- [ ] System automatically uses gemini-2.5-flash-image for generation
- [ ] Regular chat continues with main model after image

## File Attachments

### File Upload
- [ ] Can upload images (PNG, JPG, GIF, WebP)
- [ ] Can upload PDFs
- [ ] File size validation works
- [ ] Upload button visible and functional
- [ ] Multiple files can be attached

### File Processing
- [ ] AI can analyze uploaded images
- [ ] AI can discuss PDF contents
- [ ] File metadata stored correctly
- [ ] Base64 data not persisted to Firestore
- [ ] Thumbnails display for images

### File Display
- [ ] Attached files show in message
- [ ] File names display correctly
- [ ] File types indicated properly

## Bilingual Support

### Keyword Detection
- [ ] English keywords detected correctly
- [ ] Chinese keywords detected correctly
- [ ] Mixed language messages handled
- [ ] Word boundary matching works
- [ ] Case insensitive matching (English)

### Language Preference
- [ ] Language auto-detected from conversation
- [ ] Preference stored in memory
- [ ] Three modes work: english, chinese, hybrid
- [ ] AI adapts response style to preference

## Prompt Management (Admin)

### Prompt Configuration
- [ ] Can view current active prompt
- [ ] Can edit system prompt text
- [ ] Can change temperature setting
- [ ] Can create new prompt configuration
- [ ] Can toggle active/inactive

### Prompt Updates
- [ ] Changes save to Firestore
- [ ] Only one prompt can be active
- [ ] New conversations use updated prompt
- [ ] Reset to default works
- [ ] Changes apply immediately

## Provider Abstraction

### Gemini Provider
- [ ] Chat responses stream correctly
- [ ] Image generation works
- [ ] File attachments processed
- [ ] Error handling graceful
- [ ] Model selection automatic

## Known Limitations (Document, Not Fix)

- Mobile not optimized (by design)
- Dark mode not available (by design)
- Only Gemini provider currently (extensible for future)
- No message search (future feature)
- No conversation export (future feature)

## Bug Fixes Applied

Document any bugs found and fixed here:

1.

---

## Test Results

**Date Tested**: _________________

**Tested By**: _________________

**Overall Status**: ⬜ Pass / ⬜ Fail

**Notes**:
