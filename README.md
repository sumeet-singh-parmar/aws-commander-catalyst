# AWS Cloud Commander - Backend Server

Backend server for **AWS Cloud Commander** - a Zoho Cliq extension that lets you manage your entire AWS infrastructure right from your chat window.

> **Want to set up your own server?** Head over to [SETUP_GUIDE.md](./SETUP_GUIDE.md) for the complete walkthrough.

---

## What's This All About?

This is the backend server that powers AWS Cloud Commander. When you type `/aws ec2` in Zoho Cliq, this server talks to AWS, fetches your instances, and sends the data back formatted as Cliq cards.

The frontend (Cliq extension) handles the UI and user interactions, while this backend does all the heavy lifting - authenticating with AWS, making API calls, processing responses, and formatting data.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           ZOHO CLIQ                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Cliq Extension                             │  │
│  │   /aws commands ──► ExecutionHandler.ds ──► handleButton.ds   │  │
│  └─────────────────────────────┬─────────────────────────────────┘  │
│                                │                                     │
│                    Zoho OAuth 2.0 Connection                        │
└────────────────────────────────┼────────────────────────────────────┘
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ZOHO CATALYST                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              Advanced I/O Function (Node.js)                   │  │
│  │                                                                │  │
│  │   Express.js Server (index.js)                                │  │
│  │      │                                                        │  │
│  │      ├── POST /          (Main API - all AWS operations)      │  │
│  │      ├── POST /upload    (S3 file uploads)                    │  │
│  │      ├── GET /widget/*   (Dashboard widget routes)             │  │
│  │      │                                                        │  │
│  │      ▼                                                        │  │
│  │   Service Layer (services/*.js)                               │  │
│  │      ├── ec2.js      - EC2 instance management                │  │
│  │      ├── s3.js       - S3 bucket & object operations          │  │
│  │      ├── lambda.js   - Lambda function management             │  │
│  │      ├── rds.js      - RDS database management                │  │
│  │      ├── cloudwatch.js - Alarms & metrics                     │  │
│  │      ├── logs.js     - CloudWatch Logs                        │  │
│  │      ├── sns.js      - Notifications                          │  │
│  │      ├── cost.js     - Cost Explorer                          │  │
│  │      ├── iam.js      - IAM users & roles                      │  │
│  │      └── bedrock.js  - AI assistant (Claude)                  │  │
│  │      │                                                        │  │
│  │      ▼                                                        │  │
│  │   AWS Client Factory (utils/aws-clients.js)                   │  │
│  │      - Creates authenticated AWS SDK clients                   │  │
│  │      - Manages credentials from env variables                  │  │
│  │      - Handles region configuration                            │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────┘
                                │ AWS SDK v3
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AMAZON WEB SERVICES                             │
│                                                                      │
│   EC2    S3    Lambda    RDS    CloudWatch    SNS    Logs    IAM   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Features

### EC2 - Virtual Servers
- List instances (`/aws ec2`)
- Instance details (click on instance)
- Start/Stop/Reboot/Terminate instances
- Security groups and VPCs
- Instance metrics

### S3 - File Storage
- List buckets (`/aws s3`)
- Browse bucket contents
- Upload files (up to 50MB)
- Download files (presigned URLs)
- Search objects
- Create/Delete buckets
- Folder management

### Lambda - Serverless Functions
- List functions (`/aws lambda`)
- Function details
- Invoke functions (with consent)
- View metrics
- Function URLs

### RDS - Databases
- List databases (`/aws rds`)
- Database details
- Start/Stop/Reboot databases
- Aurora cluster support

### CloudWatch - Monitoring
- List alarms (`/aws alarms`)
- Alarm details
- Enable/Disable alarms
- Delete alarms
- View metrics

### CloudWatch Logs
- List log groups (`/aws logs`)
- View log streams
- Search logs

### SNS - Notifications
- List topics (`/aws sns topics`)
- List subscriptions (`/aws sns subs`)
- Publish messages (with consent)

### Cost Explorer
- Today's spend (`/aws cost today`)
- Monthly spending (`/aws cost month`)
- Service breakdown (`/aws cost services`)
- Forecasts (`/aws cost forecast`)

### IAM - Identity Management
- Current user (`/aws iam`)
- List users (`/aws iam users`)
- List roles (`/aws iam roles`)
- Account summary (`/aws iam summary`)
- Permission checking (`/aws status`)

### AI Assistant (Bedrock)
- Ask questions (`/aws ask <question>`)
- Get recommendations

---

## API Endpoints

### Main API Endpoint

```
POST /
Content-Type: application/json

{
    "service": "ec2",           // Which AWS service
    "action": "list",           // What to do
    "region": "ap-south-1",     // Currently uses env AWS_REGION
    "userId": "123456",         // Cliq user ID
    "userName": "John Doe",      // For logging
    "userEmail": "john@co.com",  // For logging
    "consent": true,            // If feature needs consent
    "confirm": true,            // If action is destructive
    // ... action-specific params
}
```

### Response Format

**Success:**
```json
{
    "success": true,
    "data": {
        // Service-specific data
    },
    "message": "Optional success message"
}
```

**Error:**
```json
{
    "success": false,
    "error": "What went wrong",
    "code": "ERROR_CODE"
}
```

**Needs Consent:**
```json
{
    "success": false,
    "requiresConsent": true,
    "category": {
        "name": "Cost Explorer",
        "description": "Why we need consent"
    }
}
```

### Widget Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /widget/dashboard` | GET | Returns dashboard HTML |
| `GET /widget/dashboard.js` | GET | Dashboard JavaScript |
| `GET /widget/dashboard.css` | GET | Dashboard styles |
| `GET /widget/dashboard/data` | GET | Dashboard JSON data |
| `GET /widget/ec2` | GET/POST | EC2 widget actions |
| `GET /widget/ec2/metrics` | GET | EC2 metrics |
| `GET /widget/s3/browse` | GET | Browse S3 bucket |
| `POST /widget/s3/upload` | POST | Upload file to S3 |
| `POST /widget/s3/delete` | POST | Delete S3 object |
| `GET /widget/s3/download` | GET | Get download URL |
| `GET /widget/s3/search` | GET | Search S3 objects |
| `POST /widget/s3/create` | POST | Create S3 bucket |
| `POST /widget/s3/delete-bucket` | POST | Delete S3 bucket |
| `POST /widget/lambda` | POST | Lambda widget actions |

### File Upload Endpoint

```
POST /upload
Content-Type: multipart/form-data

files: [File1, File2, ...]
bucket: "my-bucket"
prefix: "folder/" (optional)
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_REGION` | Primary AWS region | `ap-south-1` |
| `AWS_ACCESS_KEY_ID` | IAM user access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | `wJalrXUtnFEMI/K7MDENG...` |
| `BEDROCK_REGION` | Region for AI (keep as us-east-1) | `us-east-1` |
| `BEDROCK_MODEL_ID` | Claude model ID | `anthropic.claude-3-sonnet-20240229-v1:0` |

---

## File Structure

```
server/functions/aws_handler/
│
├── index.js                    # Main Express server
├── package.json                # Dependencies
├── README.md                   # This file
├── SETUP_GUIDE.md             # Setup instructions
│
├── services/                   # AWS service modules
│   ├── ec2.js                 # EC2 operations
│   ├── s3.js                  # S3 operations
│   ├── lambda.js              # Lambda functions
│   ├── rds.js                 # RDS databases
│   ├── cloudwatch.js          # Alarms and metrics
│   ├── logs.js                # CloudWatch Logs
│   ├── sns.js                 # SNS topics
│   ├── cost.js                # Cost Explorer
│   ├── iam.js                 # IAM users/roles
│   └── bedrock.js             # AI assistant
│
├── controllers/widget/         # Widget controllers
│   ├── dashboard.js           # Dashboard widget
│   ├── ec2.js                 # EC2 widget
│   ├── s3.js                  # S3 widget
│   └── lambda.js              # Lambda widget
│
├── utils/
│   ├── aws-clients.js         # AWS SDK client factory
│   ├── helpers.js             # Response formatting
│   ├── pricing.js             # Cost warnings
│   └── permissions.js         # IAM permission checks
│
└── widget_pages/              # Frontend assets
    ├── dashboard_loader.html  # Dashboard HTML
    ├── dashboard.js           # Dashboard JavaScript
    ├── dashboard.css          # Dashboard styles
    └── custom-modal-styles.css # Modal styles
```

---

## Security

1. **Credentials Never Leave the Server**
   - AWS access keys are environment variables on Catalyst
   - Never sent to frontend, never logged, never exposed

2. **OAuth 2.0 for All Requests**
   - Every request from Cliq to Catalyst goes through Zoho's OAuth system
   - Random internet requests can't hit the API

3. **Consent for Risky Operations**
   - Cost Explorer, AI Assistant, Lambda Invoke, SNS Publish require consent
   - Consent is managed in Cliq's `awsprefs` database

4. **Confirmation for Destructive Actions**
   - Terminating instances, deleting buckets require confirmation
   - Backend checks `confirm: true` flag

5. **Input Validation**
   - All inputs validated before AWS calls
   - No SQL injection, command injection, or other attacks

---

## Region Handling

Currently, the backend uses a single region configured via the `AWS_REGION` environment variable. The region parameter sent from the frontend is accepted but not used - all operations use the configured region.

This simplifies setup and avoids confusion. Multi-region support is planned for a future version.

---

## Built With

- **Node.js** - Runtime
- **Express.js** - Web framework
- **AWS SDK v3** - Modular AWS SDK
- **Multer** - File upload handling
- **Zoho Catalyst** - Serverless hosting

---

## Quick Start

1. **Deploy to Catalyst**
   ```bash
   cd server/functions/aws_handler
   npm install
   catalyst deploy
   ```

2. **Set Environment Variables**
   - In Catalyst Console > Functions > aws_handler > Configuration
   - Add all required environment variables

3. **Test**
   ```bash
   curl https://your-function-url/server/aws_handler/
   ```

For detailed setup instructions, see [SETUP_GUIDE.md](./SETUP_GUIDE.md).

---

## Documentation

- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Complete setup walkthrough
- [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md) - Detailed API documentation
- [docs/AWS_SETUP_GUIDE.md](./docs/AWS_SETUP_GUIDE.md) - AWS account setup
- [docs/AWS_SETUP_CHECKLIST.md](./docs/AWS_SETUP_CHECKLIST.md) - Setup checklist

---

## Questions? Issues?

- **GitHub**: Check the repository for issues and updates
- **Competition**: Built for Zoho Cliqtrix 2025

---

## Author

**Nisha Kumari** - Built for the Zoho Cliqtrix 2025 Competition

---

*Built with lots of coffee and the occasional moment of "why isn't this working" followed by "oh, I forgot a comma"*
