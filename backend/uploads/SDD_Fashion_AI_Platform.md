
# Software Design Document
## AI-Powered Fashion Assistant Platform

**Version:** 1.0
**Date:** May 2026
**Status:** Initial design — pre-implementation

---

## 1. Introduction

### 1.1 Purpose

This document is the engineering blueprint for building the AI fashion assistant platform from scratch. It describes the system architecture, service boundaries, data models, AI pipelines, API contracts, and the order in which to build things. A developer joining the project should be able to read this end-to-end and start writing code without needing to ask "where does this go?"

### 1.2 Scope

The platform consists of two user-facing experiences backed by a shared infrastructure:

1. **Personal AI Wardrobe Assistant** — users digitize their real wardrobe, receive personalized outfit combinations, and get intelligent gap-analysis recommendations for new purchases.
2. **Fashion Inspiration & Discovery Feed** — users browse curated outfits on models, save inspirations, and purchase items via affiliate links.

Both share a common AI layer, user identity, and data backbone.

### 1.3 Out of scope (for v1)

- Live styling sessions with human stylists
- AR try-on / virtual fitting
- Social features (following other users, sharing outfits publicly)
- In-house e-commerce / inventory — we are affiliate-only at launch

These are noted as future work in §10.

### 1.4 Audience

Backend engineers, ML engineers, frontend engineers, DevOps, product managers, and QA.

---

## 2. System Overview

### 2.1 Architectural style

A **microservices** architecture organized around business capabilities, with an **event-driven backbone** (Kafka) for asynchronous workflows and **synchronous gRPC** between services where the user is waiting.

We deliberately split the backend across two languages:
- **TypeScript (NestJS)** for CRUD-heavy services where developer velocity matters.
- **Python (FastAPI)** for AI/ML services where the ecosystem is non-negotiable.

### 2.2 Key principles

1. **Async-first for AI work.** The user should never wait synchronously for a 5-second vision pipeline. Acknowledge fast, process in the background, notify when done.
2. **Cache aggressively.** Wardrobe reads happen constantly; outfit suggestions get reopened. Redis everywhere it makes sense.
3. **Vector + relational split.** Postgres for structured wardrobe data; vector DB for similarity. Don't try to do everything in one store.
4. **LLMs are reasoners, not retrievers.** Use cheap deterministic methods (rules, kNN) for candidate generation; use LLMs only for the final reasoning step.
5. **Provider-agnostic AI.** Abstract LLM/CV calls so any provider can be swapped per task.

### 2.3 High-level architecture

The system has six layers:

| Layer | Responsibility |
|-------|----------------|
| Client | React Native (mobile), Next.js (web), CDN-served images |
| Edge | API gateway, auth, rate limiting, WAF |
| Service | Microservices owning business capabilities |
| Async | Kafka event bus, background workers |
| AI/ML | Vision, embedding, recommendation, stylist LLM |
| Data | Postgres, vector DB, Redis, S3, analytics warehouse |

Diagrams for the full system, wardrobe feature, and suggestion feature are provided alongside this document.

---

## 3. Service Decomposition

Each service owns its data, exposes a clear API, and can be deployed independently.

### 3.1 User Service (NestJS)

**Owns:** Authentication, user profiles, personal attributes (height, weight, body type, skin tone, gender, style preferences), preference learning state.

**Storage:** `users`, `user_profiles`, `user_preferences` tables in Postgres.

**Key APIs:**
- `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`
- `GET /users/me`, `PATCH /users/me`
- `GET /users/me/profile`, `PUT /users/me/profile`
- `GET /users/me/preferences`, `PATCH /users/me/preferences`

**Events emitted:** `user.created`, `user.profile_updated`, `user.preferences_changed`

### 3.2 Wardrobe Service (NestJS)

**Owns:** All clothing items belonging to users — CRUD, tagging, organization, image references.

**Storage:** `wardrobe_items`, `item_attributes`, `item_tags` in Postgres. Item images in S3.

**Key APIs:**
- `POST /wardrobe/items` (upload photo or URL)
- `GET /wardrobe/items` (paginated, filterable)
- `GET /wardrobe/items/:id`
- `PATCH /wardrobe/items/:id` (edit attributes)
- `DELETE /wardrobe/items/:id`
- `POST /wardrobe/items/bulk-import`

