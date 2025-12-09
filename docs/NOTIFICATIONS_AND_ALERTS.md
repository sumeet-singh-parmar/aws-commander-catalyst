# AWS Cloud Commander - Notifications & Alerts System

## Overview

AWS Cloud Commander includes a comprehensive notification system that keeps your team informed about important AWS infrastructure changes in real-time via Zoho Cliq channels.

---

## How Notifications Work

### Dynamic Notification System (New)

AWS Cloud Commander now supports **per-type notification channels** via the `awsnotifications` table. Each notification type (EC2, S3, Alarms, SNS, Lambda, RDS, Daily Cost, Weekly Summary) can be configured with its own channel and enable/disable flag.

```
┌─────────────────────────────────────────────────────────────┐
│                      USER ACTION                            │
│   (EC2 start/stop, Alarm create, etc.)                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            CHECK DYNAMIC NOTIFICATION SETTINGS              │
│                                                             │
│   1. Query awsnotifications:                                │
│      - notificationtype = "ec2" (or "s3", "alarms", etc.)│
│      - enabled = "TRUE"?                                    │
│      - channel configured?                                  │
│                                                             │
│   2. If not found, fallback to legacy system:              │
│      - Query awsschedule: alertsenabled = TRUE?            │
│      - Query awsprefs: channel configured?                 │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        enabled=TRUE              enabled=FALSE
        channel set               or no channel
              │                           │
              ▼                           ▼
    ┌─────────────────┐          ┌─────────────────┐
    │ Post to Channel │          │   No Action     │
    │  (as Bot)       │          │                 │
    └─────────────────┘          └─────────────────┘
```

### Legacy System (Backward Compatible)

For backward compatibility, if no entry exists in `awsnotifications` for a notification type, the system falls back to checking:
1. `awsschedule.alertsenabled` (for real-time notifications)
2. `awsprefs.channel` (for channel configuration)

---

## Notification Types

### 1. EC2 Instance Actions

Notifications are sent when EC2 instances are started, stopped, or rebooted.

**Triggered by:**
- Button clicks in the Cliq interface
- `/aws ec2 start <instance-id>` command
- `/aws ec2 stop <instance-id>` command
- `/aws ec2 reboot <instance-id>` command

**Files:**
- `functions/handleButton.ds` (lines 189-240, 268-319, 347-398)
- `commands/aws/ExecutionHandler.ds` (lines 148-267)

**Sample Notifications:**

```
▶️ EC2 Instance Started

👤 By: John Doe
🖥️ Instance: i-0abc123def456
⏰ Time: 30 Nov 2025 14:35
```

```
⏹️ EC2 Instance Stopped

👤 By: Jane Smith
🖥️ Instance: i-0abc123def456
⏰ Time: 30 Nov 2025 14:40
```

```
🔄 EC2 Instance Rebooted

👤 By: John Doe
🖥️ Instance: i-0abc123def456
⏰ Time: 30 Nov 2025 14:45
```

---

### 2. CloudWatch Alarm Actions

Notifications are sent when alarms are created or deleted.

**Triggered by:**
- Creating an alarm via the "Create Alarm" form
- Deleting an alarm via the delete button

**Files:**
- `functions/handleForm.ds` - Alarm creation
- `functions/handleButton.ds` - Alarm deletion

**Sample Notifications:**

```
🔔 New CloudWatch Alarm Created

👤 By: John Doe
📛 Name: HighCPUAlarm
📊 Metric: AWS/EC2 / CPUUtilization
⚡ Condition: Average > 80
⏰ Time: 30 Nov 2025 14:50
```

```
🗑️ CloudWatch Alarm Deleted

👤 By: Jane Smith
📛 Name: OldCPUAlarm
⏰ Time: 30 Nov 2025 15:00
```

---

### 3. SNS Message Publishing

Notifications are sent when someone publishes a message to an SNS topic.

**Triggered by:**
- `/aws sns publish <topicArn> <message>` command

**File:**
- `commands/aws/ExecutionHandler.ds`

**Sample Notification:**

```
📢 SNS Message Published

👤 By: John Doe
📨 Topic: my-alerts-topic
⏰ Time: 30 Nov 2025 14:55
```

---

### 4. Daily Cost Report (Scheduled)

Automated daily cost reports sent at 9:00 AM to users who enabled them.

**Triggered by:**
- Scheduler runs daily at 9:00 AM

**File:**
- `schedulers/dailyCostReport.ds`

**Requirements:**
- User must have `dailycost = TRUE` in awsschedule
- User must have `consentcost = true` in awsprefs
- User must have a channel configured in awsprefs

**Sample Notification:**

```
💰 Daily AWS Cost Report

📅 Date: 30 Nov 2025
💵 Total Cost: $45.67

By Service:
🖥️ EC2: $28.50
📦 S3: $10.25
⚡ Lambda: $4.92
🗄️ RDS: $2.00
```

**With Budget Alert (when threshold exceeded):**

```
💰 Daily AWS Cost Report

📅 Date: 30 Nov 2025
💵 Total Cost: $62.50

By Service:
🖥️ EC2: $45.00
📦 S3: $12.50
⚡ Lambda: $5.00

🚨 BUDGET ALERT
Cost exceeds threshold of $50 by 25%!
💡 Review your resources to reduce spending.
```

---

### 5. Weekly Infrastructure Summary (Scheduled)

Automated weekly summary sent every Monday at 9:00 AM.

**Triggered by:**
- Scheduler runs weekly on Mondays at 9:00 AM

**File:**
- `schedulers/weeklySummary.ds`

**Requirements:**
- User must have `weeklysummary = TRUE` in awsschedule
- User must have a channel configured in awsprefs

