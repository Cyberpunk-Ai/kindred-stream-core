# GameFlex Social Uplift

Port and clone the repository https://github.com/gameflex254/Gameflex_space.git and work directly from the existing GameFlex codebase. Before making changes, thoroughly inspect the current architecture, frontend, backend, database schema, storage, authentication, APIs/Edge Functions, realtime features, routing, existing social functionality, configuration, and deployment setup. Preserve all existing working functionality and avoid breaking or unnecessarily rewriting stable code.

PRIMARY PRIORITY — SOCIAL EXPERIENCE

Perform a comprehensive production-grade upgrade of the entire social experience. Audit the current implementation and identify bugs, missing functionality, performance bottlenecks, poor UX, unnecessary network requests, inefficient database queries, storage issues, and areas where the architecture can be improved.

1. Uploads & Media

Completely improve the media-upload experience.

Make image and video uploads reliable and resilient.

Prevent uploads from randomly crashing, disappearing, failing silently, or producing incomplete posts.

Add proper upload progress indicators and processing states.

Implement robust error handling, retry behavior, cancellation, and recovery.

Increase the supported upload size to 25 MB where technically appropriate.

Optimize media before upload where beneficial without unnecessarily degrading quality.

Ensure storage uploads use efficient, secure, production-ready patterns.

Avoid loading large media files unnecessarily.

Ensure uploaded content remains correctly associated with the user's post/profile/content record.

Handle slow networks and interrupted uploads gracefully.

Ensure users receive clear feedback when an upload succeeds or fails.

2. Shareable URLs

Implement clean, stable, shareable links for:

User profiles

Posts

Reels/videos

Stories where applicable

Other publicly accessible social content

Links should open the correct content directly, support deep linking, and provide an excellent experience when shared externally.

Ensure routing, authentication boundaries, permissions, previews/metadata where appropriate, and fallback behavior are production-ready.

3. Infinite Scrolling & Content Loading

Replace inefficient content loading patterns with a scalable feed architecture.

Implement:

Infinite scrolling

Cursor-based pagination where appropriate

Prefetching

Intelligent caching

A small amount of preloaded content to make the feed feel instant

Loading skeletons

Proper empty states

Retry states

End-of-feed handling

Efficient image/video loading

Lazy loading

Avoidance of duplicate content

Prevention of unnecessary refetching

Do not simply load the entire social feed into the browser.

The architecture must remain performant as GameFlex grows from thousands to potentially millions of users and large amounts of content.

4. Social Interactions

Audit and improve all interaction systems, including:

Likes

Views

Comments

Replies

Reposts

Shares

Saves/bookmarks where applicable

Follow/unfollow

Profile interactions

Post interactions

Content discovery

Notifications

Interactions should feel instant while remaining consistent with the backend.

Use optimistic UI where appropriate, with safe rollback when backend operations fail.

Prevent:

Double likes

Duplicate comments

Duplicate reposts

Incorrect counters

Race conditions

Broken interaction states

Excessive database requests

Counters and engagement metrics must remain accurate and scalable.

5. Comments

Improve the comment experience substantially.

Implement an efficient architecture for:

Pagination

Infinite loading where appropriate

Replies

Comment counts

Optimistic posting

Error recovery

Loading states

Sorting/relevance where useful

Efficient fetching

Protection against excessive requests

Do not fetch thousands of comments unnecessarily.

6. Multi-Image Posts

Add a polished multi-image posting experience.

Users should be able to upload multiple images and create an attractive, clean collage/gallery presentation.

Support:

Multiple image selection

Upload progress

Reordering

Removing individual images

Preview before publishing

Clean responsive layouts

Automatic collage/grid presentation

Fullscreen viewing

Mobile-friendly interaction

Efficient storage and delivery

Make the experience feel modern and premium rather than simply displaying a raw list of images.

7. Social Feed / Recommendation Engine

Significantly improve the recommendation and personalization system.

