'use strict';

/**
 * Permissions Checker Service
 * Validates what AWS permissions the IAM user has
 * Helps users understand what they can/cannot do
 */

const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, ListFunctionsCommand } = require("@aws-sdk/client-lambda");
const { CloudWatchClient, DescribeAlarmsCommand } = require("@aws-sdk/client-cloudwatch");
const { CloudWatchLogsClient, DescribeLogGroupsCommand } = require("@aws-sdk/client-cloudwatch-logs");
const { CostExplorerClient, GetCostAndUsageCommand } = require("@aws-sdk/client-cost-explorer");
const { RDSClient, DescribeDBInstancesCommand } = require("@aws-sdk/client-rds");
const { SNSClient, ListTopicsCommand } = require("@aws-sdk/client-sns");
const { IAMClient, GetUserCommand, ListUsersCommand } = require("@aws-sdk/client-iam");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");

const { 
    getEC2Client, 
    getS3Client, 
    getLambdaClient, 
    getCloudWatchClient, 
    getLogsClient,
    getCostExplorerClient,
    getRDSClient,
    getSNSClient,
    getIAMClient,
    getBedrockClient,
    getSTSClient,
    config 
} = require("./aws-clients");

/**
 * All permissions we need and their test methods
 */
const PERMISSION_CHECKS = {
    // STS - Basic identity
    sts: {
        name: "AWS Identity (STS)",
        description: "Basic AWS authentication",
        required: true,
        actions: ["sts:GetCallerIdentity"],
        test: async (region) => {
            const client = getSTSClient(region);
            const response = await client.send(new GetCallerIdentityCommand({}));
            return {
                success: true,
                details: {
                    account: response.Account,
                    userId: response.UserId,
                    arn: response.Arn
                }
            };
        }
    },

    // EC2
    ec2_read: {
        name: "EC2 Read",
        description: "List and describe EC2 instances",
        required: true,
        actions: ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"],
        test: async (region) => {
            const client = getEC2Client(region);
            await client.send(new DescribeInstancesCommand({ MaxResults: 5 }));
            return { success: true };
        }
    },
    ec2_write: {
        name: "EC2 Write",
        description: "Start, stop, reboot instances",
        required: false,
        actions: ["ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances"],
        test: async (region) => {
            // We can't actually test write without affecting resources
            // So we check if read works and assume write policy is attached
            return { success: null, message: "Cannot test without affecting resources. Verify IAM policy manually." };
        }
    },

    // S3
    s3_read: {
        name: "S3 Read",
        description: "List buckets and objects",
        required: true,
        actions: ["s3:ListAllMyBuckets", "s3:ListBucket", "s3:GetObject"],
        test: async (region) => {
            const client = getS3Client(region);
            await client.send(new ListBucketsCommand({}));
            return { success: true };
        }
    },

    // Lambda
    lambda_read: {
        name: "Lambda Read",
        description: "List and describe Lambda functions",
        required: true,
        actions: ["lambda:ListFunctions", "lambda:GetFunction"],
        test: async (region) => {
            const client = getLambdaClient(region);
            await client.send(new ListFunctionsCommand({ MaxItems: 5 }));
            return { success: true };
        }
    },
    lambda_invoke: {
        name: "Lambda Invoke",
        description: "Invoke Lambda functions",
        required: false,
        actions: ["lambda:InvokeFunction"],
        test: async (region) => {
            return { success: null, message: "Cannot test without invoking a function. Verify IAM policy manually." };
        }
    },

    // CloudWatch
    cloudwatch_read: {
        name: "CloudWatch Read",
        description: "View alarms and metrics",
        required: true,
        actions: ["cloudwatch:DescribeAlarms", "cloudwatch:GetMetricStatistics", "cloudwatch:ListMetrics"],
        test: async (region) => {
            const client = getCloudWatchClient(region);
            await client.send(new DescribeAlarmsCommand({ MaxRecords: 5 }));
            return { success: true };
        }
    },
    cloudwatch_write: {
        name: "CloudWatch Write",
        description: "Create and delete alarms",
        required: false,
        actions: ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms"],
        test: async (region) => {
            return { success: null, message: "Cannot test without creating/deleting alarms. Verify IAM policy manually." };
        }
    },

    // CloudWatch Logs
    logs_read: {
        name: "CloudWatch Logs Read",
        description: "View log groups and events",
        required: true,
        actions: ["logs:DescribeLogGroups", "logs:DescribeLogStreams", "logs:GetLogEvents", "logs:FilterLogEvents"],
        test: async (region) => {
            const client = getLogsClient(region);
            await client.send(new DescribeLogGroupsCommand({ limit: 5 }));
            return { success: true };
        }
    },

    // Cost Explorer
    cost_explorer: {
        name: "Cost Explorer",
        description: "View AWS costs and usage",
        required: false,
        actions: ["ce:GetCostAndUsage", "ce:GetCostForecast"],
        costWarning: "⚠️ Testing this will cost $0.01",
        test: async (region) => {
            // Don't actually test - it costs money!
            return { 
                success: null, 
                message: "Skipped - Cost Explorer API costs $0.01 per call. Verify IAM policy manually.",
                requiresManualVerification: true
            };
        }
    },

    // RDS
    rds_read: {
        name: "RDS Read",
        description: "List and describe databases",
        required: false,
        actions: ["rds:DescribeDBInstances", "rds:DescribeDBClusters"],
        test: async (region) => {
            const client = getRDSClient(region);
            await client.send(new DescribeDBInstancesCommand({ MaxRecords: 20 }));
            return { success: true };
        }
    },
    rds_write: {
        name: "RDS Write",
        description: "Start, stop, reboot databases",
        required: false,
        actions: ["rds:StartDBInstance", "rds:StopDBInstance", "rds:RebootDBInstance"],
        test: async (region) => {
            return { success: null, message: "Cannot test without affecting databases. Verify IAM policy manually." };
        }
    },

    // SNS
    sns_read: {
        name: "SNS Read",
        description: "List topics and subscriptions",
        required: false,
        actions: ["sns:ListTopics", "sns:ListSubscriptions", "sns:GetTopicAttributes"],
        test: async (region) => {
            const client = getSNSClient(region);
            await client.send(new ListTopicsCommand({}));
            return { success: true };
        }
    },
    sns_write: {
        name: "SNS Write",
        description: "Publish messages, manage topics",
        required: false,
        actions: ["sns:Publish", "sns:CreateTopic", "sns:DeleteTopic", "sns:Subscribe"],
        test: async (region) => {
            return { success: null, message: "Cannot test without sending messages. Verify IAM policy manually." };
        }
    },

    // IAM
    iam_read: {
        name: "IAM Read",
        description: "List users, roles, and policies",
        required: false,
        actions: ["iam:ListUsers", "iam:ListRoles", "iam:GetUser", "iam:GetAccountSummary"],
        test: async (region) => {
            const client = getIAMClient();
            await client.send(new ListUsersCommand({ MaxItems: 5 }));
            return { success: true };
        }
    },

    // Bedrock
    bedrock: {
        name: "Bedrock AI",
        description: "Use Claude AI for assistance",
        required: false,
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        marketplaceActions: ["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"],
        costWarning: "⚠️ Testing this will cost ~$0.01",
        test: async (region) => {
            // Don't actually test - it costs money and might fail for other reasons
            return { 
                success: null, 
                message: "Skipped - Bedrock API costs money. Use 'validateBedrock' action for full test.",
                requiresManualVerification: true,
                additionalRequirements: [
                    "Bedrock model access must be enabled in us-east-1",
                    "Use case form may need to be submitted for Anthropic models",
                    "AWS Marketplace permissions required for first-time enablement"
                ]
            };
        }
    }
};

