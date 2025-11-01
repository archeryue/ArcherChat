# ArcherChat Deployment Guide

This guide covers deploying ArcherChat to Google Cloud Run for production use.

## Prerequisites

- Google Cloud Platform account with billing enabled
- Docker installed locally
- gcloud CLI installed
- Firebase project set up with Firestore
- Google OAuth credentials configured

## Cost Overview

**Estimated monthly cost for family use: $5-15**

- Cloud Run: $5-10/month (with min-instances=0 for cost optimization)
- Firestore: FREE tier (generous limits for personal/family use)
- Artifact Registry: $0.10/GB storage + network egress
- Total: Well within $30/month budget

## Deployment Steps

### 1. Install Docker (WSL2)

```bash
# Install Docker on WSL2
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
```

### 2. Install and Configure gcloud CLI

```bash
# Install gcloud CLI (if not already installed)
# Follow instructions at: https://cloud.google.com/sdk/docs/install

# Initialize and authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 3. Prepare Environment Variables

Create a `.env.local` file in your project root with your credentials:

```bash
# .env.local (DO NOT COMMIT TO GIT)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GEMINI_API_KEY=your-gemini-api-key
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
ADMIN_EMAIL=your-admin-email@example.com
```

**IMPORTANT**: Ensure `.env.local` is in your `.gitignore` file!

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

Deploy with cost-optimized settings:

```bash
gcloud run deploy archerchat \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cloud-run-source-deploy/archerchat:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "NEXTAUTH_SECRET=your-secret,GOOGLE_CLIENT_ID=your-id,GOOGLE_CLIENT_SECRET=your-secret,GEMINI_API_KEY=your-key,FIREBASE_PROJECT_ID=your-project-id,FIREBASE_CLIENT_EMAIL=your-email,ADMIN_EMAIL=your-admin-email" \
  --project YOUR_PROJECT_ID
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

### 8. Update Google OAuth Settings

After deployment, you'll receive a Cloud Run URL like:
`https://archerchat-XXXXXXXXXX.us-central1.run.app`

1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   ```
   https://your-cloud-run-url.run.app/api/auth/callback/google
   ```
4. Click "Save"

### 9. Update NEXTAUTH_URL

Update the Cloud Run service with the production URL:

```bash
gcloud run services update archerchat \
  --region us-central1 \
  --update-env-vars "NEXTAUTH_URL=https://your-cloud-run-url.run.app" \
  --project YOUR_PROJECT_ID
```

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

### Error: "exec format error"

**Cause**: Docker image built for wrong architecture (ARM64 instead of AMD64)

**Solution**: Use `docker buildx build --platform linux/amd64` to build for the correct architecture

### Error: "DECODER routines::unsupported" during login

**Cause**: Firebase private key has escaped newlines (`\n`) instead of actual newlines

**Solution**: Use the script in step 7 to properly format the FIREBASE_PRIVATE_KEY

### Error: "OAuth callback error"

**Cause**: OAuth redirect URI not configured or NEXTAUTH_URL incorrect

**Solution**:
1. Verify OAuth redirect URIs include production URL
2. Ensure NEXTAUTH_URL matches the actual Cloud Run URL (no trailing slash)

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
