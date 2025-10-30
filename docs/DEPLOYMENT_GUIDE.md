# Deployment Guide - ArcherChat to Google Cloud Run

This guide walks you through deploying ArcherChat to Google Cloud Platform (GCP) using Cloud Run.

## Prerequisites

- GCP account with billing enabled
- `gcloud` CLI installed ([Install Guide](https://cloud.google.com/sdk/docs/install))
- Docker installed on your local machine
- Completed local testing

## Cost Estimate

**Expected monthly cost: $8-18 for family use (5-10 users, ~1000 messages/month)**

- Cloud Run: $5-10/month
- Firestore: FREE (within free tier)
- Gemini API: $2-5/month

## Step 1: Setup GCP Project

### 1.1 Create New Project

\`\`\`bash
# Set project name
export PROJECT_ID="archerchat-prod"

# Create project
gcloud projects create $PROJECT_ID

# Set as current project
gcloud config set project $PROJECT_ID

# Link billing account (replace with your billing account ID)
gcloud billing projects link $PROJECT_ID --billing-account=YOUR_BILLING_ACCOUNT_ID
\`\`\`

### 1.2 Enable Required APIs

\`\`\`bash
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
\`\`\`

## Step 2: Setup Firestore

### 2.1 Create Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and select your GCP project
3. Enable Firestore in **Native mode**
4. Choose region (e.g., `us-central1`)

### 2.2 Create Service Account

\`\`\`bash
# Create service account
gcloud iam service-accounts create archerchat-sa \
  --display-name="ArcherChat Service Account"

# Grant Firestore access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:archerchat-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# Create and download key
gcloud iam service-accounts keys create firebase-key.json \
  --iam-account=archerchat-sa@$PROJECT_ID.iam.gserviceaccount.com
\`\`\`

**Important**: Keep `firebase-key.json` secure and never commit to git!

## Step 3: Setup Google OAuth

### 3.1 Create OAuth Credentials

1. Go to [GCP Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Configure OAuth consent screen if needed
4. Application type: **Web application**
5. Name: "ArcherChat Production"
6. Add authorized redirect URI:
   - You'll add the Cloud Run URL here after deployment
   - Format: `https://YOUR_CLOUD_RUN_URL/api/auth/callback/google`
7. Click "Create" and save Client ID and Client Secret

## Step 4: Get Gemini API Key

1. Go to [https://ai.google.dev/](https://ai.google.dev/)
2. Click "Get API Key"
3. Create new API key (or use existing)
4. Copy the API key

## Step 5: Prepare Environment Variables

Create a file `env.yaml` with your production environment variables:

\`\`\`yaml
NEXTAUTH_URL: "https://YOUR_CLOUD_RUN_URL"  # Will update after first deployment
NEXTAUTH_SECRET: "GENERATE_A_LONG_RANDOM_STRING_HERE"
GOOGLE_CLIENT_ID: "your-google-client-id"
GOOGLE_CLIENT_SECRET: "your-google-client-secret"
GEMINI_API_KEY: "your-gemini-api-key"
FIREBASE_PROJECT_ID: "archerchat-prod"
FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL: "archerchat-sa@archerchat-prod.iam.gserviceaccount.com"
ADMIN_EMAIL: "archeryue7@gmail.com"
\`\`\`

**Generate NEXTAUTH_SECRET**:
\`\`\`bash
openssl rand -base64 32
\`\`\`

**Get Firebase values from `firebase-key.json`**:
- `FIREBASE_PROJECT_ID` → `project_id`
- `FIREBASE_PRIVATE_KEY` → `private_key` (keep the \n characters)
- `FIREBASE_CLIENT_EMAIL` → `client_email`

## Step 6: Build and Push Docker Image

### 6.1 Build Docker Image

\`\`\`bash
# Build image
docker build -t gcr.io/$PROJECT_ID/archerchat:latest .

# Test locally (optional)
docker run -p 3000:3000 --env-file .env.local gcr.io/$PROJECT_ID/archerchat:latest
\`\`\`

### 6.2 Push to Google Container Registry

\`\`\`bash
# Configure Docker for GCR
gcloud auth configure-docker

# Push image
docker push gcr.io/$PROJECT_ID/archerchat:latest
\`\`\`

## Step 7: Deploy to Cloud Run

### 7.1 Initial Deployment

\`\`\`bash
gcloud run deploy archerchat \
  --image gcr.io/$PROJECT_ID/archerchat:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --port 3000 \
  --env-vars-file env.yaml
\`\`\`

**Note**: The initial deployment will fail because `NEXTAUTH_URL` is not set correctly. Continue to next step.

### 7.2 Get Cloud Run URL

After deployment, you'll get a URL like:
\`\`\`
https://archerchat-xxxxx-uc.a.run.app
\`\`\`

### 7.3 Update Configuration

1. **Update `env.yaml`**:
   - Set `NEXTAUTH_URL` to your Cloud Run URL

2. **Update Google OAuth**:
   - Go back to OAuth credentials
   - Add authorized redirect URI:
     \`https://archerchat-xxxxx-uc.a.run.app/api/auth/callback/google\`

3. **Redeploy with correct URL**:
\`\`\`bash
gcloud run deploy archerchat \
  --image gcr.io/$PROJECT_ID/archerchat:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --port 3000 \
  --env-vars-file env.yaml
\`\`\`

## Step 8: Test Production Deployment

1. Open your Cloud Run URL
2. Click "Get Started"
3. Sign in with Google (archeryue7@gmail.com)
4. Verify chat works
5. Check admin panel
6. Add family members to whitelist

## Step 9: Setup Custom Domain (Optional)

### 9.1 Map Custom Domain

\`\`\`bash
gcloud run domain-mappings create \
  --service archerchat \
  --domain chat.yourdomain.com \
  --region us-central1
\`\`\`

### 9.2 Update DNS Records

Follow the instructions from the output to add DNS records.

### 9.3 Update Configuration

- Update `NEXTAUTH_URL` in env.yaml to your custom domain
- Update OAuth redirect URIs
- Redeploy

## Step 10: Setup Monitoring & Alerts

### 10.1 Setup Billing Alerts

1. Go to [Billing → Budgets & alerts](https://console.cloud.google.com/billing/budgets)
2. Create budget alert at $20/month
3. Create another at $30/month

### 10.2 Setup Error Alerts

Cloud Run automatically logs errors to Cloud Logging. You can setup alerts for:
- High error rates
- Slow response times
- Memory/CPU issues

## Maintenance

### Update Deployment

\`\`\`bash
# Build new image
docker build -t gcr.io/$PROJECT_ID/archerchat:latest .

# Push
docker push gcr.io/$PROJECT_ID/archerchat:latest

# Deploy
gcloud run deploy archerchat \
  --image gcr.io/$PROJECT_ID/archerchat:latest \
  --region us-central1
\`\`\`

### View Logs

\`\`\`bash
gcloud run logs tail archerchat --region us-central1
\`\`\`

### View Metrics

Go to [Cloud Run Console](https://console.cloud.google.com/run) to view:
- Request count
- Response times
- Error rates
- CPU/Memory usage

## Troubleshooting

### Deployment fails
- Check logs: `gcloud run logs tail archerchat --region us-central1`
- Verify all env vars are set correctly
- Make sure Firebase credentials are valid

### OAuth callback error
- Verify redirect URIs in Google OAuth settings
- Check that NEXTAUTH_URL matches your Cloud Run URL

### Database errors
- Check Firebase service account permissions
- Verify Firestore is enabled
- Check Firestore rules (should allow authenticated access)

### Cost exceeds budget
- Check Cloud Run request count
- Verify min instances is 0
- Check Gemini API usage
- Review Firestore read/write counts

## Security Checklist

- [ ] NEXTAUTH_SECRET is strong and random
- [ ] Firebase service account JSON not committed to git
- [ ] Environment variables stored securely (not in code)
- [ ] OAuth callback URLs configured correctly
- [ ] Firestore rules configured (admin SDK bypasses rules)
- [ ] HTTPS only (automatic with Cloud Run)
- [ ] Billing alerts setup

## Rollback

If something goes wrong:

\`\`\`bash
# List revisions
gcloud run revisions list --service archerchat --region us-central1

# Rollback to previous revision
gcloud run services update-traffic archerchat \
  --to-revisions REVISION_NAME=100 \
  --region us-central1
\`\`\`

## Cost Optimization Tips

1. Keep `min-instances` at 0 to scale to zero
2. Use Gemini Flash instead of Pro (4x cheaper)
3. Monitor Firestore read/write counts
4. Setup billing alerts
5. Review Cloud Run metrics monthly

## Support

For issues:
1. Check logs in Cloud Run console
2. Review Firestore data
3. Check environment variables
4. Verify OAuth configuration

---

**Deployment Date**: _________________

**Deployed By**: _________________

**Production URL**: _________________

**Status**: ⬜ Live / ⬜ Issues
