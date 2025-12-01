# Read this first to understand the AWS Cloud Commander project

## TL;DR

Building a **Zoho Cliq extension** that lets users manage AWS from chat.
- Backend: Zoho Catalyst (Node.js/Express)
- Frontend: Zoho Cliq (Bot + Commands + Widgets)
- Competition: Zoho Cliqtrix 2025

## The Problem

DevOps teams constantly switch between Zoho Cliq (communication) and AWS Console (infrastructure). We want to eliminate that context switching.

## The Solution

A Cliq bot that can:
- `/ec2 list` - Show all EC2 instances
- `/ec2 start i-xxx` - Start an instance
- `/cost` - Show AWS spending
- `/logs search ERROR` - Find errors in logs
- Chat naturally: "How many servers are running?"

## Architecture

```
User → Zoho Cliq → Catalyst Function → AWS APIs
                         ↓
                    (Express.js)
                         ↓
              AWS SDK v3 (EC2, S3, Lambda, etc.)
```

## Key Technical Decisions

1. **Why Catalyst not Lambda?** - Competition judges prefer Zoho ecosystem
2. **Why AWS SDK v3?** - Modular imports, smaller bundle
3. **Why Express?** - Catalyst Advanced I/O requires it
4. **Why single IAM user?** - Simple for competition demo

## Current State

### ✅ DONE
- Backend fully implemented (all 10 AWS services)
- API tested and working
- Documentation complete

### 🔄 IN PROGRESS
- Cliq extension frontend
- Bot handlers
- Command handlers

### ❌ TODO
- Widgets
- Schedulers
- Full testing

## File Map

```
index.js        → Express router, handles all API requests
services/*.js   → One file per AWS service (ec2.js, s3.js, etc.)
utils/          → AWS client factories, helper functions
```

## API Pattern

Request:
```json
{ "service": "ec2", "action": "list", "region": "ap-south-1" }
```

Response:
```json
{ "success": true, "data": [...] }
```

Error Response (with helpful suggestions):
```json
{
  "success": false,
  "error": "AccessDeniedException...",
  "code": "ACCESS_DENIED",
  "suggestion": "Your IAM user doesn't have permission...",
  "helpAction": "{ \"service\": \"permissions\", \"action\": \"checkAll\" }"
}
```

## Key Features

1. **Permission Checker** - `{ "service": "permissions", "action": "checkAll" }` 
   - Validates all AWS permissions
   - Shows exactly what's missing
   - Generates required IAM policy

2. **Cost Awareness** - Paid actions require `"confirm": true`
   - Cost Explorer: $0.01/call
   - Bedrock: $0.01-0.15/query

3. **Smart Error Messages** - Tells user exactly how to fix permission issues

## How to Continue This Project

1. **To add new AWS service**: Create new file in services/, add routes in index.js
2. **To add Cliq command**: Create handler in Cliq Extension Builder
3. **To test**: Use curl against Catalyst URL
4. **To deploy**: Run `catalyst deploy`

## Important URLs

- Catalyst Function: `https://aws-cloudops-60xxxxxxxxxx.development.catalystappsail.com/server/aws_handler`
- Cliq Bot: @awscloudcommander

## Environment Variables Needed

- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY  
- AWS_REGION (ap-south-1)
- BEDROCK_REGION (us-east-1)
- BEDROCK_MODEL_ID (anthropic.claude-3-sonnet-20240229-v1:0)

## Common Gotchas

1. Catalyst exports Express `app`, not a handler function
2. Bedrock needs TWO things:
   - Model access form submitted in Bedrock Console
   - AWS Marketplace permissions in IAM (ViewSubscriptions, Subscribe)
3. Cost Explorer only works from us-east-1
4. IAM operations are global (no region)
5. Cost Explorer API costs $0.01 per call - we added confirmation system

## Functionalities

1. AI integration (Bedrock) - "Ask Claude about your AWS"
2. Real-time logs - View CloudWatch logs in Cliq
3. Cost alerts - Proactive spending notifications
4. Clean UX - Natural language + slash commands
5. Dashboard widget - At-a-glance AWS overview