**Events emitted:** `item.uploaded`, `item.processed`, `item.deleted`, `item.attributes_corrected`

**Events consumed:** `item.vision_complete` (from Vision service) → updates item with extracted attributes.

### 3.3 Outfit Service (NestJS, orchestrates Python)

**Owns:** Outfit combinations, gap analysis results, saved outfits, outfit history.

**Storage:** `outfits`, `outfit_items`, `saved_outfits`, `gap_analysis_results` in Postgres.

**Key APIs:**
- `POST /outfits/suggest` — generate outfit recommendations (synchronous, blocking)
- `GET /outfits/saved`
- `POST /outfits/:id/save`
- `DELETE /outfits/:id/save`
- `GET /outfits/gap-analysis` — get current gap analysis
- `POST /outfits/gap-analysis/refresh` — trigger recomputation

**Internal calls:** gRPC to Recommender service for candidates, then gRPC to Stylist LLM service for reasoning.

**Events consumed:** `item.uploaded` and `item.deleted` invalidate cached gap analysis.

### 3.4 Feed Service (NestJS + Python ranker)

**Owns:** Inspiration feed cards, editorial content, ranking model, feed personalization.

**Storage:** `feed_cards`, `feed_card_items`, `user_feed_interactions` in Postgres. Precomputed rankings cached in Redis.

**Key APIs:**
- `GET /feed?cursor=...` — paginated feed
- `POST /feed/cards/:id/like`
- `POST /feed/cards/:id/save`
- `POST /feed/cards/:id/dismiss`
- `GET /feed/filters` — available filter options
- `GET /feed?style=streetwear&occasion=party&...`

**Events emitted:** `feed.engagement` (likes, saves, dismisses) — drives personalization.

### 3.5 Commerce Service (NestJS)

**Owns:** Product catalog references, affiliate link resolution, scraping product metadata from URLs, click tracking, commission attribution.

**Storage:** `external_products`, `affiliate_links`, `purchase_clicks` in Postgres.

**Key APIs:**
- `POST /commerce/resolve-url` — extract product info from a pasted URL
- `GET /commerce/products/:id`
- `POST /commerce/clicks` — track outbound clicks for attribution
- `GET /commerce/search?q=...` — find products matching a description

**External integrations:** Amazon Associates, Flipkart Affiliate, Myntra Partner API, H&M, Ajio (via scraping or partnership APIs where available).

### 3.6 Notification Service (NestJS)

**Owns:** Push notifications, transactional emails, in-app notifications.

**Storage:** `notifications`, `notification_preferences`, `device_tokens` in Postgres.

**Key APIs:**
- `POST /notifications/devices` — register device token
- `GET /notifications/in-app`
- `PATCH /notifications/:id/read`

**Events consumed:** `item.processed`, `outfit.suggested`, `gap_analysis.complete` → fan out to user devices via FCM/APNs.

### 3.7 Vision Service (Python FastAPI)

**Owns:** All computer-vision processing on clothing images.

**Pipeline:**
1. Background removal (rembg or SAM)
2. Garment segmentation if multiple items in one photo
3. Attribute classification: category, color, pattern, fit, formality, season suitability
4. Embedding generation (CLIP-based)

**Key APIs (internal gRPC):**
- `ProcessItem(image_url) → {attributes, embedding, processed_image_url}`
- `BatchProcess(image_urls[]) → results[]`

**Events consumed:** `item.uploaded` → run pipeline.
**Events emitted:** `item.vision_complete` with extracted data.

### 3.8 Embedding Service (Python FastAPI)

**Owns:** Vector embedding generation for items, users (style profile), and queries.

**Models:** CLIP (image), sentence-transformers (text). Maintained as a thin wrapper so we can swap models without changing consumers.

**Key APIs (internal gRPC):**
- `EmbedImage(image_url) → vector[512]`
- `EmbedText(text) → vector[512]`
- `EmbedUser(user_id) → vector[512]` (aggregate of wardrobe + preferences)

### 3.9 Recommender Service (Python FastAPI)

**Owns:** Candidate outfit generation, gap analysis combinatorial logic, feed ranking model.

