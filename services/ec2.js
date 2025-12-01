'use strict';

/**
 * ============================================================================
 * EC2 SERVICE MODULE
 * ============================================================================
 *
 * Handles all Amazon EC2 (Elastic Compute Cloud) operations.
 * EC2 provides resizable virtual servers in the cloud.
 *
 * Features:
 * - List all EC2 instances with detailed information
 * - Get individual instance details
 * - Start, stop, reboot instances
 * - View instance status checks
 * - Fetch CloudWatch metrics (CPU, network, etc.)
 * - List security groups, VPCs, and subnets
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    DescribeInstancesCommand,
    StartInstancesCommand,
    StopInstancesCommand,
    RebootInstancesCommand,
    DescribeInstanceStatusCommand,
    DescribeVolumesCommand,
    DescribeSecurityGroupsCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

const { GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");

const { getEC2Client, getCloudWatchClient } = require("../utils/aws-clients");
const { getNameFromTags, getEC2StateEmoji } = require("../utils/helpers");

/**
 * List all EC2 instances in the specified region.
 * Optionally filter by state or specific instance IDs.
 *
 * @param {string} region - AWS region
 * @param {object} filters - Optional filters (state, instanceIds)
 * @returns {Array} List of instance objects with formatted data
 */
async function listInstances(region, filters = {}) {
    const client = getEC2Client(region);

    const params = {};

    // Apply state filter (e.g., 'running', 'stopped')
    if (filters.state) {
        params.Filters = params.Filters || [];
        params.Filters.push({
            Name: "instance-state-name",
            Values: Array.isArray(filters.state) ? filters.state : [filters.state]
        });
    }

    // Filter by specific instance IDs
    if (filters.instanceIds) {
        params.InstanceIds = filters.instanceIds;
    }

    const response = await client.send(new DescribeInstancesCommand(params));

    // Flatten reservations into a single array of instances
    const instances = [];
    for (const reservation of response.Reservations || []) {
        for (const instance of reservation.Instances || []) {
            instances.push({
                id: instance.InstanceId,
                name: getNameFromTags(instance.Tags),
                type: instance.InstanceType,
                state: instance.State?.Name,
                stateEmoji: getEC2StateEmoji(instance.State?.Name),
                privateIp: instance.PrivateIpAddress || null,
                publicIp: instance.PublicIpAddress || null,
                az: instance.Placement?.AvailabilityZone,
                vpcId: instance.VpcId,
                subnetId: instance.SubnetId,
                launchTime: instance.LaunchTime,
                platform: instance.Platform || "Linux",
                architecture: instance.Architecture,
                keyName: instance.KeyName,
                amiId: instance.ImageId,
                securityGroups: (instance.SecurityGroups || []).map(sg => ({
                    id: sg.GroupId,
                    name: sg.GroupName
                })),
                tags: instance.Tags || []
            });
        }
    }

    return instances;
}

/**
 * Get detailed information for a single instance.
 *
 * @param {string} instanceId - The EC2 instance ID (e.g., 'i-0abc123def456')
 * @param {string} region - AWS region
 * @returns {object} Instance details
 */
async function getInstance(instanceId, region) {
    const instances = await listInstances(region, { instanceIds: [instanceId] });

    if (instances.length === 0) {
        throw new Error(`Instance ${instanceId} not found`);
    }

    return instances[0];
}

/**
 * Start a stopped EC2 instance.
 * The instance will transition from 'stopped' to 'pending' to 'running'.
 *
 * @param {string} instanceId - The instance to start
 * @param {string} region - AWS region
 * @returns {object} State change information
 */
async function startInstance(instanceId, region) {
    const client = getEC2Client(region);

    const response = await client.send(new StartInstancesCommand({
        InstanceIds: [instanceId]
    }));

    const stateChange = response.StartingInstances?.[0];

    return {
        instanceId: instanceId,
        previousState: stateChange?.PreviousState?.Name,
        currentState: stateChange?.CurrentState?.Name,
        message: `Instance ${instanceId} is starting`
    };
}

