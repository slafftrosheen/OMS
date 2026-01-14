# Changelog

All notable changes to Reclame OMS are documented in this file.

## [Unreleased]

### Added
- Comprehensive material catalogues including ORACAL, RAL, Pantone, and more.
- Advanced inventory system with barcode scanning and movement tracking.
- Profile-based order creation with draft saving and status workflows.
- Modern UI/UX with a token-based design system, theme support, and accessibility improvements.
- Calendar and scheduling system for managing loading days and events.
- Real-time chat and notification systems.
- Server hooks for session management and authentication.
- A full suite of features for the orders page including filters, search, pagination, and CSV export.
- Draft order creation form with file uploads, delivery presets, and priority selection.
- User management with role-based access and audit logging.

### Changed
- Migrated all data stores from `localStorage` to a PostgreSQL-backed API.
- Replaced mock authentication with a secure, bcrypt-based system.
- Consolidated and improved UI components.

### Fixed
- Resolved numerous UI bugs including text scaling, theme persistence, and layout issues.
- Fixed critical null reference errors on the order detail page.
- Addressed authentication errors in the preferences API.
- Removed redundant UI elements like the floating action button.

### Removed
- All mock data and placeholder implementations.
- Guest login functionality.
- Redundant test routes and old form components.

## [0.9.0] - 2025-12-16

### Added
- Initial PostgreSQL database setup with Docker.
- Database migrations and seed data.
- Local file upload system and a PDF viewer with annotations.

### Changed
- Migrated all data from `localStorage` to PostgreSQL.

## [0.8.0] - 2025-12-15

### Added
- Profile template system.
- FAQ system with categories and search.
- Multi-language support (EN, RU, LV).
