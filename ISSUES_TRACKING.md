# OMS Issues & Gaps Tracking List
## Comprehensive Issue List for Remediation

**Generated:** January 31, 2026  
**Total Issues:** 58  
**Critical:** 15 | **High:** 18 | **Medium:** 15 | **Low:** 10

---

## 🔴 CRITICAL ISSUES (Priority 1 - Must Fix Immediately)

### CODE DUPLICATIONS

- [ ] **CRIT-001** Storage Service Duplication (3 implementations)
  - Files: `storage-service.ts`, `StorageService.ts`, `storage.ts`
  - Impact: Inconsistent file handling, data loss risk
  - Effort: 8h | Sprint: 1

- [ ] **CRIT-002** Logger Duplication (2 implementations)
  - Files: `logger.ts`, `logging/logger.ts`
  - Impact: Inconsistent logging, difficult debugging
  - Effort: 6h | Sprint: 1

- [ ] **CRIT-003** Email Service Duplication (2 implementations)
  - Files: `email-service.ts`, `email/EmailService.ts`
  - Impact: Unpredictable email delivery
  - Effort: 10h | Sprint: 2

- [ ] **CRIT-004** Backup Service Conflict (2 incompatible implementations)
  - Files: `backup-service.ts` (pg_dump), `backup/BackupService.ts` (Supabase)
  - Impact: DATA LOSS RISK - pg_dump won't work with Supabase
  - Effort: 12h | Sprint: 1 | **URGENT**

- [ ] **CRIT-005** Webhook Service Duplication (2 implementations)
  - Files: `webhook-service.ts`, `webhooks/WebhookService.ts`
  - Impact: Inconsistent webhook delivery
  - Effort: 8h | Sprint: 2

### DOCUMENTATION

- [ ] **CRIT-006** Backend Architecture Contradiction
  - Issue: Docs describe PostgreSQL direct + Node.js but code uses Supabase + SvelteKit
  - Files: `deployment.md`, `authentication.md`, `getting-started.md`
  - Impact: New developers follow wrong setup, deployment fails
  - Effort: 16h | Sprint: 1 | **BLOCKS ONBOARDING**

- [ ] **CRIT-007** Missing Database Setup Script
  - Issue: `init-database.sh` referenced but doesn't exist
  - Files: `getting-started.md`, `deployment.md`
  - Impact: Cannot follow setup instructions
  - Effort: 4h | Sprint: 1

- [ ] **CRIT-008** Environment Variable Mismatch
  - Issue: Docs show PostgreSQL vars but code needs Supabase keys
  - Files: `configuration.md`, `getting-started.md` vs `.env.example`
  - Impact: Configuration errors
  - Effort: 3h | Sprint: 1

### TESTING

- [ ] **CRIT-009** No Backup Restore Tests
  - Issue: Two backup services but no restore verification
  - Impact: Cannot recover from data loss
  - Effort: 8h | Sprint: 1 | **DATA SAFETY**

- [ ] **CRIT-010** Zero Test Coverage for Storage Service
  - Issue: Storage service (294 LOC) has no tests
  - Impact: File upload/download bugs in production
  - Effort: 12h | Sprint: 2

- [ ] **CRIT-011** Zero Test Coverage for Email Service
  - Issue: Email services have no tests
  - Impact: Email delivery failures
  - Effort: 8h | Sprint: 2

### SECURITY

- [ ] **CRIT-012** Unencrypted Backups
  - Issue: Backup service creates unencrypted database dumps
  - Files: `backup-service.ts`
  - Impact: Sensitive data exposure
  - Effort: 6h | Sprint: 1 | **SECURITY**

- [ ] **CRIT-013** Console.log May Expose Secrets
  - Issue: 227 console statements may log tokens/passwords
  - Impact: Credentials in browser console
  - Effort: 12h | Sprint: 2 | **SECURITY**

- [ ] **CRIT-014** No Rate Limiting
  - Issue: API routes lack rate limiting
  - Impact: DDoS vulnerability
  - Effort: 8h | Sprint: 2 | **SECURITY**

### BUGS

