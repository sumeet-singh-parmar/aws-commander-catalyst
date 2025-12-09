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
    TerminateInstancesCommand,
    DescribeInstanceStatusCommand,
    DescribeVolumesCommand,
    DescribeSecurityGroupsCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    GetConsoleOutputCommand,
    CreateSnapshotCommand,
    CreateImageCommand,
    DescribeImagesCommand,
    AllocateAddressCommand,
    AssociateAddressCommand,
    DisassociateAddressCommand,
    DescribeAddressesCommand,
    ModifyInstanceAttributeCommand,
    DescribeInstanceTypesCommand,
    AuthorizeSecurityGroupIngressCommand,
    AuthorizeSecurityGroupEgressCommand,
    RevokeSecurityGroupIngressCommand,
    RevokeSecurityGroupEgressCommand
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
async function listInstances(region, filters = {}, page = 1, limit = 5) {
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

    // Fetch all instances (handle AWS pagination internally)
    const allInstances = [];
    let nextToken = null;
    
    do {
        if (nextToken) {
            params.NextToken = nextToken;
        }
        
        const response = await client.send(new DescribeInstancesCommand(params));
        
        // Flatten reservations into a single array of instances
        for (const reservation of response.Reservations || []) {
            for (const instance of reservation.Instances || []) {
                allInstances.push({
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
        
        nextToken = response.NextToken;
    } while (nextToken);

    // Apply in-memory pagination
    const totalItems = allInstances.length;
    const itemsPerPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedInstances = allInstances.slice(startIndex, endIndex);

    return {
        instances: paginatedInstances,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: totalItems,
            itemsPerPage: itemsPerPage,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        }
    };
}

/**
 * Get detailed information for a single instance.
 *
 * @param {string} instanceId - The EC2 instance ID (e.g., 'i-0abc123def456')
 * @param {string} region - AWS region
 * @returns {object} Instance details
 */
async function getInstance(instanceId, region) {
    const result = await listInstances(region, { instanceIds: [instanceId] });
    const instances = result.instances || result; // Support both old and new format

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
    // Fetch all instances with a large limit to get all in one page
    const result = await listInstances(region, {}, 1, 10000);
    const instances = result.instances || result; // Support both old and new format
    const totalItems = result.pagination?.totalItems || instances.length;

    const summary = {
        total: totalItems,
        byState: {},
        byType: {},
        byAz: {}
    };

    // If we got all instances in one page, use them directly
    // Otherwise, fetch remaining pages
    let allInstances = [...instances];
    if (result.pagination && result.pagination.totalPages > 1) {
        for (let page = 2; page <= result.pagination.totalPages; page++) {
            const pageResult = await listInstances(region, {}, page, 10000);
            allInstances = allInstances.concat(pageResult.instances || []);
        }
    }

    for (const instance of allInstances) {
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
async function listSecurityGroups(region, vpcId = null, page = 1, limit = 5) {
    const client = getEC2Client(region);

    const params = {};
    if (vpcId) {
        params.Filters = [{ Name: "vpc-id", Values: [vpcId] }];
    }

    // Fetch all security groups (handle AWS pagination internally)
    const allSecurityGroups = [];
    let nextToken = null;
    
    do {
        if (nextToken) {
            params.NextToken = nextToken;
        }
        
        const response = await client.send(new DescribeSecurityGroupsCommand(params));
        
        for (const sg of response.SecurityGroups || []) {
            allSecurityGroups.push({
                id: sg.GroupId,
                name: sg.GroupName,
                description: sg.Description,
                vpcId: sg.VpcId,
                inboundRules: (sg.IpPermissions || []).length,
                outboundRules: (sg.IpPermissionsEgress || []).length
            });
        }
        
        nextToken = response.NextToken;
    } while (nextToken);

    // Apply in-memory pagination
    const totalItems = allSecurityGroups.length;
    const itemsPerPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedSecurityGroups = allSecurityGroups.slice(startIndex, endIndex);

    return {
        securityGroups: paginatedSecurityGroups,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: totalItems,
            itemsPerPage: itemsPerPage,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        }
    };
}

/**
 * List VPCs (Virtual Private Clouds) in the region.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of VPCs
 */
async function listVpcs(region, page = 1, limit = 5) {
    const client = getEC2Client(region);

    // Fetch all VPCs (handle AWS pagination internally)
    const allVpcs = [];
    let nextToken = null;
    
    do {
        const params = {};
        if (nextToken) {
            params.NextToken = nextToken;
        }
        
        const response = await client.send(new DescribeVpcsCommand(params));
        
        for (const vpc of response.Vpcs || []) {
            allVpcs.push({
                id: vpc.VpcId,
                cidrBlock: vpc.CidrBlock,
                isDefault: vpc.IsDefault,
                state: vpc.State,
                name: getNameFromTags(vpc.Tags)
            });
        }
        
        nextToken = response.NextToken;
    } while (nextToken);

    // Apply in-memory pagination
    const totalItems = allVpcs.length;
    const itemsPerPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedVpcs = allVpcs.slice(startIndex, endIndex);

    return {
        vpcs: paginatedVpcs,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: totalItems,
            itemsPerPage: itemsPerPage,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        }
    };
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

/**
 * Terminate (delete) an EC2 instance permanently.
 * WARNING: This action cannot be undone!
 *
 * @param {string} instanceId - Instance ID to terminate
 * @param {string} region - AWS region
 * @returns {object} Termination result
 */
async function terminateInstance(instanceId, region) {
    const client = getEC2Client(region);

    const response = await client.send(new TerminateInstancesCommand({
        InstanceIds: [instanceId]
    }));

    const instance = response.TerminatingInstances?.[0];

    return {
        success: true,
        instanceId: instanceId,
        previousState: instance?.PreviousState?.Name,
        currentState: instance?.CurrentState?.Name,
        message: `Instance ${instanceId} is terminating`
    };
}

/**
 * Get console output for debugging boot issues.
 * Shows system logs from instance startup.
 *
 * @param {string} instanceId - Instance ID
 * @param {string} region - AWS region
 * @returns {object} Console output text
 */
async function getConsoleOutput(instanceId, region) {
    const client = getEC2Client(region);

    const response = await client.send(new GetConsoleOutputCommand({
        InstanceId: instanceId,
        Latest: true
    }));

    // Output is base64 encoded
    const output = response.Output 
        ? Buffer.from(response.Output, 'base64').toString('utf-8')
        : 'No console output available';

    return {
        instanceId: instanceId,
        timestamp: response.Timestamp,
        output: output
    };
}

/**
 * Create a snapshot (backup) of an EBS volume.
 *
 * @param {string} volumeId - Volume ID to snapshot
 * @param {string} description - Snapshot description
 * @param {string} region - AWS region
 * @param {object} tags - Optional tags
 * @returns {object} Snapshot details
 */
async function createSnapshot(volumeId, description, region, tags = {}) {
    const client = getEC2Client(region);

    const params = {
        VolumeId: volumeId,
        Description: description || `Snapshot of ${volumeId}`
    };

    // Add tags if provided
    if (Object.keys(tags).length > 0) {
        params.TagSpecifications = [{
            ResourceType: 'snapshot',
            Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
        }];
    }

    const response = await client.send(new CreateSnapshotCommand(params));

    return {
        snapshotId: response.SnapshotId,
        volumeId: response.VolumeId,
        state: response.State,
        startTime: response.StartTime,
        progress: response.Progress,
        description: response.Description
    };
}

/**
 * Create a custom AMI (Amazon Machine Image) from an instance.
 * Useful for backups or launching identical instances.
 *
 * @param {string} instanceId - Source instance ID
 * @param {string} name - AMI name
 * @param {string} description - AMI description
 * @param {string} region - AWS region
 * @param {boolean} noReboot - If true, doesn't reboot instance (less consistent)
 * @returns {object} AMI details
 */
async function createImage(instanceId, name, description, region, noReboot = false) {
    const client = getEC2Client(region);

    const response = await client.send(new CreateImageCommand({
        InstanceId: instanceId,
        Name: name,
        Description: description || `AMI created from ${instanceId}`,
        NoReboot: noReboot
    }));

    return {
        imageId: response.ImageId,
        instanceId: instanceId,
        name: name,
        description: description,
        message: `AMI ${response.ImageId} creation started`
    };
}

/**
 * List all EBS volumes attached to an instance.
 *
 * @param {string} instanceId - Instance ID
 * @param {string} region - AWS region
 * @returns {Array} List of attached volumes
 */
async function listInstanceVolumes(instanceId, region) {
    const client = getEC2Client(region);

    const response = await client.send(new DescribeVolumesCommand({
        Filters: [{
            Name: 'attachment.instance-id',
            Values: [instanceId]
        }]
    }));

    return (response.Volumes || []).map(vol => ({
        volumeId: vol.VolumeId,
        size: vol.Size,
        type: vol.VolumeType,
        state: vol.State,
        device: vol.Attachments?.[0]?.Device,
        deleteOnTermination: vol.Attachments?.[0]?.DeleteOnTermination,
        encrypted: vol.Encrypted,
        iops: vol.Iops,
        throughput: vol.Throughput
    }));
}

/**
 * Allocate a new Elastic IP address.
 *
 * @param {string} region - AWS region
 * @returns {object} Elastic IP details
 */
async function allocateElasticIp(region) {
    const client = getEC2Client(region);

    const response = await client.send(new AllocateAddressCommand({
        Domain: 'vpc'
    }));

    return {
        allocationId: response.AllocationId,
        publicIp: response.PublicIp,
        domain: response.Domain
    };
}

/**
 * Associate an Elastic IP with an instance.
 *
 * @param {string} instanceId - Instance ID
 * @param {string} allocationId - Elastic IP allocation ID
 * @param {string} region - AWS region
 * @returns {object} Association result
 */
async function associateElasticIp(instanceId, allocationId, region) {
    const client = getEC2Client(region);

    const response = await client.send(new AssociateAddressCommand({
        InstanceId: instanceId,
        AllocationId: allocationId
    }));

    return {
        associationId: response.AssociationId,
        instanceId: instanceId,
        allocationId: allocationId
    };
}

/**
 * Disassociate an Elastic IP from an instance.
 *
 * @param {string} associationId - Association ID
 * @param {string} region - AWS region
 * @returns {object} Disassociation result
 */
async function disassociateElasticIp(associationId, region) {
    const client = getEC2Client(region);

    await client.send(new DisassociateAddressCommand({
        AssociationId: associationId
    }));

    return {
        success: true,
        associationId: associationId
    };
}

/**
 * List all Elastic IPs in the region.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of Elastic IPs
 */
async function listElasticIps(region) {
    const client = getEC2Client(region);

    const response = await client.send(new DescribeAddressesCommand({}));

    return (response.Addresses || []).map(addr => ({
        allocationId: addr.AllocationId,
        publicIp: addr.PublicIp,
        privateIp: addr.PrivateIpAddress,
        instanceId: addr.InstanceId,
        associationId: addr.AssociationId,
        domain: addr.Domain,
        networkInterfaceId: addr.NetworkInterfaceId
    }));
}

/**
 * Modify instance type (requires instance to be stopped).
 *
 * @param {string} instanceId - Instance ID
 * @param {string} newInstanceType - New instance type (e.g., 't2.large')
 * @param {string} region - AWS region
 * @returns {object} Modification result
 */
async function modifyInstanceType(instanceId, newInstanceType, region) {
    const client = getEC2Client(region);

    await client.send(new ModifyInstanceAttributeCommand({
        InstanceId: instanceId,
        InstanceType: {
            Value: newInstanceType
        }
    }));

    return {
        success: true,
        instanceId: instanceId,
        newType: newInstanceType,
        message: `Instance type changed to ${newInstanceType}`
    };
}

/**
 * List available instance types for the region.
 *
 * @param {string} region - AWS region
 * @param {number} maxResults - Max results to return
 * @returns {Array} List of instance types
 */
async function listInstanceTypes(region, maxResults = 100) {
    const client = getEC2Client(region);

    const response = await client.send(new DescribeInstanceTypesCommand({
        MaxResults: maxResults
    }));

    return (response.InstanceTypes || []).map(type => ({
        instanceType: type.InstanceType,
        vcpu: type.VCpuInfo?.DefaultVCpus,
        memory: type.MemoryInfo?.SizeInMiB,
        networkPerformance: type.NetworkInfo?.NetworkPerformance,
        architecture: type.ProcessorInfo?.SupportedArchitectures
    }));
}

/**
 * Get security groups associated with an EC2 instance.
 *
 * @param {string} instanceId - Instance ID
 * @param {string} region - AWS region
 * @returns {Array} List of security groups with details
 */
async function getInstanceSecurityGroups(instanceId, region) {
    const client = getEC2Client(region);
    
    // First get the instance to find its security groups
    const instanceResponse = await client.send(new DescribeInstancesCommand({
        InstanceIds: [instanceId]
    }));
    
    const instance = instanceResponse.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
        throw new Error('Instance not found');
    }
    
    const securityGroupIds = instance.SecurityGroups?.map(sg => sg.GroupId) || [];
    
    if (securityGroupIds.length === 0) {
        return [];
    }
    
    // Get detailed info about each security group
    const sgResponse = await client.send(new DescribeSecurityGroupsCommand({
        GroupIds: securityGroupIds
    }));
    
    return (sgResponse.SecurityGroups || []).map(sg => ({
        groupId: sg.GroupId,
        groupName: sg.GroupName,
        description: sg.Description,
        vpcId: sg.VpcId,
        inboundRules: (sg.IpPermissions || []).map(rule => ({
            ipProtocol: rule.IpProtocol,
            fromPort: rule.FromPort,
            toPort: rule.ToPort,
            ipRanges: rule.IpRanges?.map(r => r.CidrIp) || [],
            ipv6Ranges: rule.Ipv6Ranges?.map(r => r.CidrIpv6) || [],
            securityGroups: rule.UserIdGroupPairs?.map(p => p.GroupId) || [],
            description: rule.IpRanges?.[0]?.Description || ''
        })),
        outboundRules: (sg.IpPermissionsEgress || []).map(rule => ({
            ipProtocol: rule.IpProtocol,
            fromPort: rule.FromPort,
            toPort: rule.ToPort,
            ipRanges: rule.IpRanges?.map(r => r.CidrIp) || [],
            ipv6Ranges: rule.Ipv6Ranges?.map(r => r.CidrIpv6) || [],
            securityGroups: rule.UserIdGroupPairs?.map(p => p.GroupId) || [],
            description: rule.IpRanges?.[0]?.Description || ''
        }))
    }));
}

/**
 * Add an inbound rule to a security group.
 *
 * @param {string} groupId - Security group ID
 * @param {Object} rule - Rule configuration
 * @param {string} region - AWS region
 * @returns {Object} Result
 */
async function addInboundRule(groupId, rule, region) {
    const client = getEC2Client(region);
    
    const ipPermission = {
        IpProtocol: rule.protocol,
        FromPort: rule.fromPort,
        ToPort: rule.toPort,
        IpRanges: rule.cidr ? [{ CidrIp: rule.cidr, Description: rule.description || '' }] : []
    };
    
    await client.send(new AuthorizeSecurityGroupIngressCommand({
        GroupId: groupId,
        IpPermissions: [ipPermission]
    }));
    
    return {
        success: true,
        message: `Inbound rule added to ${groupId}`
    };
}

/**
 * Add an outbound rule to a security group.
 *
 * @param {string} groupId - Security group ID
 * @param {Object} rule - Rule configuration
 * @param {string} region - AWS region
 * @returns {Object} Result
 */
async function addOutboundRule(groupId, rule, region) {
    const client = getEC2Client(region);
    
    const ipPermission = {
        IpProtocol: rule.protocol,
        FromPort: rule.fromPort,
        ToPort: rule.toPort,
        IpRanges: rule.cidr ? [{ CidrIp: rule.cidr, Description: rule.description || '' }] : []
    };
    
    await client.send(new AuthorizeSecurityGroupEgressCommand({
        GroupId: groupId,
        IpPermissions: [ipPermission]
    }));
    
    return {
        success: true,
        message: `Outbound rule added to ${groupId}`
    };
}

/**
 * Remove an inbound rule from a security group.
 *
 * @param {string} groupId - Security group ID
 * @param {Object} rule - Rule configuration to remove
 * @param {string} region - AWS region
 * @returns {Object} Result
 */
async function removeInboundRule(groupId, rule, region) {
    const client = getEC2Client(region);
    
    const ipPermission = {
        IpProtocol: rule.protocol,
        FromPort: rule.fromPort,
        ToPort: rule.toPort,
        IpRanges: rule.cidr ? [{ CidrIp: rule.cidr }] : []
    };
    
    await client.send(new RevokeSecurityGroupIngressCommand({
        GroupId: groupId,
        IpPermissions: [ipPermission]
    }));
    
    return {
        success: true,
        message: `Inbound rule removed from ${groupId}`
    };
}

/**
 * Remove an outbound rule from a security group.
 *
 * @param {string} groupId - Security group ID
 * @param {Object} rule - Rule configuration to remove
 * @param {string} region - AWS region
 * @returns {Object} Result
 */
async function removeOutboundRule(groupId, rule, region) {
    const client = getEC2Client(region);
    
    const ipPermission = {
        IpProtocol: rule.protocol,
        FromPort: rule.fromPort,
        ToPort: rule.toPort,
        IpRanges: rule.cidr ? [{ CidrIp: rule.cidr }] : []
    };
    
    await client.send(new RevokeSecurityGroupEgressCommand({
        GroupId: groupId,
        IpPermissions: [ipPermission]
    }));
    
    return {
        success: true,
        message: `Outbound rule removed from ${groupId}`
    };
}

module.exports = {
    listInstances,
    getInstance,
    startInstance,
    stopInstance,
    rebootInstance,
    terminateInstance,
    getInstanceStatus,
    getConsoleOutput,
    getInstanceMetrics,
    getInstancesSummary,
    listSecurityGroups,
    listVpcs,
    listSubnets,
    createSnapshot,
    createImage,
    listInstanceVolumes,
    allocateElasticIp,
    associateElasticIp,
    disassociateElasticIp,
    listElasticIps,
    modifyInstanceType,
    listInstanceTypes,
    getInstanceSecurityGroups,
    addInboundRule,
    addOutboundRule,
    removeInboundRule,
    removeOutboundRule
};
