# Quick Deployment Guide

## Step 1: Set Your SuperAdmin Email

**IMPORTANT**: Before deploying, you need to set your SuperAdmin email.

### Update `.env` file:

Open `.env` file and replace `your-email@example.com` with your actual email:

```env
VITE_SUPERADMIN_EMAIL=your-actual-email@gmail.com
```

**This email will have permanent access to the dashboard without needing a subscription.**

---

## Step 2: Deploy to Netlify (Easiest Method)

### Option A: Deploy via Netlify Dashboard (Recommended for first time)

1. **Push your code to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Go to Netlify**:
   - Visit [app.netlify.com](https://app.netlify.com/)
   - Sign up/Login (free account)

3. **Import your project**:
   - Click "Add new site" > "Import an existing project"
   - Connect to GitHub
   - Select your repository
   - Configure:
     - **Build command**: `npm run build`
     - **Publish directory**: `dist`
   - Click "Deploy site"

4. **Set Environment Variables** (CRITICAL):
   - After first deploy, go to: **Site settings** > **Environment variables**
   - Click "Add variable" and add each of these:
     
     ```
     VITE_FIREBASE_API_KEY = AIzaSyDCyB_heXOq02kKczPiGltlHpsmFJuUEOk
     VITE_FIREBASE_AUTH_DOMAIN = mystrikeview.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID = mystrikeview
     VITE_FIREBASE_STORAGE_BUCKET = mystrikeview.firebasestorage.app
     VITE_FIREBASE_MESSAGING_SENDER_ID = 768527049789
     VITE_FIREBASE_APP_ID = 1:768527049789:web:2b100514dbf275f5cef654
     VITE_SUPERADMIN_EMAIL = your-email@gmail.com
     ```

5. **Redeploy**:
   - Go to **Deploys** tab
   - Click "Trigger deploy" > "Clear cache and deploy site"

### Option B: Deploy via Netlify CLI

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login**:
   ```bash
   netlify login
   ```

3. **Set environment variables**:
   ```bash
   netlify env:set VITE_FIREBASE_API_KEY "AIzaSyDCyB_heXOq02kKczPiGltlHpsmFJuUEOk"
   netlify env:set VITE_FIREBASE_AUTH_DOMAIN "mystrikeview.firebaseapp.com"
   netlify env:set VITE_FIREBASE_PROJECT_ID "mystrikeview"
   netlify env:set VITE_FIREBASE_STORAGE_BUCKET "mystrikeview.firebasestorage.app"
   netlify env:set VITE_FIREBASE_MESSAGING_SENDER_ID "768527049789"
   netlify env:set VITE_FIREBASE_APP_ID "1:768527049789:web:2b100514dbf275f5cef654"
   netlify env:set VITE_SUPERADMIN_EMAIL "your-email@gmail.com"
   ```

4. **Deploy**:
   ```bash
   netlify deploy --prod
   ```

---

## Step 3: Add Your Domain to Firebase

After deployment, you need to authorize your Netlify domain in Firebase:

1. **Get your Netlify URL**:
   - Your site will be at: `https://your-site-name.netlify.app`

2. **Add to Firebase**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project: **mystrikeview**
   - Go to **Authentication** > **Settings**
   - Scroll to **Authorized domains**
   - Click **Add domain**
   - Add: `your-site-name.netlify.app`
   - Save

---

## Step 4: Test Your Deployment

1. Visit your Netlify URL
2. Test signup/login
3. Test Google Sign-In
4. Sign in with your SuperAdmin email
5. Verify you have permanent access to dashboard

---

## ✅ Checklist Before Deploying

- [ ] Updated `VITE_SUPERADMIN_EMAIL` in `.env` file
- [ ] All Firebase services enabled (Auth, Firestore)
- [ ] Code pushed to GitHub (if using Git integration)
- [ ] Ready to set environment variables in Netlify

---

## 🎉 You're Ready!

Once you've set your SuperAdmin email and deployed, your app will be live!
