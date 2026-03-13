# API Reference

Complete REST API documentation for Reclame OMS.

## Base URL

```
Development: http://localhost:5173/api
Production:  https://your-domain.com/api
```

## Authentication

Most endpoints require authentication via session cookie.

### Login

```http
POST /api/auth
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}
```

**Response** `200 OK`
```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "displayName": "Lina Ops",
    "primarySection": "Admin",
    "sections": ["Admin", "Production", "Logistics"],
    "roles": {
      "Admin": "SuperAdmin",
      "Production": "StationLead",
      "Logistics": "StationLead"
    },
    "stations": []
  }
}
```

### Get Current Session

```http
GET /api/auth
```

**Response** `200 OK`
```json
{
  "user": { ... }  // or null if not authenticated
}
```

### Logout

```http
DELETE /api/auth
```

**Response** `200 OK`
```json
{
  "success": true
}
```

---

## Users

### List Users

```http
GET /api/users
GET /api/users?active=true&section=Production
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `active` | boolean | Filter by active status (default: true) |
| `section` | string | Filter by section membership |

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "username": "admin",
    "name": "Lina Ops",
    "displayName": "Lina Ops",
    "primarySection": "Admin",
    "sections": ["Admin", "Production"],
    "roles": { "Admin": "SuperAdmin" },
    "stations": [],
    "isActive": true
  }
]
```

### Create User

```http
POST /api/users
Content-Type: application/json

{
  "username": "newuser",
  "displayName": "New User",
  "primarySection": "Production",
  "sections": ["Production"],
  "roles": {
    "Admin": "Viewer",
    "Production": "Operator",
    "Logistics": "Viewer"
  },
  "stations": ["CNC"]
}
```

**Response** `201 Created`

---

## User Preferences

### Get Preferences

```http
GET /api/preferences
```

**Response** `200 OK`
```json
{
  "theme": "DarkVim",
  "locale": "en",
  "scale": "normal",
  "density": "cozy",
  "pdfZoom": 1.0,
  "sidebarCollapsed": false,
  "notificationsEnabled": true,
  "customSettings": {}
}
```

### Update Preferences

```http
PUT /api/preferences
Content-Type: application/json

{
  "theme": "LightVim",
  "locale": "ru",
  "scale": "lg"
}
```

**Response** `200 OK`
```json
{
  "success": true
}
```

---

## Draft Orders

### List Orders

```http
GET /api/draft-orders
```

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "poNumber": "PO-2025-001",
    "clientName": "Acme Corp",
    "title": "Store Signage",
    "deadline": "2025-02-15",
    "loadingDate": "2025-02-14",
    "status": "in_production",
    "profiles": [...],
    "createdAt": "2025-01-10T08:00:00Z"
  }
]
```

### Create Order

```http
POST /api/draft-orders
Content-Type: application/json

{
  "poNumber": "PO-2025-002",
  "clientName": "Widget Inc",
  "title": "Exterior Signs",
  "deadline": "2025-03-01",
  "notes": "Rush order",
  "profiles": [
    {
      "quantity": 2,
      "configuration": {
        "material": "ALU",
        "thickness": 3
      }
    }
  ]
}
```

**Response** `201 Created`

### Get Order

```http
GET /api/draft-orders/{id}
```

### Update Order

```http
PUT /api/draft-orders/{id}
Content-Type: application/json

{
  "status": "approved",
  "loadingDate": "2025-02-28"
}
```

### Delete Order

```http
DELETE /api/draft-orders/{id}
```

### Generate PO Number

```http
POST /api/draft-orders/generate-po
```

**Response** `200 OK`
```json
{
  "poNumber": "PO-2025-003"
}
```

---

## Inventory

### List Inventory

```http
GET /api/inventory
GET /api/inventory?category=ALU&lowStock=true&search=plexi
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Filter by material category |
| `lowStock` | boolean | Only items below minimum level |
| `search` | string | Search by name or code |

**Response** `200 OK`
```json
{
  "items": [
    {
      "id": 1,
      "material_code": "ALU-3MM",
      "material_name": "Aluminum Sheet",
      "material_category": "ALU",
      "thickness": 3.0,
      "quantity_in_stock": 150,
      "unit_of_measure": "sheets",
      "minimum_stock_level": 50,
      "cost_per_unit": 45.00,
      "total_value": 6750.00
    }
  ],
  "count": 1
}
```

### Add Inventory Item

```http
POST /api/inventory
Content-Type: application/json

{
  "materialId": 1,
  "thickness": 3.0,
  "quantityInStock": 100,
  "unitOfMeasure": "sheets",
  "location": "Warehouse A",
  "minimumStockLevel": 25,
  "costPerUnit": 45.00
}
```

### Stock Movements

```http
GET /api/inventory/movements?stockId=1&type=PURCHASE
POST /api/inventory/movements
```

```json
{
  "inventoryStockId": 1,
  "movementType": "PRODUCTION_USE",
  "quantity": 5,
  "reason": "Order PO-2025-001",
  "notes": "Cut for client signs"
}
```

---

## Calendar

### List Events

```http
GET /api/calendar
GET /api/calendar?from=2025-01-01&to=2025-12-31&kind=loading
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | date | Start date (YYYY-MM-DD) |
| `to` | date | End date (YYYY-MM-DD) |
| `kind` | string | Event type: loading, meeting, note |

**Response** `200 OK`
```json
[
  {
    "id": "uuid-here",
    "kind": "loading",
    "date": "2025-01-15",
    "note": "DHL pickup",
    "poList": ["PO-2025-001", "PO-2025-002"],
    "carrier": "DHL",
    "window": {
      "start": "09:00",
      "end": "12:00"
    },
    "createdAt": "2025-01-10T08:00:00Z"
  },
  {
    "id": "uuid-here",
    "kind": "meeting",
    "date": "2025-01-16",
    "title": "Production Review",
    "start": "14:00",
    "end": "15:00",
    "location": "Conference Room",
    "attendees": [1, 2, 3]
  }
]
```

### Create Event

```http
POST /api/calendar
Content-Type: application/json

