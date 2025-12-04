# RevenueCat Integration Setup Guide

This document explains how to set up and configure RevenueCat subscriptions in your Warfare Fitness app.

## Overview

The app uses RevenueCat SDK to handle in-app purchases and subscriptions with the following features:

- **7-day free trial** for new subscribers
- **£9.99/month** premium subscription
- **First 7 days of workout programs** available for free
- **Days 8+ locked** behind subscription
- Automatic user ID syncing with Firebase Auth
- Restore purchases functionality
- Cross-platform support (iOS/Android)

## Prerequisites

1. **Apple Developer Account** (for iOS subscriptions)
2. **Google Play Console Account** (for Android subscriptions)
3. **RevenueCat Account** (free tier available)
4. **Firebase Auth** already configured in the app

## Step 1: Create RevenueCat Account

1. Go to [https://www.revenuecat.com](https://www.revenuecat.com)
2. Sign up for a free account
3. Create a new project called "Warfare Fitness" (or your app name)

## Step 2: Configure Products in App Store Connect / Google Play Console

### For iOS (App Store Connect):

1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Go to your app → Features → In-App Purchases
3. Click the **+** button to create a new subscription
4. Select **Auto-Renewable Subscription**
5. Create a **Subscription Group** (e.g., "Premium Subscriptions")
6. Add a new subscription with these details:
   - **Product ID**: `warfare_fitness_premium_monthly` (or your choice)
   - **Reference Name**: Premium Monthly
   - **Duration**: 1 month
   - **Price**: £9.99 (or your local currency equivalent)
   - **Introductory Offer**: 
     - Type: Free Trial
     - Duration: 7 days
7. Submit for review (required before testing in production)

### For Android (Google Play Console):

1. Log in to [Google Play Console](https://play.google.com/console)
2. Go to your app → Monetize → Subscriptions
3. Click **Create subscription**
4. Configure subscription:
   - **Product ID**: `warfare_fitness_premium_monthly` (same as iOS)
   - **Name**: Premium Monthly
   - **Billing period**: 1 month
   - **Price**: £9.99 (or local equivalent)
   - **Free trial**: 7 days
5. Save and activate

## Step 3: Configure RevenueCat Dashboard

1. Log in to [RevenueCat Dashboard](https://app.revenuecat.com)
2. Go to your project

### Connect iOS App:

1. Go to **Project Settings** → **Apps**
2. Click **+ New** → **iOS**
3. Enter your **Bundle ID** from Xcode
4. Upload your **In-App Purchase Key**:
   - In App Store Connect, go to Users and Access → Keys → In-App Purchase
   - Generate a new key (if you don't have one)
   - Download the `.p8` file and upload it to RevenueCat

### Connect Android App:

1. In **Project Settings** → **Apps**, click **+ New** → **Android**
2. Enter your **Package Name** from your app
3. Upload your **Service Account JSON**:
   - In Google Play Console, go to Setup → API access
   - Create a service account (or use existing)
   - Grant permissions: **Manage orders and subscriptions**
   - Download JSON key and upload to RevenueCat

### Add Products in RevenueCat:

1. Go to **Products** in the RevenueCat dashboard
2. Click **+ New**
3. Create product:
   - **Identifier**: `premium_monthly`
   - **App Store Product ID**: `warfare_fitness_premium_monthly` (from iOS)
   - **Play Store Product ID**: `warfare_fitness_premium_monthly` (from Android)
4. Save

### Create Entitlements:

1. Go to **Entitlements** → **+ New**
2. Create entitlement:
   - **Identifier**: `premium`
   - **Description**: Premium access to all features
3. Click on the entitlement
4. Add your `premium_monthly` product to this entitlement

### Create Offerings:

1. Go to **Offerings** → **+ New**
2. Create offering:
   - **Identifier**: `default`
   - **Description**: Default offering
3. Add packages:
   - **Package Type**: Monthly
   - **Product**: `premium_monthly`
   - Make this the **current offering**

## Step 4: Get API Keys

1. In RevenueCat Dashboard, go to **Project Settings** → **API Keys**
2. You'll see two keys:
   - **iOS API Key** (starts with `appl_`)
   - **Android API Key** (starts with `goog_`)
3. Copy both keys

## Step 5: Configure Environment Variables

1. Create a `.env` file in your project root (or copy from `env.example`):

```
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_your_ios_key_here
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_your_android_key_here
```

2. **IMPORTANT**: Add `.env` to your `.gitignore` file to keep keys secure

## Step 6: Testing

### Test on iOS:

1. Build the app using a **development build** (not Expo Go):
   ```bash
   npx expo run:ios
   ```
2. In Xcode, make sure you're signed in with a **Sandbox Tester Account**:
   - Create test account in App Store Connect → Users and Access → Sandbox Testers
3. Test the subscription flow:
   - Go to Profile screen
   - Tap "Upgrade to Premium"
   - Complete purchase (will use sandbox, no real charge)
   - Verify 7-day trial starts
   - Verify content unlocks after subscription

### Test on Android:

1. Build the app:
   ```bash
   npx expo run:android
   ```
2. Use a **test account** configured in Google Play Console
3. Test the same subscription flow

## Step 7: User ID Syncing

The app automatically syncs user IDs with RevenueCat when users log in:

- When a user logs in via Firebase Auth, their user ID is sent to RevenueCat
- This ensures subscriptions are tied to user accounts
- Users can access their subscription on multiple devices
- Handled automatically in `app/_layout.tsx` via the `AuthGuard` component

## Features Implemented

### 1. Content Gating

- **First 7 days** of workout programs are **free**
- **Days 8+** are **locked** and show upgrade prompts
- Challenges follow the same pattern
- Free users see unlock buttons that navigate to the paywall

### 2. Paywall Screen (`app/paywall.tsx`)

- Shows free vs premium comparison
- Displays 7-day trial information
- Shows remaining trial days for active trial users
- "Subscribe Now" button (£9.99/month with trial)
- Web version shows message that subscriptions are only on mobile

### 3. Profile Screen Subscription Section

- Shows current subscription status:
  - **Free Plan**: Shows upgrade button
  - **Premium Active**: Shows trial days remaining (if in trial) or renewal date
- **Restore Purchases** button (iOS/Android only)
- Gracefully handles web version (no subscription UI)

### 4. Subscription Context (`contexts/SubscriptionContext.tsx`)

The subscription context provides:
- `isPremium`: Boolean indicating if user has active subscription
- `isInTrialPeriod`: Boolean indicating if user is in trial
- `canAccessContent(dayNumber)`: Returns true if user can access that day
- `getDaysRemainingInTrial()`: Returns number of days left in trial
- `restorePurchases()`: Restores previous purchases
- `purchasePackage()`: Initiates subscription purchase

## Troubleshooting

### "RevenueCat not initialized" errors

- Make sure environment variables are set correctly
- Rebuild the app after adding env variables
- Check that API keys are correct in RevenueCat dashboard

### Purchases not working on iOS

- Ensure you're using a **development build**, not Expo Go
- RevenueCat requires native modules that aren't available in Expo Go
- Use sandbox tester account
- Check that subscription is approved in App Store Connect

### Purchases not working on Android

- Ensure you're using a **development build**
- Use a licensed test account
- Make sure the subscription is active in Google Play Console
- Check that the service account has correct permissions

### "Unable to load offerings" error

- Check that you created products in RevenueCat
- Verify products are linked to entitlements
- Make sure offering is marked as "current"
- Check API keys are correct

### Trial not showing correctly

- Verify introductory offer is configured in App Store Connect / Play Console
- Make sure it's a 7-day free trial
- Check that it's properly configured in RevenueCat

## Testing Subscriptions Without Real Charges

### iOS Sandbox Testing:

1. Create Sandbox Tester accounts in App Store Connect
2. Sign out of your personal Apple ID on device
3. When prompted during purchase, sign in with sandbox tester
4. Subscriptions auto-renew quickly in sandbox (e.g., 1 month = 5 minutes)

### Android Testing:

1. Add test accounts in Google Play Console (Setup → License Testing)
2. Subscriptions complete immediately without charge
3. Can test trial, subscription, and cancellation flows

## Important Notes

- **Free users**: Can access first 7 days of any program
- **Premium users**: Get full access to all days, challenges, and features
- **Trial**: 7 days free, then automatically charges £9.99/month
- **Cancellation**: Users can cancel anytime via App Store or Play Store settings
- **Offline mode**: App shows free content only when offline
- **Web version**: Subscriptions only available on iOS/Android apps

## Support

For RevenueCat-specific issues:
- Documentation: [https://docs.revenuecat.com](https://docs.revenuecat.com)
- Support: [https://support.revenuecat.com](https://support.revenuecat.com)

For App Store Connect / Google Play Console issues:
- Apple: [https://developer.apple.com/support/](https://developer.apple.com/support/)
- Google: [https://support.google.com/googleplay/android-developer](https://support.google.com/googleplay/android-developer)