The goal is a powerful, scalable, Instagram-grade personalized recommendation architecture, while keeping the implementation appropriate for GameFlex.

The recommendation system should consider signals such as:

Accounts followed

Profiles viewed

Posts viewed

Watch time

Likes

Comments

Shares

Reposts

Saves

Search behavior

Gaming interests

Games played

Tournament participation

Communities/squads

Creator interactions

Content categories

Recency

Engagement quality

User-to-user relationships

Content popularity

Similar users/interests

Negative signals such as skips, hides, unfollows, or low engagement

Build the recommendation system as an abstracted and replaceable service, not tightly coupled to the UI.

The architecture should allow the ranking system to evolve from a rules/weighted-signal model into more sophisticated machine-learning or ranking infrastructure later without requiring a complete rewrite of the platform.

Use appropriate feed-ranking, candidate-generation, filtering, scoring, diversity, freshness, and pagination strategies.

Avoid recommending the same content repeatedly.

Prioritize relevant content over simply showing the most popular content.

8. Performance & Backend Optimization

Perform a complete performance audit of the social system.

Optimize:

Database queries

Indexes

Pagination

API calls

Edge Functions

Storage access

Media delivery

Caching

Realtime subscriptions

Feed generation

Recommendation queries

Notification queries

Profile queries

Comment queries

Interaction writes

Eliminate N+1 queries and unnecessary repeated requests.

Use database indexes and query patterns appropriate for the actual workload.

Do not introduce unnecessary infrastructure or complexity.

9. Caching & Data Fetching

Introduce sensible caching and request deduplication where useful.

The architecture should avoid repeatedly requesting the same information.

Use appropriate stale/fresh behavior for:

Feed content

Profiles

Engagement counts

Comments

Recommendations

Notifications

Static/public content

Ensure cache invalidation is handled correctly.

10. UX Improvements

Perform a broad UX review of the social page and improve:

Loading states

Empty states

Error states

Skeletons

Animations

Transitions

Touch interaction

Mobile responsiveness

Desktop responsiveness

Accessibility

Feedback after actions

Upload experience

Content discovery

Navigation

Sharing

Profile exploration

The interface should feel fast, modern, polished, and intuitive.

Do not add unnecessary animations that hurt performance.

11. Additional Social Features

During the audit, identify important missing social functionality and implement appropriate improvements where they fit the existing architecture.

Potential areas include:

Better content discovery

Better profile exploration

Saved content

Content sharing

Better notification behavior

Hashtags/topics

Mentions

Better media viewing

Content reporting

Content moderation hooks

Improved creator/profile presentation

Better follow recommendations

Better engagement feedback

Better feed refresh behavior

Other high-value features discovered during the audit

Do not blindly add features just for the sake of adding them. Prioritize features that materially improve GameFlex's social ecosystem.

PRODUCTION SAFETY

This is extremely important.

The existing production environment contains real data. Do not wipe, reset, replace, or recreate the production database.

Development must be isolated from production.

All database changes must be implemented through explicit, version-controlled migrations.

For every schema/database change, provide the complete migration SQL that can be reviewed and manually applied to the production database.

Migrations must be:

Safe

Ordered

Reversible where practical

Idempotent where appropriate

Compatible with existing production data

Careful with existing RLS policies

Careful with indexes and constraints

Non-destructive unless explicitly required

Never use destructive operations such as dropping production tables, deleting existing user data, resetting the database, or replacing production schemas unless explicitly authorized.

Before applying any migration, verify its compatibility with the existing schema.

STORAGE

Audit the existing storage architecture.

Ensure:

Correct buckets

Correct permissions

Correct RLS/storage policies

Secure uploads

Efficient media delivery

Correct file ownership

No orphaned files where avoidable

Proper cleanup mechanisms

Reliable references between database records and stored media

The storage layer should remain abstracted so the underlying provider can be changed later without rewriting the application.

ENVIRONMENT & INFRASTRUCTURE ABSTRACTION

All environment-specific configuration must be abstracted through environment variables/configuration.

Do not hardcode:

