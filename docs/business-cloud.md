# Business and Cloud

## Packaging hypotheses

### Free desktop

**Confirmed principle:** useful local core, no forced watermark, no account.

**Provisional entitlement:** unlimited basic capture, copy/save, and basic annotation; advanced workflows and customization may be paid.

### Desktop Pro

**Provisional:** USD 29 one-time, advanced local capture/editing, Studio, brand presets, and no hosted-cloud entitlement. The working model includes one year of updates, after which the last eligible version remains usable and update renewal is optional.

### Cloud Pro

**Provisional:** approximately USD 5/month for all desktop features, hosted sharing, analytics, and 25 GB. Additional storage would be an explicit add-on rather than ambiguous unlimited fair use.

## Cloud architecture

Cloudflare R2 is the initial object store behind an S3-compatible abstraction. Objects remain private. An application API authenticates users, validates entitlements and quotas, issues short-lived upload authorization, stores Postgres metadata, and serves share-page authorization and analytics.

Keep identity, billing, relational metadata, and object APIs replaceable. Do not expose permanent R2 credentials to desktop clients.

## Analytics definitions

- **View:** successful share page load after bot and owner-preview filtering.
- **Approximate unique view:** privacy-preserving daily visitor key; never market this as exact people.
- **Download:** explicit download action or direct-download endpoint completion.
- **Interaction:** deliberate supported share-page action, versioned by event name.

Document owner views, embeds, prefetchers, bots, privacy protections, retention, and time zones in the dashboard.

## Security and abuse controls

- MIME sniffing, extension normalization, size and dimension limits
- Per-account and per-IP rate limits
- Signed uploads scoped to one object and expected content type
- Quotas and idempotent upload completion
- Share-password hashing, expiry, self-destruction, and revocation
- Report-abuse flow, administrative review, and deletion lifecycle
- Billing webhook verification and entitlement reconciliation
- Account export and deletion

## Unresolved commercial decisions

- Exact free versus paid tool boundary
- Whether the first paid purchase receives one year of updates or a major-version entitlement
- Final cloud quota, maximum file size, and retention
- Payment provider, taxes, regional pricing, refunds, and educational pricing
- Team packaging and custom-domain availability