/**
 * Run all permission checks
 */
async function checkAllPermissions(region) {
    const results = {
        timestamp: new Date().toISOString(),
        region: region || config.awsRegion,
        identity: null,
        permissions: {},
        summary: {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            required_missing: []
        },
        recommendations: []
    };

    // First, check identity
    try {
        const identityResult = await PERMISSION_CHECKS.sts.test(region);
        results.identity = identityResult.details;
    } catch (error) {
        results.identity = { error: "Failed to get AWS identity. Check your credentials." };
        results.summary.failed++;
        results.recommendations.push({
            severity: "CRITICAL",
            message: "AWS credentials are invalid or not configured",
            fix: "Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables"
        });
        return results;
    }

    // Check each permission
    for (const [key, check] of Object.entries(PERMISSION_CHECKS)) {
        if (key === 'sts') continue; // Already checked

        results.summary.total++;
        
        const permResult = {
            name: check.name,
            description: check.description,
            required: check.required,
            actions: check.actions,
            status: 'unknown',
            message: null,
            error: null
        };

        try {
            const testResult = await check.test(region);
            
            if (testResult.success === true) {
                permResult.status = 'granted';
                results.summary.passed++;
            } else if (testResult.success === null) {
                permResult.status = 'skipped';
                permResult.message = testResult.message;
                if (testResult.additionalRequirements) {
                    permResult.additionalRequirements = testResult.additionalRequirements;
                }
                results.summary.skipped++;
            } else {
                permResult.status = 'denied';
                results.summary.failed++;
            }
        } catch (error) {
            permResult.status = 'denied';
            permResult.error = parseAWSError(error);
            results.summary.failed++;

            // Track missing required permissions
            if (check.required) {
                results.summary.required_missing.push({
                    permission: key,
                    name: check.name,
                    actions: check.actions
                });
            }

            // Add recommendation
            results.recommendations.push({
                severity: check.required ? "HIGH" : "MEDIUM",
                permission: key,
                message: `Missing ${check.name} permissions`,
                fix: `Add these IAM actions: ${check.actions.join(", ")}`,
                error: permResult.error
            });
        }

        results.permissions[key] = permResult;
    }

    // Add marketplace recommendation if bedrock might be needed
    if (results.permissions.bedrock) {
        results.recommendations.push({
            severity: "INFO",
            permission: "bedrock",
            message: "Bedrock AI requires additional setup",
            fix: "Ensure aws-marketplace:ViewSubscriptions and aws-marketplace:Subscribe permissions are granted, and model access is enabled in Bedrock Console (us-east-1)"
        });
    }

    return results;
}

