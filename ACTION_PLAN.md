# OMS Remediation Action Plan
## Strategic Approach to Fix Issues & Gaps

**Generated:** January 31, 2026  
**Timeline:** 4-6 Sprints (2-3 Months)  
**Estimated Effort:** 422+ hours

---

## Executive Summary

This action plan provides a **strategic roadmap** to remediate the 58 critical issues identified in the OMS codebase. The plan prioritizes **data safety**, **service consolidation**, and **documentation alignment** before addressing technical debt and feature completeness.

**Success Metrics:**
- ✅ Zero duplicate service implementations
- ✅ All documentation aligned with Supabase architecture
- ✅ 80%+ test coverage for critical services
- ✅ Zero console statements in production
- ✅ All TODOs resolved or ticketed

---

## Strategic Principles

### 1. **Safety First**
- Backup/restore must be tested before any major changes
- Never delete code without migration path
- Always maintain rollback capability

### 2. **Consolidate Before Extending**
- No new features until duplicates resolved
- Merge similar implementations rather than rewrite
- Document deprecation timeline

### 3. **Documentation as Code**
- Update docs alongside code changes
- Every PR must update affected documentation
- Maintain single source of truth

### 4. **Test-Driven Consolidation**
- Add tests before refactoring
- Maintain test coverage during consolidation
- No reduction in test coverage allowed

---

## Phase 1: Critical Stabilization (Sprint 1 - Week 1-2)

**Objective:** Ensure data safety and align documentation with reality

### Tasks

#### 1.1 Backup Safety (Priority: 🔴 URGENT)

**Issue:** Two backup implementations, pg_dump won't work with Supabase

**Actions:**
- [ ] Test Supabase backup implementation
  - [ ] Create test backup
  - [ ] Restore to test database
  - [ ] Verify data integrity
  - [ ] Document restore procedure
- [ ] Remove pg_dump-based backup service
  - [ ] Audit usage in codebase
  - [ ] Replace with Supabase version
  - [ ] Remove `backup-service.ts`
- [ ] Encrypt backups at rest
- [ ] Set up automated backup schedule
- [ ] Create backup monitoring alerts

**Effort:** 12h  
**Risk:** HIGH - Data loss potential  
**Deliverable:** Working backup/restore with documented procedure

---

#### 1.2 Storage Service Consolidation

**Issue:** 3 storage implementations causing confusion

**Actions:**
- [ ] Audit all storage usage
  ```bash
  grep -r "StorageService\|storage-service\|storage.ts" src/
  ```
- [ ] Choose canonical implementation: `StorageService.ts` (AWS SDK)
- [ ] Create migration guide for imports
- [ ] Update all imports to use `StorageService.ts`
- [ ] Add deprecation warnings to old implementations
- [ ] Wait 1 sprint, then remove old files
- [ ] Update `/src/lib/server/storage/index.ts` to export only one

**Effort:** 8h  
**Deliverable:** Single storage service with clear API

---

#### 1.3 Logger Consolidation

**Issue:** 2 logger implementations with different interfaces

**Actions:**
- [ ] Choose: `logging/logger.ts` (structured logging)
- [ ] Create migration guide
- [ ] Update all `import { logger } from './logger'` to `import { logger } from './logging/logger'`
- [ ] Test Sentry integration still works
- [ ] Remove old `logger.ts`

**Effort:** 6h  
**Deliverable:** Unified logging across codebase

---

#### 1.4 Documentation Alignment

**Issue:** Docs describe wrong backend architecture

**Actions:**

**Part A: Rewrite Core Docs (12h)**
- [ ] `docs/architecture.md` - Confirm Supabase approach (already correct)
- [ ] `docs/deployment.md` - Rewrite for Supabase + Vercel/Node
  - Remove PM2/Nginx sections (or move to "Legacy" appendix)
  - Add Vercel deployment steps
  - Add self-hosted Node adapter steps
  - Document adapter selection in svelte.config.js
- [ ] `docs/authentication.md` - Rewrite for Supabase Auth
  - Remove session-based auth
  - Document JWT approach
  - Document auth redirects
  - Add code examples
- [ ] `docs/getting-started.md` - Fix setup instructions
  - Remove reference to `init-database.sh`
  - Add Supabase project setup
  - Update environment variables
  - Add "Connect to Supabase" section

