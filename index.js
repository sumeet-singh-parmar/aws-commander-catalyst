'use strict';

/**
 * ============================================================================
 * AWS CLOUD COMMANDER - Backend Server
 * ============================================================================
 *
 * Main Express.js application that powers the AWS Cloud Commander Zoho Cliq
 * extension. This server handles all communication between Zoho Cliq and AWS
 * services using the AWS SDK v3.
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * Architecture:
 * - Runs as an Advanced I/O function on Zoho Catalyst
 * - Receives requests from Cliq extension via OAuth 2.0 connector
 * - Routes requests to appropriate AWS service modules
 * - Returns formatted responses for display in Cliq cards/widgets
 *
 * Supported Services:
 * - EC2: Instance management (start, stop, reboot, terminate)
 * - S3: Bucket and object management, file uploads
 * - Lambda: Function listing, invocation, metrics
 * - RDS: Database instance management
 * - CloudWatch: Alarms and metrics monitoring
 * - CloudWatch Logs: Log group browsing and searching
 * - SNS: Topic management and message publishing
 * - Cost Explorer: Spending reports and forecasts
 * - IAM: User and role information
 * - Bedrock: AI assistant powered by Claude
 *
 * ============================================================================
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { minify } = require('html-minifier');
const app = express();

/*
 * Multer Configuration
 * --------------------
 * We use memory storage instead of disk storage because:
 * 1. Catalyst functions have limited disk access
 * 2. Files are immediately uploaded to S3, so no need to persist locally
 * 3. 50MB limit matches our S3 upload limit
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

app.use(express.json());

// Serve Toastify assets from node_modules so frontend can import locally
app.use('/static/toastify', express.static(path.join(__dirname, 'node_modules', 'toastify-js')));

/*
 * Widget Routes - Direct Implementation
 * -------------
 * Interactive dashboard widget operations
 */

// Import widget controllers
const ec2WidgetController = require('./controllers/widget/ec2');
const s3WidgetController = require('./controllers/widget/s3');
const lambdaWidgetController = require('./controllers/widget/lambda');

/*
 * Middleware to allow iframe embedding for widget API routes.
 * Without these headers, browsers would block widget API calls from loading
 * inside Cliq's iframe due to X-Frame-Options and CORS restrictions.
 */
const allowIframeHeaders = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    next();
};

// EC2 Widget Routes
app.get('/widget/ec2', allowIframeHeaders, ec2WidgetController.handleAction);
app.post('/widget/ec2', allowIframeHeaders, ec2WidgetController.handleAction);
app.get('/widget/ec2/metrics', allowIframeHeaders, ec2WidgetController.getMetrics);

// S3 Widget Routes
app.get('/widget/s3/browse', allowIframeHeaders, s3WidgetController.browse);
app.post('/widget/s3/upload', allowIframeHeaders, s3WidgetController.upload);
app.post('/widget/s3/delete', allowIframeHeaders, s3WidgetController.deleteObject);  // POST for delete
app.get('/widget/s3/download', allowIframeHeaders, s3WidgetController.getDownloadUrl);
app.get('/widget/s3/info', allowIframeHeaders, s3WidgetController.getBucketInfo);
app.post('/widget/s3/delete-bucket', allowIframeHeaders, s3WidgetController.deleteBucket);
app.post('/widget/s3/create', allowIframeHeaders, s3WidgetController.createBucket);

// Lambda Widget Routes
app.post('/widget/lambda', allowIframeHeaders, upload.single('zipFile'), lambdaWidgetController.handleLambdaWidget);
app.get('/widget/s3/search', allowIframeHeaders, s3WidgetController.searchObjects);
app.get('/widget/s3/object-info', allowIframeHeaders, s3WidgetController.getObjectInfo);
app.post('/widget/s3/create-folder', allowIframeHeaders, s3WidgetController.createFolder);
app.post('/widget/s3/delete-folder', allowIframeHeaders, s3WidgetController.deleteFolder);
app.get('/widget/s3/detailed-stats', allowIframeHeaders, s3WidgetController.getDetailedBucketStats);

/*
 * AWS Service Modules
 * -------------------
 * Each service module handles operations for one AWS service.
 * They use the aws-clients.js factory for authenticated clients.
 */
const ec2Service = require('./services/ec2');
const s3Service = require('./services/s3');
const lambdaService = require('./services/lambda');
const cloudwatchService = require('./services/cloudwatch');
const logsService = require('./services/logs');
const costService = require('./services/cost');
const rdsService = require('./services/rds');
const snsService = require('./services/sns');
const iamService = require('./services/iam');
const bedrockService = require('./services/bedrock');

/*
 * Utility Imports
 * ---------------
 * - config: AWS region and Bedrock settings
 * - helpers: Response formatting, byte formatting, etc.
 * - pricing: Cost warnings for paid AWS operations
 * - permissions: IAM permission checking
 */
const { config } = require('./utils/aws-clients');
const { successResponse, errorResponse } = require('./utils/helpers');
const { isPaidAction, getCostWarning, getAllPricing } = require('./utils/pricing');
const { checkAllPermissions, checkPermission, validateBedrock, getRequiredPolicy, getAvailableChecks } = require('./utils/permissions');

/*
 * Zoho Catalyst SDK
 * -----------------
 * Used for accessing Catalyst Data Store to persist user credentials.
 * If SDK is unavailable (local testing), falls back to shared AWS credentials.
 */
let catalystApp = null;
try {
    catalystApp = require('zcatalyst-sdk-node');
    console.log('✓ Catalyst SDK loaded successfully');
} catch (e) {
    console.error('✗ Catalyst SDK not available:', e.message);
}

/*
 * ============================================================================
 * CREDENTIAL MANAGEMENT HELPER
 * ============================================================================
 * Fetches user-specific AWS credentials from Catalyst Data Store.
 * All users (Quick Demo and Own Credentials) have records in user_credentials table.
 * Returns null if no credentials found - caller should handle setup redirect.
 */
