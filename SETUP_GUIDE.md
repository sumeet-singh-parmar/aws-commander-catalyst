# Setting Up Your Own AWS Cloud Commander Server

Alright, so you want to deploy your own backend server? Great choice! This guide will walk you through everything step by step. Don't worry - it looks long, but most of it is just copy-paste.

By the end of this, you'll have your own private AWS Cloud Commander backend running on Zoho Catalyst, talking to YOUR AWS account.

---

## Before We Start

Let's make sure you have everything you need:

- [ ] **An AWS Account** - Free tier works fine for testing
- [ ] **A Zoho Account** - With access to Zoho Catalyst (it's free to start)
- [ ] **About 30-45 minutes** - First time takes a bit, but it's straightforward

Optional but helpful:

- [ ] Node.js installed locally (if you want to test before deploying)
- [ ] Git installed (to clone the repo, or you can just download the ZIP)

---

## Quick Overview

Here's what we're going to do:

1. **Set up AWS** - Create an IAM user with the right permissions
2. **Enable Bedrock** - So the AI assistant works
3. **Deploy to Catalyst** - Get the server running
4. **Connect it all** - Point the extension to your server

Let's go!

---

## Step 1: Setting Up Your AWS Account

### 1.1 Log into AWS

Head over to [console.aws.amazon.com](https://console.aws.amazon.com/) and sign in.

Once you're in, make sure you're in the right region. For this guide, we'll use **Mumbai (ap-south-1)**, but you can use any region you prefer.

### 1.2 Create an IAM Policy

First, we need to create a policy that defines what the extension can do. This is important - if you skip permissions here, those features won't work in the extension.

1. Go to **IAM** (search for it in the top bar)
2. Click **Policies** in the left sidebar
3. Click **Create policy**
4. Click the **JSON** tab
5. Delete whatever's there and paste this entire policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EC2Access",
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
                "ec2:StartInstances",
                "ec2:StopInstances",
                "ec2:RebootInstances",
                "ec2:TerminateInstances",
                "ec2:GetConsoleOutput",
                "ec2:DescribeVolumes",
                "ec2:CreateSnapshot",
                "ec2:CreateImage",
                "ec2:CreateTags",
                "ec2:DescribeSnapshots",
                "ec2:DescribeImages",
                "ec2:AllocateAddress",
                "ec2:AssociateAddress",
                "ec2:DisassociateAddress",
                "ec2:DescribeAddresses",
                "ec2:ReleaseAddress",
                "ec2:ModifyInstanceAttribute",
                "ec2:DescribeInstanceTypes",
                "ec2:DescribeVpcs",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups",
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:AuthorizeSecurityGroupEgress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupEgress"
            ],
            "Resource": "*"
        },
        {
            "Sid": "CostExplorerBasic",
            "Effect": "Allow",
            "Action": [
                "ce:GetCostAndUsage",
                "ce:GetCostForecast"
            ],
            "Resource": "*"
        },
        {
            "Sid": "S3Access",
            "Effect": "Allow",
            "Action": [
                "s3:ListAllMyBuckets",
                "s3:ListBucket",
                "s3:GetBucketLocation",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:CreateBucket",
                "s3:DeleteBucket"
            ],
            "Resource": "*"
        },
        {
            "Sid": "LambdaAccess",
            "Effect": "Allow",
            "Action": [
                "lambda:ListFunctions",
                "lambda:GetFunction",
                "lambda:InvokeFunction",
                "lambda:UpdateFunctionCode",
                "lambda:UpdateFunctionConfiguration",
                "lambda:GetFunctionConfiguration",
                "logs:FilterLogEvents",
                "logs:GetLogEvents"
            ],
            "Resource": "*"
        },
        {
            "Sid": "RDSAccess",
            "Effect": "Allow",
            "Action": [
                "rds:DescribeDBInstances",
                "rds:DescribeDBClusters",
                "rds:DescribeDBSnapshots",
                "rds:StartDBInstance",
                "rds:StopDBInstance",
                "rds:RebootDBInstance"
            ],
            "Resource": "*"
        },
        {
            "Sid": "CloudWatchAccess",
            "Effect": "Allow",
            "Action": [
                "cloudwatch:DescribeAlarms",
                "cloudwatch:DescribeAlarmHistory",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics",
                "cloudwatch:PutMetricAlarm",
                "cloudwatch:DeleteAlarms",
                "cloudwatch:SetAlarmState",
                "logs:DescribeLogStreams",
                "logs:DescribeLogGroups",
                "logs:GetLogEvents",
                "logs:FilterLogEvents"
            ],
            "Resource": "*"
        },
        {
            "Sid": "SNSAccess",
            "Effect": "Allow",
            "Action": [
                "sns:ListTopics",
                "sns:ListSubscriptions",
                "sns:ListSubscriptionsByTopic",
                "sns:GetTopicAttributes",
                "sns:Publish"
            ],
            "Resource": "*"
        },
        {
            "Sid": "BedrockAccess",
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream"
            ],
            "Resource": "*"
        },
        {
            "Sid": "MarketplaceForBedrock",
            "Effect": "Allow",
            "Action": [
                "aws-marketplace:ViewSubscriptions",
                "aws-marketplace:Subscribe",
                "aws-marketplace:Unsubscribe"
            ],
            "Resource": "*"
        },
        {
            "Sid": "IAMReadAccess",
            "Effect": "Allow",
            "Action": [
                "iam:ListUsers",
                "iam:ListRoles",
                "iam:GetUser",
                "iam:GetAccountSummary",
                "iam:ListPolicies"
            ],
            "Resource": "*"
        }
    ]
}
```

6. Click **Next**
7. Give it a name: `AWSCloudCommanderPolicy`
8. Add a description if you want: "Permissions for AWS Cloud Commander Zoho Cliq extension"
9. Click **Create policy**

### What Happens If You Skip Permissions?

Good question! Here's a quick reference:

| If you remove... | This won't work in the extension |
|------------------|----------------------------------|
| EC2 permissions | Can't see or manage EC2 instances |
| S3 permissions | Can't browse buckets or upload files |
| Lambda permissions | Can't see or invoke Lambda functions |
| RDS permissions | Can't see or manage databases |
| CloudWatch permissions | No alarms or metrics |
| Logs permissions | Can't view CloudWatch logs |
| SNS permissions | Can't see topics or send notifications |
| Cost Explorer permissions | No cost reports or forecasts |
| IAM permissions | Can't see IAM users/roles |
| Bedrock permissions | AI assistant won't work |

So basically, include everything unless you specifically don't want a feature.

### 1.3 Create an IAM User

Now let's create a user that will use this policy:

1. Still in IAM, click **Users** in the left sidebar
2. Click **Create user**
3. Username: `aws-cloud-commander` (or whatever you like)
4. Click **Next**
5. Select **Attach policies directly**
6. Search for `AWSCloudCommanderPolicy` (the one you just created)
7. Check the box next to it
8. Click **Next**
9. Click **Create user**

### 1.4 Generate Access Keys

This is the important part - getting the credentials:

1. Click on the user you just created
2. Go to the **Security credentials** tab
3. Scroll down to **Access keys**
4. Click **Create access key**
5. Select **Application running outside AWS**
6. Click **Next**
7. Click **Create access key**

**STOP! Copy these now:**

- **Access key ID**: Something like `AKIAIOSFODNN7EXAMPLE`
- **Secret access key**: Something like `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

