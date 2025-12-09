# AWS Setup Checklist ✅

Quick checklist for setting up AWS Cloud Commander.

## Pre-Setup
- [ ] AWS Account with admin access
- [ ] 15-20 minutes of time

## IAM Setup
- [ ] Create IAM user: `cliq-cloudops`
- [ ] Attach `ReadOnlyAccess` policy
- [ ] Create custom policy `CliqCloudOpsPolicy` with:
  - [ ] EC2 Start/Stop/Reboot
  - [ ] Lambda Invoke
  - [ ] CloudWatch Alarms
  - [ ] Cost Explorer
  - [ ] RDS Start/Stop
  - [ ] SNS Publish
  - [ ] Bedrock InvokeModel
  - [ ] **Marketplace permissions** (ViewSubscriptions, Subscribe)
- [ ] Attach custom policy to user
- [ ] Create access keys
- [ ] **Save Access Key ID and Secret** ⚠️

## Bedrock Setup (us-east-1 region!)
- [ ] Switch to **us-east-1** region
- [ ] Open Amazon Bedrock console
- [ ] Check Model access page
- [ ] Submit use case details (if prompted)
- [ ] Wait for approval (5-15 mins)
- [ ] Test in Chat Playground with Claude 3 Sonnet
- [ ] Verify "Access granted" status

## Record Your Settings
- [ ] AWS Access Key ID: `_______________`
- [ ] AWS Secret Access Key: `_______________`
- [ ] AWS Region: `ap-south-1` (or your choice)
- [ ] Bedrock Region: `us-east-1`
- [ ] Bedrock Model: `anthropic.claude-3-sonnet-20240229-v1:0`

## Verification
- [ ] Test EC2 list in Postman
- [ ] Test Bedrock chat in Postman
- [ ] Both work? **You're ready!** 🚀

---

## Common Issues

| Issue | Fix |
|-------|-----|
| Bedrock "Access Denied" | Add Marketplace permissions + enable in console |
| Bedrock "Use case required" | Submit form, wait 15 mins |
| "Invalid credentials" | Check keys are correct and active |
| Cost Explorer empty | Wait 24h for data to appear |

---

See `AWS_SETUP_GUIDE.md` for detailed instructions.