**Sample Notification:**

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

## Database Schema

### awsschedule (Controls notification settings)

| Field | Type | Description |
|-------|------|-------------|
| userid | Text | User's Cliq ID |
| username | Text | User's display name |
| alertsenabled | Text | "TRUE" or "FALSE" - Enable real-time action notifications |
| dailycost | Text | "TRUE" or "FALSE" - Enable daily cost reports |
| weeklysummary | Text | "TRUE" or "FALSE" - Enable weekly summary |

**Important:** Zoho Cliq stores booleans as `"TRUE"` / `"FALSE"` strings, NOT actual boolean values!

### awsprefs (Stores channel and preferences)

| Field | Type | Description |
|-------|------|-------------|
| userid | Text | User's Cliq ID |
| username | Text | User's display name |
| region | Text | Default AWS region |
| costthreshold | Number | Budget threshold in USD (default: 50) |
| channel | Text | Channel name for notifications (e.g., "aws-alerts") - **Legacy, use awsnotifications for per-type channels** |
| consentcost | Boolean | Consent for Cost Explorer API |
| consentai | Boolean | Consent for AI Assistant |
| consentlambda | Boolean | Consent for Lambda invocation |

### Table: `awsnotifications` (New)

| Column | Type | Description |
|--------|------|-------------|
| userid | Text | User's Cliq ID (part of composite key) |
| notificationtype | Text | Type: "ec2", "s3", "alarms", "sns", "lambda", "rds", "daily_cost", "weekly_summary" |
| channel | Text | Channel unique name for this notification type |
| enabled | Text | "TRUE" or "FALSE" |

**Composite Key:** (userid, notificationtype)

**Note:** Zoho Cliq DB allows only 5 boolean and 5 text fields per table. The `enabled` field is stored as text ("TRUE"/"FALSE") to avoid hitting the boolean limit.

---

## User Setup

### Dynamic Notification Configuration (Recommended)

For per-type notification channels:

1. **Open Notification Settings:**
   ```
   Bot Menu → Notifications
   ```
   (Action name: "Notifications")

2. **Configure Each Notification Type:**
   - Toggle ON/OFF for each notification type (EC2, S3, Alarms, SNS, Lambda, RDS, Daily Cost, Weekly Summary)
   - Select a channel for each enabled notification type
   - Different notification types can use different channels

3. **Save Settings:**
   - Click "💾 Save Notifications"
   - Settings are stored in the `awsnotifications` table

### Legacy Settings (General Preferences)

For general preferences and scheduled notifications:

1. **Open Settings:**
   ```
   Bot Menu → Settings
   ```

2. **Set Default Notification Channel (Legacy):**
   - Select a channel from the dropdown (e.g., `#aws-alerts`)
   - This is used as fallback if no per-type channel is configured

3. **Enable Scheduled Notifications:**
   - Toggle "🔔 Alert Notifications" ON for real-time EC2/Alarm notifications (legacy)
   - Toggle "📊 Daily Cost Report" ON for daily cost reports
   - Toggle "📋 Weekly Summary" ON for weekly infrastructure digest

4. **Set Budget Threshold:**
   - Enter a dollar amount (e.g., 50)
   - You'll get budget alerts when daily costs exceed this

5. **Grant Consent:**
   - For cost reports, enable "Cost Explorer API" consent ($0.01/request)

---

## Notification Matrix

| Action | Source | Notification Type | Requires enabled | Requires channel | Requires consent |
|--------|--------|-------------------|------------------|------------------|------------------|
| EC2 Start | Button | ec2 | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| EC2 Stop | Button | ec2 | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| EC2 Reboot | Button | ec2 | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| EC2 Start | Command | ec2 | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| EC2 Stop | Command | ec2 | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| EC2 Reboot | Command | ec2 | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| S3 Bucket Created | Form | s3 | ✅ (awsnotifications) | ✅ (awsnotifications or awsprefs) | ❌ |
| S3 Bucket Deleted | Form | s3 | ✅ (awsnotifications) | ✅ (awsnotifications or awsprefs) | ❌ |
| Alarm Created | Form | alarms | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| Alarm Deleted | Button | alarms | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| SNS Publish | Command/Form | sns | ✅ (awsnotifications or alertsenabled) | ✅ (awsnotifications or awsprefs) | ❌ |
| Daily Cost | Scheduler | daily_cost | ✅ (awsnotifications + dailycost=TRUE) | ✅ (awsnotifications or awsprefs) | consentcost=true |
| Weekly Summary | Scheduler | weekly_summary | ✅ (awsnotifications + weeklysummary=TRUE) | ✅ (awsnotifications or awsprefs) | ❌ |

**Note:** The system checks `awsnotifications` table first. If no entry exists, it falls back to the legacy system (`awsschedule.alertsenabled` + `awsprefs.channel`).
| Weekly Summary | Scheduler | weeklysummary=TRUE | ✅ | ❌ |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Notifications not appearing | Check if channel is set in Settings |
| EC2 notifications not working | Verify alertsenabled = TRUE in awsschedule |
| Daily cost report not sent | Check consentcost = true in awsprefs |
| Weekly summary not sent | Check weeklysummary = TRUE in awsschedule |
| Wrong channel | Update channel in Settings form |

---

## Future Enhancements

- **Real-time Alarm Alerts:** SNS → Catalyst webhook for instant CloudWatch alarm notifications
- **S3 Event Notifications:** Alert when objects are uploaded/deleted
- **Lambda Error Alerts:** Notify when Lambda functions fail
- **RDS Event Notifications:** Database start/stop/failover alerts

---

*Part of AWS Cloud Commander - Built for Zoho Cliqtrix Competition 2025*
