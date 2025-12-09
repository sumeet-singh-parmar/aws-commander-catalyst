'use strict';

/**
 * AWS Pricing Awareness
 * Warns users about API costs before making expensive calls
 */

// Pricing information (as of 2024)
const PRICING = {
    costExplorer: {
        service: 'AWS Cost Explorer',
        costPerRequest: 0.01,
        currency: 'USD',
        warning: '⚠️ Cost Explorer API charges $0.01 per API request',
        documentation: 'https://aws.amazon.com/aws-cost-management/pricing/'
    },
    bedrock: {
        service: 'Amazon Bedrock (Claude 3 Sonnet)',
        inputTokenCost: 0.003,  // per 1K tokens
        outputTokenCost: 0.015, // per 1K tokens
        currency: 'USD',
        warning: '⚠️ Bedrock AI charges ~$0.003/1K input tokens + ~$0.015/1K output tokens',
        documentation: 'https://aws.amazon.com/bedrock/pricing/',
        estimatePerQuery: '~$0.01-0.05 per query'
    },
    cloudwatch: {
        service: 'Amazon CloudWatch',
        getMetricStatistics: {
            freeRequests: 1000000, // 1M free per month
            costPer1000: 0.01,
            currency: 'USD'
        },
        getMetricData: {
            freeRequests: 1000000,
            costPer1000: 0.01
        },
        warning: '⚠️ CloudWatch metrics: First 1M requests free, then $0.01 per 1K requests',
        documentation: 'https://aws.amazon.com/cloudwatch/pricing/'
    },
    s3: {
        service: 'Amazon S3',
        getRequests: {
            costPer1000: 0.0004, // Standard storage class
            currency: 'USD'
        },
        listRequests: {
            costPer1000: 0.005,
            currency: 'USD'
        },
        warning: '💡 S3 API: GET $0.0004/1K requests, LIST $0.005/1K requests (usually negligible)',
        documentation: 'https://aws.amazon.com/s3/pricing/'
    },
    lambda: {
        service: 'AWS Lambda',
        invokeWarning: '⚠️ Invoking Lambda functions will use your Lambda execution quota and may incur costs',
        documentation: 'https://aws.amazon.com/lambda/pricing/'
    },
    sns: {
        service: 'Amazon SNS',
        publishCost: 0.50, // per 1M requests
        smsCost: 'varies by country',
        warning: '⚠️ SNS: $0.50 per 1M publishes. SMS messages have additional per-message charges',
        documentation: 'https://aws.amazon.com/sns/pricing/'
    }
};

// Actions that cost money
const PAID_ACTIONS = {
    // Cost Explorer - Always costs money
    'cost:getUsage': { ...PRICING.costExplorer, estimatedCost: '$0.01' },
    'cost:byPeriod': { ...PRICING.costExplorer, estimatedCost: '$0.01' },
    'cost:forecast': { ...PRICING.costExplorer, estimatedCost: '$0.01' },
    'cost:monthToDate': { ...PRICING.costExplorer, estimatedCost: '$0.01' },
    'cost:comparison': { ...PRICING.costExplorer, estimatedCost: '$0.02 (2 API calls)' },
    'cost:topServices': { ...PRICING.costExplorer, estimatedCost: '$0.01' },
    'cost:trend': { ...PRICING.costExplorer, estimatedCost: '$0.01' },
    'cost:byTag': { ...PRICING.costExplorer, estimatedCost: '$0.01' },
    
    // Bedrock - Always costs money
    'bedrock:chat': { ...PRICING.bedrock, estimatedCost: '$0.01-0.05' },
    'bedrock:chatWithContext': { ...PRICING.bedrock, estimatedCost: '$0.02-0.10' },
    'bedrock:generateCfn': { ...PRICING.bedrock, estimatedCost: '$0.02-0.10' },
    'bedrock:generateIam': { ...PRICING.bedrock, estimatedCost: '$0.01-0.05' },
    'bedrock:generateLambda': { ...PRICING.bedrock, estimatedCost: '$0.02-0.10' },
    'bedrock:troubleshoot': { ...PRICING.bedrock, estimatedCost: '$0.02-0.10' },
    'bedrock:optimize': { ...PRICING.bedrock, estimatedCost: '$0.02-0.10' },
    'bedrock:reviewArchitecture': { ...PRICING.bedrock, estimatedCost: '$0.03-0.15' },
    'bedrock:explain': { ...PRICING.bedrock, estimatedCost: '$0.01-0.05' },
    'bedrock:generateCli': { ...PRICING.bedrock, estimatedCost: '$0.01-0.03' },
    
    // Lambda invoke - Runs user's code
    'lambda:invoke': { ...PRICING.lambda, estimatedCost: 'depends on function' },
    
    // SNS publish - Sends messages
    'sns:publish': { ...PRICING.sns, estimatedCost: '~$0.0000005 + SMS costs' },
    'sns:publishDirect': { ...PRICING.sns, estimatedCost: 'SMS rate varies by country' }
};

