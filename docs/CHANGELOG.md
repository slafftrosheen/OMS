# Changelog

All notable changes to Reclame OMS are documented in this file.

## [Unreleased] - 2025-12-17

### Added

#### Server Hooks
- **hooks.server.ts** - Server-side hook for session management
  - Automatically populates `locals.user` from session cookies
  - Provides backward-compatible `role` property for API routes
  - Enables proper authentication across all API endpoints

#### Orders Page Improvements
- **Page Header** with prominent "Create Draft Order" button (SuperAdmin only)
- **Status Filters** - Filter by All/Active/Draft orders
- **Search** - Full-text search across PO, client, and title
- **Pagination** - Configurable items per page (10/20/50/100)
- **Refresh Button** with loading spinner
- **Export to CSV** functionality
- **Actions Column** with view/edit quick actions
- **Draft Badge** highlighting for draft orders
- **KPI Cards** showing Total/Active/Draft/Urgent order counts

#### Notifications System (NEW)
- **Full Notifications Page** (`/notifications`)
- Filter by All/Unread/Read status
- Filter by type (Orders, Messages, System, Inventory)
- Mark individual or all notifications as read
- Dismiss notifications
- Real-time unread count badge
- Notification icons by type
- Relative time formatting (Just now, 5m ago, 2h ago, etc.)

#### Chat System (NEW)
- **Full Chat Page** (`/chat`)
- Channel-based rooms (General, Workstations, Logistics)
- Room creation with channel names
- @mention support with autocomplete
- Message threading with date separators
- User presence indicators
- Room search functionality
- Real-time message polling (5 second intervals)
- Station badges for users
- System message support

#### Navigation Updates
- Added Chat link to main navigation
- Chat icon in navbar
- Improved mobile menu with all routes

#### Order Workflow System
- **Draft Order Creation Form** with comprehensive features:
  - File upload with drag & drop (PDF, CDR, AI, EPS, JPG, PNG)
  - Image preview for uploaded files
  - Delivery address presets for major customers
  - Manual address input option
  - Priority selection (Low, Normal, High, Urgent)
  - Loading date assignment (can be set later by admin)
  - Multiple profile support per order
  - Profile duplication and collapse functionality
- **Delivery Presets System**:
  - Pre-configured addresses for major customers (Rimi, Maxima, Circle K, etc.)
  - Group presets by client name
  - Contact person and phone fields
  - Default preset marking per client
- **File Upload API** (`/api/files/upload`):
  - Secure file storage with UUID naming
  - Organized by category and date
  - Database tracking of uploads
  - User attribution for uploads

#### User Management & Authentication
- **SuperAdmin user** (`slav` / `181188`) with full system access
- Complete user CRUD API with bcrypt password hashing
- Login rate limiting (5 attempts, 15 min lockout)
- Password change functionality for users
- Admin password reset capability
- Session-based authentication with secure cookies
- Audit logging for all user actions

#### Material Catalogues (Comprehensive)
- **ORACAL 8500 Translucent** - Full color catalogue with hex values
- **RAL Classic** - Complete RAL color system
- **Pantone Coated** - Pantone color matching system
- **Plexiglass/Acrylic** - PLEXIGLAS®, Perspex, generic acrylics
- **LED Strips** - From Lemona.lv (Lemlux), BaltLed
  - RGB, RGBW, CCT, Addressable (WS2812B, WS2815)
  - Various wattages (4.8W/m to 28.8W/m)
  - IP ratings (IP20, IP65, IP68)
- **PSU Units** - Mean Well power supplies (LRS, HLG, SE series)
- **LED Modules** - Sloan, BaltLed individual modules
- **3D Printing Materials**
  - FDM filaments (Spectrum, Creality, eSUN, Prusa)
  - Anycubic resins (Standard, ABS-Like, Water-Washable)
- **Mounting Hardware** - Screws, anchors, spacers, adhesives
- **Paints** - From Kraso.lv (primers, topcoats, spray paints)

#### Inventory System
- Full PostgreSQL-backed inventory with movements tracking
- Barcode scanning with Quagga2 (Code128, EAN, Code39, UPC)
- Stock movement history (IN, OUT, ADJUSTMENT, TRANSFER)
- Low stock alerts and minimum level tracking
- Material color swatches with hex values
- CSV import functionality