**Part B: Create Missing Scripts (2h)**
- [ ] Create `scripts/init-database.sh` OR
- [ ] Update docs to reference correct scripts:
  - `supabase-migrate.sh` for migrations
  - `migrate_to_supabase.sh` for data migration
  - `run_seed.sh` for seeding

**Part C: Environment Variables (2h)**
- [ ] Update `docs/configuration.md`
  - Remove PostgreSQL connection vars
  - Document Supabase vars from `.env.example`
  - Add variable descriptions
- [ ] Verify `.env.example` is complete

**Effort:** 16h  
**Deliverable:** Documentation matches codebase reality

---

#### 1.5 Security Quick Wins

**Actions:**
- [ ] Encrypt backups (if not done in 1.1)
- [ ] Add `.env` to `.gitignore` (verify)
- [ ] Audit console.log for sensitive data (first pass)
- [ ] Add security headers to responses

**Effort:** 4h  
**Deliverable:** Reduced security exposure

---

### Sprint 1 Deliverables

✅ Tested backup/restore procedure  
✅ Single storage service  
✅ Single logger  
✅ Documentation aligned with Supabase architecture  
✅ No references to missing scripts  

**Total Effort:** 42 hours (1 week, 2 developers)  
**Validation:** Deploy to staging, verify docs can be followed

---

## Phase 2: High-Priority Consolidation (Sprint 2 - Week 3-4)

**Objective:** Eliminate remaining duplicate services and critical bugs

### Tasks

#### 2.1 Email Service Consolidation

**Issue:** 2 email providers (Resend vs Nodemailer)

**Decision Point:** Which to keep?

**Option A: Resend (Recommended)**
- Pros: Simpler API, better DX, modern
- Cons: External dependency, cost

**Option B: Nodemailer**
- Pros: More control, SMTP flexibility
- Cons: More complex, requires SMTP server

**Recommendation:** Keep Resend unless SMTP required

**Actions:**
- [ ] Decide on provider
- [ ] Audit email sending locations
- [ ] Create email template system
- [ ] Migrate all email sends to chosen service
- [ ] Add email tests (mock/test mode)
- [ ] Remove deprecated service

**Effort:** 10h  
**Deliverable:** Single email service with tests

---

#### 2.2 Webhook Service Consolidation

**Issue:** 2 webhook implementations

**Actions:**
- [ ] Choose: Event-based version (more robust)
- [ ] Migrate webhook deliveries
- [ ] Test retry logic
- [ ] Add webhook tests
- [ ] Remove basic version

**Effort:** 8h  
**Deliverable:** Reliable webhook delivery

---

#### 2.3 Realtime Order Handling Consolidation

**Issue:** 6 files managing realtime orders!

**Recommended Architecture:**
```
realtimeService (core)
  ↓
ordersStore (Svelte store)
  ↓
useRealtimeOrders (composable hook)
  ↓
Components
```

**Actions:**
- [ ] Map current realtime subscriptions
- [ ] Design unified architecture
- [ ] Implement consolidated approach
- [ ] Migrate components one-by-one
- [ ] Test subscription cleanup
- [ ] Remove old implementations

**Effort:** 16h  
**Risk:** MEDIUM - Active subscriptions  
**Deliverable:** Single realtime pattern

---

#### 2.4 Console.log Cleanup

**Issue:** 227 console statements

**Actions:**
- [ ] Categorize console statements:
  - Debug → Replace with logger.debug()
  - Errors → Replace with logger.error()
  - Info → Replace with logger.info()
  - Sensitive → Remove or redact
- [ ] Add ESLint rule: `no-console`
- [ ] Replace in batches (50 per day)
- [ ] Verify no sensitive data logged

**Effort:** 12h  
**Deliverable:** Production-ready logging

---

#### 2.5 Critical Bug Fixes

**Actions:**
- [ ] Fix incomplete realtime presence (HIGH-012)
- [ ] Fix nodemailer import (HIGH-013)
- [ ] Implement monitoring integration (HIGH-014)
- [ ] Implement local storage fallback (HIGH-016)

**Effort:** 18h  
**Deliverable:** All HIGH priority bugs resolved

---

#### 2.6 Test Coverage - Critical Services