async function getUserCredentials(userId, catalystInstance) {
    if (!catalystInstance) {
        console.log('Catalyst not available - cannot fetch user credentials');
        return null;
    }
    
    try {
        const datastore = catalystInstance.datastore();
        const table = datastore.table('user_credentials');
        const allCreds = await table.getAllRows();
        const userCred = allCreds.find(row => row.user_id === userId);
        
        if (userCred) {
            console.log(`Credentials found for user: ${userId}`);
            return {
                access_key_id: userCred.access_key_id,
                secret_access_key: userCred.secret_access_key,
                region: userCred.region || 'ap-south-1',
                session_token: userCred.session_token || ''
            };
        } else {
            console.log(`No credentials found for user: ${userId}`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching user credentials:', error);
        return null;
    }
}

/*
 * ============================================================================
 * HEALTH CHECK ENDPOINT
 * ============================================================================
 * Simple GET endpoint that returns server status. Useful for:
 * - Verifying the server is running
 * - Checking configured region settings
 * - Testing connectivity from Cliq extension
 */
app.get('/', (req, res) => {

    console.log("Token Received:", req.headers.authorization);
    
    res.json(successResponse({
        status: 'healthy',
        service: 'AWS CloudOps Handler',
        version: '1.0.0',
        region: config.awsRegion,
        bedrockRegion: config.bedrockRegion
    }));
});

/*
 * ============================================================================
 * MAIN API ROUTER
 * ============================================================================
 * This is the heart of the server - all AWS operations come through here.
 *
 * Request Format:
 * {
 *   "service": "ec2",           // Which AWS service to use
 *   "action": "list",           // What operation to perform
 *   "region": "ap-south-1",     // Region (ignored in v1, hardcoded to Mumbai)
 *   "userId": "123",            // Cliq user ID for logging
 *   "userName": "Nisha",        // For logging purposes
 *   "userEmail": "x@y.com",     // For logging purposes
 *   "consent": true,            // User consents to paid operations (checked in frontend)
 *   "confirm": true,            // User confirms destructive operations
 *   ...params                   // Action-specific parameters
 * }
 *
 * The router:
 * 1. Extracts service and action from request
 * 2. Routes to the appropriate service module (consent checked in frontend)
 * 3. Returns formatted response with optional cost warnings
 */
app.post('/', async (req, res) => {
    try {
        const { service, action, region: _passedRegion, confirm, userId, userName, userEmail, consent, ...params } = req.body;

        /*
         * Region Handling (v1)
         * --------------------
         * In version 1, we ignore the region passed from frontend and use a hardcoded
         * region. This simplifies the demo and avoids confusion. The frontend already
         * has region selection UI - it will be wired up in v2.
         */
        const region = process.env.AWS_REGION || 'ap-south-1';
        
        console.log(`[${new Date().toISOString()}] ${service}/${action} user=${userId || 'anonymous'}`, params);
        
        /*
         * Initialize Catalyst SDK for this request.
         * We need it to access the Data Store for user credentials.
         * If running locally without Catalyst, uses shared AWS credentials.
         */
        let catalystInstance = null;
        try {
            const catalyst = require('zcatalyst-sdk-node');
            catalystInstance = catalyst.initialize(req);
        } catch (e) {
            // Running locally or Catalyst unavailable - uses shared credentials
        }

        /*
         * Consent is now managed in the frontend (Cliq awsprefs database).
         * Backend trusts that frontend has already checked user consent.
         */
        
        let result;
        
        switch (service) {
            /*
             * ==================== EC2 ====================
             * Elastic Compute Cloud - Virtual server management
             * Actions: list, get, start, stop, reboot, status, metrics, summary,
             *          securityGroups, vpcs, subnets
             */
            case 'ec2':
                // Check for user credentials first
                const ec2UserCreds = await getUserCredentials(userId, catalystInstance);
                if (!ec2UserCreds) {
                    result = {
                        success: false,
                        error: 'Please complete setup first',
                        code: 'SETUP_REQUIRED'
                    };
                    break;
                }
                
                // TODO: Pass ec2UserCreds to service calls (requires updating ec2Service methods)
                // For now, service will continue using env variables
                
                switch (action) {
                    case 'list':
                        result = await ec2Service.listInstances(
                            region, 
                            params.filters || {}, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'get':
                        result = await ec2Service.getInstance(params.instanceId, region);
                        break;
                    case 'start':
                        result = await ec2Service.startInstance(params.instanceId, region);
                        break;
                    case 'stop':
                        result = await ec2Service.stopInstance(params.instanceId, region, params.force);
                        break;
                    case 'reboot':
                        result = await ec2Service.rebootInstance(params.instanceId, region);
                        break;
                    case 'status':
                        result = await ec2Service.getInstanceStatus(params.instanceId, region);
                        break;
                    case 'metrics':
                        result = await ec2Service.getInstanceMetrics(
                            params.instanceId, 
                            params.metricName || 'CPUUtilization', 
                            region, 
                            params.hours || 1
                        );
                        break;
                    case 'summary':
                        result = await ec2Service.getInstancesSummary(region);
                        break;
                    case 'securityGroups':
                        result = await ec2Service.listSecurityGroups(
                            region, 
                            params.vpcId, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'vpcs':
                        result = await ec2Service.listVpcs(
                            region, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'subnets':
                        result = await ec2Service.listSubnets(region, params.vpcId);
                        break;
                    default:
                        throw new Error(`Unknown EC2 action: ${action}`);
                }
                break;
            
            /*
             * ==================== S3 ====================
             * Simple Storage Service - Object storage management
             * Actions: listBuckets, getBucket, listObjects, getObject,
             *          getPresignedUrl, deleteObject, search, summary,
             *          getUploadUrl, uploadFromUrl, createBucket, deleteBucket
             */
            case 's3':
                // Check for user credentials
                const s3UserCreds = await getUserCredentials(userId, catalystInstance);
                if (!s3UserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'listBuckets':
                        result = await s3Service.listBuckets(
                            region, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'getBucket':
                        result = await s3Service.getBucketInfo(params.bucket, region);
                        break;
                    case 'listObjects':
                        result = await s3Service.listObjects(
                            params.bucket, 
                            params.prefix || '', 
                            region, 
                            params.maxKeys || 100,
                            null, // credentials (handled internally)
                            params.continuationToken || null,
                            params.page || 1,
                            params.limit || 5
                        );
                        break;
                    case 'getObject':
                        result = await s3Service.getObjectInfo(params.bucket, params.key, region);
                        break;
                    case 'getPresignedUrl':
                        result = await s3Service.getPresignedUrl(params.bucket, params.key, region, params.expiresIn);
                        break;
                    case 'deleteObject':
                        result = await s3Service.deleteObject(params.bucket, params.key, region);
                        break;
                    case 'search':
                        result = await s3Service.searchObjects(params.bucket, params.searchTerm, region, params.maxResults);
                        break;
                    case 'summary':
                        result = await s3Service.getBucketsSummary(region);
                        break;
                    case 'getUploadUrl':
                        result = await s3Service.getUploadPresignedUrl(params.bucket, params.key, params.contentType, region, params.expiresIn);
                        break;
                    case 'uploadFromUrl':
                        result = await s3Service.uploadFromUrl(params.bucket, params.key, params.sourceUrl, params.contentType, region);
                        break;
                    case 'createBucket':
                        result = await s3Service.createBucket(params.bucket, region);
                        break;
                    case 'deleteBucket':
                        result = await s3Service.deleteBucket(params.bucket, region);
                        break;
                    default:
                        throw new Error(`Unknown S3 action: ${action}`);
                }
                break;
            
            /*
             * ==================== LAMBDA ====================
             * Serverless function management
             * Actions: list, get, invoke (requires consent), summary, eventSources
             */
            case 'lambda':
                const lambdaUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!lambdaUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'list':
                        result = await lambdaService.listFunctions(
                            region, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'get':
                        result = await lambdaService.getFunction(params.functionName, region);
                        break;
                    case 'invoke':
                        result = await lambdaService.invokeFunction(
                            params.functionName, 
                            params.payload, 
                            region, 
                            params.invocationType
                        );
                        break;
                    case 'summary':
                        result = await lambdaService.getFunctionsSummary(region);
                        break;
                    case 'eventSources':
                        result = await lambdaService.listEventSourceMappings(params.functionName, region);
                        break;
                    default:
                        throw new Error(`Unknown Lambda action: ${action}`);
                }
                break;
            
            /*
             * ==================== CLOUDWATCH ====================
             * Monitoring and alarms
             * Actions: listAlarms, getActiveAlarms, getAlarm, getAlarmHistory,
             *          getMetrics, createAlarm, deleteAlarm, setAlarmState,
             *          listMetrics, summary
             */
            case 'cloudwatch':
                const cloudwatchUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!cloudwatchUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'listAlarms':
                        result = await cloudwatchService.listAlarms(
                            region, 
                            params.stateValue, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'getActiveAlarms':
                        result = await cloudwatchService.getActiveAlarms(
                            region, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'getAlarm':
                        result = await cloudwatchService.getAlarm(params.alarmName, region);
                        break;
                    case 'getAlarmHistory':
                        result = await cloudwatchService.getAlarmHistory(params.alarmName, region, params.historyType);
                        break;
                    case 'getMetrics':
                        result = await cloudwatchService.getMetrics(
                            params.namespace,
                            params.metricName,
                            params.dimensions,
                            region,
                            params.hours,
                            params.statistic
                        );
                        break;
                    case 'createAlarm':
                        result = await cloudwatchService.createAlarm(params, region);
                        break;
                    case 'deleteAlarm':
                        result = await cloudwatchService.deleteAlarm(params.alarmName, region);
                        break;
                    case 'setAlarmState':
                        result = await cloudwatchService.setAlarmState(params.alarmName, params.state, params.reason, region);
                        break;
                    case 'listMetrics':
                        result = await cloudwatchService.listMetrics(params.namespace, region);
                        break;
                    case 'summary':
                        result = await cloudwatchService.getAlarmsSummary(region);
                        break;
                    default:
                        throw new Error(`Unknown CloudWatch action: ${action}`);
                }
                break;
            
            /*
             * ==================== LOGS ====================
             * CloudWatch Logs - Log group and stream management
             * Actions: listGroups, listStreams, getEvents, filter, recent,
             *          errors, lambdaLogs, ec2Logs, summary
             */
            case 'logs':
                const logsUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!logsUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'listGroups':
                        result = await logsService.listLogGroups(
                            region, 
                            params.prefix, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'listStreams':
                        result = await logsService.listLogStreams(
                            params.logGroupName, 
                            region, 
                            params.orderBy, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'getEvents':
                        result = await logsService.getLogEvents(params.logGroupName, params.logStreamName, region, params);
                        break;
                    case 'filter':
                        result = await logsService.filterLogEvents(params.logGroupName, region, params);
                        break;
                    case 'recent':
                        result = await logsService.getRecentLogs(params.logGroupName, region, params.minutes, params.filterPattern);
                        break;
                    case 'errors':
                        result = await logsService.searchErrors(params.logGroupName, region, params.minutes);
                        break;
                    case 'lambdaLogs':
                        result = await logsService.getLambdaLogs(params.functionName, region, params.minutes);
                        break;
                    case 'ec2Logs':
                        result = await logsService.getEC2Logs(params.instanceId, region, params.minutes);
                        break;
                    case 'summary':
                        result = await logsService.getLogsSummary(region);
                        break;
                    default:
                        throw new Error(`Unknown Logs action: ${action}`);
                }
                break;
            
            /*
             * ==================== COST ====================
             * Cost Explorer - Spending and usage reports (requires consent)
             * Note: Each Cost Explorer API call costs $0.01
             * Actions: getUsage, byPeriod, forecast, monthToDate, comparison,
             *          topServices, trend, byTag
             */
            case 'cost':
                const costUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!costUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'getUsage':
                        result = await costService.getCostAndUsage(
                            params.startDate,
                            params.endDate,
                            params.granularity,
                            params.groupBy
                        );
                        break;
                    case 'byPeriod':
                        result = await costService.getCostsByPeriod(params.period, params.groupBy);
                        break;
                    case 'forecast':
                        result = await costService.getCostForecast(params.startDate, params.endDate, params.granularity);
                        break;
                    case 'monthToDate':
                        result = await costService.getMonthToDateCosts();
                        break;
                    case 'comparison':
                        result = await costService.getCostComparison();
                        break;
                    case 'topServices':
                        result = await costService.getTopServices(params.period, params.limit);
                        break;
                    case 'trend':
                        result = await costService.getDailyCostTrend(params.days);
                        break;
                    case 'byTag':
                        result = await costService.getCostByTag(params.tagKey, params.period);
                        break;
                    default:
                        throw new Error(`Unknown Cost action: ${action}`);
                }
                break;
            
            /*
             * ==================== RDS ====================
             * Relational Database Service - Database management
             * Actions: list, get, start, stop, reboot, clusters, snapshots, summary
             */
            case 'rds':
                const rdsUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!rdsUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'list':
                        result = await rdsService.listDBInstances(
                            region, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'get':
                        result = await rdsService.getDBInstance(params.dbInstanceId, region);
                        break;
                    case 'start':
                        result = await rdsService.startDBInstance(params.dbInstanceId, region);
                        break;
                    case 'stop':
                        result = await rdsService.stopDBInstance(params.dbInstanceId, region, params.snapshotId);
                        break;
                    case 'reboot':
                        result = await rdsService.rebootDBInstance(params.dbInstanceId, region, params.forceFailover);
                        break;
                    case 'clusters':
                        result = await rdsService.listDBClusters(
                            region, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'snapshots':
                        result = await rdsService.listDBSnapshots(
                            region, 
                            params.dbInstanceId, 
                            params.page || 1, 
                            params.limit || 5
                        );
                        break;
                    case 'summary':
                        result = await rdsService.getRDSSummary(region);
                        break;
                    default:
                        throw new Error(`Unknown RDS action: ${action}`);
                }
                break;
            
            /*
             * ==================== SNS ====================
             * Simple Notification Service - Pub/sub messaging
             * Actions: listTopics, getTopic, listSubscriptions, topicSubscriptions,
             *          publish (requires consent), createTopic, deleteTopic,
             *          subscribe, unsubscribe, summary
             */
            case 'sns':
                const snsUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!snsUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'listTopics':
                        result = await snsService.listTopics(region);
                        break;
                    case 'getTopic':
                        result = await snsService.getTopic(params.topicArn, region);
                        break;
                    case 'listSubscriptions':
                        result = await snsService.listSubscriptions(region);
                        break;
                    case 'topicSubscriptions':
                        result = await snsService.listTopicSubscriptions(params.topicArn, region);
                        break;
                    case 'publish':
                        result = await snsService.publish(params.topicArn, params.message, params.subject, region);
                        break;
                    case 'createTopic':
                        result = await snsService.createTopic(params.name, region, params.attributes);
                        break;
                    case 'deleteTopic':
                        result = await snsService.deleteTopic(params.topicArn, region);
                        break;
                    case 'subscribe':
                        result = await snsService.subscribe(params.topicArn, params.protocol, params.endpoint, region);
                        break;
                    case 'unsubscribe':
                        result = await snsService.unsubscribe(params.subscriptionArn, region);
                        break;
                    case 'summary':
                        result = await snsService.getSNSSummary(region);
                        break;
                    default:
                        throw new Error(`Unknown SNS action: ${action}`);
                }
                break;
            
            /*
             * ==================== IAM ====================
             * Identity and Access Management - Users, roles, policies
             * Note: IAM is a global service, always uses us-east-1
             * Actions: listUsers, getUser, listRoles, getRole, listPolicies,
             *          accountSummary, securityStatus, summary
             */
            case 'iam':
                const iamUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!iamUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'listUsers':
                        result = await iamService.listUsers();
                        break;
                    case 'getUser':
                        result = await iamService.getUser(params.userName);
                        break;
                    case 'listRoles':
                        result = await iamService.listRoles();
                        break;
                    case 'getRole':
                        result = await iamService.getRole(params.roleName);
                        break;
                    case 'listPolicies':
                        result = await iamService.listPolicies(params.scope);
                        break;
                    case 'accountSummary':
                        result = await iamService.getAccountSummary();
                        break;
                    case 'securityStatus':
                        result = await iamService.getSecurityStatus();
                        break;
                    case 'summary':
                        result = await iamService.getIAMSummary();
                        break;
                    default:
                        throw new Error(`Unknown IAM action: ${action}`);
                }
                break;
            
            /*
             * ==================== BEDROCK AI ====================
             * AI Assistant powered by Claude (requires consent)
             * Note: Bedrock API calls cost money based on tokens used
             * Actions: chat, chatWithContext, generateCfn, generateIam,
             *          generateLambda, troubleshoot, optimize, reviewArchitecture,
             *          explain, generateCli
             */
            case 'bedrock':
                const bedrockUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!bedrockUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'chat':
                        result = await bedrockService.chat(params.prompt, params);
                        break;
                    case 'chatWithContext':
                        result = await bedrockService.chatWithContext(params.prompt, params.awsContext, params);
                        break;
                    case 'generateCfn':
                        result = await bedrockService.generateCloudFormation(params.description, params);
                        break;
                    case 'generateIam':
                        result = await bedrockService.generateIAMPolicy(params.requirements, params);
                        break;
                    case 'generateLambda':
                        result = await bedrockService.generateLambdaCode(params.description, params.runtime, params);
                        break;
                    case 'troubleshoot':
                        result = await bedrockService.troubleshoot(params.issue, params.context, params);
                        break;
                    case 'optimize':
                        result = await bedrockService.optimizeCosts(params.costData, params);
                        break;
                    case 'reviewArchitecture':
                        result = await bedrockService.reviewArchitecture(params.architecture, params);
                        break;
                    case 'explain':
                        result = await bedrockService.explain(params.concept, params);
                        break;
                    case 'generateCli':
                        result = await bedrockService.generateCLICommand(params.description, params);
                        break;
                    default:
                        throw new Error(`Unknown Bedrock action: ${action}`);
                }
                break;
            
            /*
             * ==================== HEALTH ====================
             * Returns server health status and configuration
             */
            case 'health':
                result = {
                    status: 'healthy',
                    service: 'AWS CloudOps Handler',
                    version: '1.0.0',
                    region: config.awsRegion,
                    bedrockRegion: config.bedrockRegion,
                    timestamp: new Date().toISOString()
                };
                break;
            
            /*
             * ==================== USER CREDENTIALS ====================
             * Secure storage for user's own AWS credentials
             * Uses Catalyst's native encrypted text columns
             */
            case 'user_credentials':
                if (!catalystInstance) {
                    result = {
                        success: false,
                        error: 'Catalyst SDK not available (running locally?)'
                    };
                    break;
                }
                
                const credDatastore = catalystInstance.datastore();
                const credTable = credDatastore.table('user_credentials');
                
                switch (action) {
                    case 'write':
                        // Store or update user credentials
                        const credData = {
                            user_id: userId,
                            access_key_id: params.access_key_id || '',
                            secret_access_key: params.secret_access_key || '',
                            region: params.region || 'ap-south-1',
                            session_token: params.session_token || '',
                            created_at: Date.now(),
                            updated_at: Date.now()
                        };
                        
                        console.log('Storing credentials for user:', userId);
                        
                        // Check if credentials already exist
                        const existingCreds = await credTable.getAllRows();
                        const userCred = existingCreds.find(row => row.user_id === userId);
                        
                        if (userCred) {
                            // Update existing credentials
                            credData.updated_at = Date.now();
                            await credTable.updateRow({
                                ROWID: userCred.ROWID,
                                ...credData
                            });
                            result = {
                                success: true,
                                message: 'Credentials updated successfully'
                            };
                        } else {
                            // Insert new credentials
                            await credTable.insertRow(credData);
                            result = {
                                success: true,
                                message: 'Credentials stored successfully'
                            };
                        }
                        break;
                    
                    case 'read':
                        // Retrieve user credentials
                        console.log('Reading credentials for user:', userId);
                        
                        const allCreds = await credTable.getAllRows();
                        const userCredentials = allCreds.find(row => row.user_id === userId);
                        
                        if (userCredentials) {
                            result = {
                                success: true,
                                data: {
                                    access_key_id: userCredentials.access_key_id,
                                    secret_access_key: userCredentials.secret_access_key,
                                    region: userCredentials.region,
                                    session_token: userCredentials.session_token,
                                    created_at: userCredentials.created_at,
                                    updated_at: userCredentials.updated_at
                                }
                            };
                        } else {
                            result = {
                                success: false,
                                error: 'No credentials found for this user'
                            };
                        }
                        break;
                    
                    case 'delete':
                        // Delete user credentials
                        console.log('Deleting credentials for user:', userId);
                        
                        const credsToDelete = await credTable.getAllRows();
                        const credToDelete = credsToDelete.find(row => row.user_id === userId);
                        
                        if (credToDelete) {
                            await credTable.deleteRow(credToDelete.ROWID);
                            result = {
                                success: true,
                                message: 'Credentials deleted successfully'
                            };
                        } else {
                            result = {
                                success: false,
                                error: 'No credentials found to delete'
                            };
                        }
                        break;
                    
                    case 'check_exists':
                        // Lightweight check - just verify if credentials exist (no AWS call)
                        console.log('Checking if credentials exist for user:', userId);
                        
                        const credsCheck = await credTable.getAllRows();
                        const userCredCheck = credsCheck.find(row => row.user_id === userId);
                        
                        result = {
                            success: true,
                            exists: userCredCheck ? true : false,
                            setup_type: userCredCheck ? 'configured' : 'not_configured'
                        };
                        break;
                    
                    case 'test':
                        // Validate credentials by making an AWS STS GetCallerIdentity call
                        console.log('Testing credentials for user:', userId);
                        
                        const credsToTest = await credTable.getAllRows();
                        const userCredToTest = credsToTest.find(row => row.user_id === userId);
                        
                        if (!userCredToTest) {
                            result = {
                                success: false,
                                error: 'No credentials found for this user'
                            };
                            break;
                        }
                        
                        try {
                            const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
                            
                            const stsClient = new STSClient({
                                region: userCredToTest.region || 'ap-south-1',
                                credentials: {
                                    accessKeyId: userCredToTest.access_key_id,
                                    secretAccessKey: userCredToTest.secret_access_key,
                                    ...(userCredToTest.session_token && { sessionToken: userCredToTest.session_token })
                                }
                            });
                            
                            const identityResult = await stsClient.send(new GetCallerIdentityCommand({}));
                            
                            result = {
                                success: true,
                                message: 'Credentials are valid',
                                identity: {
                                    account: identityResult.Account,
                                    userId: identityResult.UserId,
                                    arn: identityResult.Arn
                                }
                            };
                        } catch (error) {
                            result = {
                                success: false,
                                error: 'Invalid credentials: ' + error.message
                            };
                        }
                        break;
                    
                    case 'copy_shared':
                        // Copy shared env credentials to user's table (for Quick Demo users)
                        console.log('Creating Quick Demo credentials for user:', userId);
                        
                        const sharedCredData = {
                            user_id: userId,
                            access_key_id: process.env.AWS_ACCESS_KEY_ID || '',
                            secret_access_key: process.env.AWS_SECRET_ACCESS_KEY || '',
                            region: process.env.AWS_REGION || 'ap-south-1',
                            session_token: '',
                            created_at: Date.now(),
                            updated_at: Date.now()
                        };
                        
                        // Check if credentials already exist
                        const existingSharedCreds = await credTable.getAllRows();
                        const userSharedCred = existingSharedCreds.find(row => row.user_id === userId);
                        
                        if (userSharedCred) {
                            // Update existing credentials with shared ones
                            sharedCredData.updated_at = Date.now();
                            await credTable.updateRow({
                                ROWID: userSharedCred.ROWID,
                                ...sharedCredData
                            });
                            result = {
                                success: true,
                                message: 'Shared credentials copied successfully (updated)'
                            };
                        } else {
                            // Insert new credentials
                            await credTable.insertRow(sharedCredData);
                            result = {
                                success: true,
                                message: 'Shared credentials copied successfully (created)'
                            };
                        }
                        break;
                    
                    default:
                        result = {
                            success: false,
                            error: 'Unknown user_credentials action. Use: write, read, delete, test, or copy_shared'
                        };
                }
                break;
            
            /*
             * ==================== PRICING INFO ====================
             * Returns information about which operations cost money
             */
            case 'pricing':
                switch (action) {
                    case 'info':
                        result = getAllPricing();
                        break;
                    default:
                        result = getAllPricing();
                }
                break;
            
            /*
             * ==================== PERMISSIONS CHECK ====================
             * Validates IAM permissions for the configured credentials
             * Useful for troubleshooting "Access Denied" errors
             */
            case 'permissions':
                const permissionsUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!permissionsUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'checkAll':
                        result = await checkAllPermissions(region);
                        break;
                    case 'check':
                        if (!params.permission) {
                            throw new Error('permission parameter is required');
                        }
                        result = await checkPermission(params.permission, region);
                        break;
                    case 'validateBedrock':
                        result = await validateBedrock(params.skipInvoke !== false);
                        break;
                    case 'getRequiredPolicy':
                        result = getRequiredPolicy(params.options || {});
                        break;
                    case 'list':
                        result = getAvailableChecks();
                        break;
                    default:
                        // Default to checkAll
                        result = await checkAllPermissions(region);
                }
                break;
            
            /*
             * ==================== DASHBOARD SUMMARY ====================
             * Aggregated view of multiple services for the dashboard widget
             * Fetches EC2, S3, Lambda, and CloudWatch data in parallel
             */
            case 'dashboard':
                // Check for user credentials
                const dashboardUserCreds = await getUserCredentials(userId, catalystInstance);
                if (!dashboardUserCreds) {
                    result = { success: false, error: 'Please complete setup first', code: 'SETUP_REQUIRED' };
                    break;
                }
                
                switch (action) {
                    case 'overview':
                        // Fetch summaries from multiple services in parallel for speed
                        const [ec2Summary, s3Summary, lambdaSummary, alarmsSummary] = await Promise.all([
                            ec2Service.getInstancesSummary(region),
                            s3Service.getBucketsSummary(region),
                            lambdaService.getFunctionsSummary(region),
                            cloudwatchService.getAlarmsSummary(region)
                        ]);

                        result = {
                            ec2: ec2Summary,
                            s3: s3Summary,
                            lambda: lambdaSummary,
                            alarms: alarmsSummary,
                            timestamp: new Date().toISOString()
                        };

                        // Only fetch costs if user has explicitly consented
                        // Cost Explorer API charges $0.01 per request!
                        // Consent is checked in frontend (awsprefs.consentcost)
                        if (consent === true) {
                            try {
                                const costSummary = await costService.getCostsByPeriod('week');
                                result.costs = {
                                    lastWeek: costSummary.totalCostFormatted,
                                    dailyAverage: costSummary.dailyAverageFormatted,
                                    topService: costSummary.byService[0]
                                };
                            } catch (costError) {
                                console.log('Cost fetch skipped:', costError.message);
                                result.costs = { requiresConsent: true };
                            }
                        } else {
                            // No consent - don't call Cost Explorer
                            result.costs = { requiresConsent: true };
                        }
                        break;
                    default:
                        throw new Error(`Unknown Dashboard action: ${action}`);
                }
                break;
            
            default:
                throw new Error(`Unknown service: ${service}`);
        }
        
        // Check if this action costs money and add warning
        const costWarning = getCostWarning(service, action);
        const response = successResponse(result);
        
        if (costWarning) {
            response.costWarning = costWarning;
        }
        
        res.json(response);
        
    } catch (error) {
        console.error(`[ERROR] ${error.message}`, error.stack);
        
        // Parse error for better user feedback
        let errorMessage = error.message;
        let errorCode = 'ERROR';
        let suggestion = null;
        
        // Check for common AWS permission errors
        if (error.name === 'AccessDeniedException' || error.Code === 'AccessDenied' || error.message.includes('AccessDenied')) {
            errorCode = 'ACCESS_DENIED';
            suggestion = `Your IAM user doesn't have permission for this action. Run { "service": "permissions", "action": "checkAll" } to see what permissions are missing.`;
            
            // Check for specific error patterns
            if (error.message.includes('marketplace')) {
                errorCode = 'MARKETPLACE_PERMISSION_REQUIRED';
                suggestion = 'Add aws-marketplace:ViewSubscriptions and aws-marketplace:Subscribe permissions to your IAM policy for Bedrock access.';
            } else if (error.message.includes('use case')) {
                errorCode = 'BEDROCK_USE_CASE_REQUIRED';
                suggestion = 'Go to AWS Bedrock Console → Model access → Submit use case details for Anthropic models.';
            }
        } else if (error.name === 'UnauthorizedAccess' || error.message.includes('not authorized')) {
            errorCode = 'UNAUTHORIZED';
            suggestion = 'Check that your IAM policy includes the required actions for this operation.';
        } else if (error.name === 'ExpiredTokenException' || error.message.includes('expired')) {
            errorCode = 'CREDENTIALS_EXPIRED';
            suggestion = 'Your AWS credentials have expired. Generate new access keys in IAM Console.';
        } else if (error.name === 'InvalidClientTokenId' || error.message.includes('security token')) {
            errorCode = 'INVALID_CREDENTIALS';
            suggestion = 'Your AWS Access Key ID is invalid. Check your credentials in Catalyst environment variables.';
        } else if (error.name === 'SignatureDoesNotMatch') {
            errorCode = 'INVALID_SECRET';
            suggestion = 'Your AWS Secret Access Key is invalid. Check your credentials in Catalyst environment variables.';
        } else if (error.name === 'ResourceNotFoundException') {
            errorCode = 'NOT_FOUND';
            suggestion = 'The requested resource was not found. Check that the resource exists and you have access to it.';
        }
        
        const errorResponse = {
            success: false,
            error: errorMessage,
            code: errorCode,
            timestamp: new Date().toISOString()
        };
        
        if (suggestion) {
            errorResponse.suggestion = suggestion;
            errorResponse.helpAction = '{ "service": "permissions", "action": "checkAll" }';
        }
        
        res.status(500).json(errorResponse);
    }
});

/*
 * ============================================================================
 * FILE UPLOAD ENDPOINT
 * ============================================================================
 * Handles multipart file uploads directly to S3. Supports up to 10 files
 * per request, with a 50MB limit per file.
 *
 * Request format: multipart/form-data
 * - files: The file(s) to upload
 * - metadata: JSON string with { bucket, prefix, userId }
 *
 * This endpoint is used by the Cliq extension's file upload feature.
 */
app.post('/upload', upload.array('files', 10), async (req, res) => {
    try {
        // Parse metadata from the form field (sent as JSON string)
        let metadata = {};
        if (req.body.metadata) {
            try {
                metadata = JSON.parse(req.body.metadata);
            } catch (e) {
                // If not JSON, try to parse as Deluge map format
                console.log('Metadata parse attempt:', req.body.metadata);
            }
        }

        const { userId, bucket, prefix } = metadata;
        const files = req.files;

        console.log(`[${new Date().toISOString()}] FILE UPLOAD user=${userId || 'anonymous'} bucket=${bucket} files=${files ? files.length : 0}`);

        if (!files || files.length === 0) {
            return res.status(400).json(errorResponse('No files uploaded'));
        }

        if (!bucket) {
            return res.status(400).json(errorResponse('Bucket is required'));
        }

        // Check file sizes (50MB limit per file)
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                return res.status(400).json(errorResponse(`File "${file.originalname}" exceeds 50MB limit`));
            }
        }

        // Always use hardcoded region - ignore passed region
        const region = process.env.AWS_REGION || 'ap-south-1';

        // Upload all files to S3
        const uploadResults = [];
        const errors = [];

        for (const file of files) {
            try {
                // Build the S3 key (prefix + original filename)
                let s3Key = file.originalname;
                if (prefix && prefix !== '') {
                    s3Key = prefix + file.originalname;
                }

                console.log(`Uploading: ${file.originalname} (${formatBytes(file.size)}) -> ${bucket}/${s3Key}`);

                const result = await s3Service.uploadObject(
                    bucket,
                    s3Key,
                    file.buffer,
                    file.mimetype,
                    region
                );

                uploadResults.push({
                    fileName: file.originalname,
                    key: s3Key,
                    size: file.size,
                    sizeFormatted: formatBytes(file.size),
                    uploaded: true
                });
            } catch (uploadError) {
                console.error(`Failed to upload ${file.originalname}:`, uploadError.message);
                errors.push({
                    fileName: file.originalname,
                    error: uploadError.message
                });
            }
        }

        // Return results
        const response = {
            bucket: bucket,
            prefix: prefix || '',
            totalFiles: files.length,
            successCount: uploadResults.length,
            failCount: errors.length,
            uploaded: uploadResults,
            errors: errors.length > 0 ? errors : undefined
        };

        res.json(successResponse(response));

    } catch (error) {
        console.error(`[UPLOAD ERROR] ${error.message}`, error.stack);
        res.status(500).json(errorResponse(error.message));
    }
});

/*
 * Helper function to format file sizes in human-readable format.
 * Duplicated here because we need it before requiring helpers in some cases.
 */
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/*
 * ============================================================================
 * WIDGET HTML PAGES
 * ============================================================================
 * These endpoints serve HTML pages for Zoho Cliq web_view widgets.
 * The dashboard widget is rendered in an iframe within Cliq.
 *
 * Important: We use the allowIframeHeaders middleware (defined above)
 * to allow iframe embedding since Cliq renders widgets inside iframes.
 */

const fs = require('fs');

/* Serve the dashboard widget's CSS stylesheet */
app.get('/widget/styles.css', allowIframeHeaders, (req, res) => {
    const cssPath = path.join(__dirname, 'widget_pages', 'styles.css');
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(cssPath);
});

/*
 * Dashboard Widget - Loader Page
 * ------------------------------
 * Returns the dashboard HTML with a loading spinner immediately.
 * The page then fetches actual data via JavaScript from /widget/dashboard/data.
 * This approach makes the widget feel fast - users see something instantly.
 */
app.get('/widget/dashboard', allowIframeHeaders, (req, res) => {
    // Always use hardcoded region for v1
    const region = process.env.AWS_REGION || 'ap-south-1';

    // Send the loader HTML template immediately (fast response)
    const htmlPath = path.join(__dirname, 'widget_pages', 'dashboard_loader.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/\{\{REGION\}\}/g, region);

    // Minify HTML on-the-fly for faster loading
    const minified = minify(html, {
        minifyCSS: true,
        minifyJS: true,
        collapseWhitespace: true,
        removeComments: true,
        removeAttributeQuotes: true,
        removeEmptyAttributes: true
    });

    res.setHeader('Content-Type', 'text/html');
    // No cache for HTML - always fresh
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(minified);
});

/*
 * Dashboard CSS - Cached for 24 hours
 * -----------------------------------
 * Separated stylesheet for faster repeat loads
 */
app.get('/widget/dashboard.css', allowIframeHeaders, (req, res) => {
    const cssPath = path.join(__dirname, 'widget_pages', 'dashboard.css');
    let css = fs.readFileSync(cssPath, 'utf8');

    // Minify CSS on-the-fly
    const minified = minify(`<style>${css}</style>`, {
        minifyCSS: true,
        collapseWhitespace: true,
        removeComments: true
    }).replace('<style>', '').replace('</style>', '');

    res.setHeader('Content-Type', 'text/css');
    // Cache for 10 days - CSS changes rarely
    // res.setHeader('Cache-Control', 'public, max-age=864000');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(minified);
});

/*
 * Custom Modal Styles - Cached for 10 days
 * ----------------------------------------
 * New premium UI styles for modals
 */
app.get('/widget/custom-modal-styles.css', allowIframeHeaders, (req, res) => {
    const cssPath = path.join(__dirname, 'widget_pages', 'custom-modal-styles.css');
    
    try {
        let css = fs.readFileSync(cssPath, 'utf8');

        // Minify CSS on-the-fly
        const minified = minify(`<style>${css}</style>`, {
            minifyCSS: true,
            collapseWhitespace: true,
            removeComments: true
        }).replace('<style>', '').replace('</style>', '');

        res.setHeader('Content-Type', 'text/css');
        // res.setHeader('Cache-Control', 'public, max-age=864000');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(minified);
    } catch (error) {
        console.error('Error serving custom-modal-styles.css:', error);
        res.status(404).send('CSS file not found');
    }
});

/*
 * Dashboard JavaScript - Cached for 24 hours
 * ------------------------------------------
 * Separated logic for faster repeat loads
 */
app.get('/widget/dashboard.js', allowIframeHeaders, (req, res) => {
    const region = process.env.AWS_REGION || 'ap-south-1';
    
    const jsPath = path.join(__dirname, 'widget_pages', 'dashboard.js');
    let js = fs.readFileSync(jsPath, 'utf8');
    
    // Replace region placeholder
    js = js.replace(/\{\{REGION\}\}/g, region);

    // Minify JS on-the-fly
    const minified = minify(`<script>${js}</script>`, {
        minifyJS: true,
        collapseWhitespace: true,
        removeComments: true
    }).replace('<script>', '').replace('</script>', '');

    res.setHeader('Content-Type', 'application/javascript');
    // Cache for 10 days - JS changes rarely
    // res.setHeader('Cache-Control', 'public, max-age=864000');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(minified);
});

/*
 * Dashboard Widget - Data Endpoint
 * --------------------------------
 * Returns JSON data for the dashboard. Called by the loader page's JavaScript.
 * Fetches data from multiple AWS services in parallel for speed.
 *
 * This is where the heavy lifting happens - EC2, S3, Lambda, RDS, CloudWatch,
 * Logs, and Cost data are all fetched and formatted for display.
 */
app.get('/widget/dashboard/data', allowIframeHeaders, async (req, res) => {
    try {
        // Always use hardcoded region for v1
        const region = process.env.AWS_REGION || 'ap-south-1';

        // ============================================
        // CHECK AWS CREDENTIALS - MUST BE SET UP BY USER
        // ============================================
        // Get userId from query params (REQUIRED)
        const userId = req.query.userId;
        
        console.log('[Dashboard] Request received:', {
            userId: userId,
            queryParams: req.query,
            hasCatalystApp: !!catalystApp
        });
        
        // No userId? Can't proceed
        if (!userId) {
            console.log('[Dashboard] ERROR: No userId provided in request');
            return res.status(400).json({
                success: false,
                error: 'User ID not provided',
                errorCode: 'NO_USER_ID',
                message: 'Cannot load dashboard without user identification.',
                action: {
                    title: 'Set up AWS Credentials',
                    description: 'Run /aws command to set up your AWS credentials',
                    command: '/aws'
                }
            });
        }
        
        // Check user's credentials in Catalyst Data Store
        let hasUserCredentials = false;
        
        if (catalystApp) {
            try {
                console.log('[Dashboard] Initializing Catalyst SDK...');
                const catalystInstance = catalystApp.initialize(req);
                const datastore = catalystInstance.datastore();
                const credTable = datastore.table('user_credentials');
                
                console.log('[Dashboard] Fetching credentials from table...');
                
                // Get all rows and find the user's credentials
                const allCreds = await credTable.getAllRows();
                const userCred = allCreds.find(row => row.user_id === userId);
                
                console.log('[Dashboard] Query result:', {
                    totalRows: allCreds.length,
                    foundForUser: !!userCred,
                    userId: userId
                });
                
                // If record exists for this user, consider credentials set up
                if (userCred) {
                    hasUserCredentials = true;
                    console.log(`[Dashboard] ✓ Found credentials for user ${userId}`);
                } else {
                    console.log(`[Dashboard] ✗ No credentials record found for user ${userId}`);
                }
            } catch (err) {
                console.error('[Dashboard] Credentials check FAILED:', {
                    error: err.message,
                    stack: err.stack,
                    userId: userId
                });
            }
        } else {
            console.error('[Dashboard] ERROR: Catalyst SDK (catalystApp) is NULL or undefined');
        }
        
        // User MUST have credentials set up - NO fallback
        if (!hasUserCredentials) {
            console.log(`[Dashboard] REJECTING: User ${userId} has not set up credentials`);
            return res.status(401).json({
                success: false,
                error: 'AWS credentials not configured',
                errorCode: 'NO_CREDENTIALS',
                message: 'You have not set up your AWS credentials yet.',
                action: {
                    title: 'Set up AWS Credentials',
                    description: 'Run /aws command to complete your setup',
                    command: '/aws'
                }
            });
        }
        
        console.log(`[Dashboard] ✓ Credentials validated for user ${userId}, proceeding...`);

        // Fetch data from all services in parallel for maximum speed
        const [ec2Data, s3Data, lambdaData, alarmsData, rdsData, logGroups, lambdaMetrics] = await Promise.all([
            ec2Service.listInstances(region, {}, 1, 10000).then(r => Array.isArray(r) ? r : (r.instances || [])).catch(() => []),
            s3Service.listBuckets(region, 1, 10000).then(r => Array.isArray(r) ? r : (r.buckets || [])).catch(() => []),
            lambdaService.listFunctions(region, 1, 10000).then(r => Array.isArray(r) ? r : (r.functions || [])).catch(() => []),
            cloudwatchService.listAlarms(region, null, 1, 10000).then(r => {
                if (Array.isArray(r)) return r;
                if (r && typeof r === 'object' && Array.isArray(r.alarms)) return r.alarms;
                console.error('[Dashboard] Unexpected alarms response structure:', typeof r, r);
                return [];
            }).catch((err) => {
                console.error('[Dashboard] Error fetching alarms:', err);
                return [];
            }),
            rdsService.listDBInstances(region, 1, 10000).then(r => Array.isArray(r) ? r : (r.dbInstances || [])).catch(() => []),
            logsService.listLogGroups(region, null, 1, 10000).then(r => Array.isArray(r) ? r : (r.logGroups || [])).catch(() => []),
            cloudwatchService.getLambdaInvocations(region, 24).catch(() => null)
        ]);

        // Ensure all data arrays are actually arrays (safety check)
        // Log if we get unexpected data types for debugging
        if (!Array.isArray(alarmsData)) {
            console.error('[Dashboard] alarmsData is not an array:', typeof alarmsData, alarmsData);
        }
        const ec2Array = Array.isArray(ec2Data) ? ec2Data : (ec2Data?.instances || []);
        const s3Array = Array.isArray(s3Data) ? s3Data : (s3Data?.buckets || []);
        const lambdaArray = Array.isArray(lambdaData) ? lambdaData : (lambdaData?.functions || []);
        const alarmsArray = Array.isArray(alarmsData) ? alarmsData : (alarmsData?.alarms || []);
        const rdsArray = Array.isArray(rdsData) ? rdsData : (rdsData?.dbInstances || []);
        const logsArray = Array.isArray(logGroups) ? logGroups : (logGroups?.logGroups || []);

        // ============================================
        // PROCESS EC2 DATA - Full details
        // ============================================
        const ec2Total = ec2Array.length;
        let ec2Running = 0;
        let ec2Stopped = 0;
        let ec2Pending = 0;

        for (const inst of ec2Array) {
            if (inst.state === 'running') ec2Running++;
            else if (inst.state === 'stopped') ec2Stopped++;
            else if (inst.state === 'pending' || inst.state === 'stopping') ec2Pending++;
        }

        // Build detailed instances HTML
        let instancesHtml = '';
        if (ec2Array.length > 0) {
            // Sort: running first, then pending, then stopped
            const sortedInstances = [...ec2Array].sort((a, b) => {
                const order = { running: 0, pending: 1, stopping: 2, stopped: 3 };
                return (order[a.state] || 4) - (order[b.state] || 4);
            });

            for (let i = 0; i < Math.min(10, sortedInstances.length); i++) {
                const inst = sortedInstances[i];
                const name = inst.name || inst.id || 'Unnamed';
                const instanceId = inst.id || '';
                const type = inst.type || 'N/A';
                const state = inst.state || 'unknown';
                const az = inst.az || inst.availabilityZone || '';
                const privateIp = inst.privateIp || '';
                const publicIp = inst.publicIp || '';
                const launchTime = inst.launchTime ? new Date(inst.launchTime).toLocaleDateString() : '';

                const statusClass = state === 'running' ? 'running' : (state === 'pending' || state === 'stopping' ? 'pending' : 'stopped');
                const stateLabel = state.charAt(0).toUpperCase() + state.slice(1);

                instancesHtml += `<div class="instance-row" data-instance-id="${instanceId}" data-instance-state="${state}">
                    <span class="instance-status ${statusClass}"></span>
                    <div class="instance-info">
                        <div class="instance-name">${name}</div>
                        <div class="instance-meta">
                            <span class="instance-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${az}</span>
                            ${privateIp ? `<span class="instance-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>${privateIp}</span>` : ''}
                            ${publicIp ? `<span class="instance-meta-item public-ip"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>${publicIp}</span>` : ''}
                        </div>
                    </div>
                    <div class="instance-right">
                        <span class="instance-type">${type}</span>
                        <div class="instance-badges-row">
                            <span class="instance-state-badge ${statusClass}">${stateLabel}</span>
                            <button class="instance-actions-btn" onclick="showEC2ActionsMenu('${instanceId}', '${name.replace(/'/g, "\\'")}', '${state}')" title="Actions">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>`;
            }
        } else {
            instancesHtml = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div><div class="empty-title">No EC2 Instances</div><div class="empty-text">No instances found in ${region}</div></div>`;
        }

        // ============================================
        // PROCESS S3 DATA - With more details
        // ============================================
        const s3Count = s3Array.length;
        let s3Html = '';
        if (s3Array.length > 0) {
            // Show all buckets initially (pagination handled by frontend)
            for (let i = 0; i < s3Array.length; i++) {
                const bucket = s3Array[i];
                const name = bucket.name || bucket.Name || 'Unknown';
                const escapedNameForAttr = (name || '').replace(/"/g, '&quot;');
                const escapedNameForJs = (name || '').replace(/'/g, "\\'");
                const created = bucket.createdFormatted || '';
                const bucketRegion = bucket.region || 'Global';
                const size = bucket.totalSizeFormatted ? bucket.totalSizeFormatted : '<span class="s3-placeholder">–</span>';
                const objects = bucket.totalObjects !== undefined ? bucket.totalObjects.toLocaleString() : '<span class="s3-placeholder">—</span>';

                s3Html += '<div class="s3-row" data-bucket-name="' + escapedNameForAttr + '" data-bucket-region="' + bucketRegion + '">' +
                    '<div class="s3-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>' +
                    '<div class="s3-info clickable" onclick="browseS3Bucket(\'' + escapedNameForJs + '\')">' +
                        '<div class="s3-name">' + name + '</div>' +
                        '<div class="s3-meta">' +
                            '<span class="s3-meta-item s3-region">' + bucketRegion + '</span>' +
                            '<span class="s3-meta-item s3-objects"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="s3-objects-count">' + objects + '</span> objects</span>' +
                            '<span class="s3-meta-item s3-size"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span class="s3-size-text">' + size + '</span></span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="s3-actions">' +
                        '<button class="s3-action-btn s3-action-text" onclick="event.stopPropagation(); showDetailedBucketStats(\'' + escapedNameForJs + '\', \'' + bucketRegion + '\');" title="View Details"><i class="bi bi-bar-chart-line"></i> Stats</button>' +
                        '<button class="s3-action-btn s3-action-icon" onclick="event.stopPropagation(); showBucketInfo(\'' + escapedNameForJs + '\', \'' + bucketRegion + '\');" title="Bucket Info"><i class="bi bi-info-circle"></i></button>' +
                        '<button class="s3-action-btn danger s3-action-icon" onclick="event.stopPropagation(); deleteBucket(\'' + escapedNameForJs + '\', \'' + bucketRegion + '\');" title="Delete Bucket"><i class="bi bi-trash"></i></button>' +
                    '</div>' +
                '</div>';
            }
        } else {
            s3Html = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div class="empty-title">No S3 Buckets</div><div class="empty-text">No buckets found</div></div>`;
        }

        // ============================================
        // PROCESS LAMBDA DATA - Full details
        // ============================================
        const lambdaCount = lambdaArray.length;
        let lambdaHtml = '';
        if (lambdaArray.length > 0) {
            for (let i = 0; i < Math.min(8, lambdaArray.length); i++) {
                const fn = lambdaArray[i];
                const name = fn.name || fn.FunctionName || 'Unknown';
                const runtime = fn.runtime || 'N/A';
                const memory = fn.memory || 'N/A';
                const timeout = fn.timeout || 'N/A';
                const codeSize = fn.codeSizeFormatted || '';
                const lastModified = fn.lastModified ? new Date(fn.lastModified).toLocaleDateString() : '';
                const handler = fn.handler || '';
                const description = fn.description || '';
                const escapedName = (name || '').replace(/'/g, "\\'");

                lambdaHtml += `<div class="lambda-row">
                    <div class="lambda-header">
                        <div class="lambda-name-wrapper">
                            <div class="lambda-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
                            <div class="lambda-name-info">
                                <span class="lambda-name">${name}</span>
                                ${description ? `<span class="lambda-desc">${description.substring(0, 50)}${description.length > 50 ? '...' : ''}</span>` : ''}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="lambda-runtime">${runtime}</span>
                            <button class="instance-actions-btn" onclick="showLambdaActionsMenu('${escapedName}')" title="Actions" style="margin-left: 8px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="lambda-meta">
                        <span class="lambda-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>${memory} MB</span>
                        <span class="lambda-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${timeout}s</span>
                        ${codeSize ? `<span class="lambda-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>${codeSize}</span>` : ''}
                        ${lastModified ? `<span class="lambda-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${lastModified}</span>` : ''}
                    </div>
                </div>`;
            }
        } else {
            lambdaHtml = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div><div class="empty-title">No Lambda Functions</div><div class="empty-text">No functions in ${region}</div></div>`;
        }

        // ============================================
        // PROCESS ALARMS DATA - All states
        // ============================================
        const alarmsTotal = alarmsArray.length;
        let alarmsOk = 0;
        let alarmsActive = 0;
        let alarmsInsufficient = 0;
        let alarmsHtml = '';

        for (const alarm of alarmsArray) {
            const state = alarm.state || '';
            if (state === 'OK') alarmsOk++;
            else if (state === 'ALARM') alarmsActive++;
            else if (state === 'INSUFFICIENT_DATA') alarmsInsufficient++;
        }

        if (alarmsArray.length > 0) {
            // Sort: ALARM first, then INSUFFICIENT_DATA, then OK
            const sortedAlarms = [...alarmsArray].sort((a, b) => {
                const order = { ALARM: 0, INSUFFICIENT_DATA: 1, OK: 2 };
                return (order[a.state] || 3) - (order[b.state] || 3);
            });

            for (let i = 0; i < Math.min(8, sortedAlarms.length); i++) {
                const alarm = sortedAlarms[i];
                const name = alarm.name || 'Unknown';
                const state = alarm.state || 'UNKNOWN';
                const metric = alarm.metric || '';
                const namespace = alarm.namespace || '';
                const threshold = alarm.threshold || '';
                const comparisonOperator = alarm.comparisonOperator || '';
                const statusClass = state === 'ALARM' ? 'alarm' : (state === 'INSUFFICIENT_DATA' ? 'insufficient' : 'ok');
                const rowClass = state === 'ALARM' ? 'critical' : '';
                const stateText = state === 'INSUFFICIENT_DATA' ? 'NO DATA' : state;

                let thresholdText = '';
                if (threshold && comparisonOperator) {
                    const opSymbol = comparisonOperator.includes('Greater') ? '>' : '<';
                    thresholdText = `${opSymbol} ${threshold}`;
                }

                alarmsHtml += `<div class="alarm-row ${rowClass}">
                    <span class="alarm-status ${statusClass}"></span>
                    <div class="alarm-info">
                        <div class="alarm-name">${name}</div>
                        <div class="alarm-meta">${metric}${namespace ? ' • ' + namespace : ''}${thresholdText ? ' • ' + thresholdText : ''}</div>
                    </div>
                    <span class="alarm-state ${statusClass}">${stateText}</span>
                </div>`;
            }
        } else {
            alarmsHtml = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div><div class="empty-title">No Alarms</div><div class="empty-text">No CloudWatch alarms configured</div></div>`;
        }

        // ============================================
        // PROCESS RDS DATA
        // ============================================
        const rdsCount = rdsArray.length;
        let rdsRunning = 0;
        let rdsHtml = '';

        if (rdsArray.length > 0) {
            for (let i = 0; i < Math.min(5, rdsArray.length); i++) {
                const db = rdsArray[i];
                const name = db.dbInstanceId || db.DBInstanceIdentifier || 'Unknown';
                const engine = db.engine || '';
                const engineVersion = db.engineVersion || '';
                const status = db.status || db.DBInstanceStatus || 'unknown';
                const instanceClass = db.instanceClass || db.DBInstanceClass || '';
                const storage = db.allocatedStorage || '';
                const endpoint = db.endpoint || '';

                if (status === 'available') rdsRunning++;

                const statusClass = status === 'available' ? 'running' : (status === 'stopped' ? 'stopped' : 'pending');

                rdsHtml += `<div class="rds-row">
                    <span class="rds-status ${statusClass}"></span>
                    <div class="rds-info">
                        <div class="rds-name">${name}</div>
                        <div class="rds-meta">
                            <span class="rds-meta-item">${engine} ${engineVersion}</span>
                            ${instanceClass ? `<span class="rds-meta-item">${instanceClass}</span>` : ''}
                            ${storage ? `<span class="rds-meta-item">${storage} GB</span>` : ''}
                        </div>
                    </div>
                    <span class="rds-state-badge ${statusClass}">${status}</span>
                </div>`;
            }
        } else {
            rdsHtml = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></div><div class="empty-title">No RDS Databases</div><div class="empty-text">No databases in ${region}</div></div>`;
        }

        // ============================================
        // PROCESS LOG GROUPS
        // ============================================
        const logsCount = logsArray.length;
        let logsHtml = '';

        if (logsArray.length > 0) {
            // Sort by most recent activity (stored bytes as proxy)
            const sortedLogs = [...logsArray].sort((a, b) => (b.storedBytes || 0) - (a.storedBytes || 0));

            for (let i = 0; i < Math.min(6, sortedLogs.length); i++) {
                const log = sortedLogs[i];
                const name = log.name || log.logGroupName || 'Unknown';
                const storedBytes = log.storedBytesFormatted || log.storedBytes || '0 B';
                const retentionDays = log.retentionDays || log.retentionInDays || 'Never expires';
                const createdTime = log.createdFormatted || '';

                // Shorten Lambda log names
                let displayName = name;
                if (name.startsWith('/aws/lambda/')) {
                    displayName = name.replace('/aws/lambda/', 'λ ');
                } else if (name.startsWith('/aws/')) {
                    displayName = name.replace('/aws/', '');
                }

                logsHtml += `<div class="log-row">
                    <div class="log-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
                    <div class="log-info">
                        <div class="log-name">${displayName}</div>
                        <div class="log-meta">
                            <span class="log-meta-item">${storedBytes}</span>
                            <span class="log-meta-item">Retention: ${retentionDays}${typeof retentionDays === 'number' ? ' days' : ''}</span>
                        </div>
                    </div>
                </div>`;
            }
        } else {
            logsHtml = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="empty-title">No Log Groups</div><div class="empty-text">No CloudWatch log groups</div></div>`;
        }

        // ============================================
        // DETERMINE HEALTH STATUS
        // ============================================
        let healthStatus = 'healthy';
        let healthText = 'All Systems OK';
        let healthIssues = [];

        if (alarmsActive > 0) {
            healthStatus = 'critical';
            healthIssues.push(`${alarmsActive} alarm${alarmsActive > 1 ? 's' : ''} active`);
        }
        if (ec2Stopped > 0 && ec2Running === 0 && ec2Total > 0) {
            if (healthStatus !== 'critical') healthStatus = 'warning';
            healthIssues.push('All EC2 stopped');
        }
        if (alarmsInsufficient > alarmsOk && alarmsTotal > 0) {
            if (healthStatus === 'healthy') healthStatus = 'warning';
            healthIssues.push(`${alarmsInsufficient} alarms no data`);
        }

        if (healthIssues.length > 0) {
            healthText = healthIssues.join(' • ');
        }

        // ============================================
        // FETCH COST DATA
        // ============================================
        let todayCost = '$0.00';
        let monthCost = '$0.00';
        let dailyAvg = '$0.00';
        let costError = false;
        let topServices = [];

        try {
            const costData = await costService.getCostsByPeriod('month');
            if (costData) {
                monthCost = costData.totalCostFormatted || '$0.00';
                dailyAvg = costData.dailyAverageFormatted || '$0.00';
                todayCost = costData.todayCostFormatted || dailyAvg;
                topServices = costData.byService || [];
            }
        } catch (e) {
            costError = true;
        }

        // Build top services HTML
        let topServicesHtml = '';
        if (topServices.length > 0) {
            for (let i = 0; i < Math.min(5, topServices.length); i++) {
                const svc = topServices[i];
                const serviceName = svc.service || 'Unknown';
                const cost = svc.costFormatted || '$0.00';
                const percentage = svc.percentage || 0;

                topServicesHtml += `<div class="cost-service-row">
                    <div class="cost-service-info">
                        <span class="cost-service-name">${serviceName}</span>
                        <div class="cost-service-bar"><div class="cost-service-bar-fill" style="width: ${Math.min(100, percentage)}%"></div></div>
                    </div>
                    <span class="cost-service-value">${cost}</span>
                </div>`;
            }
        }

        // ============================================
        // BUILD COST DONUT CHART SVG
        // ============================================
        let costDonutHtml = '';
        if (topServices.length > 0 && !costError) {
            const colors = ['#FF9900', '#10B981', '#8B5CF6', '#3B82F6', '#EC4899', '#F59E0B'];
            let currentAngle = 0;
            const total = topServices.reduce((sum, s) => sum + (s.cost || 0), 0);

            let paths = '';
            let legends = '';

            for (let i = 0; i < Math.min(5, topServices.length); i++) {
                const svc = topServices[i];
                const percentage = total > 0 ? (svc.cost / total) * 100 : 0;
                const angle = (percentage / 100) * 360;
                const color = colors[i % colors.length];

                // SVG arc calculation
                const startAngle = currentAngle;
                const endAngle = currentAngle + angle;
                const largeArc = angle > 180 ? 1 : 0;

                const startX = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180);
                const startY = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180);
                const endX = 50 + 40 * Math.cos((endAngle - 90) * Math.PI / 180);
                const endY = 50 + 40 * Math.sin((endAngle - 90) * Math.PI / 180);

                if (angle > 0.5) {
                    paths += `<path d="M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArc} 1 ${endX} ${endY} Z" fill="${color}" opacity="0.9"/>`;
                }

                currentAngle += angle;

                // Legend item
                const serviceName = (svc.service || 'Other').replace('Amazon ', '').replace('AWS ', '');
                legends += `<div class="donut-legend-item"><span class="donut-legend-color" style="background:${color}"></span><span class="donut-legend-label">${serviceName}</span><span class="donut-legend-value">${percentage.toFixed(0)}%</span></div>`;
            }

            costDonutHtml = `
                <div class="donut-chart-container">
                    <div class="donut-chart">
                        <svg viewBox="0 0 100 100">
                            ${paths}
                            <circle cx="50" cy="50" r="25" fill="var(--bg-card)"/>
                        </svg>
                        <div class="donut-center">
                            <div class="donut-center-value">${monthCost}</div>
                            <div class="donut-center-label">This Month</div>
                        </div>
                    </div>
                    <div class="donut-legend">${legends}</div>
                </div>`;
        }

        // ============================================
        // BUILD LAMBDA INVOCATIONS CHART
        // ============================================
        let lambdaChartHtml = '';
        let lambdaTotalInvocations = 0;
        let lambdaTotalErrors = 0;
        let lambdaAvgDuration = 0;
        let lambdaErrorRate = 0;

        if (lambdaMetrics && lambdaMetrics.datapoints && lambdaMetrics.datapoints.length > 0) {
            lambdaTotalInvocations = lambdaMetrics.totalInvocations;
            lambdaTotalErrors = lambdaMetrics.totalErrors;
            lambdaAvgDuration = lambdaMetrics.avgDuration;
            lambdaErrorRate = lambdaMetrics.errorRate;

            const datapoints = lambdaMetrics.datapoints;
            const maxInvocations = Math.max(...datapoints.map(d => d.invocations), 1);
            const chartWidth = 280;
            const chartHeight = 80;
            const padding = 4;

            // Build smooth area chart with line
            let areaPoints = `${padding},${chartHeight - padding} `;
            let linePoints = '';
            let dots = '';
            let errorDots = '';

            for (let i = 0; i < datapoints.length; i++) {
                const dp = datapoints[i];
                const x = padding + (i / (datapoints.length - 1 || 1)) * (chartWidth - 2 * padding);
                const y = (chartHeight - padding) - (dp.invocations / maxInvocations) * (chartHeight - 2 * padding);

                areaPoints += `${x},${y} `;
                linePoints += (i === 0 ? '' : ' ') + `${x},${y}`;

                // Add dots for each data point
                if (dp.errors > 0) {
                    errorDots += `<circle cx="${x}" cy="${y}" r="4" fill="#FF5252" stroke="#1C2D3F" stroke-width="2"/>`;
                } else if (dp.invocations > 0) {
                    dots += `<circle cx="${x}" cy="${y}" r="3" fill="#8B5CF6" stroke="#1C2D3F" stroke-width="1.5" opacity="0.9"/>`;
                }
            }
            areaPoints += `${chartWidth - padding},${chartHeight - padding}`;

            // Get time labels
            const firstTime = new Date(datapoints[0].timestamp).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
            const lastTime = new Date(datapoints[datapoints.length - 1].timestamp).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });

            lambdaChartHtml = `
                <div class="lambda-activity-container">
                    <div class="lambda-activity-header">
                        <div class="lambda-activity-stat main">
                            <div class="lambda-activity-stat-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            </div>
                            <div class="lambda-activity-stat-content">
                                <div class="lambda-activity-stat-value">${lambdaTotalInvocations.toLocaleString()}</div>
                                <div class="lambda-activity-stat-label">Total Invocations</div>
                            </div>
                        </div>
                        <div class="lambda-activity-stats-row">
                            <div class="lambda-activity-mini-stat">
                                <span class="lambda-activity-mini-value ${lambdaTotalErrors > 0 ? 'error' : ''}">${lambdaTotalErrors}</span>
                                <span class="lambda-activity-mini-label">Errors</span>
                            </div>
                            <div class="lambda-activity-mini-stat">
                                <span class="lambda-activity-mini-value">${lambdaAvgDuration}<small>ms</small></span>
                                <span class="lambda-activity-mini-label">Avg Duration</span>
                            </div>
                            <div class="lambda-activity-mini-stat">
                                <span class="lambda-activity-mini-value ${parseFloat(lambdaErrorRate) > 1 ? 'error' : ''}">${lambdaErrorRate}<small>%</small></span>
                                <span class="lambda-activity-mini-label">Error Rate</span>
                            </div>
                        </div>
                    </div>
                    <div class="lambda-activity-chart">
                        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="lambdaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.4"/>
                                    <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0.05"/>
                                </linearGradient>
                            </defs>
                            <polygon points="${areaPoints}" fill="url(#lambdaGradient)"/>
                            <polyline points="${linePoints}" fill="none" stroke="#8B5CF6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            ${dots}
                            ${errorDots}
                        </svg>
                    </div>
                    <div class="lambda-activity-footer">
                        <span>${firstTime}</span>
                        <span class="lambda-activity-footer-label">Last 24 hours</span>
                        <span>${lastTime}</span>
                    </div>
                </div>`;
        } else {
            lambdaChartHtml = `<div class="empty-state small"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div><div class="empty-title">No Lambda Activity</div><div class="empty-text">No invocations in the last 24 hours</div></div>`;
        }

        // ============================================
        // RETURN JSON DATA
        // ============================================
        res.json({
            success: true,
            region: region,
            health: {
                status: healthStatus,
                text: healthText
            },
            ec2: {
                total: ec2Total,
                running: ec2Running,
                stopped: ec2Stopped,
                pending: ec2Pending,
                html: instancesHtml
            },
            s3: {
                count: s3Count,
                html: s3Html
            },
            lambda: {
                count: lambdaCount,
                html: lambdaHtml,
                chartHtml: lambdaChartHtml
            },
            alarms: {
                total: alarmsTotal,
                ok: alarmsOk,
                active: alarmsActive,
                insufficient: alarmsInsufficient,
                hasActive: alarmsActive > 0,
                html: alarmsHtml
            },
            rds: {
                count: rdsCount,
                running: rdsRunning,
                html: rdsHtml
            },
            logs: {
                count: logsCount,
                html: logsHtml
            },
            cost: {
                error: costError,
                today: todayCost,
                month: monthCost,
                dailyAvg: dailyAvg,
                topServicesHtml: topServicesHtml,
                donutHtml: costDonutHtml
            }
        });

    } catch (error) {
        console.error('[Dashboard] Dashboard data error:', error);
        console.error('[Dashboard] Error stack:', error.stack);
        console.error('[Dashboard] Error details:', {
            name: error.name,
            message: error.message,
            alarmsData: typeof alarmsData,
            alarmsArray: typeof alarmsArray
        });
        
        // Check if it's an AWS credentials error
        const errorName = error.name || '';
        const errorMessage = error.message || '';
        
        // Invalid/wrong AWS credentials
        if (errorName === 'InvalidClientTokenId' || errorMessage.includes('security token')) {
            return res.status(401).json({
                success: false,
                error: 'Invalid AWS Access Key ID',
                errorCode: 'INVALID_CREDENTIALS',
                message: 'Your AWS Access Key ID is invalid or incorrect.',
                details: 'Please update your credentials with valid AWS keys.',
                action: {
                    title: 'Update Credentials',
                    description: 'Run /aws to update your AWS credentials',
                    command: '/aws'
                }
            });
        }
        
        // Wrong secret key
        if (errorName === 'SignatureDoesNotMatch') {
            return res.status(401).json({
                success: false,
                error: 'Invalid AWS Secret Access Key',
                errorCode: 'INVALID_CREDENTIALS',
                message: 'Your AWS Secret Access Key is invalid or incorrect.',
                details: 'The signature doesn\'t match. Please check your secret key.',
                action: {
                    title: 'Update Credentials',
                    description: 'Run /aws to update your AWS credentials',
                    command: '/aws'
                }
            });
        }
        
        // Expired credentials
        if (errorName === 'ExpiredTokenException' || errorMessage.includes('expired')) {
            return res.status(401).json({
                success: false,
                error: 'AWS Credentials Expired',
                errorCode: 'EXPIRED_CREDENTIALS',
                message: 'Your AWS credentials have expired.',
                details: 'Please generate new access keys from AWS IAM Console.',
                action: {
                    title: 'Update Credentials',
                    description: 'Run /aws to update your AWS credentials',
                    command: '/aws'
                }
            });
        }
        
        // Access denied (valid credentials but no permissions)
        if (errorName === 'AccessDeniedException' || errorMessage.includes('AccessDenied')) {
            return res.status(403).json({
                success: false,
                error: 'AWS Access Denied',
                errorCode: 'ACCESS_DENIED',
                message: 'Your AWS credentials don\'t have sufficient permissions.',
                details: 'Add required IAM permissions to your AWS user.',
                action: {
                    title: 'Check Permissions',
                    description: 'Run /aws permissions to see what\'s missing',
                    command: '/aws permissions'
                }
            });
        }
        
        // Generic error
        res.status(500).json({ 
            success: false, 
            error: error.message,
            errorCode: 'SERVER_ERROR'
        });
    }
});

/*
 * Export the Express app for Zoho Catalyst.
 * Catalyst will import this and handle the HTTP server setup.
 */
module.exports = app;