#### Order System
- Profile-based order creation (P7st visual profile)
- Draft order API with full CRUD
- Order status workflow (draft → pending → approved → in_production)
- Material assignment to orders
- Loading date scheduling
- PO number generation

#### UI/UX Improvements
- Modern token-based design system (CSS variables)
- Text scaling controls (compact/normal/large/xl)
- Theme system (DarkVim, LightVim, etc.)
- Density controls (cozy/normal/compact)
- Responsive sidebar with collapse
- Accessibility improvements (ARIA labels, keyboard navigation)

#### Calendar & Scheduling
- Loading day management
- Calendar events (loading, meeting, note types)
- Capacity planning per day
- Order-to-loading-day linking

#### Chat & Notifications
- Team chat with rooms
- @mention support
- Notification system with read/unread status
- Real-time notification bell

### Changed
- Migrated all stores from localStorage to PostgreSQL API
- Replaced mock authentication with real bcrypt-based auth
- Updated navbar to show all navigation items
- Improved form layouts and input styling
- Consolidated duplicate components

### Fixed
- Text scaling button overlap issues
- Theme persistence across sessions
- Navbar settings panel layout
- SectionIndicator null reference error
- Preferences API 401 errors (now gracefully handles unauthenticated)
- Order detail page null reference errors (proper guards for async loading)
- Cyclical dependency in order detail page (redoStage initialization)
- Removed redundant floating action button (duplicated navbar functionality)

### Removed
- Guest login functionality (login required)
- Mock data and placeholder implementations
- Redundant test routes
- Old OrderForm component (consolidated to profile-based)

## [0.9.0] - 2025-12-16

### Added
- Initial PostgreSQL database setup with Docker
- 10 database migration files
- Seed data for materials, colors, users, FAQ
- File upload system (local storage)
- PDF viewer with annotations

### Changed
- Migrated from localStorage to PostgreSQL for all data

## [0.8.0] - 2025-12-15

### Added
- Profile template system (P7st, P1, P3, etc.)
- FAQ system with categories and search
- Multi-language support (EN, RU, LV)

---

## Database Tables

Current schema includes 51+ tables:
- `users`, `user_sessions`, `user_preferences`
- `draft_orders`, `order_profiles`, `order_files`
- `inventory_items`, `inventory_stock`, `inventory_movements`
- `materials`, `ral_colors`, `oracal_colors`, `pantone_colors`
- `profile_templates`, `profile_sections`, `profile_section_fields`
- `calendar_events`, `loading_days`, `capacity_config`
- `chat_rooms`, `chat_messages`, `notifications`
- `faq_documents`, `faq_tags`
- `audit_log`, `files`

## API Endpoints

### Authentication
- `POST /api/auth` - Login
- `GET /api/auth` - Get session
- `DELETE /api/auth` - Logout
- `PUT /api/auth/password` - Change password

### Users
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `GET /api/users/[id]` - Get user
- `PUT /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Deactivate user

### Orders
- `GET /api/draft-orders` - List orders
- `POST /api/draft-orders` - Create order (with profiles, files, delivery)
- `GET /api/draft-orders/[id]` - Get order
- `PUT /api/draft-orders/[id]` - Update order
- `DELETE /api/draft-orders/[id]` - Delete order
- `GET /api/draft-orders/generate-po` - Generate PO number

### Delivery Presets
- `GET /api/delivery-presets` - List delivery presets (filter by client)
- `POST /api/delivery-presets` - Create delivery preset

### Files
- `GET /api/files` - List files
- `POST /api/files` - Upload file
- `POST /api/files/upload` - Simple upload endpoint

### Inventory
- `GET /api/inventory` - List inventory
- `GET /api/inventory/items` - List items
- `POST /api/inventory/items` - Create item
- `GET /api/inventory/movements` - List movements
- `POST /api/inventory/movements` - Record movement

### Materials
- `GET /api/materials` - List materials
- `POST /api/materials` - Create material
- `PUT /api/materials/[id]` - Update material
- `DELETE /api/materials/[id]` - Delete material

### Calendar
- `GET /api/calendar` - List events
- `POST /api/calendar` - Create event
- `GET /api/loading-days` - List loading days
- `POST /api/loading-days` - Toggle loading day

### Preferences
- `GET /api/preferences` - Get user preferences
- `PUT /api/preferences` - Update preferences

---

*For full API documentation, see [api-reference.md](./api-reference.md)*