- [ ] **CRIT-015** Storage Export Namespace Collision
  - File: `/src/lib/server/storage/index.ts`
  - Issue: Exports `StorageService` but `StorageService.ts` also exists
  - Impact: Wrong class imported, runtime errors
  - Effort: 2h | Sprint: 1

---

## 🟠 HIGH PRIORITY ISSUES (Priority 2 - Fix Soon)

### CODE DUPLICATIONS

- [ ] **HIGH-001** Notification Systems (3 implementations!)
  - Files: `notify/`, `notifications/`, `stores/notifications.ts`
  - Impact: Feature fragmentation, inconsistent UX
  - Effort: 20h | Sprint: 3

- [ ] **HIGH-002** Realtime Order Handling (6 files!)
  - Files: `realtime-order-store.ts`, `useRealtimeOrders.ts`, `realtime-service.ts`, `use-realtime-orders.ts`, `stores/realtime.ts`, `stores/ordersRealtime.ts`
  - Impact: Multiple subscriptions, performance issues, hard to debug
  - Effort: 16h | Sprint: 2

- [ ] **HIGH-003** Diff/Compare Duplication
  - Files: `diff/diff.js`, `compare/diff.ts`
  - Impact: Maintenance burden
  - Effort: 4h | Sprint: 3

- [ ] **HIGH-004** Focus Trap Duplication
  - Files: `focus-trap.ts`, `focusTrap.ts` both in `lib/a11y/`
  - Impact: Accessibility inconsistency
  - Effort: 2h | Sprint: 2

### ARCHITECTURE

- [ ] **HIGH-005** Inconsistent File Naming
  - Issue: Mix of kebab-case and PascalCase (storage-service.ts vs StorageService.ts)
  - Impact: Developer confusion
  - Effort: 6h | Sprint: 3

- [ ] **HIGH-006** Mixed Architecture Patterns
  - Issue: Class-based vs functional services with no standard
  - Impact: Code inconsistency
  - Effort: Document only: 4h | Sprint: 2

- [ ] **HIGH-007** Large Service Files (>400 LOC)
  - Files: AnalyticsService (521), backup-service (492), inventory/store (472), audit-service (471)
  - Impact: Hard to maintain and test
  - Effort: 24h | Sprint: 4+

### DOCUMENTATION

- [ ] **HIGH-008** Duplicate Deployment Guides
  - Files: `deployment.md`, `vercel_setup_guide.md`, `vercel-environment-setup.md`, `DEPLOYMENT_FIX.md`, `staging-deployment.md`
  - Impact: Contradictory instructions
  - Effort: 8h | Sprint: 3

- [ ] **HIGH-009** Outdated README
  - Issue: Claims adapter-static but uses adapter-vercel/node
  - Impact: Wrong deployment expectations
  - Effort: 2h | Sprint: 1

- [ ] **HIGH-010** Duplicate Testing Docs
  - Files: `TESTING.md`, `testing_guide.md`, `docs/development.md`
  - Impact: Unclear testing guidelines
  - Effort: 4h | Sprint: 3

- [ ] **HIGH-011** Incomplete API Documentation
  - Issue: Only 100 lines for 101 API endpoints
  - Impact: Difficult API integration
  - Effort: 24h | Sprint: 3

### BUGS

- [ ] **HIGH-012** Incomplete Realtime Presence
  - File: `realtime-order-store.ts` line 8
  - Issue: "Placeholder for Presence since it's not exported/implemented yet"
  - Impact: Runtime errors if presence used
  - Effort: 6h | Sprint: 2

- [ ] **HIGH-013** Conditional Import Risk
  - File: `email/EmailService.ts` line 5
  - Issue: nodemailer commented "will be installed later"
  - Impact: Runtime error if EmailService used
  - Effort: 1h | Sprint: 1

- [ ] **HIGH-014** TODO: Monitoring Integration
  - File: `error-handler.ts`
  - Issue: "TODO: Integrate with monitoring service"
  - Impact: No error tracking
  - Effort: 6h | Sprint: 2

- [ ] **HIGH-015** TODO: Email Templates
  - File: `NotificationScheduler.ts`
  - Issue: "TODO: Create low stock email template"
  - Impact: Incomplete feature
  - Effort: 4h | Sprint: 3

