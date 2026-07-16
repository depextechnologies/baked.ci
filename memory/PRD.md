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
- ✅ Shared foundation: Auth (phone/OTP + Google), Customer, Config, AI, Admin
- ✅ Provider abstraction: OtpProvider (Dev now; Twilio + Africa's Talking stubs ready), AiProvider (Emergent LLM → Claude Sonnet 4.6), PaymentProvider (COD live; Stripe + Mobile Money stubs)
- ✅ Event bus abstraction — OrderCreated → PaymentCompleted → OrderUpdated → AnalyticsUpdated → AI_REQUESTED wired
- ✅ MARTbakēd module: categories, products, offers, stores, multi-module cart, **checkout + orders**, delivery slots, payment methods
- ✅ Seed data: CI + GB countries, 9 bilingual categories, 24 CI + 12 GB products, 3 offers, 3 stores, 5 CI + 2 GB cities, 5 roles, 2 AI prompts, super_admin
- ✅ Website: 6-module Getir-style tab bar (all official wordmarks, dark+light), MART Home, Category listing, Product listing/detail, Cart, **Checkout with address + slot + payment**, **Order confirmation + Orders list**
- ✅ Phone+OTP dialog + Google login + language switcher + auto-detect language + country switcher
- ✅ AI Product Search (Claude Sonnet 4.6) on customer home
- ✅ **Super Admin Platform** — email/password login, sidebar layout, 10 pages: Dashboard KPIs, Countries CRUD, Cities CRUD, Roles view, Finance (rolling 30d), AI Command Center (prompt library CRUD), AI Business Insights (LLM narrative), Audit Logs, Customers, Admin Users (super_admin creates more admins)
- ✅ Seeded super_admin: depexopenai@gmail.com / baked@2026#!$@ (bcrypt hashed, stored in DB, credentials in .env for rotation)
- ✅ **PRD §7 Module-First Administration (2026-02)** — Super Admin sidebar strictly matches Platform Governance (Dashboard · Countries · Cities · Admin Users · Roles · AI Center · AI Business Insights · Finance · Analytics · Audit Logs · API Management · Infrastructure · System Settings). Customers/Vendors/Drivers are module-scoped.
- ✅ **MART Module Workspace** — sub-nav with Overview · Vendors · Catalogue · Inventory · Orders · Customers (module-scoped) · Drivers · Finance · AI · Analytics · Promotions · Support · Settings
- ✅ **Vendor lifecycle**: pending → approve → approved → activate → active (+ reject / suspend) with document upload
- ✅ **Drivers CRUD** per module with status transitions (pending/active/inactive/suspended)
- ✅ **Module-scoped customer view**: derived from ≥1 order OR active cart items in the module; enriched with orders count + spend by currency
- ✅ Seeded 5 MART vendors (CI + GB) covering all statuses, 4 drivers (CI + GB)

## Backlog (prioritised)
- **P0**: Checkout + Order flow (Phase 2), Payment provider abstraction, Wallet
- **P1**: Super Admin Platform (Phase 6), RBAC-guarded admin endpoints, AI Business Insights UI
- **P1**: Real SMS OTP (Twilio Verify or Africa's Talking) — swap `OTP_PROVIDER` env
- **P2**: FOOD / SHOP / EXPRESS / AUTO / IMMO business modules
- **P2**: Partner Portal, Driver Portal
- **P2**: Notifications engine, Analytics, Search (OpenSearch), Media (MinIO)
- **P2**: RabbitMQ swap for the event bus (interface preserved)
