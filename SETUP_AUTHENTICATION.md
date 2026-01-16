# Authentication & Subscription Setup Guide

This guide will help you set up Firebase authentication, user management, and PhonePe payment integration for StrikeView.

## 📋 What's Been Implemented

✅ **Authentication System**
- Firebase Authentication with Google Sign-In
- Email/Password signup and login
- User data stored in Firestore
- 3-day free trial system
- SuperAdmin account support

✅ **Pages Created**
- Homepage (`/`) - Landing page
- Login/Signup Page (`/login`) - Dark theme, centered UI
- Pricing Page (`/pricing`) - Subscription plans
- Dashboard (`/dashboard`) - Protected route, requires active subscription/trial

✅ **Protected Routes**
- Dashboard is protected - redirects to login if not authenticated
- Redirects to pricing if trial/subscription expired
- SuperAdmin has permanent access

## 🔧 Setup Steps

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Enter project name (e.g., "StrikeView")
4. Enable Google Analytics (optional)
5. Create project

### Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** sign-in provider
   - Add your project's support email
   - Save

### Step 3: Create Firestore Database

1. Go to **Firestore Database** in Firebase Console
2. Click "Create database"
3. Start in **test mode** (we'll add security rules later)
4. Choose a location (closest to your users)
5. Enable

### Step 4: Get Firebase Configuration

1. Go to **Project Settings** (gear icon) > **General**
2. Scroll to "Your apps" section
3. Click the **Web** icon (`</>`)
4. Register app with nickname "StrikeView Web"
5. Copy the `firebaseConfig` object values

### Step 5: Set Environment Variables

1. Create a `.env` file in the root directory (copy from `.env.example`)
2. Fill in your Firebase config values:

```env
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id

# Your email for SuperAdmin access
VITE_SUPERADMIN_EMAIL=your-email@example.com
```

### Step 6: Set Up Firestore Security Rules

1. Go to **Firestore Database** > **Rules**
2. Replace with these rules (adjust as needed):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // SuperAdmin can read all user data
    match /users/{userId} {
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isSuperAdmin == true;
    }
  }
}
```

### Step 7: Set Up PhonePe Payment Gateway

1. Sign up at [PhonePe Merchant Dashboard](https://merchant.phonepe.com/)
2. Complete KYC verification
3. Get your credentials:
   - Merchant ID
   - Salt Key
   - Salt Index

4. Add to `.env`:
```env
VITE_PHONEPE_MERCHANT_ID=your-merchant-id
VITE_PHONEPE_SALT_KEY=your-salt-key
VITE_PHONEPE_SALT_INDEX=1
```

5. **Note**: PhonePe integration code structure is ready in `src/utils/phonepe.js` - you'll need to implement the actual API calls based on PhonePe's documentation.

## 🎯 Testing the Setup

### Test Authentication Flow

1. Start the app: `npm run dev`
2. Navigate to `/login`
3. Try signing up with email/password
4. Try signing in with Google
5. After signup, you should be redirected to `/pricing`
6. After login, you should go to `/dashboard`

### Test SuperAdmin Access

1. Sign up/login with the email you set in `VITE_SUPERADMIN_EMAIL`
2. You should have permanent access to dashboard
3. Check Firestore - your user document should have `isSuperAdmin: true`

### Test Trial System

1. Sign up a new user
2. Check Firestore - user document should have:
   - `trialStartDate`: timestamp
   - `trialEndDate`: 3 days from start
   - `isTrialActive: true`
   - `subscriptionStatus: 'trial'`

3. After 3 days, user should be redirected to pricing page

## 📝 User Data Structure in Firestore

Each user document in `users/{userId}` contains:

```javascript
{
  uid: string,
  email: string,
  name: string,
  phone: string,
  trialStartDate: timestamp,
  trialEndDate: string (ISO date),
  isTrialActive: boolean,
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled',
  subscriptionPlan: 'monthly' | 'quarterly' | 'yearly' | null,
  subscriptionEndDate: string (ISO date) | null,
  createdAt: timestamp,
  isSuperAdmin: boolean
}
```

## 🔐 Security Considerations

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Update Firestore rules** - The test mode rules are permissive, update them for production
3. **Enable Firebase App Check** - For production to prevent abuse
4. **Set up Firebase Hosting** - For better security and performance

## 🚀 Next Steps

1. ✅ Complete Firebase setup (Steps 1-6)
2. ⏳ Implement PhonePe payment integration
3. ⏳ Add payment webhook handler (Netlify Function or Cloud Function)
4. ⏳ Test subscription flow end-to-end
5. ⏳ Deploy to production

## 📞 Support

If you encounter issues:
1. Check Firebase Console for errors
2. Check browser console for authentication errors
3. Verify environment variables are set correctly
4. Ensure Firestore rules allow your operations

## 🎉 You're All Set!

Once Firebase is configured, your authentication system is ready to use. Users can:
- Sign up and get 3-day free trial
- Sign in with Google or email
- Access dashboard during trial
- Subscribe via PhonePe (once integrated)
- SuperAdmin has permanent access