**Approaches:**
- **Phase 1 (launch):** Rule-based candidate generation + kNN similarity from vector DB.
- **Phase 2 (post-PMF):** Two-tower neural recommender trained on saved/liked outfits.
- **Phase 3:** Sequential transformer for feed ranking.

**Key APIs (internal gRPC):**
- `GenerateOutfitCandidates(user_id, context) → candidates[]`
- `ComputeGapAnalysis(user_id) → recommendations[]`
- `RankFeed(user_id, candidate_card_ids[]) → ranked_ids[]`

### 3.10 Stylist LLM Service (Python FastAPI)

**Owns:** All LLM-based reasoning — outfit explanation, style commentary, conversational interface.

**Provider abstraction:** Pluggable backends — Claude, GPT-4o, Gemini. Routed per task based on quality/cost trade-offs.

**Key APIs (internal gRPC):**
- `RankAndExplain(candidates[], context) → explained_outfits[]`
- `Chat(user_id, message, conversation_id) → response`
- `CritiqueOutfit(outfit) → feedback`

**Prompt management:** Prompts versioned and stored in a config repo, not hardcoded. A/B testable.

---

## 4. Data Model

### 4.1 Core entities (Postgres)

```sql
-- Users and identity
users (id, email, phone, auth_provider, created_at, ...)
user_profiles (user_id, height_cm, weight_kg, body_type, skin_tone, gender, dob, ...)
user_preferences (user_id, style_tags[], disliked_colors[], budget_band, ...)

-- Wardrobe
wardrobe_items (
  id, user_id, category, subcategory, primary_color, secondary_colors[],
  pattern, fit, formality, seasons[], image_url, thumb_url,
  source ('upload' | 'camera' | 'url'), source_url,
  processing_status ('pending' | 'processed' | 'failed'),
  created_at, updated_at
)
item_attributes (item_id, key, value, confidence)  -- extracted attributes
item_tags (item_id, tag)  -- user-added tags

-- Outfits
outfits (id, user_id, created_at, context_json, reasoning_text, score)
outfit_items (outfit_id, item_id, role)  -- role: 'top', 'bottom', 'shoes', 'outerwear', 'accessory'
saved_outfits (user_id, outfit_id, saved_at)

-- Gap analysis
gap_analysis_results (
  user_id, missing_item_description, unlocked_outfit_count,
  versatility_score, suggested_product_ids[],
  computed_at, expires_at
)

-- Feed
feed_cards (id, title, description, model_image_url, style_tags[], created_at, source)
feed_card_items (card_id, item_id, role, x_coord, y_coord)  -- coords for hotspot tagging
user_feed_interactions (user_id, card_id, action, timestamp)

-- Commerce
external_products (id, source, source_id, title, brand, image_url, price, url, scraped_at)
affiliate_links (product_id, network, tracking_url)
purchase_clicks (id, user_id, product_id, outfit_id, clicked_at, referrer_context)
```

### 4.2 Vector store schema (Pinecone/Qdrant)

Two indexes:
- `item_embeddings` — namespace per user, vectors are 512-d CLIP embeddings, metadata includes `item_id`, `category`, `color`, `formality`.
- `style_embeddings` — global, vectors derived from feed cards and curated style references, used for "find items matching this style".

### 4.3 Cache keys (Redis)

```
wardrobe:{user_id}              -- full wardrobe JSON, TTL 5m
user_profile:{user_id}          -- profile JSON, TTL 1h
gap_analysis:{user_id}          -- latest gap analysis, TTL 24h
feed:{user_id}:{cursor_hash}    -- paginated feed slice, TTL 15m
outfit_suggestions:{user_id}:{context_hash}  -- cached suggestion, TTL 1h
trend_signals:global            -- aggregate trend data, TTL 6h
```

---

## 5. AI / ML Architecture

### 5.1 Vision pipeline (per uploaded item)

```
Image upload → S3 → event: item.uploaded → Vision service:
  1. Fetch image from S3
  2. Remove background (rembg/SAM)
  3. Detect & segment if multiple garments
  4. For each segment:
     a. Classify category (shirt/jeans/shoes/...)
     b. Extract color palette (k-means on pixels)
     c. Run fashion attribute classifier (fine-tuned CLIP head)
     d. Generate CLIP embedding
  5. Write attributes back to wardrobe_items via gRPC to Wardrobe service
  6. Upsert embedding into vector DB
  7. Emit: item.vision_complete
```