- [ ] **HIGH-016** TODO: Local Storage Fallback
  - File: `routes/api/files/upload/+server.ts`
  - Issue: "TODO: Implement local fallback"
  - Impact: Upload fails if S3 unavailable
  - Effort: 6h | Sprint: 2

### TESTING

- [ ] **HIGH-017** Zero Test Coverage for Webhooks
  - Issue: WebhookService (299 LOC) has no tests
  - Impact: Webhook failures
  - Effort: 8h | Sprint: 2

- [ ] **HIGH-018** No Integration Tests
  - Issue: No end-to-end user flow tests
  - Impact: Breaking changes in production
  - Effort: 40h | Sprint: 3

---

## 🟡 MEDIUM PRIORITY ISSUES (Priority 3 - Should Fix)

### DOCUMENTATION

- [ ] **MED-001** Missing Feature Documentation: Change Requests
  - Impact: Users don't understand CR workflow
  - Effort: 6h | Sprint: 4

- [ ] **MED-002** Missing Feature Documentation: Rework Cycles
  - Impact: Operators confused about rework tracking
  - Effort: 4h | Sprint: 4

- [ ] **MED-003** Missing Feature Documentation: Loading Dates
  - Impact: Logistics team lacks guidance
  - Effort: 4h | Sprint: 4

- [ ] **MED-004** Missing Feature Documentation: Chat System
  - Impact: No chat usage guidelines
  - Effort: 6h | Sprint: 4

- [ ] **MED-005** Missing Feature Documentation: QR Scanning
  - Impact: QR feature underutilized
  - Effort: 4h | Sprint: 4

- [ ] **MED-006** No Database Migration Guide
  - Issue: `migrate_to_supabase.sh` exists but not documented
  - Impact: Risky migrations
  - Effort: 6h | Sprint: 3

- [ ] **MED-007** No Supabase Setup Guide
  - Issue: Missing step-by-step Supabase project creation
  - Impact: Difficult onboarding
  - Effort: 8h | Sprint: 3

### CODE QUALITY

- [ ] **MED-008** 227 Console Statements in Production
  - Issue: console.log/error/warn in src/lib/
  - Impact: Performance, information leakage
  - Effort: 12h | Sprint: 2

- [ ] **MED-009** No ESLint Rule for Console
  - Issue: New console statements keep being added
  - Impact: Regression
  - Effort: 1h | Sprint: 2

- [ ] **MED-010** Circular Dependency Risk
  - Issue: Large services with many imports
  - Impact: Build errors
  - Effort: 16h | Sprint: 4+

### TESTING

- [ ] **MED-011** No Code Coverage Reporting
  - Issue: Coverage not tracked in CI
  - Impact: Unknown test coverage
  - Effort: 4h | Sprint: 3

- [ ] **MED-012** No E2E Tests
  - Issue: No Playwright/Cypress tests
  - Impact: UI regression bugs
  - Effort: 20h | Sprint: 4+

- [ ] **MED-013** Zero Test Coverage for Analytics
  - Issue: AnalyticsService (521 LOC) has no tests
  - Impact: Analytics bugs
  - Effort: 12h | Sprint: 3

- [ ] **MED-014** Zero Test Coverage for Audit
  - Issue: AuditService (471 LOC) has no tests
  - Impact: Audit trail failures
  - Effort: 10h | Sprint: 3

### PERFORMANCE

- [ ] **MED-015** No Performance Monitoring
  - Issue: No metrics collection for API or client
  - Impact: Cannot detect slowdowns
  - Effort: 12h | Sprint: 4+

---

## 🟢 LOW PRIORITY ISSUES (Priority 4 - Nice to Have)

### DOCUMENTATION

- [ ] **LOW-001** No RLS Policy Documentation
  - Issue: Supabase Row-Level Security policies not documented
  - Impact: Security misconfig risk
  - Effort: 4h | Sprint: 5+

- [ ] **LOW-002** No Vercel Output Directory Explanation
  - Issue: `.vercel/output` not explained in docs
  - Impact: Confusion about build artifacts
  - Effort: 2h | Sprint: 4+