/**
 * Stop a running EC2 instance.
 * Use force=true to forcefully stop (like pulling the power plug).
 *
 * @param {string} instanceId - The instance to stop
 * @param {string} region - AWS region
 * @param {boolean} force - Force stop without graceful shutdown
 * @returns {object} State change information
 */
async function stopInstance(instanceId, region, force = false) {
    const client = getEC2Client(region);

    const response = await client.send(new StopInstancesCommand({
        InstanceIds: [instanceId],
        Force: force
    }));

    const stateChange = response.StoppingInstances?.[0];

    return {
        instanceId: instanceId,
        previousState: stateChange?.PreviousState?.Name,
        currentState: stateChange?.CurrentState?.Name,
        message: `Instance ${instanceId} is stopping`
    };
}

/**
 * Reboot an EC2 instance.
 * This is equivalent to pressing the reset button - instance stays running.
 *
 * @param {string} instanceId - The instance to reboot
 * @param {string} region - AWS region
 * @returns {object} Confirmation message
 */
async function rebootInstance(instanceId, region) {
    const client = getEC2Client(region);

    await client.send(new RebootInstancesCommand({
        InstanceIds: [instanceId]
    }));

    return {
        instanceId: instanceId,
        message: `Instance ${instanceId} is rebooting`
    };
}

/**
 * Get instance status checks.
 * EC2 runs two types of checks: system status and instance status.
 *
 * @param {string} instanceId - The instance to check
 * @param {string} region - AWS region
 * @returns {object} Status check details
 */
async function getInstanceStatus(instanceId, region) {
    const client = getEC2Client(region);

    const response = await client.send(new DescribeInstanceStatusCommand({
        InstanceIds: [instanceId],
        IncludeAllInstances: true
    }));

    const status = response.InstanceStatuses?.[0];

    if (!status) {
        throw new Error(`Status not found for instance ${instanceId}`);
    }

    return {
        instanceId: instanceId,
        instanceState: status.InstanceState?.Name,
        systemStatus: {
            status: status.SystemStatus?.Status,
            details: status.SystemStatus?.Details?.map(d => ({
                name: d.Name,
                status: d.Status
            }))
        },
        instanceStatus: {
            status: status.InstanceStatus?.Status,
            details: status.InstanceStatus?.Details?.map(d => ({
                name: d.Name,
                status: d.Status
            }))
        },
        az: status.AvailabilityZone
    };
}

/**
 * Get CloudWatch metrics for an EC2 instance.
 * Common metrics: CPUUtilization, NetworkIn, NetworkOut, DiskReadOps, etc.
 *
 * @param {string} instanceId - The instance to get metrics for
 * @param {string} metricName - Which metric (default: CPUUtilization)
 * @param {string} region - AWS region
 * @param {number} hours - How many hours of data to fetch
 * @returns {object} Metric datapoints and summary
 */
