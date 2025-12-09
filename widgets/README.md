# AWS Cloud Commander - Widgets

> Unified dashboard widget for real-time AWS infrastructure monitoring in Zoho Cliq

---

## Overview

AWS Cloud Commander provides a single, comprehensive dashboard widget that displays all your AWS data in one place:

| Widget | Description |
|--------|-------------|
| **AWS Dashboard** | Complete infrastructure overview with EC2, S3, Lambda, CloudWatch, RDS, Logs, and Costs |
| **Incident Widget** | Incident management dashboard with filtering (date, severity, status) and "My Resolved" section |

---

## Widget Installation

### Step 1: Create Widget in Zoho Cliq

1. Go to **Cliq** → **Profile Picture** → **Bots & Tools**
2. Navigate to **Widgets** → **Create Widget**
3. Fill in the widget details:

#### AWS Dashboard Widget
- **Name:** AWS Dashboard
- **Description:** AWS infrastructure overview
- **Slug:** awsDashboard
- **Access Level:** Organization (or Personal if you prefer)
- **Image:** Upload an AWS-themed icon

#### Incident Widget
- **Name:** Incident Management
- **Description:** Track and manage AWS incidents with filtering by date, severity, and status. View all incidents and incidents resolved by you.
- **Slug:** incidentWidget
- **Access Level:** Organization (recommended) or Personal
- **Image:** Upload an incident/alert-themed icon (e.g., warning icon, incident management icon)

### Step 2: Add Execution Handler

1. In the widget editor, go to **Execution Handler**
2. Copy contents from the respective `ExecutionHandler.ds` file:
   - For AWS Dashboard: `awsDashboard/ExecutionHandler.ds`
   - For Incident Widget: `incidentWidget/ExecutionHandler.ds`
3. Paste into the editor

### Step 3: Add Widget Function Handler (for Incident Widget)

1. Go to **Functions** → **Create Function**
2. Select **Widget Function** type
3. **Function Name:** `incidentWidgetFunction`
4. Copy contents from `incidentWidget/incidentWidgetFunction.ds`
5. Paste into the editor
6. Link this function to the widget in the widget settings

### Step 4: Save Widget

1. Save the widget
2. The widget will be available in your Cliq sidebar

---

## AWS Dashboard (`awsDashboard/`)

The unified dashboard widget showing a complete overview of all your AWS resources.

**Files:**
- `ExecutionHandler.ds` - Widget execution handler (Deluge script)

**Architecture:**
- Uses `web_view` data type for rich HTML rendering
- Instant loading with skeleton UI
- Asynchronous data fetching via JavaScript
- All styles baked into single HTML file

**Sections:**

| Section | Content |
|---------|---------|
| Health Status | Overall infrastructure health indicator |
| Cost Overview | Today's spend, monthly spend, daily average |
| EC2 Instances | Running/stopped instances with details |
| S3 Buckets | Bucket list with region info |
| Lambda Functions | Function list with runtime and memory |
| CloudWatch Alarms | Alarm status with OK/ALARM/INSUFFICIENT counts |
| RDS Databases | Database instances with status |
| CloudWatch Logs | Recent log groups |
| Cost Breakdown | Donut chart of spending by service |
| Lambda Activity | 24-hour invocation chart with errors |

**Features:**
- Real-time data from AWS APIs
- Beautiful dark theme UI
- Smooth loading with skeleton animations
- Interactive charts (cost donut, lambda activity)
- Status indicators with color coding
- Responsive layout

---

## Requirements

### Backend API
The widget calls the backend API endpoints:
- `/widget/dashboard` - Returns the HTML loader instantly
- `/widget/dashboard/data` - Returns JSON data asynchronously

### Databases
- `awsprefs` - User preferences (region settings)

---

## Customization

### Changing the Default Region

The default region is fetched from the user's `awsprefs` database record. Users can change their default region via Bot Menu → Settings.

---

## Incident Widget (`incidentWidget/`)

Native Deluge widget for incident management and tracking.

**Files:**
- `ExecutionHandler.ds` - Widget execution handler (Deluge script)
- `incidentWidgetFunction.ds` - Widget function handler for button clicks

**Architecture:**
- Uses native Cliq widget elements (tabs, sections, tables, buttons)
- Pure Deluge implementation (no HTML/CSS/JS)
- Client-side filtering logic in Deluge
- Filter state persistence via button parameters

**Sections:**

| Section | Content |
|---------|---------|
| Filters | Active filter display and filter buttons (Date, Severity, Status) |
| All Incidents | Table showing all incidents with ID, Title, Severity, Status, Created Date |
| Resolved by Me | Table showing incidents resolved by current user with ID, Title, Severity, Resolved Date |

**Features:**
- Date range filtering (Today, Last 7 days, Last 30 days, All time)
- Severity filtering (Critical, High, Medium, Low, All)
- Status filtering (Open, Investigating, Resolved, Closed, All)
- Combined filter support (AND logic)
- "My Resolved" section showing incidents resolved by current user
- Empty state handling
- Table row limits (max 50 per section)

**Filter Buttons:**
- 📅 Date - Select date range (Today, Last 7 days, Last 30 days, All time)
- 🔴 Severity - Filter by severity level
- 📊 Status - Filter by incident status
- 🔄 Clear - Clear all active filters

**Action Buttons:**
- ➕ Create - Create new incident (redirects to Bot Menu or command)
- 🔄 Refresh - Reload widget data

---

## Folder Structure

```
widgets/
├── awsDashboard/
│   └── ExecutionHandler.ds    # Widget execution handler
│
├── incidentWidget/
│   ├── ExecutionHandler.ds    # Widget execution handler
│   └── incidentWidgetFunction.ds  # Widget function handler
│
└── README.md                  # This file
```

---

## How It Works

1. **User opens widget** → ExecutionHandler.ds runs
2. **Deluge script** fetches user's region preference from `awsprefs`
3. **Returns `web_view`** pointing to `/widget/dashboard?region=...`
4. **Browser loads HTML** with skeleton loading UI
5. **JavaScript fetches** `/widget/dashboard/data` asynchronously
6. **Data renders** into the pre-styled HTML template

---

## Backend Endpoints

### GET `/widget/dashboard`
Returns the HTML loader template instantly. Includes:
- Full CSS styles
- Skeleton loading UI
- JavaScript for async data fetching

### GET `/widget/dashboard/data`
Returns JSON with all AWS data:
```json
{
  "success": true,
  "region": "ap-south-1",
  "health": { "status": "healthy", "text": "All Systems OK" },
  "ec2": { "total": 2, "running": 1, "stopped": 1, "html": "..." },
  "s3": { "count": 5, "html": "..." },
  "lambda": { "count": 10, "html": "...", "chartHtml": "..." },
  "alarms": { "total": 3, "ok": 2, "active": 1, "html": "..." },
  "rds": { "count": 1, "html": "..." },
  "logs": { "count": 15, "html": "..." },
  "cost": { "today": "$1.23", "month": "$45.67", "donutHtml": "..." }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Widget shows "Loading..." forever | Check API backend is running |
| No cost data | Enable Cost Explorer API (`ce:GetCostAndUsage` permission) |
| Empty EC2/S3 lists | Verify default region has resources |
| Charts not showing | Check JavaScript console for errors |

---

*AWS Cloud Commander - Built for Zoho Cliqtrix Competition 2025*