**Actions:**
- [ ] Add tests for StorageService
- [ ] Add tests for Email service
- [ ] Add tests for Webhook service
- [ ] Add tests for Backup service
- [ ] Set up coverage reporting in vitest

**Effort:** 40h  
**Deliverable:** 60%+ test coverage

---

### Sprint 2 Deliverables

✅ Single email service  
✅ Single webhook service  
✅ Consolidated realtime handling  
✅ Zero console.log in production  
✅ All HIGH priority bugs fixed  
✅ 60%+ test coverage  

**Total Effort:** 88 hours (2 weeks, 2 developers)  
**Validation:** All services tested and documented

---

## Phase 3: Medium Priority & Polish (Sprint 3 - Week 5-6)

**Objective:** Complete consolidation and improve documentation

### Tasks

#### 3.1 Notification System Consolidation

**Issue:** 3 notification systems

**Recommended Architecture:**
- Keep: Full notification service
- Toast notifications as part of notification service
- Unified store interface

**Actions:**
- [ ] Design unified notification API
- [ ] Migrate toast usage
- [ ] Migrate full notification usage
- [ ] Test notification delivery
- [ ] Remove duplicates

**Effort:** 20h  
**Deliverable:** Single notification system

---

#### 3.2 Remaining Duplicates

**Actions:**
- [ ] Consolidate diff implementations (keep TypeScript)
- [ ] Remove duplicate focus-trap
- [ ] Standardize file naming

**Effort:** 6h  
**Deliverable:** No remaining duplicates

---

#### 3.3 Documentation Completion

**Actions:**

**API Documentation (24h)**
- [ ] Generate API docs from code
- [ ] Document all 101 endpoints
- [ ] Add request/response examples
- [ ] Document error responses
- [ ] Document authentication flow

**Deployment Docs (8h)**
- [ ] Consolidate deployment guides
- [ ] Create deployment decision tree
- [ ] Archive legacy guides
- [ ] Add troubleshooting section

**Testing Docs (4h)**
- [ ] Consolidate testing docs
- [ ] Add testing guidelines
- [ ] Document test patterns

**Feature Docs (24h)**
- [ ] Document Change Requests
- [ ] Document Rework cycles
- [ ] Document Loading dates
- [ ] Document Chat system
- [ ] Document QR scanning

**Effort:** 60h  
**Deliverable:** Complete documentation

---

#### 3.4 Integration Testing

**Actions:**
- [ ] Design integration test suite
- [ ] Test critical user flows:
  - Order creation → assignment → completion
  - Rework cycle
  - Loading date assignment
  - File upload/download
- [ ] Add to CI pipeline

**Effort:** 40h  
**Deliverable:** 80%+ coverage with integration tests

---

### Sprint 3 Deliverables

✅ Single notification system  
✅ No code duplicates  
✅ Complete API documentation  
✅ Consolidated deployment guides  
✅ Feature documentation  
✅ 80%+ test coverage  

**Total Effort:** 92 hours (2 weeks, 2 developers)  
**Validation:** Can onboard new developer using docs alone

---

## Phase 4: Long-Term Improvements (Month 2+)

### 4.1 Architecture Standardization
- Refactor large services (>400 LOC)
- Document preferred patterns
- Create coding guidelines
- Add barrel exports

**Effort:** 40h

---

### 4.2 Performance & Monitoring
- Add performance monitoring
- Set up error monitoring
- Track Core Web Vitals
- Add slow query detection

**Effort:** 20h

---

### 4.3 Security Hardening
- Complete security audit
- Add rate limiting
- Set up dependency scanning
- Implement CSP headers

**Effort:** 24h

---

### 4.4 Testing Completeness
- Add E2E tests (Playwright)
- Add visual regression tests
- Add load testing
- Set up test environment

**Effort:** 60h

---

### 4.5 Developer Experience
- Add Prettier configuration
- Improve ESLint rules
- Set up pre-commit hooks
- Create development guide

**Effort:** 16h

---

## Timeline & Resource Allocation

### Option A: 2-Developer Team (Recommended)

