// TEST FILE: This should trigger Gitleaks secret scanning
// This is a fake API key for testing purposes

const testConfig = {
  // This fake Google API key should be caught by Gitleaks
  apiKey: "AIzaSyDFakeKeyForTestingPurposes123456"
};

module.exports = testConfig;
