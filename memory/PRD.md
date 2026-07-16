# BAKĒD Platform v1.0 — Implementation Memory

## Original Problem Statement
Multi-business digital commerce ecosystem for Africa (launch: Côte d'Ivoire) with 6 business apps — MART, FOOD, SHOP, EXPRESS, AUTO, IMMO — plus Super Admin, AI Command Center, Shared Wallet, Shared Auth, Shared Notifications, Shared Analytics. Configuration-Driven Modular Monolith. Original request specified NestJS + Postgres + Prisma + Redis + RabbitMQ + Next.js — after discussion the user chose to proceed on Emergent's supported stack (React + FastAPI + MongoDB) with the same architecture pattern replicated faithfully.

## Tech Stack (v1)
- Frontend: React (CRA) + Tailwind + shadcn/ui + Framer + React Router + sonner + Poppins
- Backend: FastAPI + Motor (MongoDB) + emergentintegrations + JWT
- Config: Configuration Driven — countries/modules/currencies/locales seeded as data, adding new markets = insert only
- Event Bus: In-process abstraction with RabbitMQ-compatible interface

## Personas
1. **Customer** — Phone/OTP-first, browses MART, adds to cart. Single unified identity across all 6 modules.
2. **Partner (merchant)** — Phase 4
3. **Driver** — Phase 5
4. **Admin / Super Admin** — Phase 6

## Static Core Requirements
- Mobile-first design, dark by default, light supported
- WCAG 2.2 AA, Poppins font, module colour tokens (MART/FOOD green, SHOP/EXPRESS yellow, AUTO red, IMMO purple, platform blue)
- One customer identity across all business modules
- Multi-country, multi-currency, multi-locale — no hardcoded values

## Implemented (v1 — 2026-02)
- ✅ Configuration Driven Modular Monolith backend (core/ + shared/ + modules/)
- ✅ Shared foundation: Auth (phone/OTP + Google via Emergent), Customer, Config, AI
- ✅ Provider abstraction: OtpProvider (Dev impl now, Twilio/Africa's Talking pluggable), AiProvider (Emergent LLM → Claude Sonnet 4.6)
- ✅ Event bus abstraction (in-process, RabbitMQ-compatible signature)
- ✅ MARTbakēd module: categories, products, offers, stores, multi-module cart
- ✅ Seed data: CI (XOF/fr, 24 products) + GB (GBP/en, 12 products), 9 categories, 3 stores, 3 offers, 6 modules
- ✅ Website: Top nav (logo/address/search/offers/orders/account/cart/theme), 6-module tab bar, MART Home (hero + delivery + AI band + categories sidebar + top categories + deals + features), Category index & detail, Product list (with sort), Product detail, Cart (guest+authed)
- ✅ Phone+OTP dialog with dev-code hint, Google login (Emergent OAuth), unified customer identity
- ✅ AI Product Search band on home (Claude Sonnet 4.6 via Emergent LLM key)
- ✅ Theme toggle (dark/light), country picker (CI ↔ GB)

## Backlog (prioritised)
- **P0**: Checkout + Order flow (Phase 2), Payment provider abstraction, Wallet
- **P1**: Super Admin Platform (Phase 6), RBAC-guarded admin endpoints, AI Business Insights UI
- **P1**: Real SMS OTP (Twilio Verify or Africa's Talking) — swap `OTP_PROVIDER` env
- **P2**: FOOD / SHOP / EXPRESS / AUTO / IMMO business modules
- **P2**: Partner Portal, Driver Portal
- **P2**: Notifications engine, Analytics, Search (OpenSearch), Media (MinIO)
- **P2**: RabbitMQ swap for the event bus (interface preserved)
