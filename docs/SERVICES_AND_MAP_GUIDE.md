# MedReach Services, Emergency Blood & Map Integration Guide

## Overview
This document outlines the architectural enhancements for Mumbai healthcare care networks, multi-category map parity, ambulance booking, and emergency blood dispatch workflows across all frontend variants (Bootstrap, Tailwind, Skeleton).

---

## 1. Multi-Category Nearby Care Map Parity

All four provider categories (Hospitals, Blood Banks, Diagnostics, Ambulances) share identical functional and visual parity with the primary hospital experience:
- **Interactive Marker Map**: Providers with verified geographical coordinates are plotted on Google Maps with distinct category pins.
- **Provider Popup**: Marker clicks open an interactive popup displaying provider name, category badge, address/locality, contact phone, operating hours, and direct navigation links.
- **Synchronized Directory List**: Selecting a provider from the directory list centers and highlights the marker on the map.
- **Rich Detail Card Below Map**: Displays complete provider data, contact actions, operational status, and verification source evidence.

---

## 2. Ambulance Booking & Fleet Management

### Actions Available on Every Listing:
1. **Call Provider**: Direct `tel:` link to verified dispatch lines.
2. **Navigate**: Google Maps turn-by-turn routing with exact latitude and longitude coordinates.
3. **Book Ambulance**: Launches `AmbulanceBookingModal` pre-associated with the selected ambulance provider.

### Booking Modal Specifications:
- **Patient Name \***: Required field.
- **Patient Age \***: Required numeric field (> 0).
- **Ambulance Required?**: Yes/No toggle. When 'Yes', pickup location input is dynamically displayed and validated.
- **Notes / Clinical Information**: Optional input for medical handoff instructions.
- **Direct Emergency Fallback**: Prominent callouts to dial 108 or 112 for acute life-threatening situations.

---

## 3. Blood Services & Emergency Requisition

### A. Specific Blood Bank Page (`/blood-banks`)
- **Login Required**: Requisitioning blood units or pledging blood donations requires user authentication. Unauthenticated users are directed to the login/registration gateway.
- **Normal Requirement Timing**: Options restricted to routine clinical schedules:
  - `3 days`
  - `1 week`
  - `2 weeks`
  - `1 month`

### B. Dedicated Urgent Blood Flow (`/urgent-blood`)
- **Separate from Bed Requests**: Bypasses the emergency bed admission triage form, dispatching directly to the blood management system (`/api/blood-requests`).
- **Urgency Options**:
  - `within 6 hours`
  - `12 hours`
  - `18 hours`
  - `24 hours`
  - `up to 2 days`
- **Rapid Unit Presets**: Quick buttons for 1, 2, and 4 unit selections.
- **Dispatch Tracking**: Issues immediate reference code (`BR-YYYYMMDD-XXX`) with tracking details and printable confirmation.
