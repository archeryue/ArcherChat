# Test Security Scanning

This file is intentionally created to test our CI/CD pipeline.

## Test Case 1: Secret Detection

Let's see if our Gitleaks scanner catches this fake API key:

```
GOOGLE_API_KEY=AIzaSyDFakeKeyForTestingPurposes12345
```

This should trigger the secret scanning check and FAIL the CI pipeline.

## Expected Result

- ❌ Secret Scanning job should FAIL
- ❌ PR should be blocked from merging
- ✅ All other checks should pass

## Cleanup

After testing, this file should be deleted and the branch removed.
