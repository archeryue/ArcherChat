# Testing Checklist for ArcherChat

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

## Known Limitations (Document, Not Fix)

- Mobile not optimized (by design)
- Dark mode not available (by design)
- Single AI model only (future feature)
- No file uploads (future feature)
- No message search (future feature)

## Bug Fixes Applied

Document any bugs found and fixed here:

1.

---

## Test Results

**Date Tested**: _________________

**Tested By**: _________________

**Overall Status**: ⬜ Pass / ⬜ Fail

**Notes**:
