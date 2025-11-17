# ArcherChat Deployment Guide

This guide covers deploying ArcherChat to Google Cloud Run for production use.

## 🔴 CRITICAL: Production URL & Authentication

**Production URL**: `https://archerchat-697285727061.us-central1.run.app`

### ⚠️ Dual URL Issue (MUST READ)
Google Cloud Run automatically creates TWO URLs for your service:
1. **Project-based URL**: `https://archerchat-697285727061.us-central1.run.app` ✅ (ACTIVE)
2. **Generated URL**: `https://archerchat-er7tpljqpa-uc.a.run.app` (alternate)

**CRITICAL FOR AUTHENTICATION**:
- NEXTAUTH_URL **MUST** match your Google OAuth redirect URL
- Current configuration: `https://archerchat-697285727061.us-central1.run.app`
- If URLs don't match, authentication will fail on first attempt!
- Always use the same URL consistently throughout your application

## Prerequisites

- Google Cloud Platform account with billing enabled
- Docker installed locally (for local testing)
- gcloud CLI installed and configured
- Firebase project set up with Firestore
- Google OAuth credentials configured
- Project ID: `archerchat-3d462`

## Cost Overview

**Estimated monthly cost for family use: $8-18**

- Cloud Run: $5-10/month (with min-instances=0 for cost optimization)
- Gemini API: $2-5/month (tiered models, uses free tier first)
- Firestore: FREE tier (generous limits for personal/family use)
- Google Custom Search: FREE (within 100 queries/day)
- Artifact Registry: $0.10/GB storage + network egress
- Total: Well within $30/month budget

## Quick Deployment (Recommended)

### Using Cloud Build (Simplest Method)

```bash
# 1. Test locally first
npm run build   # Catch TypeScript errors
npx jest        # Ensure all tests pass

# 2. Deploy using Cloud Build
gcloud builds submit --config cloudbuild.yaml --project=archerchat-3d462

# 3. Deploy the built image to Cloud Run
gcloud run deploy archerchat \
  --image us-central1-docker.pkg.dev/archerchat-3d462/cloud-run-source-deploy/archerchat:latest \
  --region us-central1 \
  --project archerchat-3d462

# 4. Update traffic routing (if needed)
gcloud run services update-traffic archerchat \
  --to-revisions=REVISION_NAME=100 \
  --region=us-central1 \
  --project=archerchat-3d462
```

## Detailed Deployment Steps

### 1. Prerequisites Setup

```bash
# Verify gcloud is installed and configured
gcloud --version
gcloud config get-value project  # Should show: archerchat-3d462

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 2. Prepare Environment Variables

**IMPORTANT**: Get your actual credentials from the `.env.local` file in the project root!

```bash
# Check if .env.local exists and has your credentials
cat .env.local

# The file should contain (DO NOT COMMIT TO GIT):
# NEXTAUTH_URL=http://localhost:8080  # Default dev port is 8080
# NEXTAUTH_SECRET=your-actual-secret-from-env-local
# GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-actual-client-secret
# GEMINI_API_KEY=your-actual-api-key
# FIREBASE_PROJECT_ID=your-project-id
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nactual-key\n-----END PRIVATE KEY-----\n"
# FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
# ADMIN_EMAIL=your-admin-email@example.com
# GOOGLE_SEARCH_API_KEY=your-search-api-key
# GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id
```

**⚠️ CRITICAL STEPS**:
1. **ALWAYS** use the actual values from `.env.local` file when deploying
2. **NEVER** commit `.env.local` to Git (ensure it's in `.gitignore`)
3. **ALWAYS** keep a backup of your `.env.local` file in a secure location

### 4. Test Docker Build Locally (Optional but Recommended)

```bash
# Build Docker image
docker build -t archerchat-test .

# Test locally
docker run --env-file .env.local -p 3000:3000 archerchat-test
```

### 5. Build AMD64 Docker Image

Cloud Run requires AMD64 architecture. Use Docker buildx to build for the correct platform:

```bash
# Create buildx builder (one-time setup)
docker buildx create --use --name multiarch --driver docker-container

# Build AMD64 image
docker buildx build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cloud-run-source-deploy/archerchat:latest \
  --load .
```

### 6. Push Image to Artifact Registry

```bash
# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet

# Remove credential helper from Docker config if it causes issues
# Edit ~/.docker/config.json and set it to: {}

# Authenticate Docker with Artifact Registry
gcloud auth print-access-token | docker login -u oauth2accesstoken \
  --password-stdin https://us-central1-docker.pkg.dev

# Push the image
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cloud-run-source-deploy/archerchat:latest
```

### 7. Deploy to Cloud Run

**⚠️ FIRST**: Get all credential values from your `.env.local` file!

```bash
# View your credentials (DO NOT share this output!)
cat .env.local
```

Deploy with cost-optimized settings (replace with YOUR actual values from .env.local):

```bash
gcloud run deploy archerchat \
  --image us-central1-docker.pkg.dev/archerchat-3d462/cloud-run-source-deploy/archerchat:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "NEXTAUTH_SECRET=[FROM_ENV_LOCAL],GOOGLE_CLIENT_ID=[FROM_ENV_LOCAL],GOOGLE_CLIENT_SECRET=[FROM_ENV_LOCAL],GEMINI_API_KEY=[FROM_ENV_LOCAL],FIREBASE_PROJECT_ID=[FROM_ENV_LOCAL],FIREBASE_CLIENT_EMAIL=[FROM_ENV_LOCAL],ADMIN_EMAIL=[FROM_ENV_LOCAL],GOOGLE_SEARCH_API_KEY=[FROM_ENV_LOCAL],GOOGLE_SEARCH_ENGINE_ID=[FROM_ENV_LOCAL]" \
  --project archerchat-3d462
```

**Note**: The FIREBASE_PRIVATE_KEY needs special handling. Create a script to properly format it:

```bash
#!/bin/bash
# update_firebase_key.sh

FIREBASE_PRIVATE_KEY=$(grep FIREBASE_PRIVATE_KEY .env.local | cut -d '=' -f2- | sed 's/\\n/\n/g' | tr -d '"')

gcloud run services update archerchat \
  --region us-central1 \
  --update-env-vars "FIREBASE_PRIVATE_KEY=${FIREBASE_PRIVATE_KEY}" \
  --project YOUR_PROJECT_ID
```

### 8. ⚠️ CRITICAL: Configure Google OAuth & NEXTAUTH_URL

**Your production URL**: `https://archerchat-697285727061.us-central1.run.app`

#### Google OAuth Configuration
1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials?project=archerchat-3d462)
2. Select your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", ensure you have:
   ```
   https://archerchat-697285727061.us-central1.run.app/api/auth/callback/google
   ```
4. Remove any incorrect URLs
5. Click "Save"

#### Update NEXTAUTH_URL (Must Match OAuth)

```bash
# Update NEXTAUTH_URL to match your OAuth redirect URL
gcloud run services update archerchat \
  --region us-central1 \
  --update-env-vars "NEXTAUTH_URL=https://archerchat-697285727061.us-central1.run.app" \
  --project archerchat-3d462
```

**⚠️ WARNING**: If NEXTAUTH_URL doesn't match your OAuth redirect URL, authentication will fail!

### 10. Setup Billing Alerts (Recommended)

1. Go to [GCP Billing Budgets](https://console.cloud.google.com/billing/budgets)
2. Click "Create Budget"
3. Set up alerts at:
   - Budget 1: $20/month with thresholds at 50%, 90%, 100%
   - Budget 2: $30/month with thresholds at 50%, 90%, 100%
4. Add your email for notifications

## Architecture Details

### Cloud Run Configuration

- **Region**: us-central1 (cheapest region)
- **Memory**: 512Mi (sufficient for Next.js app)
- **CPU**: 1 vCPU
- **Min instances**: 0 (scales to zero when idle - no charges)
- **Max instances**: 2 (prevents runaway costs)
- **Timeout**: 300 seconds
- **Port**: 3000

### Docker Multi-stage Build

The Dockerfile uses a multi-stage build to optimize image size:
1. **deps stage**: Install dependencies
2. **builder stage**: Build Next.js application
3. **runner stage**: Run the production build

## Updating the Deployment

When you make code changes:

```bash
# 1. Build new image
docker buildx build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cloud-run-source-deploy/archerchat:latest \
  --load .

# 2. Push to Artifact Registry
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cloud-run-source-deploy/archerchat:latest

# 3. Deploy new revision
gcloud run deploy archerchat \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cloud-run-source-deploy/archerchat:latest \
  --region us-central1 \
  --project YOUR_PROJECT_ID
```

## Monitoring and Logs

View Cloud Run logs:

```bash
# Recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=archerchat" \
  --limit=50 --project YOUR_PROJECT_ID

# Error logs only
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=archerchat AND severity>=ERROR" \
  --limit=20 --project YOUR_PROJECT_ID
```

## Managing Users

1. Visit `https://your-cloud-run-url.run.app/admin`
2. Sign in with your admin email (specified in ADMIN_EMAIL env var)
3. Add family members' email addresses to the whitelist

## Troubleshooting

### Authentication Issues (First Login Fails, Second Works)

**Cause**: NEXTAUTH_URL doesn't match the URL you're accessing from

**Problem**: Google Cloud Run creates two URLs for your service:
- `https://archerchat-697285727061.us-central1.run.app` (project-based)
- `https://archerchat-er7tpljqpa-uc.a.run.app` (generated)

**Solution**:
1. Check which URL is configured in Google OAuth redirect URIs
2. Update NEXTAUTH_URL to match that exact URL:
   ```bash
   gcloud run services update archerchat \
     --region us-central1 \
     --update-env-vars "NEXTAUTH_URL=https://archerchat-697285727061.us-central1.run.app" \
     --project archerchat-3d462
   ```
3. Always access the application using the same URL

### Error: "State cookie was missing" or "state mismatch"

**Cause**: URL mismatch between where you start login and where OAuth redirects

**Solution**: Ensure you're consistently using the same URL throughout the authentication flow

### Error: "exec format error"

**Cause**: Docker image built for wrong architecture (ARM64 instead of AMD64)

**Solution**: Use Cloud Build which automatically builds for the correct architecture

### Error: "DECODER routines::unsupported" during login

**Cause**: Firebase private key has escaped newlines (`\n`) instead of actual newlines

**Solution**: Update the Firebase private key with proper newlines using the update script

### Error: "OAuth callback error"

**Cause**: OAuth redirect URI not configured or NEXTAUTH_URL incorrect

**Solution**:
1. Verify OAuth redirect URIs include production URL
2. Ensure NEXTAUTH_URL matches the actual Cloud Run URL (no trailing slash)
3. Use the project-based URL: `https://archerchat-697285727061.us-central1.run.app`

### Container fails to start

Check logs:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=archerchat AND severity>=ERROR" \
  --limit=20 --project YOUR_PROJECT_ID --format="table(timestamp,textPayload)"
```

## Security Checklist

- [ ] `.env.local` is in `.gitignore`
- [ ] No credentials committed to GitHub
- [ ] OAuth redirect URIs restricted to production domains
- [ ] Firestore security rules configured properly
- [ ] Admin email is correct in environment variables
- [ ] Billing alerts are set up
- [ ] Only whitelisted users can access the application

## Cost Optimization Tips

1. **Use min-instances=0**: Service scales to zero when not in use
2. **Limit max-instances**: Prevents unexpected scaling costs
3. **Choose cheapest region**: us-central1 is typically the most affordable
4. **Use FREE tier services**: Firestore FREE tier is generous for family use
5. **Monitor usage**: Set up billing alerts to avoid surprises
6. **Tiered models**: Gemini 2.5 Flash-Lite for background tasks (25% cheaper)
7. **Memory budget**: 500-token limit keeps costs predictable

## Testing New Features

After deployment, test these key features:

### Memory System
1. Start a conversation and mention personal info:
   ```
   "Hi! My name is Archer, I'm a software engineer.
   I prefer TypeScript and I'm working on AI projects."
   ```
2. Chat for 5+ messages over 2+ minutes
3. Visit `/profile` to see extracted memory facts
4. Start a new conversation and verify AI remembers your preferences
5. Test deleting individual facts and clearing all memory

### Image Generation
1. Trigger in English: `"create an image of a sunset over mountains"`
2. Trigger in Chinese: `"生成一幅图片，描绘星空"`
3. Verify inline image display in chat
4. Test fallback behavior if generation fails

### File Attachments
1. Upload an image and ask the AI to describe it
2. Upload a PDF and ask questions about its content
3. Verify multimodal processing works correctly

### Bilingual Support
1. Test memory triggers in both languages
2. Test image keywords in both languages
3. Verify language preference detection

## Production Checklist

Before going live:

- [ ] Test Docker build locally
- [ ] All environment variables configured
- [ ] OAuth redirect URIs updated
- [ ] NEXTAUTH_URL set to production URL
- [ ] Firebase private key properly formatted
- [ ] Billing alerts configured
- [ ] Initial users added to whitelist
- [ ] Test login and chat functionality
- [ ] Test memory system (automatic extraction, profile page)
- [ ] Test image generation feature (bilingual keywords)
- [ ] Test file attachments (images, PDFs)
- [ ] Test prompt management (admin panel)
- [ ] Verify tiered model configuration (2.5 Flash, Image, Lite)
- [ ] Monitor logs for errors
- [ ] Check Firestore security rules

## Support

For issues or questions:
- Check logs in Google Cloud Console
- Review Firestore security rules
- Verify all environment variables are set correctly
- Test authentication flow with whitelisted email

## License

This deployment guide is part of the ArcherChat project.
