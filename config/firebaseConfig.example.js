// Firebase Configuration Example
// Copy this file to firebaseConfig.js and fill in your actual Firebase config values

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Export for use in the app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}