/**
 * Check a specific permission
 */
async function checkPermission(permissionKey, region) {
    const check = PERMISSION_CHECKS[permissionKey];
    
    if (!check) {
        return {
            success: false,
            error: `Unknown permission: ${permissionKey}`,
            availablePermissions: Object.keys(PERMISSION_CHECKS)
        };
    }

    try {
        const result = await check.test(region);
        return {
            success: result.success,
            permission: permissionKey,
            name: check.name,
            description: check.description,
            actions: check.actions,
            message: result.message,
            details: result.details
        };
    } catch (error) {
        return {
            success: false,
            permission: permissionKey,
            name: check.name,
            description: check.description,
            actions: check.actions,
            error: parseAWSError(error),
            fix: `Add these IAM actions to your policy: ${check.actions.join(", ")}`
        };
    }
}

/**
 * Validate Bedrock specifically (more detailed check)
 */
async function validateBedrock(skipInvoke = true) {
    const results = {
        timestamp: new Date().toISOString(),
        bedrockRegion: config.bedrockRegion,
        modelId: config.bedrockModelId,
        checks: {},
        ready: false,
        issues: [],
        recommendations: []
    };

    // Check 1: Can we reach Bedrock at all?
    results.checks.bedrockAccess = {
        name: "Bedrock Service Access",
        status: "checking"
    };

    // Check 2: Do we have marketplace permissions?
    results.checks.marketplacePermissions = {
        name: "AWS Marketplace Permissions",
        status: "cannot_verify",
        message: "Marketplace permissions cannot be directly tested. If Bedrock invoke fails with marketplace error, add aws-marketplace:ViewSubscriptions and aws-marketplace:Subscribe permissions.",
        actions: ["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe", "aws-marketplace:Unsubscribe"]
    };

    // Check 3: Can we invoke the model?
    if (!skipInvoke) {
        results.checks.modelInvoke = {
            name: "Model Invocation",
            status: "checking",
            costWarning: "This test costs ~$0.01"
        };

        try {
            const client = getBedrockClient();
            const response = await client.send(new InvokeModelCommand({
                modelId: config.bedrockModelId,
                contentType: "application/json",
                accept: "application/json",
                body: JSON.stringify({
                    anthropic_version: "bedrock-2023-05-31",
                    max_tokens: 10,
                    messages: [{ role: "user", content: "Hi" }]
                })
            }));

            results.checks.modelInvoke.status = "success";
            results.checks.bedrockAccess.status = "success";
            results.ready = true;
        } catch (error) {
            const parsedError = parseAWSError(error);
            results.checks.modelInvoke.status = "failed";
            results.checks.modelInvoke.error = parsedError;

            // Analyze the error
            if (parsedError.code === "AccessDeniedException") {
                if (parsedError.message.includes("marketplace")) {
                    results.issues.push({
                        type: "MARKETPLACE_PERMISSIONS",
                        message: "Missing AWS Marketplace permissions",
                        fix: "Add aws-marketplace:ViewSubscriptions and aws-marketplace:Subscribe to your IAM policy"
                    });
                    results.checks.marketplacePermissions.status = "missing";
                } else if (parsedError.message.includes("use case")) {
                    results.issues.push({
                        type: "USE_CASE_FORM",
                        message: "Anthropic use case form not submitted",
                        fix: "Go to Bedrock Console → Model access → Submit use case details for Anthropic"
                    });
                } else {
                    results.issues.push({
                        type: "BEDROCK_PERMISSION",
                        message: "Missing Bedrock permissions",
                        fix: "Add bedrock:InvokeModel to your IAM policy"
                    });
                }
            } else if (parsedError.code === "ResourceNotFoundException") {
                results.issues.push({
                    type: "MODEL_NOT_FOUND",
                    message: "Model not found or not enabled",
                    fix: `Ensure model ${config.bedrockModelId} is enabled in ${config.bedrockRegion}`
                });
            } else {
                results.issues.push({
                    type: "UNKNOWN",
                    message: parsedError.message,
                    code: parsedError.code
                });
            }

            results.checks.bedrockAccess.status = "failed";
        }
    } else {
        results.checks.modelInvoke = {
            name: "Model Invocation",
            status: "skipped",
            message: "Skipped to avoid costs. Set skipInvoke=false to test (costs ~$0.01)"
        };
    }

    // Generate recommendations
    if (results.issues.length > 0) {
        for (const issue of results.issues) {
            results.recommendations.push({
                severity: "HIGH",
                issue: issue.type,
                message: issue.message,
                fix: issue.fix
            });
        }
    }

    if (!results.ready && results.checks.modelInvoke.status === "skipped") {
        results.recommendations.push({
            severity: "INFO",
            message: "Run with skipInvoke=false to fully test Bedrock access",
            note: "This will cost approximately $0.01"
        });
    }

    return results;
}

