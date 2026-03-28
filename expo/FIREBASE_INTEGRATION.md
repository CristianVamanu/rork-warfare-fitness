# Firebase Integration Documentation

## Overview
This app integrates Firebase Cloud Messaging (FCM) for push notifications and Firebase Cloud Storage for file uploads. All Firebase credentials are encrypted and stored securely, and the configuration is loaded dynamically at runtime.

## Features Implemented

### 1. Firebase Cloud Messaging (FCM)
- **Push Notifications**: Send instant notifications to all users
- **Scheduled Notifications**: Schedule notifications for future delivery
- **Notification Templates**: Quick templates for common notification types
- **Admin Interface**: Easy-to-use admin panel for sending notifications

### 2. Firebase Cloud Storage
- **File Uploads**: Upload images, videos, and PDFs
- **Secure Storage**: Files are stored in Firebase Cloud Storage
- **URL Generation**: Automatic generation of download URLs
- **File Management**: Delete files when no longer needed

### 3. Security Features
- **Encrypted Credentials**: Firebase config is encrypted using SHA-256 hashing
- **Dynamic Configuration**: No hardcoded credentials in source code
- **Admin-Only Access**: Only admins can configure Firebase
- **Secure Storage**: Credentials stored in AsyncStorage with encryption

## Setup Instructions

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project" or select an existing project
3. Follow the setup wizard to create your project
4. Enable Google Analytics (optional)

### Step 2: Register Your App

#### For iOS:
1. In Firebase Console, click the iOS icon
2. Enter your iOS bundle ID (found in `app.json` under `ios.bundleIdentifier`)
3. Download the `GoogleService-Info.plist` file
4. Note down the configuration values from the file

#### For Android:
1. In Firebase Console, click the Android icon
2. Enter your Android package name (found in `app.json` under `android.package`)
3. Download the `google-services.json` file
4. Note down the configuration values from the file

#### For Web (React Native Web):
1. In Firebase Console, click the Web icon (</>)
2. Register your app with a nickname
3. Copy the Firebase configuration object

### Step 3: Enable Firebase Services

#### Cloud Messaging:
1. In Firebase Console, go to **Build** → **Cloud Messaging**
2. If prompted, enable Cloud Messaging API
3. Note your Sender ID from the project settings

#### Cloud Storage:
1. In Firebase Console, go to **Build** → **Storage**
2. Click "Get Started"
3. Choose production mode or test mode:
   - **Production Mode**: Add security rules manually
   - **Test Mode**: Anyone can read/write (change before going live)
4. Select a location for your default bucket
5. Click "Done"

### Step 4: Configure Firebase in the App

1. **Login as Admin**:
   - Email: `admin@warfarefitness.com` or `superadmin@warfarefitness.com`
   - Password: `M@ngalia88`

2. **Navigate to Admin Settings**:
   - Go to Admin Panel → Settings

3. **Scroll to Firebase Configuration Section**

4. **Enter your Firebase credentials**:
   - **API Key** (Required): Found in Firebase project settings
   - **Auth Domain**: `your-project-id.firebaseapp.com`
   - **Project ID** (Required): Your Firebase project ID
   - **Storage Bucket**: `your-project-id.appspot.com`
   - **Messaging Sender ID**: Found in Cloud Messaging settings
   - **App ID** (Required): Found in your app registration
   - **Measurement ID** (Optional): For Google Analytics

5. **Click "Save Firebase Config"**
   - The app will encrypt and save your credentials
   - Firebase will be initialized automatically
   - Push notification permissions will be requested

### Step 5: Test the Integration

#### Test Push Notifications:
1. Go to Admin Panel → Send Notifications
2. Enter a title and message
3. Click "Send to All Users"
4. You should receive a notification on your device

#### Test Scheduled Notifications:
1. Go to Admin Panel → Send Notifications
2. Toggle to "Schedule" mode
3. Select a future date/time
4. Click "Schedule Notification"

#### Test File Uploads:
1. Use the `useFirebase` hook in your component:
```typescript
const { uploadFile, getFileUrl } = useFirebase();

const handleUpload = async (file: { uri: string; name: string; type: string }) => {
  const url = await uploadFile(file, `workouts/${file.name}`);
  if (url) {
    console.log('File uploaded:', url);
  }
};
```

## Firebase Configuration Reference

### Required Fields
- **API Key**: Used for authenticating API requests
- **Project ID**: Unique identifier for your Firebase project
- **App ID**: Unique identifier for your registered app

### Optional Fields
- **Auth Domain**: For Firebase Authentication (if using)
- **Storage Bucket**: For Cloud Storage functionality
- **Messaging Sender ID**: For Cloud Messaging
- **Measurement ID**: For Google Analytics tracking

### Example Configuration
```typescript
{
  apiKey: "AIzaSyA-example-key",
  authDomain: "my-app.firebaseapp.com",
  projectId: "my-app",
  storageBucket: "my-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456",
  measurementId: "G-XXXXXXXXXX"
}
```

## Security Best Practices

### 1. Credentials Storage
- All Firebase credentials are encrypted using SHA-256
- Encryption key is generated once and stored separately
- Never expose credentials in logs or error messages

### 2. Firebase Security Rules

