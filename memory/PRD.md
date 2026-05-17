# MediAssist - Product Requirements

## Overview
MediAssist is a full-stack mobile health app (React Native + Expo + FastAPI + MongoDB) that helps patients manage medications, get AI-powered health guidance, scan medications via camera, and find nearby pharmacies. Bilingual (Turkish/English).

## Stack
- **Frontend:** React Native (Expo SDK 54), expo-router, AsyncStorage, axios, lucide-react-native, react-native-chart-kit, expo-camera, expo-image-picker, expo-location, expo-notifications
- **Backend:** FastAPI, Motor (async MongoDB), PyJWT, bcrypt, openai (OpenAI GPT-4o)
- **Database:** MongoDB (collections: users, medications, dose_logs, chat_messages)

## Features
1. **Auth (JWT):** register/login, change password, edit profile, delete account
2. **Medications CRUD** with daily times, duration, notes
3. **Daily timeline** with mark-as-taken/skipped
4. **Adherence tracking:** streak days, summary stats, weekly chart, per-med rate
5. **AI Health Chat (GPT-4o):** strict health-only prompt, history, clear-chat, bilingual, mandatory disclaimer
6. **Vision Medication Scan (GPT-4o):** camera + gallery, returns structured JSON (name, ingredients, uses, side effects, dosage, warnings), prefill add-to-list
7. **Pharmacy Finder:** GPS-based, mock pharmacies (10), all/on-call tabs, distance filter (500m/1km/2km/5km), tap-to-call, on-duty badge
8. **Profile/Settings:** edit profile, change password, language toggle (TR/EN), logout, delete account

## API Endpoints (all under `/api`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/profile`, `POST /auth/change-password`, `DELETE /auth/account`
- `POST/GET /medications`, `GET/PUT/DELETE /medications/{id}`
- `POST /dose-logs`
- `GET /schedule/today`, `GET /stats/summary`, `GET /stats/adherence`, `GET /stats/medication-adherence`
- `POST /chat/send`, `GET /chat/history`, `DELETE /chat/history`
- `POST /vision/scan-medication`
- `GET /pharmacies/nearby`

## Known Mocks/Limits
- **Pharmacy data is MOCKED** (10 sample TR pharmacies offset from user GPS for realistic distances). Real Turkey pharmacy API integration is a next step.
- **Password reset email is NOT YET implemented** (skipped per user request).
- **Notifications:** UI prepared; expo-notifications scheduling can be expanded for real device builds.

## Design
Light theme, Primary #4A90D9, Secondary #34C47C, organic & earthy archetype, rounded-24 cards, generous spacing.