Database credentials

Supabase credentials

Storage URLs

API keys

Service-role credentials

Production URLs

Development URLs

External service credentials

Secrets

The application must be switchable between development, staging, and production through environment configuration.

Maintain a clean separation such as:

Development
     ↓
Staging
     ↓
Production


The codebase should not require rewriting application code when switching environments.

DATABASE ARCHITECTURE

Treat the database as a critical production asset.

Before modifying the schema:

Inspect the existing schema.

Understand relationships.

Inspect existing indexes.

Inspect RLS policies.

Inspect triggers/functions.

Inspect storage policies.

Inspect existing migrations.

Identify dependencies.

Design the minimum required changes.

Create migration files.

Validate migrations against the development/staging environment.

Ensure they can be safely applied to production without losing existing data.

Do not duplicate existing tables or functionality unnecessarily.

ERROR HANDLING & RELIABILITY

Improve the platform's resilience across the social experience.

Every important asynchronous operation should have:

Loading state

Success state

Failure state

Retry mechanism where appropriate

User-friendly error message

Logging/diagnostic information

Safe recovery behavior

No silent failures.

No unexplained blank screens.

No disappearing posts.

No permanently stuck uploads.

No infinite loading states.

PLATFORM-WIDE AUDIT

Although the social page is the first priority, perform an overall audit of GameFlex and fix important issues you discover across the platform.

Check:

Authentication

Profiles

Navigation

Routing

Squads

Tournaments

Notifications

Messaging

Search

Storage

Database

Realtime

Edge Functions

API communication

Mobile experience

Desktop experience

Performance

Security

Error handling

Accessibility

PWA behavior where applicable

Only make changes that improve stability, usability, performance, security, or architectural quality.

CODE QUALITY

Keep the architecture clean and maintainable.

Prefer:

Reusable components

Reusable services

Clear separation of concerns

Typed interfaces

Centralized configuration

Abstracted storage services

Abstracted recommendation services

Abstracted API/data-access layers

Consistent error handling

Consistent loading states

Modular backend functions

Avoid:

Duplicated logic

Hardcoded credentials

Hardcoded environment-specific URLs

Giant components

Unnecessary dependencies

Unnecessary rewrites

Temporary hacks

Breaking existing functionality

PERFORMANCE TARGET

Design the updated system so that it can progressively scale from the current GameFlex user base toward 100K+ users and eventually much larger scale without requiring a fundamental rewrite of the social architecture.

Do not prematurely over-engineer the platform, but make important architectural boundaries scalable from the beginning.

FINAL VALIDATION

After implementing the work:

Run the production build.

Run available tests.

Check TypeScript errors.

Check lint errors.

Check database migrations.

Check RLS.

Check authentication.

Check uploads.

Test the 25 MB upload limit.

Test image and video uploads.

Test multi-image posts.

Test likes.

Test comments/replies.

Test reposts.

Test sharing.

Test profile links.

Test infinite scrolling.

Test pagination.

Test recommendation/feed loading.

Test error recovery.

Test mobile responsiveness.

Test desktop responsiveness.

Check for console errors.

Check for network/request inefficiencies.

Check for obvious database N+1 queries.

Check for broken routes.

Check for regressions.

Do not declare the implementation complete merely because the application builds.

DELIVERABLES

At the end, provide a concise implementation report containing:

What was audited.

What was changed.

What bugs were fixed.

What new functionality was added.

What performance improvements were made.

What database changes were required.

The complete migration files/SQL for every database change.

Any new environment variables required.

Any storage policy changes required.

Any Edge Function/backend changes.

Any important architectural changes.

Tests and validation performed.

Any remaining issues or recommended future improvements.

Most importantly: preserve existing GameFlex data and functionality, keep development/staging isolated from production, make all database changes migration-based, and leave the entire system production-ready, scalable, maintainable, and switchable between environments through configuration.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kindred-stream-core.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7a567234-f6e4-4fa7-b982-b3e468b7a425).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