**Latency target:** P50 < 4s, P95 < 10s.
**Cost optimization:** Batch processing where possible; cache CLIP results by image hash.

### 5.2 Outfit generation pipeline (synchronous)

```
User requests outfit (with context: occasion, weather, etc.)
  → Outfit service:
    1. Load wardrobe + user profile (Redis, fallback PG)
    2. Call Recommender service:
       a. Filter wardrobe by hard constraints (season, occasion)
       b. Vector kNN to find items that pair well (item A → top 20 nearest B's)
       c. Apply rule engine (color theory: complementary/analogous; formality match)
       d. Score candidate outfits (compatibility × diversity × user history)
       e. Return top 20 candidates
    3. Call Stylist LLM service:
       a. Construct prompt: user context + top 20 candidates + style guidelines
       b. LLM reranks and writes a 1-2 sentence rationale per outfit
       c. Return top 5 with explanations
    4. Cache result; return to user
```

**Latency target:** P50 < 2s, P95 < 5s.

### 5.3 Gap analysis pipeline (async, nightly + on-demand)

```
For each user with active wardrobe:
  1. Define a candidate set of "essential missing items"
     (white shirt, black jeans, white sneakers, black blazer, ...)
     based on user style preferences and known wardrobe gaps
  2. For each candidate:
     a. Simulate adding it to the wardrobe
     b. Count valid new outfit combinations it enables (constrained combinatorial)
     c. Score: unlocked_count × versatility × budget_fit
  3. Sort, take top 5
  4. For each, query Commerce service for matching real products
  5. Write to gap_analysis_results, cache in Redis
  6. Emit: gap_analysis.complete → notify user if score improved significantly
```

### 5.4 Feed personalization

Hybrid: editorial-curated content + algorithmic ranking. The editorial team uploads curated outfits weekly. The ranker (initially heuristic, later ML) sorts these per user based on:
- Style affinity (cosine sim between user style embedding and card embedding)
- Recency
- Engagement signals (CTR, save rate from similar users)
- Diversity penalty (avoid showing 5 streetwear cards in a row)

### 5.5 LLM provider routing

```
Task type                  → Primary       → Fallback
------------------------------------------------------------
Outfit reasoning (premium)  → Claude        → GPT-4o
Bulk feed descriptions      → Gemini Flash  → GPT-4o-mini
Conversational chat         → Claude        → GPT-4o
Image-based critique        → Claude        → GPT-4o
```

Routing logic lives in the Stylist LLM service. Each call is logged with input/output/cost for analytics.

---

## 6. API Design Principles

### 6.1 Public REST APIs

All client-facing APIs are versioned (`/v1/...`), use JSON, and follow RESTful conventions. Auth via JWT in `Authorization: Bearer <token>`. Errors follow RFC 7807 (problem+json).

### 6.2 Internal gRPC

Service-to-service calls use gRPC with protobuf schemas in a shared repo. Schemas are the source of truth for inter-service contracts.

### 6.3 Events

Kafka topics are namespaced by domain (`wardrobe.events`, `outfit.events`, etc.). Schemas registered in a schema registry (Confluent or Apicurio). Every event has a `version`, `event_id`, `occurred_at`, and `actor_id` envelope.

### 6.4 Idempotency

All POST endpoints that create resources accept an `Idempotency-Key` header. Critical for mobile clients on flaky networks.

---

## 7. Security & Privacy

- **Authentication:** Auth0 / Clerk for v1; rotate to self-hosted Keycloak if cost justifies. Refresh tokens stored in secure storage on device.
- **Authorization:** All wardrobe APIs scope to `user_id` from JWT — never trust client-provided user IDs.
- **PII handling:** Body measurements, skin tone, photos are sensitive. Encrypted at rest (AWS KMS), encrypted in transit (TLS 1.3 everywhere).
- **Image storage:** Pre-signed S3 URLs only, no public buckets. Images are user-private by default; feed images are public.
- **Rate limiting:** Per-user limits at the API gateway. AI endpoints have stricter limits (LLM calls are expensive).
- **GDPR / data deletion:** A user delete cascades — items, outfits, embeddings, analytics rows scrubbed within 30 days.
- **Affiliate disclosure:** Required by FTC and similar regulators in target markets; surfaced in UI on every commerce link.