/**
 * Get required IAM policy JSON
 */
function getRequiredPolicy(options = {}) {
    const statements = [];

    // EC2
    if (options.ec2 !== false) {
        statements.push({
            Sid: "EC2Access",
            Effect: "Allow",
            Action: [
                "ec2:Describe*",
                ...(options.ec2Write !== false ? ["ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances"] : [])
            ],
            Resource: "*"
        });
    }

    // S3
    if (options.s3 !== false) {
        statements.push({
            Sid: "S3Access",
            Effect: "Allow",
            Action: [
                "s3:ListAllMyBuckets",
                "s3:ListBucket",
                "s3:GetObject",
                "s3:GetBucketLocation"
            ],
            Resource: "*"
        });
    }

    // Lambda
    if (options.lambda !== false) {
        statements.push({
            Sid: "LambdaAccess",
            Effect: "Allow",
            Action: [
                "lambda:ListFunctions",
                "lambda:GetFunction",
                ...(options.lambdaInvoke !== false ? ["lambda:InvokeFunction"] : [])
            ],
            Resource: "*"
        });
    }

    // CloudWatch
    if (options.cloudwatch !== false) {
        statements.push({
            Sid: "CloudWatchAccess",
            Effect: "Allow",
            Action: [
                "cloudwatch:Describe*",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics",
                ...(options.cloudwatchWrite !== false ? ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms"] : [])
            ],
            Resource: "*"
        });
    }

    // CloudWatch Logs
    if (options.logs !== false) {
        statements.push({
            Sid: "CloudWatchLogsAccess",
            Effect: "Allow",
            Action: [
                "logs:Describe*",
                "logs:GetLogEvents",
                "logs:FilterLogEvents"
            ],
            Resource: "*"
        });
    }

    // Cost Explorer
    if (options.costExplorer !== false) {
        statements.push({
            Sid: "CostExplorerAccess",
            Effect: "Allow",
            Action: [
                "ce:GetCostAndUsage",
                "ce:GetCostForecast",
                "ce:GetDimensionValues"
            ],
            Resource: "*"
        });
    }

    // RDS
    if (options.rds !== false) {
        statements.push({
            Sid: "RDSAccess",
            Effect: "Allow",
            Action: [
                "rds:Describe*",
                ...(options.rdsWrite !== false ? ["rds:StartDBInstance", "rds:StopDBInstance", "rds:RebootDBInstance"] : [])
            ],
            Resource: "*"
        });
    }

    // SNS
    if (options.sns !== false) {
        statements.push({
            Sid: "SNSAccess",
            Effect: "Allow",
            Action: [
                "sns:List*",
                "sns:GetTopicAttributes",
                ...(options.snsWrite !== false ? ["sns:Publish", "sns:CreateTopic", "sns:DeleteTopic", "sns:Subscribe", "sns:Unsubscribe"] : [])
            ],
            Resource: "*"
        });
    }

    // IAM
    if (options.iam !== false) {
        statements.push({
            Sid: "IAMAccess",
            Effect: "Allow",
            Action: [
                "iam:List*",
                "iam:Get*"
            ],
            Resource: "*"
        });
    }

    // Bedrock
    if (options.bedrock !== false) {
        statements.push({
            Sid: "BedrockAccess",
            Effect: "Allow",
            Action: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
                "bedrock:GetFoundationModel",
                "bedrock:ListFoundationModels"
            ],
            Resource: "*"
        });

        // Marketplace for Bedrock
        statements.push({
            Sid: "MarketplaceForBedrock",
            Effect: "Allow",
            Action: [
                "aws-marketplace:ViewSubscriptions",
                "aws-marketplace:Subscribe",
                "aws-marketplace:Unsubscribe"
            ],
            Resource: "*"
        });
    }

    return {
        Version: "2012-10-17",
        Statement: statements
    };
}

