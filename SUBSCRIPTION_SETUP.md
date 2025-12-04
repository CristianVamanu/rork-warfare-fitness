# RevenueCat Subscription Setup Guide

This guide will help you configure RevenueCat for in-app subscriptions in your Warfare Fitness app.

## 🚀 Quick Start

The app now includes a complete subscription system with:
- ✅ RevenueCat SDK integration
- ✅ Paywall screen with Free vs Premium tiers (£9.99/month)
- ✅ Premium content gating
- ✅ Restore purchases functionality
- ✅ Subscription management screen
- ✅ Firebase Auth integration

## 📋 Prerequisites

1. **Apple Developer Account** (for iOS subscriptions)
2. **Google Play Console Account** (for Android subscriptions)
3. **RevenueCat Account** (free to start)

## 🔧 Setup Steps

### Step 1: Create RevenueCat Account

1. Go to [RevenueCat](https://app.revenuecat.com/signup)
2. Sign up for a free account
3. Create a new project for your app

### Step 2: Configure iOS Subscriptions

1. **In App Store Connect:**
   - Go to your app
   - Navigate to "Features" → "In-App Purchases"
   - Create a new Auto-Renewable Subscription
   - Set Product ID: `warfare_premium_monthly`
   - Set Price: £9.99/month
   - Configure localization and screenshots

2. **In RevenueCat Dashboard:**
   - Go to your project
   - Click "Apps" → "Add iOS App"
   - Enter your Bundle ID: `app.rork.warfighter-fitness`
   - Add App Store Connect API Key:
     - In App Store Connect, go to Users and Access → Keys → App Store Connect API
     - Create a new key with "Admin" access
     - Download the `.p8` file
     - Upload to RevenueCat
   - Click "Save"

### Step 3: Configure Android Subscriptions

1. **In Google Play Console:**
   - Go to your app
   - Navigate to "Monetize" → "Subscriptions"
   - Create a new subscription
   - Set Product ID: `warfare_premium_monthly`
   - Set Price: £9.99/month
   - Set billing period: 1 month

2. **In RevenueCat Dashboard:**
   - Go to your project
   - Click "Apps" → "Add Android App"
   - Enter your Package Name: `app.rork.warfighter_fitness`
   - Add Google Play Service Credentials:
     - In Google Play Console, go to Setup → API access
     - Create service account
     - Download JSON key
     - Upload to RevenueCat
   - Click "Save"

### Step 4: Create Products & Offerings

1. **In RevenueCat Dashboard:**
   - Go to "Products"
   - Click "New"
   - Product ID: `warfare_premium_monthly`
   - Type: Subscription
   - Link to App Store product ID: `warfare_premium_monthly`
   - Link to Google Play product ID: `warfare_premium_monthly`
   - Save

2. **Create an Offering:**
   - Go to "Offerings"
   - Click "New Offering"
   - Offering ID: `default`
   - Add your product as a "Monthly" package
   - Make it current
   - Save

### Step 5: Create Entitlement

1. **In RevenueCat Dashboard:**
   - Go to "Entitlements"
   - Click "New"
   - Entitlement ID: `premium`
   - Attach your `warfare_premium_monthly` product
   - Save

### Step 6: Get API Keys

1. **In RevenueCat Dashboard:**
   - Go to "API Keys"
   - Copy your iOS API Key (starts with `appl_`)
   - Copy your Android API Key (starts with `goog_`)

### Step 7: Add Environment Variables

In Rork, add these environment variables:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_your_ios_key_here
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_your_android_key_here
```

## 🎨 Usage Examples

### Gating Premium Content

```typescript
import { PremiumGate } from '@/components/PremiumGate';

// Wrap any component with PremiumGate
<PremiumGate feature="Ice Bath Protocols">
  <YourPremiumContent />
</PremiumGate>
```

### Checking Premium Status

```typescript
import { useSubscription } from '@/contexts/SubscriptionContext';

function YourComponent() {
  const { subscriptionState } = useSubscription();
  
  if (subscriptionState.isPremium) {
    // Show premium content
  } else {
    // Show limited content
  }
}
```

### Programmatic Premium Check

```typescript
import { usePremiumFeature } from '@/components/PremiumGate';

function YourComponent() {
  const { isPremium, requirePremium } = usePremiumFeature();
  
  const handlePremiumAction = () => {
    requirePremium(() => {
      // This code only runs if user is premium
      // Otherwise, paywall is shown
    });
  };
}
```

## 🔗 Navigation

The subscription system includes these screens:

- `/paywall` - Paywall with pricing (modal)
- `/manage-subscription` - Subscription management

Add these to your navigation:

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Show paywall
router.push('/paywall');

// Show manage subscription
router.push('/manage-subscription');
```

## 🧪 Testing

### Test Subscriptions

1. **iOS:**
   - Use Sandbox testers (App Store Connect → Users and Access → Sandbox Testers)
   - Purchases won't charge real money
   - Subscriptions renew quickly for testing

2. **Android:**
   - Use test accounts (Google Play Console → Setup → License testing)
   - Purchases won't charge real money

### Verify Setup

1. Run the app
2. Go to the paywall screen
3. You should see:
   - Free tier features
   - Premium tier at £9.99/month
   - Subscribe button (iOS/Android only)
4. Try subscribing with a test account
5. After purchase, premium status should activate

## 🛠️ Troubleshooting

### "No offerings available"
- Ensure products are created in App Store Connect/Google Play Console
- Check product IDs match exactly in RevenueCat
- Verify API keys are correct
- Wait a few hours for products to propagate

### "Purchase failed"
- Check Bundle ID/Package Name matches
- Verify app is signed correctly
- Ensure test account is configured
- Check RevenueCat dashboard for errors

### Purchases not restoring
- Verify user is signed in with same account
- Check RevenueCat user ID is set correctly
- Look for errors in console logs

## 📱 User Flow

1. **New User:**
   - Signs up with email/password
   - Gets free tier access
   - Can view paywall anytime
   - Can upgrade to premium

2. **Subscription Purchase:**
   - User taps "Subscribe Now" on paywall
   - iOS/Android payment sheet appears
   - User completes purchase
   - Premium unlocked immediately

3. **Restore Purchases:**
   - User taps "Restore Purchases"
   - RevenueCat checks for existing subscriptions
   - Premium status restored if found

4. **Manage Subscription:**
   - User goes to Manage Subscription screen
   - Can view expiration date
   - Can refresh status
   - Links to iOS/Android settings

## 🎯 Features Included

### Free Tier
- ✅ Basic training programs
- ✅ Community forum access
- ✅ Ice bath tracker (limited)
- ❌ Premium content library
- ❌ Advanced analytics

### Premium Tier (£9.99/month)
- ✅ Full ice bath protocols & videos
- ✅ Exclusive training programs & PDFs
- ✅ Advanced habit trackers & analytics
- ✅ Premium community features
- ✅ Early access to new features

## 🔐 Security

- RevenueCat API keys are in environment variables
- Keys are NOT committed to git
- Server-side receipt validation via RevenueCat
- No manual approval needed

## 📊 Analytics

RevenueCat provides built-in analytics:
- Revenue tracking
- Subscription metrics
- Churn analysis
- Trial conversion
- MRR/ARR reports

## 🚀 Going Live

1. Complete App Store/Play Store app setup
2. Submit app for review
3. Ensure subscriptions are approved
4. Make offering "Current" in RevenueCat
5. Test with real account
6. Launch! 🎉

## 📞 Support

- **RevenueCat Docs:** https://docs.revenuecat.com
- **RevenueCat Community:** https://community.revenuecat.com
- **Apple Docs:** https://developer.apple.com/in-app-purchase
- **Google Docs:** https://developer.android.com/google/play/billing

## 🎉 You're All Set!

Your app now has a complete subscription system. Users can upgrade to premium, access exclusive content, and manage their subscriptions—all automatically handled by RevenueCat.