#### Cloud Storage Rules (Production):
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated admin users to upload
    match /{allPaths=**} {
      allow read: if true; // Public read
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

#### Cloud Messaging:
- Only admins can send notifications through the app
- Admin status is checked before allowing notification sends
- Use the Admin Settings to manage who can send notifications

### 3. Environment Variables
While credentials are stored securely in the app, you can also use environment variables for additional security layers:

1. Create a `.env` file (add to `.gitignore`):
```env
FIREBASE_API_KEY=your-api-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_APP_ID=your-app-id
# ... other credentials
```

2. Never commit `.env` to version control
3. Use different Firebase projects for development and production

## API Reference

### Firebase Context Hook
```typescript
const {
  firebaseApp,           // Firebase app instance
  firebaseStorage,       // Firebase storage instance
  config,                // Current Firebase configuration
  isConfigured,          // Boolean: Is Firebase configured?
  isInitializing,        // Boolean: Is Firebase initializing?
  pushToken,             // Expo push token (if registered)
  
  // Configuration
  saveFirebaseConfig,    // Save and initialize Firebase config
  clearFirebaseConfig,   // Clear Firebase configuration
  
  // Notifications
  registerForPushNotifications,    // Register device for push notifications
  sendLocalNotification,           // Send immediate notification
  schedulePushNotification,        // Schedule future notification
  cancelScheduledNotification,     // Cancel scheduled notification
  
  // Storage
  uploadFile,            // Upload file to Cloud Storage
  deleteFile,            // Delete file from Cloud Storage
  getFileUrl,            // Get download URL for file
} = useFirebase();
```

### Upload File Example
```typescript
import * as ImagePicker from 'expo-image-picker';
import { useFirebase } from '@/contexts/FirebaseContext';

const { uploadFile } = useFirebase();

const pickAndUploadImage = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });

  if (!result.canceled && result.assets[0]) {
    const asset = result.assets[0];
    const file = {
      uri: asset.uri,
      name: `workout-${Date.now()}.jpg`,
      type: 'image/jpeg',
    };

    const url = await uploadFile(file, `workouts/${file.name}`);
    if (url) {
      console.log('Uploaded to:', url);
      // Save URL to your database/state
    }
  }
};
```

### Send Notification Example
```typescript
import { useFirebase } from '@/contexts/FirebaseContext';

const { sendLocalNotification } = useFirebase();

const sendWorkoutReminder = async () => {
  await sendLocalNotification({
    title: 'Workout Reminder',
    body: 'Time to dominate your workout, soldier!',
    sound: true,
    priority: 'high',
    data: { screen: 'training' },
  });
};
```

## Troubleshooting

### Issue: Firebase not initializing
**Solution**: 
- Check that all required fields are filled
- Verify your API key is correct
- Ensure your Firebase project is active
- Check console logs for specific errors

### Issue: Push notifications not working
**Solution**:
- Ensure Firebase configuration is saved
- Check that notifications are enabled in device settings
- On iOS, test on a physical device (not simulator)
- Verify your Messaging Sender ID is correct
- Make sure Cloud Messaging is enabled in Firebase Console

### Issue: File uploads failing
**Solution**:
- Check that Cloud Storage is enabled in Firebase
- Verify Storage Bucket name is correct
- Review Firebase Storage security rules
- Ensure file size is within limits (default: 5MB)
- Check console logs for specific error messages

### Issue: "Firebase Not Configured" error
**Solution**:
- Go to Admin Settings
- Re-enter Firebase credentials
- Click "Save Firebase Config"
- Wait for the success message

## Data Preservation

### What's Preserved
✅ User profile and authentication data
✅ Workout logs and completion history
✅ Streaks and power levels
✅ Custom workouts and programs
✅ Community posts and interactions
✅ Badges and achievements
✅ Meal logs and hydration tracking
✅ Ice bath logs and fasting data

### How Data is Preserved
- All user data is stored in AsyncStorage
- Firebase integration adds features without modifying existing data
- No data is migrated to Firebase automatically
- User data remains in local storage unless explicitly uploaded
- Firebase is only used for:
  - Push notifications (no data storage)
  - File uploads (URLs stored locally)

### Backup Recommendations
1. **Regular Backups**: Users should back up their data periodically
2. **Export Feature**: Consider adding data export functionality
3. **Cloud Sync**: Optionally sync user data to Firebase Firestore

## Platform-Specific Notes

### iOS
- Push notifications require a physical device for testing
- Notification permissions must be granted by the user
- Background notifications may be delayed by iOS
- Ensure your Bundle ID matches Firebase registration

### Android
- Notifications work on emulators and physical devices
- Background notifications are more reliable than iOS
- Ensure your Package Name matches Firebase registration
- FCM may require Google Play Services

### Web (React Native Web)
- Push notifications are not supported
- File uploads work but use browser file APIs
- Local notifications display as browser notifications
- Consider adding web-specific fallbacks

## Maintenance

### Regular Tasks
1. **Monitor Firebase Usage**: Check Firebase Console for usage limits
2. **Review Security Rules**: Update rules as needed
3. **Check Logs**: Review notification delivery logs
4. **Update Dependencies**: Keep Firebase packages up to date
5. **Test Notifications**: Periodically test notification delivery

### Updating Firebase Credentials
1. Go to Admin Settings
2. Click "Clear Config" if changing projects
3. Enter new credentials
4. Save configuration
5. Test functionality

### Monitoring
- Firebase Console provides analytics and usage stats
- Check notification delivery rates
- Monitor storage usage and costs
- Review error logs in Firebase Console

## Support

For issues with:
- **Firebase Setup**: Check Firebase Console documentation
- **App Configuration**: Review this guide and check Admin Settings
- **Push Notifications**: Test with simple messages first
- **File Uploads**: Verify storage rules and file formats
- **Authentication Issues**: Check Firebase Authentication settings

## Additional Resources

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Cloud Storage Docs](https://firebase.google.com/docs/storage)
- [Expo Notifications Docs](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [React Native Firebase](https://rnfirebase.io/)

## Notes

- Firebase credentials are encrypted but stored on device
- Push tokens are device-specific
- Notification delivery depends on network connectivity
- File uploads are subject to Firebase storage limits
- Always test on physical devices before production release
