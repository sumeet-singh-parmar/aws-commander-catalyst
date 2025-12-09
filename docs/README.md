# AWS Cloud Commander 🚀

> Manage your entire AWS infrastructure from Zoho Cliq

**Built for Zoho Cliqtrix Competition 2025**

## Quick Start

### 1. Deploy Backend (Zoho Catalyst)

```bash
cd functions/aws_handler
npm install
cd ../..
catalyst deploy
```

### 2. Set Environment Variables

In Catalyst Console > Functions > aws_handler > Configuration:

| Variable | Value |
|----------|-------|
| `AWS_ACCESS_KEY_ID` | Your AWS key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret |
| `AWS_REGION` | `ap-south-1` |
| `BEDROCK_REGION` | `us-east-1` |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` |

### 3. Test API

```bash
curl https://your-catalyst-url/server/aws_handler
```

## Features

| Feature | Description |
|---------|-------------|
| 🖥️ EC2 | List, start, stop, reboot instances |
| 📦 S3 | Browse buckets, download files |
| ⚡ Lambda | List functions, invoke them |
| 📊 CloudWatch | View alarms, metrics |
| 📋 Logs | Search logs, find errors |
| 💰 Cost | Track spending, forecasts |
| 🗄️ RDS | Manage databases |
| 🔔 SNS | Send notifications |
| 🔐 IAM | Security audit |
| 🤖 AI | Chat with Claude |

## API Example

```bash
curl -X POST https://your-url/server/aws_handler \
  -H "Content-Type: application/json" \
  -d '{
    "service": "ec2",
    "action": "list",
    "region": "ap-south-1"
  }'
```

## Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for complete details.

## Project Structure

```
├── functions/aws_handler/
│   ├── index.js           # Main router
│   ├── services/          # AWS services
│   │   ├── ec2.js
│   │   ├── s3.js
│   │   ├── lambda.js
│   │   ├── cloudwatch.js
│   │   ├── logs.js
│   │   ├── cost.js
│   │   ├── rds.js
│   │   ├── sns.js
│   │   ├── iam.js
│   │   └── bedrock.js
│   └── utils/
│       ├── aws-clients.js
│       └── helpers.js
└── catalyst-config.json
```

## Tech Stack

- **Backend**: Zoho Catalyst (Node.js + Express)
- **Frontend**: Zoho Cliq Extension
- **Cloud**: AWS (EC2, S3, Lambda, CloudWatch, etc.)
- **AI**: Amazon Bedrock (Claude 3 Sonnet)

---

Made with ❤️ for Cliqtrix 2025
