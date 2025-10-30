# Quick Start Guide - Get Your API Keys

Your Gemini API key is already configured! ✅

You need **2 more things** before testing:

## 1. Firebase/Firestore Project (5 minutes)

### Step 1: Create Firebase Project
1. Go to: https://console.firebase.google.com/
2. Click **"Create a project"** (or use existing)
3. Project name: "ArcherChat" (or any name)
4. **Disable** Google Analytics (not needed)
5. Click "Create project"

### Step 2: Enable Firestore
1. In your Firebase project, click **"Firestore Database"** in left sidebar
2. Click **"Create database"**
3. Select **"Start in production mode"**
4. Choose location: **"us-central1"** (or nearest to you)
5. Click "Enable"

### Step 3: Get Service Account Key
1. Click the **gear icon** (⚙️) next to "Project Overview"
2. Click **"Project settings"**
3. Go to **"Service accounts"** tab
4. Click **"Generate new private key"**
5. Click **"Generate key"** in the popup
6. A JSON file will download - **keep it safe!**

### Step 4: Copy Values to .env.local
Open the downloaded JSON file and find:
- `project_id` → Copy to `FIREBASE_PROJECT_ID`
- `private_key` → Copy to `FIREBASE_PRIVATE_KEY` (keep the quotes!)
- `client_email` → Copy to `FIREBASE_CLIENT_EMAIL`

**Example:**
```env
FIREBASE_PROJECT_ID=archerchat-12345
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc@archerchat-12345.iam.gserviceaccount.com
```

---

## 2. Google OAuth Credentials (5 minutes)

### Step 1: Go to GCP Console
1. Go to: https://console.cloud.google.com/
2. If you created a Firebase project, it's already created in GCP!
3. Select your project from the dropdown at the top

### Step 2: Enable Google+ API
1. Go to: https://console.cloud.google.com/apis/library
2. Search for **"Google+ API"**
3. Click it and click **"Enable"**

### Step 3: Configure OAuth Consent Screen
1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Select **"External"** user type
3. Click **"Create"**
4. Fill in required fields:
   - App name: "ArcherChat"
   - User support email: archeryue7@gmail.com
   - Developer contact: archeryue7@gmail.com
5. Click **"Save and Continue"**
6. Skip "Scopes" (click "Save and Continue")
7. Add test user: **archeryue7@gmail.com**
8. Click **"Save and Continue"**

### Step 4: Create OAuth Credentials
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **"Create Credentials"** → **"OAuth 2.0 Client ID"**
3. Application type: **"Web application"**
4. Name: "ArcherChat Local"
5. Under **"Authorized redirect URIs"**, click "Add URI"
6. Add: `http://localhost:3000/api/auth/callback/google`
7. Click **"Create"**
8. A popup will show your **Client ID** and **Client Secret**

### Step 5: Copy to .env.local
Copy:
- **Client ID** → `GOOGLE_CLIENT_ID`
- **Client Secret** → `GOOGLE_CLIENT_SECRET`

**Example:**
```env
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
```

---

## 3. Install Dependencies & Run

Once you've updated `.env.local` with all the values:

```bash
# Install dependencies
cd /home/archer/ArcherChat
npm install

# Run development server
npm run dev
```

Open http://localhost:3000 and test!

---

## Troubleshooting

### "Firebase Admin error"
- Make sure `FIREBASE_PRIVATE_KEY` includes the `\n` characters
- Keep the quotes around the private key
- Make sure you copied the entire key from `-----BEGIN` to `-----END`

### "OAuth error: redirect_uri_mismatch"
- Check that you added `http://localhost:3000/api/auth/callback/google` exactly
- Make sure there are no extra spaces or trailing slashes

### "Access Denied" when logging in
- Make sure you added archeryue7@gmail.com as a test user in OAuth consent screen
- Or publish the OAuth app (change from "Testing" to "In production")

---

## Current Status

✅ Gemini API key configured
✅ NextAuth secret generated
✅ Admin email set
⏳ Firebase credentials needed
⏳ Google OAuth credentials needed

**Once you add Firebase and OAuth credentials, you're ready to test!**
