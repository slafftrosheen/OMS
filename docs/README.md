# Reclame OMS Documentation

Enterprise-grade Order Management System for signage manufacturing.

## Table of Contents

1. [Getting Started](./getting-started.md)
2. [Architecture](./architecture.md)
3. [Database Schema](./database-schema.md)
4. [API Reference](./api-reference.md)
5. [Authentication & Authorization](./authentication.md)
6. [Configuration](./configuration.md)
7. [Deployment](./deployment.md)
8. [Development Guide](./development.md)
9. [Changelog](./CHANGELOG.md)

## Quick Links

- **Setup**: See [Getting Started](./getting-started.md)
- **API Docs**: See [API Reference](./api-reference.md)
- **Database**: See [Database Schema](./database-schema.md)
- **Changes**: See [Changelog](./CHANGELOG.md)

## System Overview

Reclame OMS is a full-stack order management system built with:

| Layer | Technology |
|-------|------------|
| Frontend | SvelteKit, TypeScript |
| Backend | SvelteKit API Routes |
| Database | PostgreSQL |
| Authentication | Session-based with bcrypt + secure cookies |
| Internationalization | svelte-i18n (EN, RU, LV) |

## Core Features

- **Order Management**: Create, track, and manage production orders
- **Profile System**: Configurable manufacturing profiles (P7st, P1, P3, etc.)
- **Inventory Management**: Materials, stock levels, suppliers, movements
- **Material Catalogues**: ORACAL, RAL, Pantone, LEDs, PSUs, 3D printing
- **Calendar & Scheduling**: Loading days, meetings, capacity planning
- **Real-time Chat**: Team communication with mentions
- **Multi-language**: English, Russian, Latvian support
- **Role-based Access**: SuperAdmin, StationLead, Operator, Viewer
- **Modern UI**: Token-based design system, themes, accessibility

## Default Users

| Username | Password | Role |
|----------|----------|------|
| slav | 181188 | SuperAdmin |
| admin | admin | SuperAdmin |
| cnc | cnc123 | StationLead |
| logistics | log123 | StationLead |

## License

Proprietary - All rights reserved.
