# Warfare Fitness

A premium fitness app built with Expo Router + React Native.

**Platforms:** iOS, Android, Web  
**Framework:** Expo Router + React Native + TypeScript

## Features

- Gymverse-style dark UI with gold accents
- Trainer system — trainers create and sell programs with configurable free trials
- AI Food Scanner powered by OpenAI Vision
- Lift-style ranking system (Iron → Warlord)
- Challenges, community, leaderboard
- Admin panel with full control

## Getting Started

```bash
npm install
npm run dev          # web
npm run start        # iOS/Android via Expo Go
```

## Environment Variables

Create a `.env` file:

```
EXPO_PUBLIC_API_BASE_URL=https://your-vercel-url.vercel.app
OPENAI_API_KEY=sk-...
```

## Building for Production

```bash
npx eas build --platform ios
npx eas build --platform android
npx expo export --platform web   # for Vercel
```
