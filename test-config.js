// TEST FILE: This should trigger Gitleaks secret scanning
// This is a fake API key for testing purposes
// Updated to trigger a new commit

const testConfig = {
  // This fake Google API key should be caught by Gitleaks NOW
  apiKey: "AIzaSyDFakeKeyForTestingPurposes123456",
  timestamp: Date.now()
};

module.exports = testConfig;
