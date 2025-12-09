# AWS Cloud Commander - Cliq Extension

> Deluge code for the Zoho Cliq frontend components

---

## Folder Structure

```
cliq-extension/
├── commands/
│   └── aws/
│       ├── ExecutionHandler.ds    # Main /aws command logic
│       └── SuggestionHandler.ds   # Autocomplete suggestions
│
├── functions/
│   ├── handleButton.ds            # Button click handler
│   └── handleForm.ds              # Form submit handler
│
├── widgets/
│   ├── awsDashboard/              # Main AWS Dashboard widget
│   │   ├── ExecutionHandler.ds    # Widget display logic
│   │   └── widgetFunction.ds      # Button handler
│   │
│   ├── alarmMonitor/              # CloudWatch Alarm Monitor widget
│   │   ├── ExecutionHandler.ds    # Widget display logic
│   │   └── alarmWidgetFunction.ds # Button handler
│   │
│   ├── costTracker/               # AWS Cost Tracker widget
│   │   ├── ExecutionHandler.ds    # Widget display logic
│   │   └── costWidgetFunction.ds  # Button handler
│   │
│   └── README.md                  # Widget documentation
│
├── schedulers/
│   ├── dailyCostReport.ds         # Daily cost report scheduler
│   ├── weeklySummary.ds           # Weekly infrastructure summary scheduler
│   └── README.md                  # Scheduler documentation
│
├── docs/
│   ├── NOTIFICATIONS_AND_ALERTS.md    # Notification system docs
│   ├── S3_FEATURES_DOCUMENTATION.md   # S3 features docs
│   └── DELUGE_FORMS_REFERENCE.md      # Form reference docs
│
└── README.md                      # This file
```

---

## Key Features

### Real-time Channel Notifications

Get instant notifications in your Cliq channel when:

- EC2 instances are started/stopped/rebooted (via button or command)
- CloudWatch alarms are created
- Budget thresholds are exceeded

See [NOTIFICATIONS_AND_ALERTS.md](docs/NOTIFICATIONS_AND_ALERTS.md) for full documentation.

### Scheduled Reports

- **Daily Cost Report** - Automated daily AWS spend summary at 9:00 AM
- **Weekly Infrastructure Summary** - Weekly digest of EC2, S3, Lambda, and alarms

### S3 Bucket Management

- Browse bucket contents with folder navigation
- Search across all buckets
- Download files directly to Cliq
- Create/delete buckets
- View bucket info and policies

See [S3_FEATURES_DOCUMENTATION.md](docs/S3_FEATURES_DOCUMENTATION.md) for details.

### CloudWatch Alarms

- List and view all alarms
- Create new alarms with custom metrics
- View alarm history
- Get notified when alarms are created

### Budget Alerts

- Set a daily cost threshold
- Get alerted when spending exceeds your budget
- See percentage over budget

### Sidebar Widgets

Three powerful widgets for real-time AWS monitoring in your Cliq sidebar:

| Widget | Description |
|--------|-------------|
| **AWS Dashboard** | Infrastructure overview: EC2, S3, Lambda, Alarms, Costs |
| **Alarm Monitor** | CloudWatch alarm status with active alerts priority |
| **Cost Tracker** | Spending analysis: Today, Week, Month, Forecast |

See [widgets/README.md](widgets/README.md) for full widget documentation.

---

## How to Install in Zoho Cliq

### Step 1: Create the Connection

1. Go to **Cliq** → **Profile Picture** → **Bots & Tools**
2. Go to **Connections** → **Create Connection**
3. Configure:
   - **Connection Name:** AWS Cloud Commander API
   - **Link Name:** `awscloudcommander`
   - **Grant Type:** Client Credentials (or your OAuth setup)
   - **Scope:** `ZohoCatalyst.functions.ALL`
4. Click **Create and Connect**

---

### Step 2: Create the Command

1. Go to **Commands** → **Create Command**
2. Fill in:
   - **Command Name:** `aws`
   - **Description:** Manage AWS infrastructure from Cliq
   - **Access Level:** Organization (or Team)

3. **Execution Handler:**
   - Copy the contents of `commands/aws/ExecutionHandler.ds`
   - Paste into the Execution Handler editor

4. **Suggestion Handler:**
   - Copy the contents of `commands/aws/SuggestionHandler.ds`
   - Paste into the Suggestion Handler editor

5. Click **Save**

---

### Step 3: Create the Button Function

1. Go to **Functions** → **Create Function**
2. Fill in:
   - **Name:** `handleButton`
   - **Type:** Button Function

3. Copy the contents of `functions/handleButton.ds`
4. Paste into the editor
5. Click **Save**

---

### Step 4: Create the Form Function

1. Go to **Functions** → **Create Function**
2. Fill in:
   - **Name:** `handleForm`
   - **Type:** Form Function

3. Copy the contents of `functions/handleForm.ds`
4. Paste into the editor
5. Click **Save**

---

### Step 5: Create the Databases (if not done)

Create these 4 databases in **Bots & Tools** → **Databases**:

#### 1. awsprefs (User Preferences & Consent)

