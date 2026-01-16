# Deployment Guide for StrikeView

## 🚀 Pre-Deployment Checklist

### 1. Set SuperAdmin Email

Before deploying, make sure to set your SuperAdmin email in the `.env` file:

```env
VITE_SUPERADMIN_EMAIL=your-actual-email@gmail.com
```

**Important**: This email will have permanent access to the dashboard without needing a subscription.

### 2. Firebase Setup Verification

Make sure you've completed:
- ✅ Email/Password authentication enabled
- ✅ Google Sign-In enabled
- ✅ Firestore database created
- ✅ Firestore security rules updated

### 3. Environment Variables for Production

You'll need to set these environment variables in your hosting platform (Netlify/Vercel):

```
VITE_FIREBASE_API_KEY=AIzaSyDCyB_heXOq02kKczPiGltlHpsmFJuUEOk
VITE_FIREBASE_AUTH_DOMAIN=mystrikeview.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mystrikeview
VITE_FIREBASE_STORAGE_BUCKET=mystrikeview.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=768527049789
VITE_FIREBASE_APP_ID=1:768527049789:web:2b100514dbf275f5cef654
VITE_SUPERADMIN_EMAIL=your-email@gmail.com
```

---

## 📦 Deployment Options

### Option 1: Deploy to Netlify (Recommended)

#### Method A: Deploy via Netlify CLI

1. **Install Netlify CLI** (if not already installed):
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```bash
   netlify login
   ```

3. **Initialize Netlify** (if first time):
   ```bash
   netlify init
   ```
   - Choose "Create & configure a new site"
   - Choose a site name or let Netlify generate one
   - Build command: `npm run build`
   - Publish directory: `dist`

4. **Set Environment Variables**:
   ```bash
   netlify env:set VITE_FIREBASE_API_KEY "AIzaSyDCyB_heXOq02kKczPiGltlHpsmFJuUEOk"
   netlify env:set VITE_FIREBASE_AUTH_DOMAIN "mystrikeview.firebaseapp.com"
   netlify env:set VITE_FIREBASE_PROJECT_ID "mystrikeview"
   netlify env:set VITE_FIREBASE_STORAGE_BUCKET "mystrikeview.firebasestorage.app"
   netlify env:set VITE_FIREBASE_MESSAGING_SENDER_ID "768527049789"
   netlify env:set VITE_FIREBASE_APP_ID "1:768527049789:web:2b100514dbf275f5cef654"
   netlify env:set VITE_SUPERADMIN_EMAIL "your-email@gmail.com"
   ```

5. **Deploy**:
   ```bash
   netlify deploy --prod
   ```

#### Method B: Deploy via Netlify Dashboard (Git Integration)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Netlify**:
   - Go to [Netlify Dashboard](https://app.netlify.com/)
   - Click "Add new site" > "Import an existing project"
   - Connect your GitHub account
   - Select your repository
   - Configure build settings:
     - Build command: `npm run build`
     - Publish directory: `dist`

3. **Set Environment Variables**:
   - Go to Site settings > Environment variables
   - Add all the `VITE_*` variables from your `.env` file

4. **Deploy**:
   - Click "Deploy site"
   - Netlify will automatically deploy on every push to main

### Option 2: Deploy to Vercel

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```
   - Follow the prompts
   - When asked for environment variables, add all `VITE_*` variables

4. **Or use Vercel Dashboard**:
   - Go to [Vercel Dashboard](https://vercel.com/)
   - Import your GitHub repository
   - Add environment variables in project settings
   - Deploy

### Option 3: Deploy to Firebase Hosting

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase Hosting**:
   ```bash
   firebase init hosting
   ```
   - Select your Firebase project
   - Public directory: `dist`
   - Single-page app: Yes
   - Overwrite index.html: No

4. **Build and Deploy**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

5. **Set Environment Variables**:
   - Firebase Hosting doesn't support environment variables directly
   - You'll need to use Firebase Functions or build-time environment variables
   - Alternative: Use `.env.production` file that gets bundled during build

---

## 🔐 Setting Up SuperAdmin After Deployment

### Method 1: Set in Environment Variables (Recommended)

Set `VITE_SUPERADMIN_EMAIL` in your hosting platform's environment variables. This will automatically grant SuperAdmin access to that email.

### Method 2: Manually Set in Firestore

1. Go to Firebase Console > Firestore Database
2. Find the `users` collection
3. Find your user document (by email or UID)
4. Edit the document and set:
   - `isSuperAdmin: true`
   - Save

### Method 3: Update via Code (One-time)

You can temporarily add this to your code to set SuperAdmin for existing users:

```javascript
// In AuthContext.jsx, after user signs up/logs in
if (user.email === 'your-email@gmail.com') {
  await setDoc(
    doc(db, 'users', user.uid),
    { isSuperAdmin: true },
    { merge: true }
  )
}
```

---

## ✅ Post-Deployment Checklist

- [ ] Environment variables set in hosting platform
- [ ] SuperAdmin email configured
- [ ] Test signup flow on production
- [ ] Test Google Sign-In on production
- [ ] Verify SuperAdmin access works
- [ ] Test trial system
- [ ] Check Firestore security rules
- [ ] Update Firebase authorized domains (if needed)

---

## 🌐 Firebase Authorized Domains

After deployment, add your production domain to Firebase:

1. Go to Firebase Console > Authentication > Settings
2. Scroll to "Authorized domains"
3. Add your production domain (e.g., `your-site.netlify.app`)
4. Save

---

## 🐛 Troubleshooting

### Issue: Environment variables not working in production

**Solution**: Make sure all variables start with `VITE_` and are set in your hosting platform's environment variables section.

### Issue: Authentication not working on production

**Solution**: 
- Check Firebase Console > Authentication > Settings > Authorized domains
- Add your production domain
- Check browser console for errors

### Issue: SuperAdmin not working

**Solution**:
- Verify `VITE_SUPERADMIN_EMAIL` is set correctly in production environment
- Check Firestore - user document should have `isSuperAdmin: true`
- Make sure you're signing in with the exact email set in environment variable

---

## 📝 Notes

- **Never commit `.env` file** - It's already in `.gitignore`
- **Environment variables** must be set in your hosting platform for production
- **Firebase authorized domains** must include your production domain
- **SuperAdmin email** must match exactly (case-sensitive)
