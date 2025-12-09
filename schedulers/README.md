# AWS Cloud Commander - Schedulers

## Overview

Schedulers are automated tasks that run periodically to send reports and notifications to users. They are bundled with the Cliq extension and configured in the Zoho Cliq Developer Console.

## How Schedulers Work

```
┌─────────────────────────────────────────────────────────────┐
│                    ZOHO CLIQ SERVER                         │
│                                                             │
│   ┌─────────────┐    Trigger Time       ┌──────────────┐   │
│   │  Scheduler  │ ───────────────────►  │ Your .ds     │   │
│   │   Config    │                       │ Script Runs  │   │
│   └─────────────┘                       └──────┬───────┘   │
│                                                │           │
└────────────────────────────────────────────────│───────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   Scheduler Script                          │
│                                                             │
│  1. Query awsschedule DB → Find users who enabled feature   │
│  2. For each user:                                          │
│     - Get their notification channel                        │
│     - Check consent/preferences from awsprefs               │
│     - Call Catalyst API for AWS data                        │
│     - Post formatted message to their channel               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Available Schedulers

### 1. dailyCostReport.ds
**Purpose:** Sends daily AWS cost report to users who enabled it.

| Setting | Value |
|---------|-------|
| Name | `dailyCostReport` |
| Description | Sends daily AWS cost report to configured channel |
| Recurring Period | Daily |
| Repeats every | 1 day |
| Time | 09:00 AM |
| Ends | Never |

**Flow:**
1. Queries `awsschedule` for users with `dailycost=true`
2. For each user, checks `awsprefs` for `consentcost=true`
3. Calls Catalyst API to get cost data
4. Posts cost report to user's configured channel

**Sample Output:**
```
💰 Daily AWS Cost Report

📅 Date: 30 Nov 2025
💵 Total Cost: $12.45

By Service:
🖥️ EC2: $8.20
📦 S3: $2.15
⚡ Lambda: $1.50
🗄️ RDS: $0.60
```

---

### 2. weeklySummary.ds
**Purpose:** Sends weekly infrastructure summary to users who enabled it.

| Setting | Value |
|---------|-------|
| Name | `weeklySummary` |
| Description | Sends weekly AWS infrastructure summary to configured channel |
| Recurring Period | Weekly |
| Day | Monday |
| Repeats every | 1 week |
| Time | 09:00 AM |
| Ends | Never |

**Flow:**
1. Queries `awsschedule` for users with `weeklysummary=true`
2. Gets user's region from `awsprefs`
3. Calls Catalyst API dashboard endpoint
4. Posts infrastructure summary to user's configured channel

**Sample Output:**
```
📊 Weekly AWS Infrastructure Summary

📅 Week ending: 30 Nov 2025
🌍 Region: ap-south-1

🖥️ EC2 Instances:
   • Total: 5
   • 🟢 Running: 3
   • 🔴 Stopped: 2

📦 S3 Buckets: 12

⚡ Lambda Functions: 8

🔔 CloudWatch Alarms:
   • 🟢 OK: 4
   • 🔴 Active: 1

⚠️ Attention: 1 alarm(s) require attention!
```

---

## Database Tables Used

### awsschedule
Controls which reports users receive and where.

| Field | Type | Description |
|-------|------|-------------|
| userid | String | User's Cliq ID |
| username | String | User's display name |
| channel | String | Channel name for notifications (e.g., "aws-alerts") |
| alertsenabled | Boolean | Enable CloudWatch alarm notifications |
| dailycost | Boolean | Enable daily cost reports |
| weeklysummary | Boolean | Enable weekly infrastructure summary |

### awsprefs
Stores user preferences and consent.

| Field | Type | Description |
|-------|------|-------------|
| userid | String | User's Cliq ID |
| username | String | User's display name |
| region | String | Default AWS region (e.g., "ap-south-1") |
| costthreshold | Number | Cost alert threshold in USD |
| consentcost | Boolean | Consent for Cost Explorer API ($0.01/request) |
| consentai | Boolean | Consent for AI Assistant |
| consentlambda | Boolean | Consent for Lambda invocation |

---

## User Setup Required

For schedulers to work, users must:

1. **Open Settings:** Bot Menu → Settings
2. **Set Notification Channel:** Enter the channel name (e.g., `aws-alerts`)
3. **Enable Reports:** Toggle on the reports they want
4. **Grant Consent:** For cost reports, enable "Cost Explorer API" consent

---

## Registering Schedulers in Cliq Console

1. Go to **Zoho Cliq Developer Console**
2. Open your extension → **Schedulers** section
3. Click **Add Scheduler**
4. Configure each scheduler with the settings above
5. **Publish** the extension

---

## Architecture Flow

```
                         ┌─────────────────┐
                         │  9:00 AM Daily  │
                         └────────┬────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  dailyCostReport.ds     │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Query awsschedule       │
                    │ WHERE dailycost=true    │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        ┌──────────┐       ┌──────────┐       ┌──────────┐
        │  User A  │       │  User B  │       │  User C  │
        │ channel: │       │ channel: │       │ channel: │
        │ aws-ops  │       │ devops   │       │ alerts   │
        └────┬─────┘       └────┬─────┘       └────┬─────┘
             │                  │                  │
             ▼                  ▼                  ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ Check consent   │ │ Check consent   │ │ Check consent   │
    │ from awsprefs   │ │ from awsprefs   │ │ from awsprefs   │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                  │                  │
             ▼                  ▼                  ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ Call Catalyst   │ │ Call Catalyst   │ │ Call Catalyst   │
    │ API for costs   │ │ API for costs   │ │ API for costs   │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                  │                  │
             ▼                  ▼                  ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ Post to         │ │ Post to         │ │ Post to         │
    │ #aws-ops        │ │ #devops         │ │ #alerts         │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## Future Enhancement: Real-time Alarm Alerts

Schedulers have a minimum interval of 1 day, which is not suitable for alarm monitoring. For real-time alarm notifications, we plan to implement:

**SNS → Catalyst Webhook Flow:**
```
CloudWatch Alarm triggers
        ↓
    SNS Topic
        ↓
SNS → Catalyst endpoint (/sns-webhook)
        ↓
Catalyst posts to Cliq channel (instant!)
```

This will be added as a future enhancement for immediate alarm notifications.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Reports not being sent | Check if channel name is set in Settings |
| Cost report not working | Verify user has `consentcost=true` in awsprefs |
| Wrong region data | Check user's region setting in awsprefs |
| Scheduler not running | Verify scheduler is registered in Cliq Console |
