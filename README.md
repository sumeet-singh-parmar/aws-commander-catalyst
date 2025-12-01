# AWS Cloud Commander - Backend Server

Hey there! Welcome to the backend server for **AWS Cloud Commander** - a Zoho Cliq extension that lets you manage your entire AWS infrastructure right from your chat window. Pretty cool, right?

> **Want to set up your own server?** Head over to [SETUP_GUIDE.md](./SETUP_GUIDE.md) for the complete walkthrough.

---

## What's This All About?

So basically, this is the brain behind AWS Cloud Commander. When you type `/aws ec2` in Zoho Cliq, this server is what actually talks to AWS, fetches your instances, and sends the data back to you in a nice card format.

The frontend (Cliq extension) handles the UI and user interactions, while this backend does all the heavy lifting - authenticating with AWS, making API calls, processing responses, and more.

---

## About Version 1.0 (Current)

Alright, let me be upfront about something. This is **Version 1**, built specifically for the **Zoho Cliqtrix 2025 Competition**. To keep the demo smooth and hassle-free, we made some intentional decisions:

### What We Did for v1 (And Why)

1. **Hardcoded Region to Mumbai (`ap-south-1`)**

   Yeah, we know - ideally you'd want to pick your own region. But here's the thing: for a demo, having a single region just works better. No confusion, no "oops wrong region" moments. The region selector in the frontend? It's there, it works, but the backend currently ignores it and uses Mumbai for everything.

2. **Demo AWS Account by Default**

   When you install the extension, it connects to our shared demo AWS account. We've set up some sample EC2 instances, S3 buckets, Lambda functions - basically enough stuff for you to play around and see how everything works.

3. **Single Set of Credentials**

   Right now, the backend uses one set of AWS credentials stored in environment variables. Multi-tenant support (where each user brings their own credentials) is planned for v2.

### What's Already Built for v2

Here's the exciting part - the frontend is already prepared for the future:

- **Custom Server URL**: There's a field in `/aws settings` where users can enter their own backend URL
- **Region Selection**: The dropdown works, it saves to the database, we just need to wire it up in the backend
- **Credentials Input**: The UI placeholders are there for users to enter their own AWS keys

So when v2 drops, it'll be a backend update - the frontend is ready to go!

---

## Three Ways to Use This

Let me explain the three deployment options we're offering:

### Option 1: Just Use the Demo (Easiest)

**Who's this for?** Competition judges, people who just want to try it out, anyone who wants to see it working in 30 seconds.

**How it works:** Install the extension, and boom - you're connected to our demo AWS account. You'll see our sample resources, play around with the features, get a feel for how everything works.

**The catch:** It's a shared account, so you're seeing demo data, not your real infrastructure.

### Option 2: Deploy Your Own Server (Recommended for Real Use)

**Who's this for?** Organizations that want to actually use this with their AWS infrastructure. Anyone who cares about security and privacy.

**How it works:**
1. You set up your own AWS account with the right permissions
2. You deploy this server code to Zoho Catalyst (or AWS Lambda if you prefer)
3. You configure the extension to talk to YOUR server

**The benefits:**
- Your credentials stay on YOUR server
- Your data never touches our systems
- Full control over everything
- You can customize it if you want

**Setup:** Follow the [SETUP_GUIDE.md](./SETUP_GUIDE.md) - it's pretty detailed.

### Option 3: Bring Your Own Credentials (Coming in v2)

**Who's this for?** People who don't want to deal with deploying a server but still want to use their own AWS account.

**How it will work:** You'll enter your AWS Access Key and Secret Key in `/aws settings`. The extension will pass these to the backend (our server or yours), and we'll use YOUR credentials for YOUR requests.

**Status:** The frontend input fields are already there. Backend support coming in v2.

---

## How Everything Fits Together