// Actions that are essentially free (within free tier or negligible)
const FREE_ACTIONS = [
    'ec2:list', 'ec2:get', 'ec2:start', 'ec2:stop', 'ec2:reboot', 'ec2:status',
    'ec2:summary', 'ec2:securityGroups', 'ec2:vpcs', 'ec2:subnets',
    's3:listBuckets', 's3:getBucket', 's3:listObjects', 's3:getObject',
    's3:getPresignedUrl', 's3:deleteObject', 's3:search', 's3:summary',
    'lambda:list', 'lambda:get', 'lambda:summary', 'lambda:eventSources',
    'cloudwatch:listAlarms', 'cloudwatch:getActiveAlarms', 'cloudwatch:getAlarm',
    'cloudwatch:getAlarmHistory', 'cloudwatch:listMetrics', 'cloudwatch:summary',
    'cloudwatch:createAlarm', 'cloudwatch:deleteAlarm', 'cloudwatch:setAlarmState',
    'logs:listGroups', 'logs:listStreams', 'logs:getEvents', 'logs:filter',
    'logs:recent', 'logs:errors', 'logs:lambdaLogs', 'logs:ec2Logs', 'logs:summary',
    'rds:list', 'rds:get', 'rds:start', 'rds:stop', 'rds:reboot',
    'rds:clusters', 'rds:snapshots', 'rds:summary',
    'sns:listTopics', 'sns:getTopic', 'sns:listSubscriptions',
    'sns:topicSubscriptions', 'sns:createTopic', 'sns:deleteTopic',
    'sns:subscribe', 'sns:unsubscribe', 'sns:summary',
    'iam:listUsers', 'iam:getUser', 'iam:listRoles', 'iam:getRole',
    'iam:listPolicies', 'iam:accountSummary', 'iam:securityStatus', 'iam:summary',
    'health', 'dashboard:overview'
];

/**
 * Check if an action costs money
 */
function isPaidAction(service, action) {
    const key = `${service}:${action}`;
    return PAID_ACTIONS.hasOwnProperty(key);
}

/**
 * Get pricing info for an action
 */
function getPricingInfo(service, action) {
    const key = `${service}:${action}`;
    return PAID_ACTIONS[key] || null;
}

/**
 * Get cost warning message for an action
 */
function getCostWarning(service, action) {
    const info = getPricingInfo(service, action);
    if (!info) return null;
    
    return {
        warning: info.warning,
        estimatedCost: info.estimatedCost,
        documentation: info.documentation,
        service: info.service
    };
}

/**
 * Format cost warning for response
 */
function formatCostWarning(service, action) {
    const warning = getCostWarning(service, action);
    if (!warning) return null;
    
    return `💰 ${warning.warning}\n   Estimated cost: ${warning.estimatedCost}`;
}

/**
 * Get all pricing information
 */
function getAllPricing() {
    return {
        paidActions: Object.entries(PAID_ACTIONS).map(([key, info]) => ({
            action: key,
            service: info.service,
            estimatedCost: info.estimatedCost,
            warning: info.warning
        })),
        freeActions: FREE_ACTIONS,
        summary: {
            costExplorer: '$0.01 per API call',
            bedrock: '$0.01-0.15 per query',
            lambdaInvoke: 'Depends on function',
            snsPublish: '$0.50 per 1M + SMS costs',
            otherServices: 'Mostly free tier / negligible'
        }
    };
}

/**
 * Estimate monthly cost based on usage
 */
function estimateMonthlyCost(usage) {
    let total = 0;
    const breakdown = [];
    
    if (usage.costExplorerCalls) {
        const cost = usage.costExplorerCalls * 0.01;
        total += cost;
        breakdown.push({
            service: 'Cost Explorer',
            calls: usage.costExplorerCalls,
            cost: cost
        });
    }
    
    if (usage.bedrockQueries) {
        const cost = usage.bedrockQueries * 0.03; // Average estimate
        total += cost;
        breakdown.push({
            service: 'Bedrock AI',
            queries: usage.bedrockQueries,
            cost: cost
        });
    }
    
    if (usage.snsPublishes) {
        const cost = (usage.snsPublishes / 1000000) * 0.50;
        total += cost;
        breakdown.push({
            service: 'SNS',
            publishes: usage.snsPublishes,
            cost: cost
        });
    }
    
    return {
        totalEstimate: total,
        totalFormatted: `$${total.toFixed(2)}`,
        breakdown: breakdown
    };
}

module.exports = {
    PRICING,
    PAID_ACTIONS,
    FREE_ACTIONS,
    isPaidAction,
    getPricingInfo,
    getCostWarning,
    formatCostWarning,
    getAllPricing,
    estimateMonthlyCost
};