- [ ] **LOW-003** Missing CHANGELOG Updates
  - Issue: Changes not consistently logged
  - Impact: Unclear release history
  - Effort: Ongoing

### CODE QUALITY

- [ ] **LOW-004** Inconsistent Error Handling
  - Issue: Some services throw, some return null
  - Impact: Inconsistent error UX
  - Effort: 16h | Sprint: 5+

- [ ] **LOW-005** No Prettier Configuration
  - Issue: Code formatting inconsistent
  - Impact: PR diff noise
  - Effort: 2h | Sprint: 4+

- [ ] **LOW-006** No Barrel Exports
  - Issue: Deep imports instead of index.ts barrels
  - Impact: Verbose imports
  - Effort: 8h | Sprint: 5+

### TESTING

- [ ] **LOW-007** No Visual Regression Tests
  - Issue: UI changes not visually tested
  - Impact: Styling bugs
  - Effort: 16h | Sprint: 5+

- [ ] **LOW-008** No Load Testing
  - Issue: System performance under load unknown
  - Impact: Scaling issues
  - Effort: 12h | Sprint: 5+

### SECURITY

- [ ] **LOW-009** No Security Audit
  - Issue: No third-party security review
  - Impact: Unknown vulnerabilities
  - Effort: External: 40h | Sprint: 5+

- [ ] **LOW-010** No Dependency Scanning
  - Issue: No automated vulnerability scanning
  - Impact: Outdated packages with CVEs
  - Effort: 4h | Sprint: 4+

---

## Summary by Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| **Code Duplications** | 5 | 4 | 0 | 0 | 9 |
| **Documentation** | 3 | 5 | 7 | 3 | 18 |
| **Testing** | 3 | 4 | 5 | 3 | 15 |
| **Security** | 3 | 0 | 0 | 2 | 5 |
| **Bugs/TODOs** | 1 | 5 | 0 | 0 | 6 |
| **Architecture** | 0 | 3 | 1 | 0 | 4 |
| **Code Quality** | 0 | 0 | 3 | 3 | 6 |
| **Performance** | 0 | 0 | 1 | 0 | 1 |
| **TOTAL** | **15** | **18** | **15** | **10** | **58** |

---

## Effort Summary by Sprint

| Sprint | Priority | Issues | Effort (hours) |
|--------|----------|--------|----------------|
| **Sprint 1** | Critical | 8 | 42h |
| **Sprint 2** | Critical + High | 13 | 88h |
| **Sprint 3** | High + Medium | 12 | 92h |
| **Sprint 4+** | Medium + Low | 25 | 200h+ |
| **TOTAL** | All | **58** | **422h+** |

---

## Quick Reference: What to Fix First

### Week 1 (Sprint 1)
1. Fix backup service (remove pg_dump version)
2. Consolidate storage services
3. Consolidate loggers
4. Fix documentation (backend architecture)
5. Create missing setup scripts
6. Test backup/restore procedure

### Week 2 (Sprint 2)
7. Consolidate email services
8. Consolidate webhooks
9. Consolidate realtime order handling
10. Replace console.log statements
11. Fix critical TODOs
12. Add tests for storage/email/webhooks

### Week 3-4 (Sprint 3)
13. Consolidate notification systems
14. Add integration tests
15. Complete API documentation
16. Consolidate deployment docs
17. Add missing feature docs
18. Set up code coverage reporting

### Month 2+ (Sprint 4+)
19. Refactor large services
20. Add E2E tests
21. Performance monitoring
22. Security hardening
23. Dependency scanning
24. Architecture standardization

---

## Issue Templates

### For Creating GitHub Issues

```markdown
## Critical: [CRIT-XXX] Issue Title

**Priority:** 🔴 Critical
**Effort:** Xh
**Sprint:** X

**Problem:**
[Description of the issue]

**Impact:**
[What breaks or what's at risk]

**Files Affected:**
- /path/to/file1
- /path/to/file2

**Proposed Solution:**
[How to fix it]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests added
- [ ] Documentation updated

**Related Issues:**
- #XXX
```

---

**Next Steps:**
1. Create GitHub issues from this list
2. Assign to sprints
3. Begin with Sprint 1 critical issues
4. Review and update weekly

---

**Report End**
