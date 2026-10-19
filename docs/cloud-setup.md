# Setting up cloud accounts (site owner guide)

Pipewright works fully without this. Follow these steps only if you want visitors to be able to
**sign in with Google** and keep their work in the cloud. It takes about 15 minutes, and the free
Firebase tier (Spark plan) is enough to start.

## What you're turning on

- **Sign in with Google** through Firebase Authentication.
- **Cloud sync** through Cloud Firestore. Each user gets private documents holding their current
  schema, recent work and data-model structure. File rows, example values from personal-data
  columns, and AI keys are never uploaded.
- **Plan field ready for billing.** Every account is created with `plan: "free"`, and
  [`firestore.rules`](../firestore.rules) stop users changing it from the browser. A future
  billing server (Stripe webhook + Firebase Admin SDK) can set it later.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project**. You can reuse an existing Google Cloud project.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Pick a support email and save.
3. **Build → Firestore Database → Create database.** Choose **production mode** and a region near your users (for India, `asia-south1`).

## 2. Register the web app and copy its config

1. **Project settings (gear) → General → Your apps → Web (`</>`)**. Name it "Pipewright"; you don't need Firebase Hosting.
2. Copy `apiKey`, `authDomain`, `projectId` and `appId` into `.env.local` (locally) and into your
   Vercel project's **Environment Variables**:

   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
   NEXT_PUBLIC_FIREBASE_APP_ID=1:...:web:...
   ```

   These values are public by design. They only name your project; the security rules are what protect data.

## 3. Publish the security rules

Deploy [`firestore.rules`](../firestore.rules) with either:

- **Console:** Firestore → **Rules** → paste the file → **Publish**, or
- **CLI:** `npm i -g firebase-tools && firebase login && firebase use your-project && firebase deploy --only firestore:rules`

The rules let each signed-in user read and write only `users/{their uid}` and its `data/*`
documents. They cap each document under 1 MB and lock the `plan` field.

## 4. Authorise your domains

**Authentication → Settings → Authorised domains:** `localhost` is there already. Add your live
domain, e.g. `pipewright.vercel.app` and any custom domain. Sign-in from other domains is refused.

## 5. Restart and test

1. `npm run dev`. A **Sign in** button with the Google logo appears in the top bar.
2. Sign in, load the demo shop in the Data Model, then open the site in another browser and sign
   in there. The model appears within a few seconds (or on **Sync now**).
3. In Firestore → Data you should see `users/{uid}` with `plan: "free"` and `users/{uid}/data/{schema|recent|workspace}`.

## Costs

Firestore bills per document read, write and stored GB. Pipewright writes at most one document per
change (debounced by 2 seconds) and reads three documents per sync, so the free daily quota (50k
reads, 20k writes, 1 GiB stored) covers thousands of active users.

## Adding paid plans later

The pieces are in place for a flat monthly plan with a free first month:

1. Create the product and price in Stripe, with a 30-day trial.
2. Add a server route that creates a Checkout session for the signed-in user (verify their Firebase ID token).
3. Add a Stripe webhook route that sets `users/{uid}.plan` with the Firebase Admin SDK. The rules already stop browsers doing this.
4. Gate cloud sync on `plan` in `lib/cloud/account.ts`.
