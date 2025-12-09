'use strict';

/**
 * ============================================================================
 * AWS CLIENT FACTORY
 * ============================================================================
 *
 * This module creates authenticated AWS SDK v3 clients for all services.
 * Instead of creating clients directly in each service file, we centralize
 * client creation here. This gives us:
 *
 * 1. Single place to manage credentials
 * 2. Consistent configuration across all services
 * 3. Easy to swap credential sources in the future (v2 multi-tenant support)
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

/*
 * AWS SDK v3 Client Imports
 * -------------------------
 * We use the modular AWS SDK v3 - each service is a separate package.
 * This keeps our bundle size smaller compared to importing the entire SDK.
 */
const { EC2Client } = require("@aws-sdk/client-ec2");
const { S3Client } = require("@aws-sdk/client-s3");
const { LambdaClient } = require("@aws-sdk/client-lambda");
const { CloudWatchClient } = require("@aws-sdk/client-cloudwatch");
const { CloudWatchLogsClient } = require("@aws-sdk/client-cloudwatch-logs");
const { CostExplorerClient } = require("@aws-sdk/client-cost-explorer");
const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
const { RDSClient } = require("@aws-sdk/client-rds");
const { SNSClient } = require("@aws-sdk/client-sns");
const { IAMClient } = require("@aws-sdk/client-iam");
const { STSClient } = require("@aws-sdk/client-sts");

/*
 * Credential Provider
 * -------------------
 * Reads AWS credentials from environment variables.
 * These are set in Zoho Catalyst's function configuration.
 *
 * In v2, this could be extended to accept user-provided credentials
 * from the request, enabling multi-tenant support.
 */
const getCredentials = () => ({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

/*
 * Configuration Object
 * --------------------
 * Central configuration for AWS regions and Bedrock model.
 *
 * AWS_REGION: Primary region for most services (default: Mumbai)
 * BEDROCK_REGION: Region for Bedrock AI (must be us-east-1 for Claude)
 * BEDROCK_MODEL_ID: Which Claude model to use for the AI assistant
 */
const config = {
    awsRegion: process.env.AWS_REGION || "ap-south-1",
    bedrockRegion: process.env.BEDROCK_REGION || "us-east-1",
    bedrockModelId: process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0"
};

/*
 * Generic Client Factory
 * ----------------------
 * Creates any AWS client with the configured credentials and region.
 * If no region is passed, uses the default from config.
 */
const createClient = (ClientClass, region) => {
    return new ClientClass({
        region: region || config.awsRegion,
        credentials: getCredentials()
    });
};

/*
 * Export client factory functions and config.
 * Each service module imports the factory it needs.
 */
module.exports = {
    // Configuration object (for reading region settings elsewhere)
    config,

    // EC2 - Virtual servers (regional)
    getEC2Client: (region) => createClient(EC2Client, region),

    // S3 - Object storage (regional, but bucket names are global)
    getS3Client: (region) => createClient(S3Client, region),

    // Lambda - Serverless functions (regional)
    getLambdaClient: (region) => createClient(LambdaClient, region),

    // CloudWatch - Metrics and alarms (regional)
    getCloudWatchClient: (region) => createClient(CloudWatchClient, region),

    // CloudWatch Logs - Log groups and streams (regional)
    getLogsClient: (region) => createClient(CloudWatchLogsClient, region),

    // Cost Explorer - Always uses us-east-1 (global service)
    getCostExplorerClient: () => createClient(CostExplorerClient, "us-east-1"),

    // Bedrock - AI service, uses configured Bedrock region (typically us-east-1)
    getBedrockClient: () => createClient(BedrockRuntimeClient, config.bedrockRegion),

    // RDS - Relational databases (regional)
    getRDSClient: (region) => createClient(RDSClient, region),

    // SNS - Notification service (regional)
    getSNSClient: (region) => createClient(SNSClient, region),

    // IAM - Identity management, always us-east-1 (global service)
    getIAMClient: () => createClient(IAMClient, "us-east-1"),

    // STS - Security Token Service (regional, used for identity verification)
    getSTSClient: (region) => createClient(STSClient, region)
};
