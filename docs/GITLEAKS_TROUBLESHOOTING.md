# Gitleaks Secret Scanning - Troubleshooting Guide

**Last Updated**: 2025-11-03 (After extensive testing)

This guide documents common issues with Gitleaks and how to fix them, based on real troubleshooting experience.

---

## Quick Checklist

If Gitleaks is not detecting secrets, check these first:

- [ ] Config file is named `gitleaks.toml` (NOT `.gitleaks.toml`)
- [ ] Config file is in repository root
- [ ] Secret matches the regex pattern exactly (check character count!)
- [ ] Secret is in a file that was CHANGED in the commit being scanned
- [ ] Secret doesn't match any allowlist patterns

---

## Common Issues and Solutions

### Issue 1: Gitleaks Not Using Custom Config

**Symptom**: Gitleaks passes but should detect secrets

**Cause**: Config file is not being detected

**Solutions**:

1. **File Name Must Be Exact**
   - ✅ Correct: `gitleaks.toml`
   - ❌ Wrong: `.gitleaks.toml`
   - ❌ Wrong: `gitleaks.toml.example`
   - ❌ Wrong: `.github/gitleaks.toml`

2. **File Must Be in Repository Root**
   ```
   WhimCraft/
   ├── gitleaks.toml          ✅ Correct location
   ├── .github/
   │   └── gitleaks.toml      ❌ Wrong location
   └── config/
       └── gitleaks.toml      ❌ Wrong location
   ```

3. **GitHub Action Configuration**
   ```yaml
   # gitleaks-action@v2 auto-detects gitleaks.toml
   - name: Run Gitleaks
     uses: gitleaks/gitleaks-action@v2
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
       GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
       # No GITLEAKS_CONFIG needed if using gitleaks.toml in root
   ```

---

### Issue 2: Regex Not Matching Secrets

**Symptom**: Known secrets pass through Gitleaks

**Cause**: Regex pattern doesn't match the actual format

**Example: Google API Keys**

Google API keys have the format: `AIza` + exactly 35 more characters = **39 total**

```toml
# ❌ WRONG - Will miss keys that are 38 or 40 chars
[[rules]]
regex = '''AIza[0-9A-Za-z-_]+'''

# ✅ CORRECT - Requires exactly 39 characters
[[rules]]
regex = '''AIza[0-9A-Za-z-_]{35}'''
```

**Testing Your Regex**:
```bash
# Fake key format: AIza + 35 more characters = 39 total
# Example pattern: AIzaSy + 33 random chars
# DO NOT include actual fake keys in docs - Gitleaks will catch them!

# To test, create a temporary test file with a properly formatted fake key
echo 'const key = "AIza' + 'Sy' + 'FAKE_KEY_HERE_33_CHARS_TOTAL"' > test.js
```

**Real Examples**:
- Google API Key: `AIza` + 35 chars = 39 total
- Firebase Private Key: Multi-line, starts with `-----BEGIN PRIVATE KEY-----`
- OAuth Secret: `GOCSPX-` + 28 chars = 35 total
- NextAuth Secret: Base64, typically 32+ characters

---

### Issue 3: Secrets Not Being Scanned

**Symptom**: Gitleaks always passes, even with obvious secrets

**Cause**: Gitleaks only scans **files changed in the commit**, not all files

**Understanding Gitleaks Behavior**:

```bash
# Commit 1: Add file with secret
git add secret-file.js
git commit -m "Add config"
# ✅ Gitleaks scans secret-file.js

# Commit 2: Change unrelated file
git add README.md
git commit -m "Update docs"
# ❌ Gitleaks does NOT scan secret-file.js (not changed in this commit)
```

**Solution**: If testing, make sure the secret is in a file that's part of the commit:

```bash
# To trigger secret detection, modify the file with the secret
echo "// test" >> secret-file.js
git add secret-file.js
git commit -m "Test secret detection"
# ✅ Now Gitleaks will scan secret-file.js
```

---

### Issue 4: Allowlist False Positives

**Symptom**: Secrets are ignored unexpectedly

**Cause**: Allowlist patterns are too broad

**Example from our config**:

```toml
[allowlist]
paths = [
    '''.env.local.example''',  # Specific file - good
]

regexes = [
    '''example''',  # ❌ TOO BROAD - ignores ANY file containing "example"
]
```

