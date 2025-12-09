'use strict';

/**
 * ============================================================================
 * EC2 WIDGET CONTROLLER
 * ============================================================================
 * 
 * Handles EC2 operations for the interactive dashboard widget.
 * Provides instance management and metrics retrieval.
 * 
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 * ============================================================================
 */

const ec2Service = require('../../services/ec2');
const { successResponse, errorResponse } = require('../../utils/helpers');

// Helper to verify user credentials
async function verifyUserCredentials(userId, catalystApp, req) {
    if (!userId) {
        return { error: 'NO_USER_ID', message: 'User ID is required' };
    }

    try {
        const catalystInstance = catalystApp.initialize(req);
        const credDatastore = catalystInstance.datastore();
        const credTable = credDatastore.table('user_credentials');
        
        const allCreds = await credTable.getAllRows();
        const userCredentials = allCreds.find(row => row.user_id === userId);
        
        if (!userCredentials) {
            return { error: 'NO_CREDENTIALS', message: 'AWS credentials not configured' };
        }
        
        return { valid: true };
    } catch (error) {
        console.error('Credential verification failed:', error);
        return { error: 'VERIFICATION_FAILED', message: 'Failed to verify credentials' };
    }
}

/**
 * Handle EC2 Instance Actions
 * Actions: start, stop, reboot, terminate, consoleOutput, createSnapshot, createImage, listVolumes
 */