Let me walk you through the architecture. I'll try to make this as clear as possible.

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           ZOHO CLIQ                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Cliq Extension                             │  │
│  │                                                                │  │
│  │   /aws commands ──► ExecutionHandler.ds ──► handleButton.ds   │  │
│  │                                                                │  │
│  │   Bot messages, Welcome handler, Dashboard widget              │  │
│  │                                                                │  │
│  └─────────────────────────────┬─────────────────────────────────┘  │
│                                │                                     │
│                    Zoho OAuth 2.0 Connection                        │
│                    (invokeurl with connection)                       │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
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
│  │      ├── GET /widget/*   (Dashboard widget)                   │  │
│  │      │                                                        │  │
│  │      ▼                                                        │  │
│  │   Service Layer (services/*.js)                               │  │
│  │      │                                                        │  │
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
│  │                                                                │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
                                │ AWS SDK v3
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AMAZON WEB SERVICES                             │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                 Region: ap-south-1 (Mumbai)                  │   │
│   │                                                              │   │
│   │   EC2    S3    Lambda    RDS    CloudWatch    SNS    Logs   │   │
│   │                                                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                 Region: us-east-1 (Virginia)                 │   │
│   │                                                              │   │
│   │   Cost Explorer (global)    Bedrock AI (Claude)    IAM*     │   │
│   │                                                              │   │
│   │   *IAM is a global service, but API endpoint is us-east-1   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Let Me Explain the Flow

When you type `/aws ec2` in Cliq, here's what happens step by step:

```
Step 1: You type "/aws ec2" in Zoho Cliq
         │
         ▼
Step 2: ExecutionHandler.ds (Deluge script) catches the command
        - Parses what you typed
        - Figures out you want to see EC2 instances
        - Calls the handleButton function
         │
         ▼
Step 3: handleButton.ds builds the API request
        - Creates the JSON payload: { service: "ec2", action: "list" }
        - Uses Zoho OAuth 2.0 connector to make the call
        - The connection handles authentication automatically
         │
         ▼
Step 4: Request hits our Catalyst server (index.js)
        - Express receives the POST request
        - Extracts service="ec2" and action="list"
        - Routes to the EC2 service module
         │
         ▼
Step 5: ec2.js does the actual work
        - Gets an EC2Client from aws-clients.js
        - Calls AWS DescribeInstances API
        - Processes the response
        - Formats it nicely
         │
         ▼
Step 6: Response flows back
        - Catalyst → Cliq
        - handleButton receives the data
        - Formats it as a Cliq card with buttons
        - You see your EC2 instances!
```

### About the OAuth 2.0 Authentication

This part confused me at first too, so let me clarify:

The **Zoho OAuth 2.0 connector** authenticates the **Cliq extension** talking to the **Catalyst server**. It makes sure only authorized requests from your Cliq organization can access the backend.

The **AWS credentials** (Access Key + Secret Key) are stored as **environment variables** in Catalyst. They're used by the backend to talk to AWS. These credentials NEVER go through Zoho's OAuth flow - they stay on the server.

So it's two separate auth mechanisms:
1. Cliq → Catalyst: Zoho OAuth 2.0
2. Catalyst → AWS: IAM credentials

```
┌──────────┐         OAuth 2.0          ┌───────────┐        IAM Keys         ┌─────────┐
│  Cliq    │ ◄─────────────────────────► │  Catalyst │ ◄──────────────────────► │   AWS   │
│Extension │   (Zoho handles this)      │  Server   │   (env variables)       │Services │
└──────────┘                            └───────────┘                          └─────────┘
```

---

## Everything This Thing Can Do

Let me list out all the features. This is pretty comprehensive:

### EC2 - Virtual Servers

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| See all instances | `/aws ec2` | Lists all your EC2 instances with their status, type, IP addresses |
| Get instance details | Click on an instance | Shows full details - security groups, volumes, launch time, etc. |
| Start an instance | Click "Start" button | Boots up a stopped instance |
| Stop an instance | Click "Stop" button | Shuts down a running instance (keeps data) |
| Reboot an instance | Click "Reboot" button | Restarts the instance |
| Terminate an instance | Click "Terminate" + confirm | Permanently deletes the instance (careful!) |
| Quick overview | `/aws ec2 summary` | Shows counts - how many running, stopped, etc. |

### S3 - File Storage

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| List buckets | `/aws s3` | Shows all your S3 buckets |
| Browse files | Click on a bucket | Lists objects/files in that bucket |
| Navigate folders | Click folder names | Dive into subfolders |
| Download files | Click "Download" | Generates a secure download link |
| Upload files | Click "Upload" | Opens file picker (up to 50MB) |
| Delete files | Click "Delete" | Removes the file (with confirmation) |
| Search files | `/aws s3 search <term>` | Finds files matching your search |
| Create bucket | `/aws s3 create <name>` | Creates a new bucket |
| Delete bucket | Delete button | Removes empty bucket |

### Lambda - Serverless Functions

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| List functions | `/aws lambda` | Shows all Lambda functions with runtime, size |
| Function details | Click on a function | Full config - timeout, memory, triggers, etc. |
| Invoke function | Click "Invoke" (needs consent) | Actually runs the function |
| View metrics | Click "Metrics" | Shows invocations, errors, duration |
| Get public URL | Click "Get URL" | Shows Function URL if configured |

### RDS - Databases

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| List databases | `/aws rds` | Shows all RDS instances with engine, status |
| Database details | Click on a database | Full details - endpoint, storage, backups |
| Start database | Click "Start" | Starts a stopped database |
| Stop database | Click "Stop" | Stops a running database (saves money!) |
| Reboot database | Click "Reboot" | Restarts the database |

### CloudWatch - Monitoring & Alarms

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| List alarms | `/aws alarms` | Shows all CloudWatch alarms with state |
| Alarm details | Click on an alarm | Full configuration, thresholds, actions |
| View history | Click "History" | See when alarm changed states |
| Enable/disable | Toggle button | Turn alarm actions on/off |
| Delete alarm | Click "Delete" | Removes the alarm |
| Get metrics | `/aws metrics ec2 <id>` | Shows CPU, network, disk metrics |

### CloudWatch Logs

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| List log groups | `/aws logs` | Shows all log groups |
| View streams | Click on a group | Lists log streams |
| Read logs | Click on a stream | Shows actual log entries |
| Search logs | Filter pattern | Find specific entries |
| Lambda logs | `/aws logs lambda <name>` | Quick access to function logs |

### SNS - Notifications

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| List topics | `/aws sns` | Shows all SNS topics |
| Topic details | Click on a topic | Shows subscriptions, ARN |
| Publish message | Click "Publish" (needs consent) | Sends a message to all subscribers |
| View subscriptions | Click "Subscriptions" | Lists who's subscribed |

### Cost Explorer - Spending

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| Today's spend | `/aws cost today` | Shows what you've spent today |
| This month | `/aws cost month` | Current month spending |
| By service | `/aws cost services` | Breakdown by EC2, S3, etc. |
| Forecast | `/aws cost forecast` | Predicted end-of-month spend |
| Daily trend | In dashboard | Visual spending chart |

### IAM - Identity Management

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| Current user | `/aws iam` | Shows your IAM user details |
| List users | `/aws iam users` | All IAM users in account |
| List roles | `/aws iam roles` | All IAM roles |
| Account summary | `/aws iam summary` | Stats about your IAM setup |

### AI Assistant (Bedrock)

| What You Can Do | How | What Happens |
|-----------------|-----|--------------|
| Ask questions | `/aws ask <question>` | Natural language queries about AWS |
| Get recommendations | `/aws recommend` | AI-powered suggestions |

---

## The Consent System - Why Some Features Need Permission

Some features can cost money or have real-world effects, so we built a consent system. Here's what requires consent and why:

| Feature Category | Why We Ask |
|------------------|------------|
| **Cost Explorer** | Shows your financial data - spending, forecasts. Some organizations consider this sensitive. |
| **AI Assistant** | Uses Amazon Bedrock which charges per request. We don't want surprise bills. |
| **Lambda Invoke** | Actually RUNS code. This could trigger workflows, cost money, or change things. |
| **SNS Publish** | Sends real messages to real people/systems. Don't want accidental notifications. |

### How It Works

1. First time you try a consent-required feature, you'll get a message explaining what it does
2. You go to `/aws settings` or `/aws consent` to enable it
3. Your consent is saved in Zoho's Data Store (per user)
4. Now you can use the feature

You can revoke consent anytime. It's all per-user, so your settings don't affect teammates.

---

## API Details (For Developers)

If you're integrating or building on top of this, here's the API:

### Main Endpoint

```
POST /
Content-Type: application/json

{
    "service": "ec2",           // Which AWS service
    "action": "list",           // What to do
    "region": "ap-south-1",     // Ignored in v1, but send it anyway
    "userId": "123456",         // Cliq user ID
    "userName": "John Doe",     // For logging
    "userEmail": "john@co.com", // For logging
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
        // Whatever the action returns
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

| Endpoint | What It Does |
|----------|--------------|
| `GET /widget/dashboard` | Returns the dashboard HTML (with loading spinner) |
| `GET /widget/dashboard/data` | Returns JSON data for the dashboard |
| `GET /widget/styles.css` | CSS styles for widgets |
| `POST /upload` | Handles multipart file uploads to S3 |

---

## Environment Variables

The server needs these environment variables to work:

| Variable | What It Is | Example |
|----------|-----------|---------|
| `AWS_REGION` | Your primary AWS region | `ap-south-1` |
| `AWS_ACCESS_KEY_ID` | Your IAM user's access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | Your IAM user's secret key | `wJalrXUtnFEMI/K7MDENG...` |
| `BEDROCK_REGION` | Region for AI (keep as us-east-1) | `us-east-1` |
| `BEDROCK_MODEL_ID` | Which Claude model to use | `anthropic.claude-3-sonnet-20240229-v1:0` |

---

## File Structure

Here's what's in this folder:

```
server/
│
├── index.js                    # The main server - Express app, routing, endpoints
├── package.json                # Dependencies (express, aws-sdk, multer, etc.)
├── README.md                   # You're reading it!
├── SETUP_GUIDE.md             # Step-by-step setup instructions
│
├── services/                   # One file per AWS service
│   ├── ec2.js                 # EC2 operations
│   ├── s3.js                  # S3 operations (this one's big!)
│   ├── lambda.js              # Lambda function management
│   ├── rds.js                 # RDS database operations
│   ├── cloudwatch.js          # Alarms and metrics
│   ├── logs.js                # CloudWatch Logs
│   ├── sns.js                 # SNS topics and messages
│   ├── cost.js                # Cost Explorer queries
│   ├── iam.js                 # IAM user/role info
│   └── bedrock.js             # AI assistant using Claude
│
├── utils/
│   └── aws-clients.js         # Factory that creates AWS SDK clients
│
└── widget_pages/
    ├── dashboard_loader.html  # Dashboard HTML with loading animation
    └── styles.css             # Styles for the dashboard widget
```

---

## Security - How We Keep Things Safe

1. **Credentials Never Leave the Server**

   Your AWS access keys are environment variables on Catalyst. They're never sent to the frontend, never logged, never exposed.

2. **OAuth 2.0 for All Requests**

   Every request from Cliq to Catalyst goes through Zoho's OAuth system. Random internet requests can't hit our API.

3. **Consent for Risky Operations**

   Things that cost money or have side effects require explicit user consent.

4. **Confirmation for Destructive Actions**

   Terminating an EC2 instance? Deleting a bucket? You'll need to confirm. We send a `confirm: true` flag only after user clicks "Yes, I'm sure."

5. **Input Validation**

   We validate inputs before making AWS calls. No SQL injection, no command injection, no funny business.

6. **No Hardcoded Secrets**

   Look through the code - you won't find a single access key. Everything's in env variables.

---

## What's Coming in v2

We've got plans! Here's what's on the roadmap:

- **Multi-Region Support**: Actually use the region selector, let users switch regions
- **User Credentials**: Let users enter their own AWS keys through the UI
- **Custom Backend URLs**: Point the extension at your own server easily
- **Better AI**: More context-aware suggestions, cost optimization tips
- **Team Features**: Share configurations, see who did what
- **More Services**: DynamoDB, ECS, Route53, and more

---

## Built With

- **Node.js** - Runtime
- **Express.js** - Web framework
- **AWS SDK v3** - The new modular AWS SDK (so we only import what we need)
- **Multer** - File upload handling
- **Zoho Catalyst** - Serverless hosting

---

## Questions? Issues?

- **GitHub**: [github.com/sumeet-singh-parmar/aws-commander-catalyst](https://github.com/sumeet-singh-parmar/aws-commander-catalyst)
- **Competition**: This was built for Zoho Cliqtrix 2025

---

---

## Author

**Nisha Kumari** - Built with passion for the Zoho Cliqtrix 2025 Competition

---

*Built with lots of coffee and the occasional moment of "why isn't this working" followed by "oh, I forgot a comma"*
