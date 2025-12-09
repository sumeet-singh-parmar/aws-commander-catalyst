'use strict';

/**
 * ============================================================================
 * RDS SERVICE MODULE
 * ============================================================================
 *
 * Handles all Amazon RDS (Relational Database Service) operations.
 * RDS makes it easy to set up, operate, and scale databases in the cloud.
 *
 * Supported database engines:
 * - MySQL, PostgreSQL, MariaDB
 * - Oracle, SQL Server
 * - Amazon Aurora (MySQL/PostgreSQL compatible)
 *
 * Features:
 * - List and view database instances
 * - Start, stop, and reboot databases
 * - View Aurora clusters
 * - List database snapshots
 * - Get summary statistics
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    DescribeDBInstancesCommand,
    StartDBInstanceCommand,
    StopDBInstanceCommand,
    RebootDBInstanceCommand,
    DescribeDBClustersCommand,
    DescribeDBSnapshotsCommand
} = require("@aws-sdk/client-rds");

const { getRDSClient } = require("../utils/aws-clients");
const { formatBytes } = require("../utils/helpers");

/**
 * List all RDS database instances in the region.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of database instances with details
 */
async function listDBInstances(region, page = 1, limit = 5) {
    const client = getRDSClient(region);

    // Fetch all DB instances (handle AWS pagination internally)
    const allInstances = [];
    let marker = null;
    
    do {
        const params = {};
        if (marker) {
            params.Marker = marker;
        }
        
        const response = await client.send(new DescribeDBInstancesCommand(params));
        
        for (const db of response.DBInstances || []) {
            allInstances.push({
                id: db.DBInstanceIdentifier,
                status: db.DBInstanceStatus,
                statusEmoji: getDBStatusEmoji(db.DBInstanceStatus),
                engine: db.Engine,
                engineVersion: db.EngineVersion,
                instanceClass: db.DBInstanceClass,
                allocatedStorage: db.AllocatedStorage,
                allocatedStorageFormatted: `${db.AllocatedStorage} GB`,
                endpoint: db.Endpoint ? {
                    address: db.Endpoint.Address,
                    port: db.Endpoint.Port
                } : null,
                multiAZ: db.MultiAZ,
                availabilityZone: db.AvailabilityZone,
                vpcId: db.DBSubnetGroup?.VpcId,
                publiclyAccessible: db.PubliclyAccessible,
                storageType: db.StorageType,
                storageEncrypted: db.StorageEncrypted,
                createdAt: db.InstanceCreateTime,
                backupRetention: db.BackupRetentionPeriod,
                latestRestorableTime: db.LatestRestorableTime
            });
        }
        
        marker = response.Marker;
    } while (marker);

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
 * Get status emoji for database state.
 * Makes it easy to visually identify database status in Cliq messages.
 *
 * @param {string} status - Database status string
 * @returns {string} Emoji representing the status
 */
function getDBStatusEmoji(status) {
    const statuses = {
        'available': '🟢',      // Ready to use
        'starting': '🟡',       // Starting up
        'stopping': '🟠',       // Shutting down
        'stopped': '🔴',        // Stopped (not running)
        'creating': '🟡',       // Being created
        'deleting': '⚫',       // Being deleted
        'rebooting': '🟡',      // Restarting
        'backing-up': '🔵',     // Backup in progress
        'modifying': '🟡',      // Configuration change
        'failed': '❌'          // Error state
    };
    return statuses[status] || '⚪';
}

/**
 * Get detailed information for a specific database instance.
 *
 * @param {string} dbInstanceId - Database instance identifier
 * @param {string} region - AWS region
 * @returns {object} Detailed database configuration
 */
async function getDBInstance(dbInstanceId, region) {
    const client = getRDSClient(region);

    const response = await client.send(new DescribeDBInstancesCommand({
        DBInstanceIdentifier: dbInstanceId
    }));

    if (!response.DBInstances || response.DBInstances.length === 0) {
        throw new Error(`DB instance ${dbInstanceId} not found`);
    }

    const db = response.DBInstances[0];

    return {
        id: db.DBInstanceIdentifier,
        status: db.DBInstanceStatus,
        statusEmoji: getDBStatusEmoji(db.DBInstanceStatus),
        engine: db.Engine,
        engineVersion: db.EngineVersion,
        instanceClass: db.DBInstanceClass,
        allocatedStorage: db.AllocatedStorage,
        maxAllocatedStorage: db.MaxAllocatedStorage,
        endpoint: db.Endpoint ? {
            address: db.Endpoint.Address,
            port: db.Endpoint.Port
        } : null,
        multiAZ: db.MultiAZ,
        availabilityZone: db.AvailabilityZone,
        secondaryAZ: db.SecondaryAvailabilityZone,
        vpcId: db.DBSubnetGroup?.VpcId,
        subnetGroup: db.DBSubnetGroup?.DBSubnetGroupName,
        publiclyAccessible: db.PubliclyAccessible,
        storageType: db.StorageType,
        iops: db.Iops,
        storageEncrypted: db.StorageEncrypted,
        kmsKeyId: db.KmsKeyId,
        createdAt: db.InstanceCreateTime,
        backupRetention: db.BackupRetentionPeriod,
        backupWindow: db.PreferredBackupWindow,
        maintenanceWindow: db.PreferredMaintenanceWindow,
        latestRestorableTime: db.LatestRestorableTime,
        autoMinorVersionUpgrade: db.AutoMinorVersionUpgrade,
        licenseModel: db.LicenseModel,
        securityGroups: (db.VpcSecurityGroups || []).map(sg => ({
            id: sg.VpcSecurityGroupId,
            status: sg.Status
        })),
        parameterGroups: (db.DBParameterGroups || []).map(pg => ({
            name: pg.DBParameterGroupName,
            status: pg.ParameterApplyStatus
        })),
        optionGroup: db.OptionGroupMemberships?.[0]?.OptionGroupName,
        performanceInsightsEnabled: db.PerformanceInsightsEnabled,
        deletionProtection: db.DeletionProtection
    };
}

/**
 * Start a stopped RDS database instance.
 * Note: Starting a database can take several minutes.
 *
 * @param {string} dbInstanceId - Database to start
 * @param {string} region - AWS region
 * @returns {object} Start confirmation
 */
async function startDBInstance(dbInstanceId, region) {
    const client = getRDSClient(region);

    const response = await client.send(new StartDBInstanceCommand({
        DBInstanceIdentifier: dbInstanceId
    }));

    return {
        dbInstanceId: dbInstanceId,
        previousStatus: 'stopped',
        currentStatus: response.DBInstance?.DBInstanceStatus,
        message: `DB instance ${dbInstanceId} is starting. This may take several minutes.`
    };
}

/**
 * Stop a running RDS database instance.
 * Optionally create a snapshot before stopping.
 *
 * @param {string} dbInstanceId - Database to stop
 * @param {string} region - AWS region
 * @param {string} snapshotId - Optional snapshot identifier
 * @returns {object} Stop confirmation
 */
async function stopDBInstance(dbInstanceId, region, snapshotId = null) {
    const client = getRDSClient(region);

    const params = {
        DBInstanceIdentifier: dbInstanceId
    };

    // Optionally create a final snapshot before stopping
    if (snapshotId) {
        params.DBSnapshotIdentifier = snapshotId;
    }

    const response = await client.send(new StopDBInstanceCommand(params));

    return {
        dbInstanceId: dbInstanceId,
        previousStatus: 'available',
        currentStatus: response.DBInstance?.DBInstanceStatus,
        snapshotId: snapshotId,
        message: `DB instance ${dbInstanceId} is stopping.`
    };
}

/**
 * Reboot a database instance.
 * For Multi-AZ deployments, can optionally force a failover.
 *
 * @param {string} dbInstanceId - Database to reboot
 * @param {string} region - AWS region
 * @param {boolean} forceFailover - Force failover for Multi-AZ
 * @returns {object} Reboot confirmation
 */
async function rebootDBInstance(dbInstanceId, region, forceFailover = false) {
    const client = getRDSClient(region);

    const response = await client.send(new RebootDBInstanceCommand({
        DBInstanceIdentifier: dbInstanceId,
        ForceFailover: forceFailover
    }));

    return {
        dbInstanceId: dbInstanceId,
        currentStatus: response.DBInstance?.DBInstanceStatus,
        forceFailover: forceFailover,
        message: `DB instance ${dbInstanceId} is rebooting.`
    };
}

/**
 * List Aurora database clusters.
 * Aurora clusters contain multiple database instances.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of Aurora clusters
 */
async function listDBClusters(region, page = 1, limit = 5) {
    const client = getRDSClient(region);

    // Fetch all clusters (handle AWS pagination internally)
    const allClusters = [];
    let marker = null;
    
    do {
        const params = {};
        if (marker) {
            params.Marker = marker;
        }
        
        const response = await client.send(new DescribeDBClustersCommand(params));
        
        for (const cluster of response.DBClusters || []) {
            allClusters.push({
                id: cluster.DBClusterIdentifier,
                status: cluster.Status,
                statusEmoji: getDBStatusEmoji(cluster.Status),
                engine: cluster.Engine,
                engineVersion: cluster.EngineVersion,
                endpoint: cluster.Endpoint,
                readerEndpoint: cluster.ReaderEndpoint,
                port: cluster.Port,
                multiAZ: cluster.MultiAZ,
                members: (cluster.DBClusterMembers || []).map(m => ({
                    id: m.DBInstanceIdentifier,
                    isClusterWriter: m.IsClusterWriter
                })),
                allocatedStorage: cluster.AllocatedStorage,
                storageEncrypted: cluster.StorageEncrypted,
                createdAt: cluster.ClusterCreateTime
            });
        }
        
        marker = response.Marker;
    } while (marker);

    // Apply in-memory pagination
    const totalItems = allClusters.length;
    const itemsPerPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedClusters = allClusters.slice(startIndex, endIndex);

    return {
        clusters: paginatedClusters,
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
 * List database snapshots.
 * Snapshots are point-in-time backups of databases.
 *
 * @param {string} region - AWS region
 * @param {string} dbInstanceId - Optional filter by database
 * @returns {Array} List of snapshots
 */
async function listDBSnapshots(region, dbInstanceId = null, page = 1, limit = 5) {
    const client = getRDSClient(region);

    // Fetch all snapshots (handle AWS pagination internally)
    const allSnapshots = [];
    let marker = null;
    
    do {
        const params = { MaxRecords: 50 };
        if (dbInstanceId) {
            params.DBInstanceIdentifier = dbInstanceId;
        }
        if (marker) {
            params.Marker = marker;
        }

        const response = await client.send(new DescribeDBSnapshotsCommand(params));
        
        for (const snapshot of response.DBSnapshots || []) {
            allSnapshots.push({
                id: snapshot.DBSnapshotIdentifier,
                dbInstanceId: snapshot.DBInstanceIdentifier,
                status: snapshot.Status,
                snapshotType: snapshot.SnapshotType,
                engine: snapshot.Engine,
                engineVersion: snapshot.EngineVersion,
                allocatedStorage: snapshot.AllocatedStorage,
                createdAt: snapshot.SnapshotCreateTime,
                percentProgress: snapshot.PercentProgress,
                encrypted: snapshot.Encrypted
            });
        }
        
        marker = response.Marker;
    } while (marker);

    // Apply in-memory pagination
    const totalItems = allSnapshots.length;
    const itemsPerPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedSnapshots = allSnapshots.slice(startIndex, endIndex);

    return {
        snapshots: paginatedSnapshots,
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
 * Get summary statistics for all RDS instances.
 *
 * @param {string} region - AWS region
 * @returns {object} Summary with counts grouped by status, engine, class
 */
async function getRDSSummary(region) {
    const instances = await listDBInstances(region);

    const summary = {
        total: instances.length,
        byStatus: {},
        byEngine: {},
        byInstanceClass: {},
        totalStorage: 0
    };

    for (const db of instances) {
        // Count by status
        summary.byStatus[db.status] = (summary.byStatus[db.status] || 0) + 1;

        // Count by engine (mysql, postgres, etc.)
        summary.byEngine[db.engine] = (summary.byEngine[db.engine] || 0) + 1;

        // Count by instance class (db.t3.micro, db.r5.large, etc.)
        summary.byInstanceClass[db.instanceClass] = (summary.byInstanceClass[db.instanceClass] || 0) + 1;

        // Sum total storage
        summary.totalStorage += db.allocatedStorage || 0;
    }

    summary.totalStorageFormatted = `${summary.totalStorage} GB`;

    return summary;
}

module.exports = {
    listDBInstances,
    getDBInstance,
    startDBInstance,
    stopDBInstance,
    rebootDBInstance,
    listDBClusters,
    listDBSnapshots,
    getRDSSummary
};
