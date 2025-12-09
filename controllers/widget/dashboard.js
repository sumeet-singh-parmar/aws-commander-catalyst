'use strict';

/**
 * Dashboard Widget Controller
 * Handles the main dashboard data endpoint
 */

const { successResponse, errorResponse } = require('../../utils/helpers');

async function getDashboardData(req, res, ec2Service, s3Service, lambdaService, cloudwatchService, logsService, costService, rdsService) {
    const userId = req.query.userId;
    const region = process.env.AWS_REGION || 'ap-south-1';
    let hasUserCredentials = false;
    let userCredentials = null;
    let catalystInstance = null;
    
    console.log(`[Dashboard] Request received: { userId: '${userId}', queryParams: ${JSON.stringify(req.query)} }`);

    try {
        const catalystApp = require('zcatalyst-sdk-node');
        if (!catalystApp) {
            console.error('[Dashboard] ERROR: Catalyst SDK not available');
            throw new Error('Catalyst SDK not available. Please deploy to Catalyst.');
        }
        
        console.log('[Dashboard] Initializing Catalyst SDK...');
        catalystInstance = catalystApp.initialize(req);

        if (!userId) {
            console.log('[Dashboard] REJECTING: No userId provided');
            return res.status(400).json(errorResponse('No user ID provided. Please ensure the widget URL includes userId.', 'NO_USER_ID', {
                title: "Setup Required",
                description: "Cannot load dashboard without user identification. Please ensure the widget URL includes your user ID.",
                command: "/aws"
            }));
        }

        const credDatastore = catalystInstance.datastore();
        const credTable = credDatastore.table('user_credentials');
        
        console.log(`[Dashboard] Executing query: SELECT * FROM user_credentials WHERE user_id = '${userId}'`);
        const allCreds = await credTable.getAllRows();
        userCredentials = allCreds.find(row => row.user_id === userId);

        if (userCredentials) {
            hasUserCredentials = true;
            console.log(`[Dashboard] ✓ Found credentials for user ${userId}`);
        } else {
            console.log(`[Dashboard] REJECTING: User ${userId} has not set up credentials`);
            return res.status(401).json(errorResponse('AWS credentials not configured', 'NO_CREDENTIALS', {
                title: "AWS Credentials Not Set Up",
                description: "You have not set up your AWS credentials yet.",
                command: "/aws"
            }));
        }
        
        console.log(`[Dashboard] Fetching AWS data for region: ${region}`);

        // Fetch data from all AWS services in parallel
        const [ec2Data, s3Data, lambdaData, alarmsData, logsData, costData, rdsData] = await Promise.all([
            ec2Service.listInstances(region).catch(err => {
                console.error('[Dashboard] EC2 fetch failed:', err);
                return [];
            }),
            s3Service.listBuckets(region, 1, 10000).then(r => r.buckets || r).catch(err => {
                console.error('[Dashboard] S3 fetch failed:', err);
                return [];
            }),
            lambdaService.listFunctions(region, 1, 10000).then(r => r.functions || r).catch(err => {
                console.error('[Dashboard] Lambda fetch failed:', err);
                return [];
            }),
            cloudwatchService.listAlarms(region, null, 1, 10000).then(r => r.alarms || r).catch(err => {
                console.error('[Dashboard] CloudWatch fetch failed:', err);
                return [];
            }),
            logsService.listLogGroups(region, null, 1, 10000).then(r => r.logGroups || r).catch(err => {
                console.error('[Dashboard] Logs fetch failed:', err);
                return [];
            }),
            costService.getCurrentMonthCost(region).catch(err => {
                console.error('[Dashboard] Cost fetch failed:', err);
                return { error: true, message: err.message };
            }),
            rdsService.listInstances(region).catch(err => {
                console.error('[Dashboard] RDS fetch failed:', err);
                return [];
            })
        ]);

        console.log(`[Dashboard] Data fetched - EC2: ${ec2Data.length}, S3: ${s3Data.length}, Lambda: ${lambdaData.length}`);

        // Process data and return
        const dashboardData = {
            region: region,
            timestamp: new Date().toISOString(),
            ec2: {
                total: ec2Data.length,
                running: ec2Data.filter(i => i.state === 'running').length,
                stopped: ec2Data.filter(i => i.state === 'stopped').length,
                data: ec2Data
            },
            s3: {
                count: s3Data.length,
                data: s3Data
            },
            lambda: {
                count: lambdaData.length,
                data: lambdaData
            },
            alarms: {
                total: alarmsData.alarms?.length || 0,
                active: alarmsData.alarms?.filter(a => a.state === 'ALARM').length || 0,
                ok: alarmsData.alarms?.filter(a => a.state === 'OK').length || 0,
                data: alarmsData.alarms || []
            },
            logs: {
                count: logsData.length,
                data: logsData
            },
            rds: {
                count: rdsData.length,
                data: rdsData
            },
            cost: costData.error ? {
                error: true,
                message: costData.message
            } : costData,
            health: {
                status: 'healthy',
                text: 'All Systems Operational'
            }
        };

        return res.json(successResponse(dashboardData));

    } catch (error) {
        console.error('[Dashboard] Credentials check FAILED:', { error: error.message, stack: error.stack, userId });
        
        if (error.name === 'InvalidClientTokenId' || error.message?.includes('security token')) {
            return res.status(401).json(errorResponse('Invalid AWS credentials', 'INVALID_CREDENTIALS', {
                title: "Invalid AWS Credentials",
                description: "Your AWS Access Key ID or Secret Access Key is invalid.",
                command: "/aws",
                details: "Please verify your credentials in AWS IAM Console."
            }));
        }
        
        if (error.name === 'ExpiredToken' || error.message?.includes('expired')) {
            return res.status(401).json(errorResponse('AWS credentials have expired', 'CREDENTIALS_EXPIRED', {
                title: "Credentials Expired",
                description: "Your AWS credentials have expired.",
                command: "/aws",
                details: "Generate new access keys from AWS IAM Console."
            }));
        }
        
        if (error.name === 'UnauthorizedOperation' || error.name === 'AccessDenied') {
            return res.status(403).json(errorResponse('Insufficient AWS permissions', 'ACCESS_DENIED', {
                title: "Access Denied",
                description: "Your AWS credentials lack required permissions.",
                command: "/aws permissions",
                details: "Add necessary IAM permissions to your user or role."
            }));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to fetch dashboard data'));
    }
}

module.exports = {
    getDashboardData
};