{
  "kind": "loading",
  "date": "2025-01-20",
  "carrier": "UPS",
  "note": "Priority shipment",
  "poList": ["PO-2025-003"],
  "window": {
    "start": "08:00",
    "end": "10:00"
  }
}
```

### Update Event

```http
PUT /api/calendar/{id}
Content-Type: application/json

{
  "carrier": "FedEx",
  "poList": ["PO-2025-003", "PO-2025-004"]
}
```

### Delete Event

```http
DELETE /api/calendar/{id}
```

### Capacity Configuration

```http
GET /api/calendar/capacity
PUT /api/calendar/capacity
DELETE /api/calendar/capacity
```

```json
// GET response
{
  "defaultCapacity": 10,
  "customCapacities": {
    "2025-01-15": 5,
    "2025-01-16": 15
  }
}

// PUT body
{
  "defaultCapacity": 12
}
// or
{
  "date": "2025-01-20",
  "capacity": 8
}
```

---

## Loading Days

### List Loading Days

```http
GET /api/loading-days
GET /api/loading-days?active=true&from=2025-01-01
```

**Response** `200 OK`
```json
[
  {
    "id": "2025-01-15",
    "date": "2025-01-15",
    "carrier": "DHL",
    "note": "Morning pickup",
    "active": true
  }
]
```

### Toggle Loading Day

```http
POST /api/loading-days
Content-Type: application/json

{
  "date": "2025-01-20",
  "carrier": "UPS",
  "note": "New route"
}
```

---

## Chat

### List Rooms

```http
GET /api/chat
```

**Response** `200 OK`
```json
[
  {
    "id": "general",
    "name": "General",
    "type": "channel",
    "isPrivate": false
  }
]
```

### Create Room

```http
POST /api/chat
Content-Type: application/json

{
  "id": "project-alpha",
  "name": "Project Alpha",
  "type": "channel"
}
```

### Delete Room

```http
DELETE /api/chat?id=project-alpha
```

### List Messages

```http
GET /api/chat/messages?roomId=general&limit=50
GET /api/chat/messages?roomId=general&before=uuid-of-last-message
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid-here",
    "roomId": "general",
    "authorId": "1",
    "authorName": "Admin",
    "text": "Hello team!",
    "variant": "user",
    "mentions": [],
    "ts": "2025-01-10T08:00:00Z"
  }
]
```

### Send Message

```http
POST /api/chat/messages
Content-Type: application/json

{
  "roomId": "general",
  "text": "Project update: Phase 1 complete",
  "mentions": [2, 3],
  "variant": "user"
}
```

---

## Notifications

### List Notifications

```http
GET /api/notifications
GET /api/notifications?unreadOnly=true&limit=20
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid-here",
    "type": "order_update",
    "title": "Order Approved",
    "message": "PO-2025-001 has been approved",
    "link": "/orders/1",
    "isRead": false,
    "createdAt": "2025-01-10T08:00:00Z"
  }
]
```

### Create Notification

```http
POST /api/notifications
Content-Type: application/json

{
  "userId": 1,
  "type": "reminder",
  "title": "Deadline Approaching",
  "message": "Order PO-2025-001 due in 2 days",
  "link": "/orders/1"
}
```

### Mark as Read

```http
PUT /api/notifications
Content-Type: application/json

{
  "ids": ["uuid-1", "uuid-2"]
}
// or
{
  "markAllRead": true
}
```

### Dismiss Notification

```http
DELETE /api/notifications?id=uuid-here
```

---

## Station Log

### List Logs

```http
GET /api/station-log
GET /api/station-log?po=PO-2025-001&station=CNC&limit=100
```

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "po": "PO-2025-001",
    "station": "CNC",
    "notes": "Completed cutting",
    "redo": null,
    "loggedBy": "Marta Jansone",
    "at": 1704873600000
  }
]
```

### Create Log Entry

```http
POST /api/station-log
Content-Type: application/json

{
  "po": "PO-2025-001",
  "station": "SANDING",
  "notes": "Surface prep complete",
  "redo": null
}
```

---

## Audit Log

### List Audit Entries

```http
GET /api/audit-log
GET /api/audit-log?limit=100&action=LOGIN&entityType=user
```

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "userId": 1,
    "username": "admin",
    "action": "LOGIN",
    "entityType": "user",
    "entityId": "1",
    "createdAt": "2025-01-10T08:00:00Z"
  }
]
```

### Create Audit Entry

```http
POST /api/audit-log
Content-Type: application/json

{
  "action": "UPDATE_ORDER",
  "entityType": "order",
  "entityId": "1",
  "details": "Changed status to approved"
}
```

---

## Profile Templates

### List Templates

```http
GET /api/profiles/templates
GET /api/profiles/templates?active=true
```

### Get Template

```http
GET /api/profiles/templates/{code}
```

### Export Template

```http
GET /api/profiles/templates/{code}/export
```

### Import Template

```http
POST /api/profiles/templates/import
Content-Type: application/json

{
  "template": { ... }
}
```

### Clone Template

```http
POST /api/profiles/templates/{code}/clone
Content-Type: application/json

{
  "newCode": "P7st-v2"
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message here"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request - Invalid input |
| `401` | Unauthorized - Authentication required |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found |
| `409` | Conflict - Resource already exists |
| `500` | Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. For production, consider adding:

- 100 requests per minute per IP for unauthenticated requests
- 1000 requests per minute per user for authenticated requests