async function getInstanceMetrics(instanceId, metricName, region, hours = 1) {
    const client = getCloudWatchClient(region);

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Adjust period based on time range for reasonable data density
    let period = 300; // 5 minutes for short ranges
    if (hours > 24) period = 3600; // 1 hour for day+ ranges
    if (hours > 168) period = 86400; // 1 day for week+ ranges

    const response = await client.send(new GetMetricStatisticsCommand({
        Namespace: "AWS/EC2",
        MetricName: metricName,
        Dimensions: [
            { Name: "InstanceId", Value: instanceId }
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: period,
        Statistics: ["Average", "Maximum", "Minimum"]
    }));

    // Sort datapoints chronologically
    const datapoints = (response.Datapoints || []).sort((a, b) =>
        new Date(a.Timestamp) - new Date(b.Timestamp)
    );

    return {
        instanceId: instanceId,
        metricName: metricName,
        period: period,
        unit: response.Datapoints?.[0]?.Unit || 'N/A',
        datapoints: datapoints.map(dp => ({
            timestamp: dp.Timestamp,
            average: dp.Average,
            maximum: dp.Maximum,
            minimum: dp.Minimum
        })),
        summary: datapoints.length > 0 ? {
            latest: datapoints[datapoints.length - 1]?.Average,
            avgOverPeriod: datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / datapoints.length,
            max: Math.max(...datapoints.map(dp => dp.Maximum || 0)),
            min: Math.min(...datapoints.map(dp => dp.Minimum || Infinity))
        } : null
    };
}

/**
 * Get a summary of all EC2 instances in the region.
 * Groups instances by state, type, and availability zone.
 *
 * @param {string} region - AWS region
 * @returns {object} Summary statistics
 */
async function getInstancesSummary(region) {
    const instances = await listInstances(region);

    const summary = {
        total: instances.length,
        byState: {},
        byType: {},
        byAz: {}
    };

    for (const instance of instances) {
        // Count by state (running, stopped, etc.)
        summary.byState[instance.state] = (summary.byState[instance.state] || 0) + 1;

        // Count by instance type (t2.micro, m5.large, etc.)
        summary.byType[instance.type] = (summary.byType[instance.type] || 0) + 1;

        // Count by availability zone
        summary.byAz[instance.az] = (summary.byAz[instance.az] || 0) + 1;
    }

    return summary;
}

/**
 * List security groups in the region.
 * Optionally filter by VPC.
 *
 * @param {string} region - AWS region
 * @param {string} vpcId - Optional VPC ID to filter by
 * @returns {Array} List of security groups
 */
async function listSecurityGroups(region, vpcId = null) {
    const client = getEC2Client(region);

    const params = {};
    if (vpcId) {
        params.Filters = [{ Name: "vpc-id", Values: [vpcId] }];
    }

    const response = await client.send(new DescribeSecurityGroupsCommand(params));

    return (response.SecurityGroups || []).map(sg => ({
        id: sg.GroupId,
        name: sg.GroupName,
        description: sg.Description,
        vpcId: sg.VpcId,
        inboundRules: (sg.IpPermissions || []).length,
        outboundRules: (sg.IpPermissionsEgress || []).length
    }));
}

/**
 * List VPCs (Virtual Private Clouds) in the region.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of VPCs
 */
async function listVpcs(region) {
    const client = getEC2Client(region);

    const response = await client.send(new DescribeVpcsCommand({}));

    return (response.Vpcs || []).map(vpc => ({
        id: vpc.VpcId,
        cidrBlock: vpc.CidrBlock,
        isDefault: vpc.IsDefault,
        state: vpc.State,
        name: getNameFromTags(vpc.Tags)
    }));
}

/**
 * List subnets in the region.
 * Optionally filter by VPC.
 *
 * @param {string} region - AWS region
 * @param {string} vpcId - Optional VPC ID to filter by
 * @returns {Array} List of subnets
 */
async function listSubnets(region, vpcId = null) {
    const client = getEC2Client(region);

    const params = {};
    if (vpcId) {
        params.Filters = [{ Name: "vpc-id", Values: [vpcId] }];
    }

    const response = await client.send(new DescribeSubnetsCommand(params));

    return (response.Subnets || []).map(subnet => ({
        id: subnet.SubnetId,
        vpcId: subnet.VpcId,
        az: subnet.AvailabilityZone,
        cidrBlock: subnet.CidrBlock,
        availableIps: subnet.AvailableIpAddressCount,
        isDefault: subnet.DefaultForAz,
        name: getNameFromTags(subnet.Tags)
    }));
}

module.exports = {
    listInstances,
    getInstance,
    startInstance,
    stopInstance,
    rebootInstance,
    getInstanceStatus,
    getInstanceMetrics,
    getInstancesSummary,
    listSecurityGroups,
    listVpcs,
    listSubnets
};
