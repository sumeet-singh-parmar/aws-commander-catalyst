# AWS Cloud Commander - AWS Setup Guide

## 🚀 Complete AWS Setup (One-Time)

Follow these steps **exactly** to set up your AWS account for AWS Cloud Commander. This takes about 15-20 minutes.

---

## Prerequisites

- AWS Account with admin access (or permissions to create IAM users)
- Access to AWS Console

---

## Step 1: Create IAM User

1. Go to **AWS Console** → **IAM** → **Users**
2. Click **Create user**
3. **User name**: `cliq-cloudops`
4. Click **Next**
5. Select **Attach policies directly**
6. Search and select: `ReadOnlyAccess` (we'll add custom permissions next)
7. Click **Next** → **Create user**

---

## Step 2: Create Custom Policy

1. Go to **IAM** → **Policies** → **Create policy**
2. Click **JSON** tab
3. Paste this policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EC2Management",
            "Effect": "Allow",
            "Action": [
                "ec2:StartInstances",
                "ec2:StopInstances",
                "ec2:RebootInstances"
            ],
            "Resource": "*"
        },
        {
            "Sid": "LambdaInvoke",
            "Effect": "Allow",
            "Action": [
                "lambda:InvokeFunction"
            ],
            "Resource": "*"
        },
        {
            "Sid": "CloudWatchManagement",
            "Effect": "Allow",
            "Action": [
                "cloudwatch:PutMetricAlarm",
                "cloudwatch:DeleteAlarms",
                "cloudwatch:SetAlarmState"
            ],
            "Resource": "*"
        },
        {
            "Sid": "CostExplorer",
            "Effect": "Allow",
            "Action": [
                "ce:GetCostAndUsage",
                "ce:GetCostForecast",
                "ce:GetDimensionValues"
            ],
            "Resource": "*"
        },
        {
            "Sid": "RDSManagement",
            "Effect": "Allow",
            "Action": [
                "rds:StartDBInstance",
                "rds:StopDBInstance",
                "rds:RebootDBInstance"
            ],
            "Resource": "*"
        },
        {
            "Sid": "SNSPublish",
            "Effect": "Allow",
            "Action": [
                "sns:Publish",
                "sns:CreateTopic",
                "sns:DeleteTopic",
                "sns:Subscribe",
                "sns:Unsubscribe"
            ],
            "Resource": "*"
        },
        {
            "Sid": "BedrockAI",
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
                "bedrock:GetFoundationModel",
                "bedrock:ListFoundationModels"
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
        }
    ]
}
```

4. Click **Next**
5. **Policy name**: `CliqCloudOpsPolicy`
6. Click **Create policy**

---

## Step 3: Attach Policy to User

1. Go to **IAM** → **Users** → **cliq-cloudops**
2. Click **Add permissions** → **Attach policies directly**
3. Search for `CliqCloudOpsPolicy`
4. Select it and click **Add permissions**

---

## Step 4: Create Access Keys

1. Go to **IAM** → **Users** → **cliq-cloudops**
2. Click **Security credentials** tab
3. Scroll to **Access keys** → **Create access key**
4. Select **Application running outside AWS**
5. Click **Next** → **Create access key**
6. **⚠️ IMPORTANT**: Download the CSV or copy both:
   - Access key ID: `AKIA...`
   - Secret access key: `...` (shown only once!)
7. Click **Done**

**Save these securely - you'll need them for Catalyst!**

---

## Step 5: Enable Bedrock AI (IMPORTANT!)

Amazon Bedrock requires one-time setup. Follow these steps carefully:

### 5a. Go to Bedrock Console

1. Go to **AWS Console**
2. **Change region to `us-east-1` (N. Virginia)** ← Important!
3. Search for **Amazon Bedrock**
4. Click **Get started**

### 5b. Submit Use Case Details (First-time Anthropic users)

> ⚠️ **Note**: Some first-time users need to submit use case details before accessing Anthropic models.

1. In Bedrock Console, click **Model access** (left sidebar)
2. Look for any notification about submitting use case details
3. If prompted, click to submit the form:
   - **Company name**: Your company
   - **Use case**: "Internal DevOps assistant for AWS management"
   - **Expected usage**: Low/Medium
4. Submit and **wait 5-15 minutes** for approval

### 5c. Enable Claude Model (One-Time Invocation)

> 📌 **How Bedrock Works Now**: Serverless models are auto-enabled when first invoked. But for Anthropic models served via AWS Marketplace, a user with Marketplace permissions must invoke once to enable it account-wide.

**You already have Marketplace permissions from Step 2!**

To enable the model:

1. In Bedrock Console, go to **Playgrounds** → **Chat**
2. Select model: **Anthropic** → **Claude 3 Sonnet**
3. Type any message: `Hello`
4. Click **Run**
5. If it works → Model is now enabled for your account! ✅
6. If error about use case → Wait for approval from Step 5b

### 5d. Verify Model Access

1. Go to **Model access** in Bedrock Console
2. Find **Anthropic** → **Claude 3 Sonnet**
3. Status should show **Access granted** ✅

---

## Step 6: Note Your Settings

Record these for the Cliq extension setup:

| Setting | Value |
|---------|-------|
| AWS Access Key ID | `AKIA...` (from Step 4) |
| AWS Secret Access Key | `...` (from Step 4) |
| AWS Region | `ap-south-1` (or your preferred region) |
| Bedrock Region | `us-east-1` |
| Bedrock Model | `anthropic.claude-3-sonnet-20240229-v1:0` |

---

## ✅ Setup Complete!

Your AWS account is now ready for AWS Cloud Commander.

---

## 💰 Cost Awareness

### Free Tier / Negligible Cost:
- EC2 API calls (Describe, Start, Stop)
- S3 API calls
- Lambda API calls (not invocations)
- CloudWatch alarms and metrics (within limits)
- IAM API calls
- RDS API calls

### Paid Services:
| Service | Cost | Notes |
|---------|------|-------|
| **Cost Explorer** | $0.01 per API call | The extension asks for confirmation |
| **Bedrock AI** | ~$0.01-0.15 per query | The extension asks for confirmation |
| **SNS** | $0.50 per 1M publishes | SMS has additional costs |
| **Lambda Invoke** | Depends on function | Uses your Lambda quota |

**The extension will always warn you before making paid API calls!**

---

## Troubleshooting

### "Access Denied" on Bedrock

**Cause**: Marketplace permissions or model not enabled
**Fix**:
1. Verify IAM policy has `aws-marketplace:*` permissions
2. Go to Bedrock Console (us-east-1)
3. Try the Chat Playground with Claude 3 Sonnet
4. If it asks for use case details, submit them and wait

### "Model not found" on Bedrock

**Cause**: Wrong region or model ID
**Fix**:
1. Ensure Bedrock region is `us-east-1`
2. Use model ID: `anthropic.claude-3-sonnet-20240229-v1:0`

### "Credentials not valid"

**Cause**: Wrong access keys or keys not active
**Fix**:
1. Check Access Key ID and Secret are correct
2. In IAM, verify the access key status is "Active"
3. Create new access key if needed

### Cost Explorer returns empty

**Cause**: No AWS usage yet or wrong date range
**Fix**:
1. Cost data takes 24 hours to appear
2. Ensure you have some AWS usage
3. Try with `period: "month"` instead of `"week"`

---

## Security Best Practices

1. **Never share your access keys**
2. **Rotate keys periodically** (every 90 days recommended)
3. **Use least privilege** - the policy above only grants what's needed
4. **Enable MFA** on your AWS account
5. **Monitor usage** in CloudTrail

---

## Need Help?

If you encounter issues:
1. Check the error message carefully
2. Verify IAM permissions match the policy above
3. Ensure Bedrock is enabled in us-east-1
4. Wait 10 minutes after permission changes

---

*AWS Cloud Commander - Setup Guide v1.0*
