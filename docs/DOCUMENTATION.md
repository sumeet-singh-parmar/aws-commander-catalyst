# AWS Cloud Commander - Complete Project Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Competition Context](#competition-context)
3. [Architecture](#architecture)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Backend (Zoho Catalyst)](#backend-zoho-catalyst)
7. [Frontend (Zoho Cliq Extension)](#frontend-zoho-cliq-extension)
8. [AWS Services Integration](#aws-services-integration)
9. [API Reference](#api-reference)
10. [Database Schema](#database-schema)
11. [Authentication & Security](#authentication--security)
12. [Deployment Guide](#deployment-guide)
13. [Testing](#testing)
14. [Current Status](#current-status)
15. [Pending Work](#pending-work)
16. [Troubleshooting](#troubleshooting)

---

## Project Overview

### What is AWS Cloud Commander?

AWS Cloud Commander is a **Zoho Cliq extension** that allows users to manage their entire AWS infrastructure directly from within Zoho Cliq chat. Instead of switching between AWS Console and work communication, users can:

- Monitor EC2 instances, S3 buckets, Lambda functions
- Start/stop/reboot servers with simple commands
- View real-time CloudWatch logs and alarms
- Track AWS costs and get forecasts
- Get AI-powered assistance using Amazon Bedrock (Claude)
- Receive proactive alerts about infrastructure issues

### Why This Project?

This is being built for the **Zoho Cliqtrix Competition** - a hackathon for building innovative Zoho Cliq extensions. The project demonstrates:

1. Deep integration between Zoho and AWS ecosystems
2. AI-powered DevOps assistance
3. Practical utility for developers and DevOps teams
4. Clean architecture and production-ready code

### Target Users

- DevOps Engineers
- Cloud Architects
- Developers managing AWS infrastructure
- Small teams without dedicated AWS Console access
- Anyone who wants to manage AWS from chat

---

## Competition Context

### Zoho Cliqtrix Competition

- **Platform**: Zoho Cliq (team communication tool like Slack)
- **Requirement**: Build a Cliq extension that solves real problems
- **Judging Criteria**:
  - Innovation
  - Usefulness
  - Technical implementation
  - User experience
  - Integration with Zoho ecosystem

### Why Zoho Catalyst Backend (Not AWS Lambda)?

We chose Zoho Catalyst over AWS Lambda for the backend because:

1. **Competition judges prefer Zoho ecosystem** - Shows knowledge of Zoho platform
2. **Easier demo** - Everything in Zoho, no AWS console needed for demo
3. **Free tier sufficient** - 25K requests/month free
4. **Simpler architecture** - Single ecosystem
5. **Better integration** - Native Catalyst-Cliq connection

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ZOHO CLIQ                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   Bot    │  │ Commands │  │ Widgets  │  │ Scheduler│        │
│  │ Handler  │  │ /ec2 /s3 │  │Dashboard │  │  Alerts  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │                │
│       └─────────────┴─────────────┴─────────────┘                │
│                           │                                      │
│                    ┌──────▼──────┐                              │
│                    │  Cliq API   │                              │
│                    │  Handlers   │                              │
│                    └──────┬──────┘                              │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ZOHO CATALYST                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  aws_handler Function                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │  EC2    │ │   S3    │ │ Lambda  │ │CloudWatch│        │   │
│  │  │ Service │ │ Service │ │ Service │ │ Service │        │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘        │   │
│  │       │           │           │           │              │   │
│  │  ┌────┴───────────┴───────────┴───────────┴────┐        │   │
│  │  │           AWS SDK v3 Clients                 │        │   │
│  │  └─────────────────────┬───────────────────────┘        │   │
│  └────────────────────────┼─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────┼─────────────────────────────────┐   │
│  │    Data Store          │         Environment Vars         │   │
│  │    (aws_config)        │    (AWS_ACCESS_KEY_ID, etc.)    │   │
│  └────────────────────────┼─────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            │ AWS SDK
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AMAZON WEB SERVICES                         │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │   EC2   │ │   S3    │ │ Lambda  │ │CloudWatch│ │   RDS   │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │   SNS   │ │   IAM   │ │  Cost   │ │ Bedrock │ │   STS   │   │
│  │         │ │         │ │Explorer │ │ (Claude)│ │         │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User** types command in Cliq (e.g., `/ec2 list`)
2. **Cliq** triggers command handler
3. **Handler** calls Catalyst function via HTTPS
4. **Catalyst function** uses AWS SDK to call AWS APIs
5. **AWS** returns data
6. **Catalyst** formats response
7. **Cliq** displays formatted cards/tables to user

---

## Technology Stack

### Backend (Zoho Catalyst)

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18.x |
| Framework | Express.js 4.x |
| AWS SDK | AWS SDK v3 (modular) |
| Function Type | Advanced I/O |

### Frontend (Zoho Cliq)

| Component | Technology |
|-----------|------------|
| Platform | Zoho Cliq Extension |
| Bot | @awscloudcommander |
| Commands | /ec2, /s3, /cost, /lambda, /logs, /ai |
| Widget | AWS Dashboard (unified) |
| Database | Catalyst Data Store |

### AWS Services Used

| Service | Purpose |
|---------|---------|
| EC2 | Virtual server management |
| S3 | Storage management |
| Lambda | Serverless function management |
| CloudWatch | Metrics, alarms, dashboards |
| CloudWatch Logs | Log viewing and searching |
| Cost Explorer | Cost tracking and forecasting |
| RDS | Database management |
| SNS | Notifications |
| IAM | Security and user management |
| Bedrock | AI chat (Claude 3 Sonnet) |
| STS | Security token service |

---

## Project Structure

```
catalyst-aws-cloudops/
│
├── catalyst-config.json          # Catalyst deployment config
│
├── functions/
│   └── aws_handler/              # Main Catalyst function
│       │
│       ├── index.js              # Express app + API router
│       ├── package.json          # Dependencies
│       │
│       ├── services/             # AWS service modules
│       │   ├── ec2.js           # EC2 operations
│       │   ├── s3.js            # S3 operations
│       │   ├── lambda.js        # Lambda operations
│       │   ├── cloudwatch.js    # Alarms & metrics
│       │   ├── logs.js          # CloudWatch Logs
│       │   ├── cost.js          # Cost Explorer
│       │   ├── rds.js           # RDS databases
│       │   ├── sns.js           # Notifications
│       │   ├── iam.js           # IAM security
│       │   └── bedrock.js       # AI chat
│       │
│       └── utils/                # Shared utilities
│           ├── aws-clients.js   # AWS client factories
│           └── helpers.js       # Helper functions
│
├── DOCUMENTATION.md              # This file
└── README.md                     # Quick start guide
```

### File Responsibilities

| File | Responsibility |
|------|----------------|
| `index.js` | Express server, API routing, request handling |
| `aws-clients.js` | Create AWS SDK clients with credentials |
| `helpers.js` | Formatting, date handling, response builders |
| `ec2.js` | All EC2 operations (list, start, stop, metrics) |
| `s3.js` | All S3 operations (buckets, objects, presigned URLs) |
| `lambda.js` | Lambda operations (list, invoke, logs) |
| `cloudwatch.js` | Alarms and metrics |
| `logs.js` | Log groups, streams, searching |
| `cost.js` | Cost data, forecasts, comparisons |
| `rds.js` | Database management |
| `sns.js` | Topics and notifications |
| `iam.js` | Users, roles, security audit |
| `bedrock.js` | AI chat and code generation |

---

## Backend (Zoho Catalyst)

### Function Configuration

**Type**: Advanced I/O (Express.js)
**Runtime**: Node.js 18.x
**Timeout**: 30 seconds (default)
**Memory**: 512 MB (default)

### Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | `AKIA...` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | `...secret...` | AWS IAM secret key |
| `AWS_REGION` | `ap-south-1` | Default AWS region |
| `BEDROCK_REGION` | `us-east-1` | Bedrock region |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | AI model |

### Request/Response Format

**Request:**
```json
{
  "service": "ec2",
  "action": "list",
  "region": "ap-south-1",
  "...params": {}
}
```

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-11-27T10:00:00.000Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-11-27T10:00:00.000Z"
}
```

### Express.js Pattern

Catalyst Advanced I/O uses Express.js:

```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: 'healthy' });
});

app.post('/', async (req, res) => {
    const { service, action, ...params } = req.body;
    // Handle request
    res.json({ success: true, data: result });
});

module.exports = app;  // Export Express app, NOT handler function
```

---

## Frontend (Zoho Cliq Extension)

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| AWS Cloud Commander | Bot | Chat interface, natural language |
| /ec2 | Command | EC2 management |
| /s3 | Command | S3 management |
| /cost | Command | Cost tracking |
| /lambda | Command | Lambda management |
| /logs | Command | Log viewing |
| /ai | Command | AI assistant |
| /aws | Command | Setup & config |
| AWS Dashboard | Widget | Unified overview (EC2, S3, Lambda, Alarms, RDS, Logs, Costs) |
| Cost Alert | Scheduler | Daily cost alerts |

### Bot Handlers

**Welcome Handler**: Shows when user first messages bot
```javascript
{
  "type": "banner",
  "title": "AWS Cloud Commander",
  "subtitle": "Manage AWS from Cliq"
}
```

**Message Handler**: Handles natural language
- Detects keywords (ec2, cost, instance, bucket, etc.)
- Routes to appropriate service
- Falls back to AI for unknown queries

### Commands

Each command follows this pattern:
```javascript
{
  "name": "ec2",
  "description": "Manage EC2 instances",
  "execution_type": "handler",
  "params": [
    {
      "name": "action",
      "type": "string",
      "optional": true
    }
  ]
}
```

---

## AWS Services Integration

### IAM Permissions Required

The AWS IAM user (`cliq-cloudops`) needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2Permissions",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:RebootInstances"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3Permissions",
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets",
        "s3:ListBucket",
        "s3:GetObject",
        "s3:GetBucketLocation"
      ],
      "Resource": "*"
    },
    {
      "Sid": "LambdaPermissions",
      "Effect": "Allow",
      "Action": [
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "lambda:InvokeFunction"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchPermissions",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:Describe*",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchLogsPermissions",
      "Effect": "Allow",
      "Action": [
        "logs:Describe*",
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CostExplorerPermissions",
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetCostForecast"
      ],
      "Resource": "*"
    },
    {
      "Sid": "RDSPermissions",
      "Effect": "Allow",
      "Action": [
        "rds:Describe*",
        "rds:StartDBInstance",
        "rds:StopDBInstance"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SNSPermissions",
      "Effect": "Allow",
      "Action": [
        "sns:List*",
        "sns:Publish"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMPermissions",
      "Effect": "Allow",
      "Action": [
        "iam:List*",
        "iam:Get*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "BedrockPermissions",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:GetFoundationModel",
        "bedrock:ListFoundationModels",
        "bedrock:GetModelInvocationLoggingConfiguration"
      ],
      "Resource": "*"
    },
    {
      "Sid": "MarketplacePermissionsForBedrock",
      "Effect": "Allow",
      "Action": [
        "aws-marketplace:ViewSubscriptions",
        "aws-marketplace:Subscribe",
        "aws-marketplace:Unsubscribe"
      ],
      "Resource": "*"
    }
  ]
}
```

### AWS SDK v3 Modular Imports

We use AWS SDK v3 (modular) for smaller bundle size:

```javascript
// Good - modular imports
const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");

// Bad - v2 style (larger bundle)
const AWS = require('aws-sdk');
```

---

## API Reference

### EC2 Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `list` | `region`, `filters` | List all EC2 instances |
| `get` | `instanceId`, `region` | Get single instance details |
| `start` | `instanceId`, `region` | Start stopped instance |
| `stop` | `instanceId`, `region`, `force` | Stop running instance |
| `reboot` | `instanceId`, `region` | Reboot instance |
| `status` | `instanceId`, `region` | Get status checks |
| `metrics` | `instanceId`, `metricName`, `region`, `hours` | Get CloudWatch metrics |
| `summary` | `region` | Get counts by state/type |
| `securityGroups` | `region`, `vpcId` | List security groups |
| `vpcs` | `region` | List VPCs |
| `subnets` | `region`, `vpcId` | List subnets |

**Example: List EC2 Instances**
```json
// Request
{ "service": "ec2", "action": "list", "region": "ap-south-1" }

// Response
{
  "success": true,
  "data": [
    {
      "id": "i-0123456789",
      "name": "WebServer",
      "type": "t2.micro",
      "state": "running",
      "stateEmoji": "🟢",
      "privateIp": "10.0.1.5",
      "publicIp": "54.123.45.67",
      "az": "ap-south-1a"
    }
  ]
}
```

### S3 Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `listBuckets` | `region` | List all buckets |
| `getBucket` | `bucket`, `region` | Get bucket info with size |
| `listObjects` | `bucket`, `prefix`, `region`, `maxKeys` | List objects |
| `getObject` | `bucket`, `key`, `region` | Get object metadata |
| `getPresignedUrl` | `bucket`, `key`, `region`, `expiresIn` | Get download link |
| `deleteObject` | `bucket`, `key`, `region` | Delete object |
| `search` | `bucket`, `searchTerm`, `region` | Search objects |
| `summary` | `region` | Get buckets summary |

### Lambda Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `list` | `region` | List all functions |
| `get` | `functionName`, `region` | Get function details |
| `invoke` | `functionName`, `payload`, `region` | Invoke function |
| `summary` | `region` | Get summary by runtime |
| `eventSources` | `functionName`, `region` | List triggers |

### CloudWatch Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `listAlarms` | `region`, `stateValue` | List alarms |
| `getActiveAlarms` | `region` | Get ALARM state only |
| `getAlarm` | `alarmName`, `region` | Get alarm details |
| `getAlarmHistory` | `alarmName`, `region` | Get state changes |
| `getMetrics` | `namespace`, `metricName`, `dimensions`, `region`, `hours` | Get metrics |
| `createAlarm` | `params`, `region` | Create alarm |
| `deleteAlarm` | `alarmName`, `region` | Delete alarm |
| `summary` | `region` | Get alarms summary |

### Logs Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `listGroups` | `region`, `prefix` | List log groups |
| `listStreams` | `logGroupName`, `region` | List streams |
| `getEvents` | `logGroupName`, `logStreamName`, `region`, `options` | Get logs |
| `filter` | `logGroupName`, `region`, `options` | Search logs |
| `recent` | `logGroupName`, `region`, `minutes` | Recent logs |
| `errors` | `logGroupName`, `region`, `minutes` | Search errors |
| `lambdaLogs` | `functionName`, `region`, `minutes` | Lambda logs |
| `summary` | `region` | Logs summary |

### Cost Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `getUsage` | `startDate`, `endDate`, `granularity`, `groupBy` | Raw cost data |
| `byPeriod` | `period`, `groupBy` | Cost by period |
| `forecast` | `startDate`, `endDate` | Cost forecast |
| `monthToDate` | - | MTD costs |
| `comparison` | - | This month vs last |
| `topServices` | `period`, `limit` | Top cost drivers |
| `trend` | `days` | Daily trend |
| `byTag` | `tagKey`, `period` | Cost by tag |

### RDS Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `list` | `region` | List databases |
| `get` | `dbInstanceId`, `region` | Get DB details |
| `start` | `dbInstanceId`, `region` | Start database |
| `stop` | `dbInstanceId`, `region` | Stop database |
| `reboot` | `dbInstanceId`, `region` | Reboot database |
| `clusters` | `region` | List Aurora clusters |
| `snapshots` | `region`, `dbInstanceId` | List snapshots |
| `summary` | `region` | RDS summary |

### SNS Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `listTopics` | `region` | List topics |
| `getTopic` | `topicArn`, `region` | Get topic details |
| `publish` | `topicArn`, `message`, `subject`, `region` | Send message |
| `createTopic` | `name`, `region` | Create topic |
| `subscribe` | `topicArn`, `protocol`, `endpoint`, `region` | Subscribe |
| `summary` | `region` | SNS summary |

### IAM Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `listUsers` | - | List IAM users |
| `getUser` | `userName` | Get user with MFA status |
| `listRoles` | - | List roles |
| `getRole` | `roleName` | Get role details |
| `listPolicies` | `scope` | List policies |
| `accountSummary` | - | Account overview |
| `securityStatus` | - | Security audit |
| `summary` | - | IAM summary |

### Bedrock AI Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `chat` | `prompt`, `options` | Basic AI chat |
| `chatWithContext` | `prompt`, `awsContext`, `options` | Chat with AWS state |
| `generateCfn` | `description` | Generate CloudFormation |
| `generateIam` | `requirements` | Generate IAM policy |
| `generateLambda` | `description`, `runtime` | Generate Lambda code |
| `troubleshoot` | `issue`, `context` | Troubleshoot issues |
| `optimize` | `costData` | Cost optimization |
| `reviewArchitecture` | `architecture` | Architecture review |
| `explain` | `concept` | Explain AWS concepts |
| `generateCli` | `description` | Generate CLI commands |

### Permissions Service (NEW!)

Use this to check what AWS permissions the user has configured.

| Action | Parameters | Description |
|--------|------------|-------------|
| `checkAll` | `region` | **Check ALL permissions** - shows what's working and what's missing |
| `check` | `permission`, `region` | Check a specific permission (e.g., "ec2_read") |
| `validateBedrock` | `skipInvoke` | Detailed Bedrock validation |
| `list` | - | List all available permission checks |
| `getRequiredPolicy` | `options` | Generate the required IAM policy JSON |

**Example: Check All Permissions**
```json
// Request
{ "service": "permissions", "action": "checkAll" }

// Response
{
  "success": true,
  "data": {
    "identity": {
      "account": "123456789012",
      "userId": "AIDA...",
      "arn": "arn:aws:iam::123456789012:user/cliq-cloudops"
    },
    "permissions": {
      "ec2_read": { "status": "granted", "name": "EC2 Read" },
      "s3_read": { "status": "granted", "name": "S3 Read" },
      "bedrock": { "status": "skipped", "message": "..." }
    },
    "summary": {
      "total": 14,
      "passed": 10,
      "failed": 2,
      "skipped": 2,
      "required_missing": []
    },
    "recommendations": [
      {
        "severity": "HIGH",
        "permission": "cost_explorer",
        "message": "Missing Cost Explorer permissions",
        "fix": "Add these IAM actions: ce:GetCostAndUsage, ce:GetCostForecast"
      }
    ]
  }
}
```

**Example: Get Required IAM Policy**
```json
// Request
{ "service": "permissions", "action": "getRequiredPolicy" }

// Response - Returns complete IAM policy JSON you can copy-paste
{
  "success": true,
  "data": {
    "Version": "2012-10-17",
    "Statement": [...]
  }
}
```

### Pricing Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `info` | - | Get all pricing information |

### Consent Service (Per-User Cost Consent)

Manages per-user consent for paid AWS services. Users must consent before using paid features.

| Action | Parameters | Description |
|--------|------------|-------------|
| `grant` | `userId`, `categoryId` | Grant consent for a paid category |
| `revoke` | `userId`, `categoryId` | Revoke consent |
| `revokeAll` | `userId` | Revoke all consents |
| `status` | `userId` | Get user's consent status for all categories |
| `list` | - | List all paid categories |

**How Per-User Consent Works:**

1. User calls a paid action (e.g., Cost Explorer)
2. Backend checks if user has consented
3. If NO consent → Returns consent request with cost info
4. User sends request with `"consent": true` and `"userId": "..."`
5. Consent is recorded in database
6. Future requests from this user work without re-consenting

**Example Flow:**

```json
// Step 1: User tries to get costs (first time)
{ "service": "cost", "action": "byPeriod", "userId": "user123" }

// Response: Consent required
{
  "success": false,
  "requiresConsent": true,
  "userId": "user123",
  "category": {
    "id": "cost_explorer",
    "name": "Cost Explorer",
    "costInfo": "$0.01 per API call"
  },
  "message": "⚠️ This action requires your consent as it incurs AWS charges.",
  "howToConsent": "Add \"consent\": true to your request to enable Cost Explorer for your account"
}

// Step 2: User grants consent
{ "service": "cost", "action": "byPeriod", "userId": "user123", "consent": true }

// Response: Success! Consent recorded + data returned
{
  "success": true,
  "data": { ... cost data ... }
}

// Step 3: Future requests work without consent
{ "service": "cost", "action": "byPeriod", "userId": "user123" }
// Works! User already consented
```

**Check User's Consent Status:**
```json
{ "service": "consent", "action": "status", "userId": "user123" }
```

### Dashboard Service

| Action | Parameters | Description |
|--------|------------|-------------|
| `overview` | `region` | Full AWS overview |

---

## Database Schema

### Catalyst Data Store: `aws_config`

Stores user-specific configuration.

| Column | Type | Required | Unique | Description |
|--------|------|----------|--------|-------------|
| `ROWID` | Auto | Yes | Yes | System ID |
| `user_id` | Single Line | Yes | Yes | Zoho user ID |
| `api_url` | Single Line | Yes | No | Catalyst function URL |
| `region` | Single Line | Yes | No | Default AWS region |
| `created_at` | Date-Time | Yes | No | Creation timestamp |

**Note:** User consent for paid operations is now managed in the frontend (Cliq `awsprefs` database with fields `consentcost`, `consentai`, `consentlambda`).

---

## Authentication & Security

### AWS Setup Guide

**⚠️ IMPORTANT: Before using AWS Cloud Commander, complete the AWS setup!**

See these guides:
- **[AWS_SETUP_GUIDE.md](./AWS_SETUP_GUIDE.md)** - Complete step-by-step instructions
- **[AWS_SETUP_CHECKLIST.md](./AWS_SETUP_CHECKLIST.md)** - Quick checklist

### Key Setup Requirements

1. **IAM User** with correct permissions
2. **AWS Marketplace permissions** for Bedrock
3. **Bedrock model enabled** in us-east-1
4. **Use case form submitted** (for Anthropic models)

### Current Implementation (Competition)

For the competition, we use a single AWS IAM user:
- Credentials stored in Catalyst environment variables
- All Cliq users share the same AWS account
- Sufficient for demo purposes

### Production Implementation (Future)

For production/marketplace, implement multi-tenant:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User A    │     │   User B    │     │   User C    │
│ (IAM Role)  │     │ (IAM Role)  │     │ (IAM Role)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────┐
│              Catalyst Function                       │
│         (AssumeRole with External ID)               │
└─────────────────────────────────────────────────────┘
```

Each user would:
1. Create IAM Role in their AWS account
2. Trust Catalyst's AWS account
3. Store Role ARN in their config
4. Catalyst assumes role per request

---

## Deployment Guide

### Prerequisites

1. **Zoho Account** with access to:
   - Zoho Cliq (organization)
   - Zoho Catalyst

2. **AWS Account** with:
   - IAM user with required permissions
   - Access key and secret key
   - Bedrock model access enabled

3. **Development Tools**:
   - Node.js 18+
   - Catalyst CLI (`npm install -g zcatalyst-cli`)
   - Git

### Step 1: Catalyst Project Setup

```bash
# Login to Catalyst
catalyst login

# Create new project (or use existing)
catalyst init

# Navigate to project
cd aws-cloudops
```

### Step 2: Deploy Backend

```bash
# Copy function files to functions/aws_handler/
# (Replace existing files with our code)

# Install dependencies
cd functions/aws_handler
npm install
cd ../..

# Deploy
catalyst deploy
```

### Step 3: Configure Environment Variables

In Catalyst Console:
1. Go to Functions > aws_handler > Configuration
2. Add environment variables:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`
   - `BEDROCK_REGION`
   - `BEDROCK_MODEL_ID`

### Step 4: Test Backend

```bash
# Get function URL from Catalyst Console
# Test with curl:

curl -X GET https://your-function-url/server/aws_handler

curl -X POST https://your-function-url/server/aws_handler \
  -H "Content-Type: application/json" \
  -d '{"service": "ec2", "action": "list"}'
```

### Step 5: Create Cliq Extension

1. Go to Zoho Cliq > Admin > Extensions
2. Create new extension
3. Add components:
   - Bot
   - Commands
   - Widgets
   - Schedulers
4. Configure handlers with code

### Step 6: Test in Cliq

1. Install extension in your organization
2. Message the bot: `@awscloudcommander`
3. Run commands: `/ec2 list`

---

## Testing

### Backend Testing (curl)

```bash
# Health check
curl https://your-url/server/aws_handler

# EC2 List
curl -X POST https://your-url/server/aws_handler \
  -H "Content-Type: application/json" \
  -d '{"service": "ec2", "action": "list"}'

# S3 Buckets
curl -X POST https://your-url/server/aws_handler \
  -H "Content-Type: application/json" \
  -d '{"service": "s3", "action": "listBuckets"}'

# Cost Last Week
curl -X POST https://your-url/server/aws_handler \
  -H "Content-Type: application/json" \
  -d '{"service": "cost", "action": "byPeriod", "period": "week"}'

# AI Chat
curl -X POST https://your-url/server/aws_handler \
  -H "Content-Type: application/json" \
  -d '{"service": "bedrock", "action": "chat", "prompt": "What is EC2?"}'
```

### Test Results (Verified Working)

| Test | Status | Notes |
|------|--------|-------|
| Health Check | ✅ Pass | Returns healthy status |
| EC2 List | ✅ Pass | Found 2 instances |
| S3 List | ✅ Pass | Found 1 bucket |
| Cost Explorer | ✅ Pass | Returns cost breakdown |
| Bedrock AI | ⚠️ Pending | Needs form completion |

---

## Current Status

### ✅ Completed

1. **AWS Setup**
   - IAM user created (`cliq-cloudops`)
   - Permissions configured
   - Access keys generated

2. **Catalyst Backend**
   - Project structure created
   - All 10 service modules implemented
   - Express router configured
   - Environment variables set
   - Successfully deployed
   - API tested and working

3. **Cliq Extension (Partial)**
   - Database schema created
   - Bot created
   - Basic handlers implemented

### ⏳ In Progress

- Cliq command handlers
- Widget implementation
- Full end-to-end testing

### ❌ Not Started

- Scheduler for alerts
- Message actions
- Production hardening
- Documentation for end users

---

## Pending Work

### High Priority (Competition Must-Haves)

1. **Complete Cliq Commands**
   - [ ] /ec2 - full implementation
   - [ ] /s3 - full implementation
   - [ ] /cost - full implementation
   - [ ] /logs - full implementation
   - [ ] /ai - full implementation

2. **Dashboard Widget**
   - [x] Unified dashboard with all AWS services
   - [x] Beautiful dark theme UI
   - [x] Async loading with skeleton UI
   - [x] Cost donut chart
   - [x] Lambda activity chart

3. **Demo Script**
   - [ ] Prepare demo flow
   - [ ] Test all features
   - [ ] Record video

### Medium Priority (Nice-to-Haves)

1. **Scheduler**
   - [ ] Daily cost report
   - [ ] Alarm state alerts

2. **Message Actions**
   - [ ] Right-click to analyze
   - [ ] Share to channel

3. **Error Handling**
   - [ ] Better error messages
   - [ ] Retry logic

### Low Priority (Future)

1. **Multi-tenant**
   - [ ] Per-user AWS accounts
   - [ ] IAM Role assumption

2. **More AWS Services**
   - [ ] ECS/EKS
   - [ ] Route53
   - [ ] ElastiCache

---

## Troubleshooting

### Common Issues

#### 1. "res.status is not a function"

**Cause**: Wrong Catalyst function format
**Solution**: Use Express.js pattern, export `app` not handler

```javascript
// Wrong
module.exports = async (req, res) => { ... }

// Correct
const app = express();
module.exports = app;
```

#### 2. "Missing credentials in config"

**Cause**: Environment variables not set
**Solution**: Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Catalyst Console

#### 3. "Bedrock model access denied"

**Cause**: Need to request model access
**Solution**: 
1. Go to AWS Bedrock Console
2. Click "Model access"
3. Request access to Anthropic Claude models
4. Fill out use case form
5. Wait 15 minutes

#### 4. "Model access denied - Marketplace actions not authorized"

**Cause**: IAM user missing AWS Marketplace permissions for Bedrock
**Error Message**: `Model access is denied due to IAM user or service role is not authorized to perform the required AWS Marketplace actions`
**Solution**: 
1. Go to IAM → Users → cliq-cloudops
2. Add inline policy with these permissions:
```json
{
    "Effect": "Allow",
    "Action": [
        "aws-marketplace:ViewSubscriptions",
        "aws-marketplace:Subscribe",
        "aws-marketplace:Unsubscribe"
    ],
    "Resource": "*"
}
```
3. Wait 10 minutes for changes to propagate
4. Also ensure Bedrock model access is enabled in Bedrock Console

#### 5. "CORS error from Cliq"

**Cause**: Catalyst handles CORS automatically
**Solution**: Ensure using correct Catalyst URL format

#### 5. "Data Store table not found"

**Cause**: Table not created
**Solution**: Create `aws_config` table in Catalyst Data Store

---

## Contact & Resources

### Useful Links

- [Zoho Catalyst Docs](https://catalyst.zoho.com/help/)
- [Zoho Cliq API](https://www.zoho.com/cliq/help/platform/overview.html)
- [AWS SDK v3 Docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Cliqtrix Competition](https://www.zoho.com/cliq/cliqtrix.html)

### Project Repository

All code is in:
- Backend: `catalyst-aws-cloudops/`
- Frontend: Zoho Cliq Extension Builder

---

## Onboarding Flow (For Judges)

### Overview

AWS Cloud Commander requires initial setup before use. The onboarding flow guides judges/users through the configuration process with **3 flexible options** based on their preference.

### Why Onboarding?

Before the extension can work, the system needs:
1. **AWS Credentials** - To connect to AWS APIs
2. **Region Selection** - Which AWS region to use
3. **Feature Consent** - Agree to paid features (Cost Explorer, AI, Lambda invoke)

### Onboarding Gate

If a user tries to use any feature before completing onboarding:
- Bot messages → Show onboarding prompt
- `/aws` commands → Redirect to onboarding
- Widget → Show setup required message

### Three Options for Setup

#### Option 1: Self-Hosted (Full Control)

**For:** Technical judges who want to deploy their own backend

**Steps:**
1. Clone the Catalyst server from GitHub
2. Create a Zoho Catalyst project
3. Set environment variables:
   ```
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_DEFAULT_REGION=ap-south-1
   ```
4. Deploy to Catalyst
5. Update Cliq extension connection URL
6. Complete in-app setup (region, consent)

**Advantages:**
- Full control over data
- Can modify server code
- Use their own AWS account

**Requirements:**
- AWS account with proper IAM permissions
- Zoho Catalyst account
- Technical knowledge

---

#### Option 2: Bring Your Own AWS (BYOA)

**For:** Judges who have AWS but don't want to deploy a server

**Steps:**
1. Provide AWS Access Key and Secret Key in Cliq extension
2. We store credentials securely (encrypted in Catalyst Data Store)
3. Our deployed server uses their credentials
4. Complete in-app setup (region, consent)

**Advantages:**
- No server deployment needed
- Use their own AWS resources
- See real data from their account

**Requirements:**
- AWS account with IAM user
- IAM policy with required permissions (see below)

**Required IAM Policy:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:Describe*",
                "ec2:StartInstances",
                "ec2:StopInstances",
                "ec2:RebootInstances",
                "s3:ListAllMyBuckets",
                "s3:GetBucketLocation",
                "s3:ListBucket",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "lambda:ListFunctions",
                "lambda:GetFunction",
                "lambda:InvokeFunction",
                "rds:DescribeDBInstances",
                "rds:DescribeDBClusters",
                "cloudwatch:DescribeAlarms",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:PutMetricAlarm",
                "cloudwatch:DeleteAlarms",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
                "logs:GetLogEvents",
                "ce:GetCostAndUsage",
                "ce:GetCostForecast",
                "iam:ListUsers",
                "iam:ListRoles",
                "iam:GetAccountSummary",
                "sns:ListTopics",
                "sns:ListSubscriptionsByTopic",
                "sns:Publish"
            ],
            "Resource": "*"
        }
    ]
}
```

**For AI Features (Optional):**
```json
{
    "Effect": "Allow",
    "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
    ],
    "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
}
```

**Bedrock Setup:**
1. Go to AWS Console → Bedrock → Model Access
2. Enable access to Claude 3 Haiku (or preferred model)
3. Wait for access to be granted (~10 minutes)

---

#### Option 3: Use Our Demo Environment (Quickest)

**For:** Judges who want to test immediately without any setup

**Steps:**
1. Simply use the extension as-is
2. Data comes from our pre-configured AWS account
3. All features work out of the box
4. Complete in-app consent forms only

**Advantages:**
- Zero setup time
- See real AWS data immediately
- All features available
- Test AI, costs, everything

**Limitations:**
- Using shared demo AWS account
- Cannot see their own AWS resources
- Demo data may not reflect their use case

**Demo Account Includes:**
- 2 EC2 instances (1 running, 1 stopped)
- 3 S3 buckets with sample files
- 5 Lambda functions
- CloudWatch alarms configured
- RDS database instance
- Sample log groups
- AI (Bedrock) enabled

---

### Onboarding UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    WELCOME SCREEN                            │
│                                                              │
│  Welcome to AWS Cloud Commander!                            │
│  Let's set up your AWS integration.                         │
│                                                              │
│  Choose how you'd like to get started:                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Option 1: Self-Hosted                                   ││
│  │ Deploy your own backend server                          ││
│  │ [View Setup Guide]                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Option 2: Bring Your Own AWS                            ││
│  │ Provide AWS credentials                                 ││
│  │ [Enter Credentials]                                     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Option 3: Use Demo Environment                          ││
│  │ Try with our pre-configured AWS                         ││
│  │ [Start Demo] ← Recommended for quick testing           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### After Onboarding

Once setup is complete:
1. User can access all features
2. Dashboard widget shows real data
3. Commands work with their/demo AWS
4. Settings can be changed anytime

### Database Storage

Onboarding data stored in `awsprefs` table:
- `userid` - Cliq user ID
- `username` - Display name
- `region` - Selected AWS region
- `onboarded` - Boolean (true after setup)
- `setupOption` - 1, 2, or 3
- `consentcost` - Cost Explorer consent
- `consentai` - AI/Bedrock consent
- `consentlambda` - Lambda invoke consent

For Option 2 (BYOA), credentials stored separately in encrypted `awscredentials` table:
- `userid` - Cliq user ID
- `accessKey` - Encrypted AWS access key
- `secretKey` - Encrypted AWS secret key

---

### Implementation Status

| Component | Status |
|-----------|--------|
| Onboarding UI | TODO |
| Option 1 (Self-Hosted) | Docs ready, UI TODO |
| Option 2 (BYOA) | Backend support TODO |
| Option 3 (Demo) | Working (current default) |
| Onboarding gate in bot | TODO (placeholder in code) |
| Onboarding gate in commands | TODO |

---

## Bot Handlers

### Overview

The bot (`@awscloudcommander`) provides a conversational interface:

| Handler | Purpose |
|---------|---------|
| Welcome | First-time greeting and quick start |
| Message | Keyword detection and natural language routing |
| Participation | Channel add/remove events |
| Menu Action | Right-click message actions |

### Message Handler Keywords

| Keywords | Action |
|----------|--------|
| `hi`, `hello`, `hey` | Greeting + suggestions |
| `help`, `?` | Show all commands |
| `ec2`, `instance`, `server` | EC2 operations |
| `s3`, `bucket`, `storage` | S3 operations |
| `cost`, `spend`, `bill` | Cost reports |
| `lambda`, `function` | Lambda operations |
| `alarm`, `alert` | CloudWatch alarms |
| `log` | CloudWatch logs |
| `dashboard` | Open dashboard |
| `settings` | Open settings |

### Direct Instance Actions

Users can type:
- `start i-0123456789` → Start EC2 instance
- `stop i-0123456789` → Stop EC2 instance
- `reboot i-0123456789` → Reboot EC2 instance

See `cliq-extension/bot/README.md` for full details.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-27 | Initial implementation |
| 1.1.0 | 2025-11-30 | Unified dashboard widget, bot handlers, onboarding docs |

---

*This documentation was created for the Zoho Cliqtrix Competition 2025.*
*AWS Cloud Commander - Manage AWS from Zoho Cliq* 🚀