---

## 8. Observability

- **Metrics:** Prometheus + Grafana. Every service exposes `/metrics`. Key dashboards: API latency, error rates, AI pipeline throughput, LLM cost per user.
- **Logs:** Structured JSON logs to Loki / CloudWatch. Trace IDs threaded via OpenTelemetry.
- **Traces:** OpenTelemetry → Tempo / Jaeger. Critical for debugging outfit-suggestion latency.
- **Errors:** Sentry for frontend and backend exception tracking.
- **Product analytics:** Events to ClickHouse; PostHog or Amplitude for funnels.

**SLOs:**
- API gateway P95 latency < 500ms (excluding AI endpoints)
- Outfit suggestion P95 < 5s
- Image upload acknowledgment P95 < 1s
- Availability: 99.9% per service

---

## 9. Build Roadmap

A pragmatic order so you have a working system at every milestone, not one big bang at the end.

### Phase 0 — Foundations (weeks 1–3)
- Repo setup (monorepo with Nx or Turborepo, or polyrepo — your call)
- CI/CD pipelines, base Docker images, Kubernetes cluster
- Auth (User service skeleton + Auth0/Clerk integration)
- Postgres + Redis provisioned
- Basic mobile app shell with login

### Phase 1 — Wardrobe MVP (weeks 4–8)
- Wardrobe service CRUD
- S3 image upload from mobile
- Vision service v1 (background removal + basic category classification only)
- Embedding service v1 (off-the-shelf CLIP)
- Wardrobe grid UI on mobile

### Phase 2 — Outfit suggestions v1 (weeks 9–12)
- Outfit service
- Recommender service with rule-based logic only
- Stylist LLM service hooked to Claude
- Outfit suggestion UI

### Phase 3 — Gap analysis + Commerce (weeks 13–16)
- Gap analysis batch job
- Commerce service with affiliate integrations (start with 1–2 networks)
- Outfit detail UI with "buy this" CTAs

### Phase 4 — Inspiration feed (weeks 17–20)
- Feed service
- Editorial content uploader (admin tool)
- Feed UI on mobile + web
- Heuristic ranker

### Phase 5 — Personalization + scale (weeks 21+)
- Two-tower recommender (replaces heuristics where data justifies)
- Trend signals from feed engagement
- A/B testing infrastructure
- Web app feature parity

---

## 10. Future Work

- **AR / virtual try-on:** integrate with body-shape models for visual outfit previews on the user's own avatar.
- **Social layer:** follow other users, public outfit boards, stylist creators.
- **In-house commerce:** beyond affiliate — direct partnerships with brands, possibly private-label.
- **Live stylist booking:** human-in-the-loop for high-stakes occasions.
- **On-device inference:** for privacy-sensitive markets, run CLIP variants on-device with model distillation.
- **Multilingual + multi-region:** localize style sensibilities (Indian ethnic wear ≠ European minimal ≠ K-fashion).

---

## 11. Appendix

### 11.1 Glossary

- **Outfit:** A collection of items (top, bottom, shoes, optional outerwear, optional accessories) intended to be worn together.
- **Gap analysis:** Combinatorial reasoning identifying which missing items would unlock the most new outfit combinations.
- **Embedding:** A 512-dimensional vector representation of an item, user style, or query, enabling similarity search.
- **Two-tower model:** Recommender architecture with separate neural networks for users and items, trained to score (user, item) compatibility.
- **RAG:** Retrieval-augmented generation — feeding retrieved context (the user's wardrobe) into an LLM prompt.

### 11.2 Open questions

- Should we offer a "lite" tier without LLM-based reasoning to control costs?
- How aggressive should we be about scraping product data vs. waiting for partnership APIs?
- Do we build a stylist-facing tool for editorial content, or use a third-party CMS?
- What's the legal status of storing user body measurements in our target markets?

---

*End of document.*