> **Super Important**: This is the ONLY time AWS will show you the secret access key. Download the CSV or copy both values somewhere safe. If you lose it, you'll have to create new keys.

---

## Step 2: Enable Amazon Bedrock (For the AI Assistant)

The AI assistant uses Amazon Bedrock with Claude. Here's how to set it up:

### 2.1 Go to Bedrock Console

1. In AWS Console, search for **Bedrock**
2. **Important**: Change your region to **us-east-1** (N. Virginia) - Bedrock needs this region!
3. If it's your first time, click **Get started**

### 2.2 Request Access to Claude

1. In the left sidebar, click **Model access**
2. Click **Manage model access** (or **Modify model access**)
3. Scroll down to find **Anthropic**
4. Check the box for **Claude 3 Sonnet** (recommended) or any Claude model you prefer
5. Click **Request model access** at the bottom
6. You might need to agree to some terms
7. Submit the request

Most Claude model access is granted instantly. You can refresh the page and check if it says "Access granted" next to the model.

### 2.3 Which Model Should I Pick?

| Model | Good For | Cost |
|-------|----------|------|
| Claude 3 Haiku | Fast responses, cheaper | $ |
| Claude 3 Sonnet | Best balance (recommended) | $$ |
| Claude 3 Opus | Most capable, smartest | $$$ |