**Problem**: A file named `test-secret.env.example` or containing text like "for example" will be ignored!

**Better Allowlist**:

```toml
[allowlist]
# Whitelist specific file paths only
paths = [
    '''.env.local.example$''',      # Only exact file
    '''docs/.*\.md$''',              # Documentation only
    '''.github/workflows/.*\.yml$''', # Workflow files
]

# Use specific placeholder patterns
regexes = [
    '''(your-api-key-here|PLACEHOLDER|REDACTED|<insert-key>)''',
]
```

---

### Issue 5: CI Passes But Secrets Exist in History

**Symptom**: Old secrets exist in git history but CI passes

**Cause**: Gitleaks only scans new commits by default

**Solution**: Scan entire history periodically

```yaml
# Add to .github/workflows/security-audit.yml
name: Full History Secret Scan

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:      # Manual trigger

jobs:
  scan-history:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history

      - name: Scan All History
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Testing Gitleaks Configuration

### Step 1: Create a Test Branch

```bash
git checkout -b test-gitleaks
```

### Step 2: Add a Fake Secret

Create `test-secret.js` with a properly formatted fake key:

```javascript
// Create a fake Google API key (39 chars total: AIza + 35 more)
// Format: "AIza" + "Sy" + random 33 alphanumeric characters
const apiKey = "AIza" + "Sy" + "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
// Replace the X's with random letters/numbers/dashes/underscores
```

**Important**: Make sure the fake key:
- Matches your regex pattern exactly (39 characters total)
- Has correct character count
- Doesn't contain allowlist keywords
- Is actually formatted to trigger Gitleaks (don't use placeholder X's)

### Step 3: Commit and Push

```bash
git add test-secret.js
git commit -m "Test: Add fake secret to verify Gitleaks"
git push origin test-gitleaks
```

### Step 4: Check CI Results

Go to: `https://github.com/YOUR_REPO/actions`

**Expected Result**:
- 🔴 Secret Scanning: **FAILURE** (detected the fake key)
- View logs to see: "Secret detected in test-secret.js"

**If it passes**: Review this troubleshooting guide!

### Step 5: Clean Up

```bash
git checkout main
git branch -D test-gitleaks
git push origin --delete test-gitleaks
```

---

## Debugging Tips

### View Gitleaks Configuration

Check if your config is valid:

```bash
# Install gitleaks locally
brew install gitleaks  # macOS
# OR download from: https://github.com/gitleaks/gitleaks/releases

# Test config file
gitleaks detect --config gitleaks.toml --verbose

# Scan specific file
gitleaks detect --config gitleaks.toml --source test-file.js
```

### Check Regex Patterns

Use online regex testers:
- https://regex101.com/ (select "Golang" flavor)
- Test your pattern against real API key formats

### View CI Logs

1. Go to GitHub Actions run
2. Click on "Secret Scanning" job
3. Expand "Run Gitleaks" step
4. Look for:
   - "Loading config from gitleaks.toml" ✅
   - "X leaks detected" or "No leaks detected"

---

## Our Configuration

Current working configuration in `gitleaks.toml`:

```toml
title = "WhimCraft Gitleaks Configuration"

[extend]
useDefault = true  # Use Gitleaks built-in rules + our custom ones

# Custom rule for Google API keys
[[rules]]
id = "google-api-key"
description = "Google API Key (Gemini, Search, etc.)"
regex = '''AIza[0-9A-Za-z-_]{35}'''  # Exactly 39 chars total
keywords = ["AIza"]

# Allow specific files only
[allowlist]
paths = [
    '''.env.local.example''',
]
```

**Tested and verified**: ✅ Detects 39-character Google API keys

---

## Prevention Best Practices

1. **Never commit secrets to git** - Use environment variables
2. **Use .gitignore** - Add `.env`, `.env.local` before first commit
3. **Rotate immediately if exposed** - Assume public once committed
4. **Test Gitleaks regularly** - Use fake secrets to verify it works
5. **Review PRs carefully** - Don't rely solely on automation

---

## Resources

- [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
- [Gitleaks Action](https://github.com/gitleaks/gitleaks-action)
- [Regex Testing](https://regex101.com/)
- [Google API Key Format](https://cloud.google.com/docs/authentication/api-keys)

---

**Remember**: Gitleaks is a safety net, not a replacement for good security practices!