async function handleAction(req, res) {
    const action = req.query.action;

    console.log(`[Widget EC2] Action: ${action}`);

    // Handle GET requests (query-based actions)
    if (req.method === 'GET') {
        const { instanceId, userId, region } = req.query;

        if (!userId || !region) {
            return res.status(400).json(errorResponse('Missing required parameters'));
        }

        // Verify credentials
        const catalystApp = require('zcatalyst-sdk-node');
        const credCheck = await verifyUserCredentials(userId, catalystApp, req);
        
        if (credCheck.error) {
            return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
        }

        try {
            let result;

            switch (action) {
                case 'consoleOutput':
                    if (!instanceId) return res.status(400).json(errorResponse('Instance ID required'));
                    result = await ec2Service.getConsoleOutput(instanceId, region);
                    return res.json(successResponse(result));

                case 'listVolumes':
                    if (!instanceId) return res.status(400).json(errorResponse('Instance ID required'));
                    result = await ec2Service.listInstanceVolumes(instanceId, region);
                    return res.json(successResponse({ volumes: result }));

                case 'listElasticIps':
                    result = await ec2Service.listElasticIps(region);
                    return res.json(successResponse({ elasticIps: result }));

                case 'listInstanceTypes':
                    result = await ec2Service.listInstanceTypes(region);
                    return res.json(successResponse({ instanceTypes: result }));

                case 'getSecurityGroups':
                    if (!instanceId) return res.status(400).json(errorResponse('Instance ID required'));
                    result = await ec2Service.getInstanceSecurityGroups(instanceId, region);
                    return res.json(successResponse({ securityGroups: result }));

                default:
                    return res.status(400).json(errorResponse(`Unknown GET action: ${action}`));
            }
        } catch (error) {
            console.error(`[Widget EC2] ${action} failed:`, error);
            return res.status(500).json(errorResponse(error.message || `Failed to ${action}`));
        }
    }

    // Handle POST requests (mutation actions)
    const { instanceId, volumeId, description, name, noReboot, allocationId, associationId, newInstanceType, userId, region, groupId, rule } = req.body;

    // Validate required parameters
    if (!userId || !region) {
        return res.status(400).json(errorResponse('User ID and region are required'));
    }

    // Verify user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await verifyUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        let result;
        let message;

        switch (action) {
            case 'start':
                if (!instanceId) return res.status(400).json(errorResponse('Instance ID required'));
                result = await ec2Service.startInstance(instanceId, region);
                message = `Instance ${instanceId} is starting`;
                break;

            case 'stop':
                if (!instanceId) return res.status(400).json(errorResponse('Instance ID required'));
                result = await ec2Service.stopInstance(instanceId, region);
                message = `Instance ${instanceId} is stopping`;
                break;

            case 'reboot':
                if (!instanceId) return res.status(400).json(errorResponse('Instance ID required'));
                result = await ec2Service.rebootInstance(instanceId, region);
                message = `Instance ${instanceId} is rebooting`;
                break;

            case 'terminate':
                if (!instanceId) return res.status(400).json(errorResponse('Instance ID required'));
                result = await ec2Service.terminateInstance(instanceId, region);
                message = `Instance ${instanceId} is terminating`;
                break;

            case 'createSnapshot':
                if (!volumeId) return res.status(400).json(errorResponse('Volume ID required'));
                result = await ec2Service.createSnapshot(volumeId, description, region);
                message = `Snapshot ${result.snapshotId} creation started`;
                break;

            case 'createImage':
                if (!instanceId || !name) return res.status(400).json(errorResponse('Instance ID and AMI name required'));
                result = await ec2Service.createImage(instanceId, name, description, region, noReboot);
                message = `AMI ${result.imageId} creation started`;
                break;

            case 'allocateElasticIp':
                result = await ec2Service.allocateElasticIp(region);
                message = `Elastic IP ${result.publicIp} allocated`;
                break;

            case 'associateElasticIp':
                if (!instanceId || !allocationId) return res.status(400).json(errorResponse('Instance ID and Allocation ID required'));
                result = await ec2Service.associateElasticIp(instanceId, allocationId, region);
                message = `Elastic IP associated with instance ${instanceId}`;
                break;

            case 'disassociateElasticIp':
                if (!associationId) return res.status(400).json(errorResponse('Association ID required'));
                result = await ec2Service.disassociateElasticIp(associationId, region);
                message = `Elastic IP disassociated successfully`;
                break;

            case 'modifyInstanceType':
                if (!instanceId || !newInstanceType) return res.status(400).json(errorResponse('Instance ID and new instance type required'));
                result = await ec2Service.modifyInstanceType(instanceId, newInstanceType, region);
                message = `Instance type changed to ${newInstanceType}`;
                break;

            case 'addInboundRule':
                if (!groupId || !rule) return res.status(400).json(errorResponse('Group ID and rule required'));
                result = await ec2Service.addInboundRule(groupId, rule, region);
                message = `Inbound rule added to security group`;
                break;

            case 'addOutboundRule':
                if (!groupId || !rule) return res.status(400).json(errorResponse('Group ID and rule required'));
                result = await ec2Service.addOutboundRule(groupId, rule, region);
                message = `Outbound rule added to security group`;
                break;

            case 'removeInboundRule':
                if (!groupId || !rule) return res.status(400).json(errorResponse('Group ID and rule required'));
                result = await ec2Service.removeInboundRule(groupId, rule, region);
                message = `Inbound rule removed from security group`;
                break;

            case 'removeOutboundRule':
                if (!groupId || !rule) return res.status(400).json(errorResponse('Group ID and rule required'));
                result = await ec2Service.removeOutboundRule(groupId, rule, region);
                message = `Outbound rule removed from security group`;
                break;

            default:
                return res.status(400).json(errorResponse(`Unknown action: ${action}`));
        }

        console.log(`[Widget EC2] ${action} successful:`, result);
        
        return res.json(successResponse({
            ...result,
            message: message
        }));

    } catch (error) {
        console.error(`[Widget EC2] ${action} failed:`, error);
        
        // Handle specific AWS errors
        if (error.name === 'InvalidInstanceID.NotFound') {
            return res.status(404).json(errorResponse('Instance not found', 'INSTANCE_NOT_FOUND'));
        }
        
        if (error.name === 'IncorrectInstanceState') {
            return res.status(400).json(errorResponse('Instance is in incorrect state for this action', 'INCORRECT_STATE'));
        }
        
        if (error.name === 'UnauthorizedOperation' || error.message?.includes('not authorized')) {
            return res.status(403).json(errorResponse('You don\'t have permission for this action. Check your AWS IAM permissions.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || `Failed to ${action}`, 'ACTION_FAILED'));
    }
}

/**
 * Get EC2 Instance Metrics
 * Returns CloudWatch metrics for CPU, Network In/Out, Disk Ops
 */
async function getMetrics(req, res) {
    const { instanceId, userId, region, timeRange } = req.query;

    console.log(`[Widget EC2 Metrics] Instance: ${instanceId}, TimeRange: ${timeRange}, User: ${userId}`);

    // Validate required parameters
    if (!instanceId) {
        return res.status(400).json(errorResponse('Instance ID is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Verify user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await verifyUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        // Parse time range (1h, 6h, 24h, 7d)
        let hours = 1;
        if (timeRange === '6h') hours = 6;
        else if (timeRange === '24h') hours = 24;
        else if (timeRange === '7d') hours = 168;

        // Fetch metrics in parallel
        const [cpuMetrics, networkInMetrics, networkOutMetrics] = await Promise.all([
            ec2Service.getInstanceMetrics(instanceId, 'CPUUtilization', region, hours),
            ec2Service.getInstanceMetrics(instanceId, 'NetworkIn', region, hours),
            ec2Service.getInstanceMetrics(instanceId, 'NetworkOut', region, hours)
        ]);

        // Format data for charts
        const formatMetricData = (metric) => {
            if (!metric || !metric.datapoints || metric.datapoints.length === 0) {
                return [];
            }
            
            return metric.datapoints.map(dp => ({
                timestamp: dp.Timestamp,
                value: dp.Average || dp.Sum || 0
            })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        };

        const response = {
            instanceId: instanceId,
            timeRange: timeRange,
            metrics: {
                cpu: {
                    label: 'CPU Utilization (%)',
                    data: formatMetricData(cpuMetrics),
                    current: cpuMetrics?.current?.value || 0,
                    average: cpuMetrics?.current?.average || 0,
                    max: cpuMetrics?.current?.max || 0
                },
                networkIn: {
                    label: 'Network In (Bytes)',
                    data: formatMetricData(networkInMetrics),
                    current: networkInMetrics?.current?.value || 0,
                    average: networkInMetrics?.current?.average || 0,
                    max: networkInMetrics?.current?.max || 0
                },
                networkOut: {
                    label: 'Network Out (Bytes)',
                    data: formatMetricData(networkOutMetrics),
                    current: networkOutMetrics?.current?.value || 0,
                    average: networkOutMetrics?.current?.average || 0,
                    max: networkOutMetrics?.current?.max || 0
                }
            }
        };

        console.log(`[Widget EC2 Metrics] Success - CPU points: ${response.metrics.cpu.data.length}`);
        
        return res.json(successResponse(response));

    } catch (error) {
        console.error('[Widget EC2 Metrics] Failed:', error);
        
        if (error.name === 'InvalidInstanceID.NotFound') {
            return res.status(404).json(errorResponse('Instance not found'));
        }
        
        if (error.name === 'UnauthorizedOperation') {
            return res.status(403).json(errorResponse('Insufficient permissions to view metrics', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to fetch metrics'));
    }
}

/**
 * Get EC2 Instance Details
 * Returns comprehensive information about an EC2 instance
 */
async function getInstanceInfo(req, res) {
    const { instanceId, userId, region } = req.query;

    console.log(`[Widget EC2 Info] Instance: ${instanceId}, User: ${userId}`);

    // Validate required parameters
    if (!instanceId) {
        return res.status(400).json(errorResponse('Instance ID is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Verify user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await verifyUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        // Get instance details
        const instances = await ec2Service.describeInstances([instanceId], region);
        
        if (!instances || instances.length === 0) {
            return res.status(404).json(errorResponse('Instance not found'));
        }

        const instance = instances[0];

        // Get brief CPU metrics for mini chart
        const cpuMetrics = await ec2Service.getInstanceMetrics(instanceId, 'CPUUtilization', region, 1).catch(() => null);

        const response = {
            instanceId: instance.id,
            name: instance.name,
            type: instance.type,
            state: instance.state,
            ami: instance.ami,
            keyPair: instance.keyPair,
            availabilityZone: instance.availabilityZone,
            vpcId: instance.vpcId,
            subnetId: instance.subnetId,
            privateIp: instance.privateIp,
            publicIp: instance.publicIp,
            securityGroups: instance.securityGroups || [],
            tags: instance.tags || [],
            launchTime: instance.launchTime,
            platform: instance.platform,
            monitoring: instance.monitoring,
            cpuMetrics: cpuMetrics ? {
                current: cpuMetrics.current?.value || 0,
                average: cpuMetrics.current?.average || 0,
                max: cpuMetrics.current?.max || 0
            } : null
        };

        console.log(`[Widget EC2 Info] Success - Retrieved info for ${instance.name || instanceId}`);
        
        return res.json(successResponse(response));

    } catch (error) {
        console.error('[Widget EC2 Info] Failed:', error);
        
        if (error.name === 'InvalidInstanceID.NotFound') {
            return res.status(404).json(errorResponse('Instance not found'));
        }
        
        if (error.name === 'UnauthorizedOperation') {
            return res.status(403).json(errorResponse('Insufficient permissions to view instance details', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to fetch instance info'));
    }
}

module.exports = {
    handleAction,
    getMetrics,
    getInstanceInfo
};

