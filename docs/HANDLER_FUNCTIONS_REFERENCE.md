# AWS Cloud Commander - Handler Functions Reference

This document describes the modular handler architecture for the Cliq extension.

## Architecture Overview

The extension uses a **dispatcher pattern** where:
- `handleButton.ds` - Dispatcher that routes button clicks to service-specific handlers
- `handleForm.ds` - Dispatcher that routes form submissions to service-specific handlers
- `handlers/` folder - Contains all service-specific handler files

## Function Naming Rules

**Zoho Cliq function names can only contain alphabetic characters (a-z, A-Z).**
- NO numbers allowed (e.g., `buttonEC2` ❌)
- NO underscores allowed
- NO special characters

## Button Handler Functions

| Function Name | File | Description | Routes |
|---------------|------|-------------|--------|
| `buttonECTwo` | `handlers/buttonEC2.ds` | EC2 instance management | `ec2_*` actions |
| `buttonSThree` | `handlers/buttonS3.ds` | S3 bucket/object management | `s3_*` actions |
| `buttonLambda` | `handlers/buttonLambda.ds` | Lambda function management | `lambda_*` actions |
| `buttonCloudWatch` | `handlers/buttonCloudWatch.ds` | CloudWatch Logs & Alarms | `logs_*`, `alarms_*`, `alarm_*` actions |
| `buttonCost` | `handlers/buttonCost.ds` | Cost Explorer reports | `cost_*` actions |
| `buttonRDS` | `handlers/buttonRDS.ds` | RDS database management | `rds_*` actions |
| `buttonSNS` | `handlers/buttonSNS.ds` | SNS topic management | `sns_*` actions |
| `buttonCore` | `handlers/buttonCore.ds` | Core utilities & settings | `dashboard`, `health_*`, `permissions_*`, `incident_*`, `help_*`, `settings_*`, `ai_*`, `consent_*`, `onboard_*` |

## Standalone Functions

| Function Name | File | Description | Type |
|---------------|------|-------------|------|
| `setupForm` | `functions/setupForm.ds` | Setup configuration form | Form |
| `credentialsForm` | `functions/credentialsForm.ds` | AWS credentials collection form | Form |
| `backendForm` | `functions/backendForm.ds` | Custom backend URL configuration form | Form |
| `botOnboard` | `functions/botOnboard.ds` | Onboarding flow handler | Button |
| `botConnect` | `functions/botConnect.ds` | OAuth connection handler | Button |
| `botTour` | `functions/botTour.ds` | Feature tour navigation | Button |
| `testStorage` | `functions/testStorage.ds` | Catalyst Data Store test utility | Button |

## Form Handler Functions (Monolithic)

| Function Name | File | Description | Handles Forms |
|---------------|------|-------------|---------------|
| `handleForm` | `functions/handleForm.ds` | All form submissions | All AWS-related forms |

## Dispatcher Routing Logic

### handleButton.ds Routes:

```
actionType == "ec2"                    → buttonECTwo
actionType == "s3"                     → buttonSThree
actionType == "lambda"                 → buttonLambda
actionType == "logs/alarms/alarm"      → buttonCloudWatch
actionType == "cost"                   → buttonCost
buttonKey starts with "rds_"           → buttonRDS
buttonKey starts with "sns_"           → buttonSNS
actionType == "dashboard/health/permissions/incident/help/consent" → buttonCore
```

### handleForm.ds Routes:

```
formName == "s3_*"                     → formSThree
formName == "awsLambdaInvokeForm"      → formLambda
formName == "createAlarmForm"          → formCloudWatch
formName == "sns_publish_form"         → formSNS
formName == "aws*Form" (core forms)    → formCore
```

## Handler Contents Summary

### buttonCore.ds (~783 lines)
- Dashboard overview
- Health check (backend status)
- Permissions check & policy view
- Incident management (create, list, update)
- Help command reference
- Settings form
- AI assistant form
- Consent grant actions
- Onboarding handlers

### buttonCloudWatch.ds (~788 lines)
- Logs: list groups, view logs, errors filter, summary
- Alarms: list, active only, details, history, delete, create form

### buttonECTwo.ds (~548 lines)
- List instances, refresh
- Instance details
- Start/stop/reboot/terminate actions

### buttonSThree.ds (~514 lines)
- List buckets, refresh
- Browse bucket contents
- Upload form, search form
- Download, delete objects
- Create/delete buckets

### buttonLambda.ds (~342 lines)
- List functions
- Function info/details
- Invoke form
- View logs

### buttonRDS.ds (~279 lines)
- List instances
- List clusters
- Snapshots
- Summary

### buttonSNS.ds (~243 lines)
- List topics
- View subscribers
- Publish form

### buttonCost.ds (~127 lines)
- Cost reports (today, week, month)
- Forecasts
- Breakdown by service

## Zoho Cliq Function Configuration

When creating these functions in Zoho Cliq:

**Button Functions:**
- Type: `Button`
- Name: exact function name (e.g., `buttonECTwo`)

**Form Functions:**
- Type: `Form`
- Name: exact function name (e.g., `formSThree`)

## File-to-Function Mapping

| Handler File | Cliq Function Name |
|--------------|-------------------|
| `buttonEC2.ds` | `buttonECTwo` |
| `buttonS3.ds` | `buttonSThree` |
| `buttonLambda.ds` | `buttonLambda` |
| `buttonCloudWatch.ds` | `buttonCloudWatch` |
| `buttonCost.ds` | `buttonCost` |
| `buttonRDS.ds` | `buttonRDS` |
| `buttonSNS.ds` | `buttonSNS` |
| `buttonCore.ds` | `buttonCore` |
| `formS3.ds` | `formSThree` |
| `formLambda.ds` | `formLambda` |
| `formCloudWatch.ds` | `formCloudWatch` |
| `formSNS.ds` | `formSNS` |
| `formCore.ds` | `formCore` |

## Dynamic Backend URL Pattern

When making API calls, fetch the user's backend URL from `awssetup`:

```deluge
// Fetch user's backend URL from awssetup
setupQuery = Map();
setupQuery.put("criteria", "userid==" + userId);
setupRecords = zoho.cliq.getRecords("awssetup", setupQuery);

API_URL = "https://aws-cloudops-906900311.development.catalystserverless.com/server/aws_handler/";

if(setupRecords != null && setupRecords.get("status") == "SUCCESS")
{
    setupList = setupRecords.get("list");
    if(setupList != null && setupList.size() > 0)
    {
        setupConfig = setupList.get(0);
        setupType = setupConfig.get("setuptype");
        
        if(setupType == "own_backend")
        {
            customUrl = setupConfig.get("backendurl");
            if(customUrl != null && customUrl != "")
            {
                API_URL = customUrl;
            }
        }
    }
}

// Now use API_URL for invokeurl calls
response = invokeurl [
    url: API_URL
    type: POST
    parameters: requestBody.toString()
    headers: {"Content-Type": "application/json"}
    connection: "awscloudcommander"
];
```

**Note:** This pattern should be implemented in all functions that make backend API calls to support custom backend routing.

---
*Last updated: December 2024*