For most people, **Sonnet** is the sweet spot.

---

## Step 3: Deploy to Zoho Catalyst

Alright, AWS is set up. Now let's get the server running on Catalyst.

### 3.1 Create a Catalyst Project

1. Go to [console.catalyst.zoho.com](https://console.catalyst.zoho.com/)
2. Sign in with your Zoho account
3. Click **Create Project** (or **New Project**)
4. Give it a name like `aws-cloud-commander`
5. Pick your data center (doesn't matter too much)
6. Click **Create**

### 3.2 Create an Advanced I/O Function

1. Inside your project, click **Develop** in the left menu
2. Click **Functions**
3. Click **+ Create Function**
4. Choose **Advanced I/O** (not Basic I/O!)
5. Give it a name: `server` or `main`
6. Select **Node.js 18.x** as the stack
7. Click **Create**

### 3.3 Add Environment Variables

This is where we put your AWS credentials. They're stored securely and never exposed:

1. In your function, click the **Configuration** tab
2. Click **Environment Variables**
3. Add these five variables:

| Key | Value | Notes |
|-----|-------|-------|
| `AWS_REGION` | `ap-south-1` | Or your preferred region |
| `AWS_ACCESS_KEY_ID` | Your access key | The one from Step 1.4 |
| `AWS_SECRET_ACCESS_KEY` | Your secret key | The one from Step 1.4 |
| `BEDROCK_REGION` | `us-east-1` | Keep this as us-east-1! |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | Or your chosen model |

4. Click **Save**

**A note about the region**: We're putting `AWS_REGION` in environment variables because Version 1 of the backend uses a single hardcoded region. The frontend already has a region selector that saves to the database - we'll wire that up in Version 2. For now, all operations use whatever region you set here.

### 3.4 Upload the Server Code

Now we need to get the actual code into Catalyst:

**Option A: Download and Upload (Easier)**

1. Download the server code as a ZIP from GitHub
2. Extract the ZIP file
3. Navigate to `server/functions/aws_handler/` folder
4. Select all files in this folder (index.js, package.json, services/, utils/, etc.)
5. Create a ZIP file with these files (make sure index.js is at the root of the ZIP)
6. In Catalyst, go to your function
7. Click the **Code** tab
8. Click **Upload** and select the ZIP file
9. Make sure the files are at the root level (index.js should be directly visible)

**Option B: Use Catalyst CLI (For developers)**

If you're comfortable with command line:

```bash
# Navigate to the function directory
cd server/functions/aws_handler

# Install dependencies locally (optional, for testing)
npm install

# Install Catalyst CLI if you haven't
npm install -g zcatalyst-cli

# Login to Catalyst
catalyst login

# Deploy the function
catalyst deploy
```

**Important**: Make sure you're in the `server/functions/aws_handler/` directory when deploying, as this contains the `catalyst-config.json` file.

### 3.5 Get Your Server URL

After deploying:

1. Go to your function in Catalyst console
2. Look for the **Function URL** - it looks something like:
   ```
   https://awscloudcommander-60034xxxxx.development.catalystserverless.com/server/aws_handler/
   ```
   Note: The URL will include `/aws_handler/` if your function is named `aws_handler`
3. Copy this URL - you'll need it!

### 3.6 Test It!

Let's make sure everything works. Open a browser and go to your function URL (or use curl):

```bash
curl https://your-function-url.catalystserverless.com/server/aws_handler/
```

You should see:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "AWS CloudOps Handler",
    "version": "1.0.0",
    "region": "ap-south-1",
    "bedrockRegion": "us-east-1"
  }
}
```

If you see that, your server is running!

---

## Step 4: Connect the Cliq Extension to Your Server

Almost done! Now we need to tell the extension to use YOUR server instead of the demo.

### For Extension Developers (If You're Modifying the Extension)

1. Open the extension in Zoho Cliq Developer Console
2. Go to **Connections**
3. Find the `awscloudcommander` connection (or similar OAuth connection)
4. Update the **Base URL** to your Catalyst function URL
   - Make sure it ends with `/aws_handler/` (or your function name)
   - Example: `https://your-project.development.catalystserverless.com/server/aws_handler/`
5. Re-authorize the connection

