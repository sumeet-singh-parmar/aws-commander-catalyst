# Testing Notifications Guide

## Prerequisites

1. **Configure Notification Settings:**
   - Go to **Bot Menu → Notifications**
   - Enable the notification types you want to test
   - Select a channel for each notification type
   - Click **💾 Save**

2. **Ensure AWS Credentials are Set:**
   - Go to **Bot Menu → Settings**
   - Configure your AWS credentials
   - Or use **Bot Menu → Reset Setup** to restart the setup process

---

## Testing Each Notification Type

### 1. EC2 Notifications

**Test Start Notification:**
```
/aws ec2 start <instance-id>
```
**Expected:** Notification card in EC2 channel with:
- ▶️ EC2 Instance Started
- User name
- Instance ID
- Timestamp

**Test Stop Notification:**
```
/aws ec2 stop <instance-id>
```
**Expected:** Notification card in EC2 channel with:
- ⏹️ EC2 Instance Stopped
- User name
- Instance ID
- Timestamp

**Test Reboot Notification:**
```
/aws ec2 reboot <instance-id>
```
**Expected:** Notification card in EC2 channel with:
- 🔄 EC2 Instance Rebooted
- User name
- Instance ID
- Timestamp

---

### 2. S3 Notifications

**Test Bucket Creation:**
```
/aws s3 create
```
Fill in the form:
- Bucket name: `test-bucket-notification`
- Region: Select your region
- Click **Create Bucket**

**Expected:** Notification card in S3 channel with:
- 📦 S3 Bucket Created
- User name
- Bucket name
- Region
- Timestamp
- Button to browse bucket

**Test Bucket Deletion:**
```
/aws s3 delete <bucket-name>
```
**Expected:** Notification card in S3 channel with:
- 🗑️ S3 Bucket Deleted
- User name
- Bucket name
- Timestamp

---

### 3. CloudWatch Alarm Notifications

**Test Alarm Creation:**
```
/aws alarms create
```
Fill in the form:
- Alarm name: `test-alarm-notification`
- Metric: Select a metric
- Threshold: Enter a value
- Click **Create Alarm**

**Expected:** Notification card in Alarms channel with:
- 🔔 CloudWatch Alarm Created
- User name
- Alarm name
- Metric details
- Timestamp

**Test Alarm Deletion:**
1. List alarms: `/aws alarms`
2. Click **Delete** on an alarm

**Expected:** Notification card in Alarms channel with:
- 🗑️ CloudWatch Alarm Deleted
- User name
- Alarm name
- Timestamp

---

### 4. SNS Notifications

**Test Message Publishing:**
```
/aws sns publish <topic-arn> "Test notification message"
```

**Expected:** Notification card in SNS channel with:
- 📢 SNS Message Published
- User name
- Topic name
- Timestamp

---

### 5. Scheduled Notifications

#### Daily Cost Report

**Setup:**
1. Go to **Bot Menu → Settings**
2. Enable **📊 Daily Cost Report**
3. Go to **Bot Menu → Notifications**
4. Enable **💰 Daily Cost Report**
5. Select a channel

**Test:**
- Wait for the scheduled time (runs daily)
- OR manually trigger the scheduler (if you have access)

**Expected:** Notification card in Daily Cost channel with:
- Daily cost summary
- Cost breakdown by service
- Comparison with previous day

#### Weekly Infrastructure Summary

**Setup:**
1. Go to **Bot Menu → Settings**
2. Enable **📈 Weekly Infrastructure Summary**
3. Go to **Bot Menu → Notifications**
4. Enable **📊 Weekly Summary**
5. Select a channel

**Test:**
- Wait for the scheduled time (runs weekly)
- OR manually trigger the scheduler (if you have access)

**Expected:** Notification card in Weekly Summary channel with:
- Infrastructure overview
- Resource counts (EC2, S3, Lambda, RDS)
- Cost summary
- Alarms status

---

## Troubleshooting

### Notifications Not Appearing?

1. **Check Notification Settings:**
   - Go to **Bot Menu → Notifications**
   - Verify the notification type is **Enabled**
   - Verify a channel is selected

2. **Check Fallback Settings:**
   - Go to **Bot Menu → Settings**
   - Verify notification channel is set (for backward compatibility)

3. **Check AWS Credentials:**
   - Ensure credentials are configured
   - Test with `/aws status`

4. **Check Channel Permissions:**
   - Ensure the bot has access to the channel
   - Bot should be added to the channel

5. **Check Logs:**
   - Look for errors in the function logs
   - Check if `postToChannelAsBot` is working

### Testing Without AWS Resources

If you don't have AWS resources to test with:

1. **Use Test/Dummy Data:**
   - Create a test EC2 instance (free tier)
   - Create a test S3 bucket
   - Use CloudWatch free tier metrics

2. **Check Notification Logic:**
   - Verify notification settings are saved correctly
   - Check database records in `awsnotifications` table
   - Verify channel extraction is working

---

## Quick Test Script

Run these commands in sequence to test all notification types:

```bash
# 1. Configure notifications
# Bot Menu → Notifications → Enable all → Select channels → Save

# 2. Test EC2 (replace with your instance ID)
/aws ec2 start i-1234567890abcdef0

# 3. Test S3
/aws s3 create
# Fill form: test-notification-bucket

# 4. Test Alarms
/aws alarms create
# Fill form with test alarm

# 5. Test SNS (replace with your topic ARN)
/aws sns publish arn:aws:sns:region:account:topic "Test notification"

# 6. Verify notifications appeared in configured channels
```

---

## Expected Notification Format

All notifications follow this format:

```
*[Emoji] [Action]*

👤 *By:* [User Name]
[Resource Details]
⏰ *Time:* [Timestamp]

[Additional Details]
```

Example:
```
▶️ *EC2 Instance Started*

👤 *By:* John Doe
🖥️ *Instance:* `i-1234567890abcdef0`
⏰ *Time:* 08 Dec 2025, 14:30
```

---

## Notes

- Notifications are sent using `postToChannelAsBot` (bot posts as itself)
- Each notification type can have its own channel
- If no specific channel is set, falls back to `awsprefs.channel`
- Notifications are sent asynchronously (don't block the command response)