| Field | Type | Description |
|-------|------|-------------|
| userid | Text | Zoho user ID |
| username | Text | User display name |
| region | Text | Default AWS region (e.g., ap-south-1) |
| costthreshold | Number | Cost alert threshold in USD |
| channel | Text | Notification channel (optional) |
| consentcost | Boolean | Consent for Cost Explorer API ($0.01/request) |
| consentai | Boolean | Consent for AI Assistant (Bedrock) |
| consentlambda | Boolean | Consent for Lambda invocation |

#### 2. awsschedule (Scheduled Reports & Alerts)

| Field | Type | Description |
|-------|------|-------------|
| userid | Text | Zoho user ID |
| username | Text | User display name |
| alertsenabled | Boolean | Enable CloudWatch alarm notifications |
| dailycost | Boolean | Enable daily cost report |
| weeklysummary | Boolean | Enable weekly infrastructure summary |

#### 3. awsincidents
| Field | Type |
|-------|------|
| incidentid | Text |
| title | Text |
| severity | Text |
| status | Text |
| resource | Text |
| createdat | Number |
| updatedat | Number |
| reportedby | Text |
| resolvedby | Text |
| notes | Large Text |

#### 3. awsauditlog
| Field | Type |
|-------|------|
| logid | Text |
| userid | Text |
| username | Text |
| action | Text |
| resource | Text |
| timestamp | Number |
| result | Text |
| details | Text |

---

### Step 6: Create Widgets (Optional but Recommended)

Create three sidebar widgets for real-time AWS monitoring:

#### Widget 1: AWS Dashboard

1. Go to **Widgets** → **Create Widget**
2. Fill in:
   - **Name:** AWS Dashboard
   - **Description:** Complete AWS infrastructure overview
   - **Slug:** awsDashboard
3. **Execution Handler:** Copy `widgets/awsDashboard/ExecutionHandler.ds`
4. Create Widget Function:
   - Go to **Functions** → **Create Function** (Widget Function type)
   - **Name:** `widgetFunction`
   - Copy `widgets/awsDashboard/widgetFunction.ds`
5. Link the function to the widget and Save

#### Widget 2: Alarm Monitor

1. **Name:** Alarm Monitor
2. **Slug:** alarmMonitor
3. **Execution Handler:** Copy `widgets/alarmMonitor/ExecutionHandler.ds`
4. **Widget Function:** `alarmWidgetFunction` from `widgets/alarmMonitor/alarmWidgetFunction.ds`

#### Widget 3: Cost Tracker

1. **Name:** Cost Tracker
2. **Slug:** costTracker
3. **Execution Handler:** Copy `widgets/costTracker/ExecutionHandler.ds`
4. **Widget Function:** `costWidgetFunction` from `widgets/costTracker/costWidgetFunction.ds`

---

### Step 7: Bundle into Extension (Optional)

1. Go to **Extensions** → **Create Extension**
2. Fill in:
   - **Name:** AWS Cloud Commander
   - **Description:** Manage AWS infrastructure from Zoho Cliq
3. Select all components:
   - Command: `aws`
   - Functions: `handleButton`, `handleForm`, `widgetFunction`, `alarmWidgetFunction`, `costWidgetFunction`
   - Widgets: `awsDashboard`, `alarmMonitor`, `costTracker`
   - Databases: `awsprefs`, `awsschedule`, `awsincidents`, `awsauditlog`
   - Connection: `awscloudcommander`
4. Click **Create**

---

## Usage

After installation, use these commands:

```
/aws                    → Dashboard
/aws ec2                → List EC2 instances
/aws ec2 start <id>     → Start instance
/aws ec2 stop <id>      → Stop instance
/aws s3                 → List S3 buckets
/aws s3 <bucket>        → Browse bucket
/aws cost               → This week's costs
/aws cost month         → Monthly costs
/aws lambda             → List Lambda functions
/aws rds                → List RDS databases
/aws alarms             → CloudWatch alarms
/aws logs               → CloudWatch logs
/aws ai <question>      → Ask AI assistant
/aws status             → Health check
/aws permissions        → Check IAM permissions
Bot Menu → Settings    → Configure preferences
/aws help               → Show all commands
```

---

## Configuration

The backend API URL is configured in each handler:

```deluge
API_URL = "https://aws-cloudops-906900311.development.catalystserverless.com/server/aws_handler/";
CONNECTION_NAME = "awscloudcommander";
```

Update these values if your backend URL changes.

---

## Backend Services Supported

| Service | Actions | Consent |
|---------|---------|---------|
| EC2 | list, start, stop, reboot, status, metrics, sg, vpcs | FREE |
| S3 | listBuckets, listObjects, getBucket, search, download | FREE |
| Lambda | list, get, invoke | invoke=PAID |
| RDS | list, start, stop, reboot, clusters, snapshots | FREE |
| CloudWatch | listAlarms, getActiveAlarms, getAlarm, history | FREE |
| Logs | listGroups, recent, errors, filter, lambdaLogs | FREE |
| Cost | byPeriod, monthToDate, comparison, forecast, trend | ALL PAID |
| SNS | listTopics, listSubscriptions, publish | publish=PAID |
| IAM | listUsers, listRoles, securityStatus, accountSummary | FREE |
| Bedrock | chat, troubleshoot, optimize, explain, generateCli | ALL PAID |

---

*AWS Cloud Commander - Built for Zoho Cliqtrix Competition 2025*