/**
 * Parse AWS error into user-friendly format
 */
function parseAWSError(error) {
    const result = {
        code: error.name || error.Code || "UnknownError",
        message: error.message || "An unknown error occurred",
        service: null,
        action: null
    };

    // Extract service and action if available
    if (error.$metadata) {
        result.requestId = error.$metadata.requestId;
    }

    // Common error translations
    const errorMessages = {
        "AccessDeniedException": "You don't have permission to perform this action",
        "UnauthorizedAccess": "Your credentials don't have access to this resource",
        "ExpiredTokenException": "Your AWS credentials have expired",
        "InvalidClientTokenId": "The AWS Access Key ID is invalid",
        "SignatureDoesNotMatch": "The AWS Secret Access Key is invalid",
        "ResourceNotFoundException": "The requested resource was not found",
        "ThrottlingException": "Too many requests - please slow down",
        "ServiceUnavailableException": "AWS service is temporarily unavailable"
    };

    if (errorMessages[result.code]) {
        result.friendlyMessage = errorMessages[result.code];
    }

    return result;
}

/**
 * Get list of all available permission checks
 */
function getAvailableChecks() {
    return Object.entries(PERMISSION_CHECKS).map(([key, check]) => ({
        key: key,
        name: check.name,
        description: check.description,
        required: check.required,
        actions: check.actions,
        costWarning: check.costWarning || null
    }));
}

module.exports = {
    checkAllPermissions,
    checkPermission,
    validateBedrock,
    getRequiredPolicy,
    parseAWSError,
    getAvailableChecks,
    PERMISSION_CHECKS
};