| Phase | Duration | Sprint | FTE | Hours | Focus |
|-------|----------|--------|-----|-------|-------|
| Phase 1 | 1 week | Sprint 1 | 2.0 | 42h | Safety & Docs |
| Phase 2 | 2 weeks | Sprint 2 | 2.0 | 88h | Consolidation |
| Phase 3 | 2 weeks | Sprint 3 | 2.0 | 92h | Documentation |
| Phase 4 | 4+ weeks | Sprint 4+ | 1.5 | 160h | Long-term |
| **TOTAL** | **9 weeks** | | | **382h** | |

---

### Option B: 1-Developer Team

| Phase | Duration | Sprint | FTE | Hours | Focus |
|-------|----------|--------|-----|-------|-------|
| Phase 1 | 2 weeks | Sprint 1 | 1.0 | 42h | Safety & Docs |
| Phase 2 | 4 weeks | Sprint 2-3 | 1.0 | 88h | Consolidation |
| Phase 3 | 4 weeks | Sprint 4-5 | 1.0 | 92h | Documentation |
| Phase 4 | 8+ weeks | Sprint 6+ | 1.0 | 160h | Long-term |
| **TOTAL** | **18 weeks** | | | **382h** | |

---

## Risk Management

### High Risks

| Risk | Mitigation |
|------|-----------|
| **Data loss during backup migration** | Test restore before removing old backup |
| **Breaking changes during consolidation** | Feature flags + gradual rollout |
| **Realtime subscription issues** | Test in staging first, monitor subscriptions |
| **Email delivery failures** | Keep old service for 1 sprint, parallel testing |

### Medium Risks

| Risk | Mitigation |
|------|-----------|
| **Documentation becomes outdated again** | Enforce doc updates in PR checklist |
| **New duplicates introduced** | Code review guidelines |
| **Test coverage drops** | Coverage gate in CI |

---

## Success Criteria

### Phase 1 Complete When:
- ✅ Can restore from backup successfully
- ✅ All docs can be followed without errors
- ✅ Single storage service in use
- ✅ Single logger in use

### Phase 2 Complete When:
- ✅ No duplicate service implementations
- ✅ Zero console.log in production
- ✅ 60%+ test coverage
- ✅ All HIGH bugs fixed

### Phase 3 Complete When:
- ✅ API fully documented
- ✅ All features documented
- ✅ 80%+ test coverage
- ✅ New developer can onboard from docs

### Overall Success When:
- ✅ All 58 issues resolved or scheduled
- ✅ No duplicate implementations
- ✅ Documentation matches codebase
- ✅ 80%+ test coverage
- ✅ All TODOs resolved

---

## Monitoring & Metrics

### Track Weekly:
- Issues resolved vs remaining
- Test coverage percentage
- Console statements removed
- Documentation pages updated

### Track Monthly:
- Developer onboarding time
- Bug report rate
- Test failure rate
- Deployment success rate

---

## Communication Plan

### Weekly:
- Sprint planning
- Progress updates
- Blocker resolution

### Monthly:
- Stakeholder demo
- Metrics review
- Retrospective

### Per Sprint:
- Sprint review with demo
- Documentation review
- Test coverage report

---

## Appendix A: Quick Reference Commands

### Audit Commands

```bash
# Find all storage imports
grep -r "StorageService\|storage-service\|storage\.ts" src/

# Find all logger imports
grep -r "from.*logger" src/

# Count console statements
grep -r "console\." src/ | wc -l

# Find TODOs
grep -r "TODO\|FIXME" src/

# Check test coverage
npm run test -- --coverage
```

### Migration Commands

```bash
# Replace storage imports (example)
find src/ -type f -name "*.ts" -exec sed -i 's|from.*storage-service|from "./storage/StorageService"|g' {} +

# Replace logger imports (example)
find src/ -type f -name "*.ts" -exec sed -i 's|from.*logger\.ts|from "./logging/logger"|g' {} +
```

---

## Appendix B: Decision Log

| Decision | Date | Rationale |
|----------|------|-----------|
| Keep `StorageService.ts` | TBD | Most modern, AWS SDK-based |
| Keep `logging/logger.ts` | TBD | Structured logging, more features |
| Choose Resend for email | TBD | Simpler API, better DX |
| Consolidate in 3 phases | TBD | Prioritize safety and docs first |

---

**Action Plan End**

**Next Steps:**
1. Review and approve this plan
2. Create Sprint 1 board
3. Assign developers
4. Begin Phase 1 execution
5. Track progress weekly