### For End Users (Using /aws settings)

1. Open Zoho Cliq
2. Type `/aws settings`
3. Look for the **Backend Server URL** field
4. Enter your Catalyst function URL (ending with `/aws_handler/`)
5. Click **Save** or submit the form

The extension will validate the URL by checking the `/status` endpoint.

### Test the Connection

1. In Zoho Cliq, type `/aws`
2. You should see the dashboard loading
3. Try `/aws ec2` - you should see YOUR EC2 instances (or "No instances found" if you don't have any)

If you see data from YOUR AWS account, congratulations - you're done!

---

## Troubleshooting

### "Access Denied" from AWS

**What it means**: The IAM policy is missing permissions

**How to fix**:
1. Go back to IAM in AWS Console
2. Find your policy
3. Make sure all the permissions from Step 1.2 are included
4. If you edited the policy, it takes effect immediately

### "Model access not granted" or Bedrock errors

**What it means**: You haven't enabled Claude in Bedrock

**How to fix**:
1. Go to Bedrock console
2. Make sure you're in **us-east-1** region
3. Go to Model access
4. Request access to Claude models
5. Wait for "Access granted"

### Function returns 500 error

**What it means**: Usually a missing environment variable

**How to fix**:
1. Go to your Catalyst function
2. Check Configuration > Environment Variables
3. Make sure ALL 5 variables are set
4. Make sure there are no typos (especially in the secret key)

### "Connection failed" in Cliq

**What it means**: OAuth connection issue

**How to fix**:
1. Check that your Catalyst function URL is correct
2. Make sure the URL ends with `/server/` (or whatever your function name is)
3. Try re-authorizing the connection

### Still stuck?

Try testing the server directly:

```bash
# Health check
curl https://your-function-url/server/aws_handler/

# Test EC2 list (will fail without OAuth, but shows if server is running)
curl -X POST https://your-function-url/server/aws_handler/ \
  -H "Content-Type: application/json" \
  -d '{"service":"ec2","action":"list"}'
```

Note: The POST request will likely fail with authentication errors, but if you get a response (even an error), it means your server is running. The OAuth connection handles authentication from Cliq.

---

## Testing Locally (Optional)

Want to test the server on your machine before deploying? Here's how:

```bash
# Go to the function folder
cd server/functions/aws_handler

# Install dependencies
npm install

# Set environment variables (Mac/Linux)
export AWS_REGION=ap-south-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export BEDROCK_REGION=us-east-1
export BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Or on Windows PowerShell
$env:AWS_REGION="ap-south-1"
$env:AWS_ACCESS_KEY_ID="your-access-key"
$env:AWS_SECRET_ACCESS_KEY="your-secret-key"
$env:BEDROCK_REGION="us-east-1"
$env:BEDROCK_MODEL_ID="anthropic.claude-3-sonnet-20240229-v1:0"

# Start the server
node index.js
```

The server will start on `http://localhost:9000` (or the port specified in your config). Test it with:

```bash
curl http://localhost:9000
```

**Note**: Local testing won't have Catalyst SDK, so some features (like user credentials from Data Store) won't work. The server will fall back to using environment variables for AWS credentials.

---

## Security Tips

A few things to keep in mind:

1. **Never commit credentials to Git** - Use environment variables, always
2. **Rotate your access keys** - AWS recommends rotating them periodically
3. **Use least privilege** - If you don't need a feature, remove those permissions
4. **Enable MFA** - On your AWS root account at minimum
5. **Monitor with CloudTrail** - See who's doing what in your account

---

## Updating the Server

When we release updates:

1. Download the new code (or `git pull`)
2. Navigate to `server/functions/aws_handler/` directory
3. Deploy to Catalyst again:
   - **Option A**: Upload new ZIP file via Catalyst console
   - **Option B**: Run `catalyst deploy` from the function directory
4. Your environment variables stay the same - no need to reconfigure them
5. Test the health endpoint to verify the update worked

---

## You're Done!

If you've followed all the steps, you now have:

- Your own private AWS Cloud Commander backend
- Running on Zoho Catalyst (serverless, scales automatically)
- Talking to YOUR AWS account
- Completely separate from our demo system

Your AWS credentials never touch our servers. Your data stays yours.

Questions? Issues? Open an issue on GitHub or check the README for more details.

Happy cloud managing!
