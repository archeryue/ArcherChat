# Branch Protection Setup Guide

**Status**: ✅ **ACTIVE and TESTED** on `main` branch (as of 2025-11-03)

This document explains how to enable branch protection rules on GitHub to enforce CI checks.

## Why Branch Protection?

Branch protection ensures:
- ✅ All tests must pass before merging
- ✅ No secrets can be committed (Gitleaks catches them)
- ✅ TypeScript builds successfully
- ✅ Code is linted and follows standards
- ✅ At least one reviewer approves changes (optional)

## ✅ Current Status

**Branch protection is ACTIVE on `main` and has been tested:**

✅ **Test 1: Secret Detection** - Successfully blocked commit with fake API key
✅ **Test 2: Direct Push Prevention** - Blocked direct push to `main`, required PR
✅ **Test 3: Failed Checks** - Prevented merge when checks failed

**Result**: Cannot merge to `main` unless all 5 CI checks pass!

## Setup Instructions

### 1. Go to Repository Settings

Navigate to: `https://github.com/archeryue/WhimCraft/settings/branches`

### 2. Add Branch Protection Rule

Click **"Add branch protection rule"**

### 3. Configure Protection for `main` branch

**Branch name pattern**: `main`

**Enable the following settings**:

#### Protect matching branches
- ✅ **Require a pull request before merging**
  - Require approvals: `1` (optional, can be 0 for solo projects)
  - Dismiss stale pull request approvals when new commits are pushed

- ✅ **Require status checks to pass before merging**
  - Require branches to be up to date before merging
  - **Add the following status checks** (these will appear after the first workflow run):
    - `Secret Scanning`
    - `ESLint`
    - `TypeScript Build`
    - `Jest Tests`
    - `NPM Security Audit`
    - `All Checks Passed`

- ✅ **Require conversation resolution before merging**

- ✅ **Do not allow bypassing the above settings**
  - This ensures even admins must pass all checks

#### Rules applied to everyone including administrators
- ✅ **Include administrators** (recommended for safety)

### 4. Save Changes

Click **"Create"** or **"Save changes"**

## Testing Branch Protection

After setting up:

1. Create a test branch:
   ```bash
   git checkout -b test-branch-protection
   ```

2. Make a change and push:
   ```bash
   echo "test" > test.txt
   git add test.txt
   git commit -m "Test branch protection"
   git push origin test-branch-protection
   ```

3. Create a pull request on GitHub

4. Verify that:
   - All CI checks run automatically
   - You cannot merge until all checks pass
   - The "Merge" button is disabled until checks complete

## What Gets Checked?

Every push and PR triggers:

1. **Secret Scanning** - Detects API keys, passwords, tokens
2. **ESLint** - Code quality and style checks
3. **TypeScript Build** - Ensures no type errors
4. **Jest Tests** - All 87 tests must pass
5. **NPM Audit** - Checks for vulnerable dependencies

## Bypassing in Emergencies

If you need to bypass (NOT recommended):
1. Temporarily disable branch protection
2. Merge/push your changes
3. Re-enable branch protection immediately

**Better approach**: Fix the failing checks instead of bypassing!

## Cost

- **Free for public repositories**
- **Free for private repositories** on GitHub Free (with some limitations)
- GitHub Actions includes 2,000 minutes/month for free

---

**Last Updated**: 2025-11-03
