'use strict';

/**
 * ============================================================================
 * CLOUDWATCH LOGS SERVICE MODULE
 * ============================================================================
 *
 * Handles Amazon CloudWatch Logs - AWS's centralized logging service.
 * All your Lambda functions, EC2 instances (with CloudWatch agent), and
 * other AWS services can send their logs here.
 *
 * Features:
 * - List and browse log groups
 * - List log streams within a group
 * - Read log events from streams
 * - Search/filter logs with patterns
 * - Get Lambda function logs easily
 * - Search for errors across logs
 * - Create and delete log groups
 *
 * Log Structure:
 * - Log Group: Container for related logs (e.g., /aws/lambda/my-function)
 * - Log Stream: Individual source within a group (e.g., each Lambda container)
 * - Log Event: A single log entry with timestamp and message
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    DescribeLogGroupsCommand,
    DescribeLogStreamsCommand,
    GetLogEventsCommand,
    FilterLogEventsCommand,
    CreateLogGroupCommand,
    DeleteLogGroupCommand
} = require("@aws-sdk/client-cloudwatch-logs");

const { getLogsClient } = require("../utils/aws-clients");
const { formatBytes, truncate } = require("../utils/helpers");

/**
 * List all log groups in the region.
 * Log groups are like folders that contain related log streams.
 *
 * Common log group patterns:
 * - /aws/lambda/function-name (Lambda functions)
 * - /aws/rds/instance/db-name (RDS databases)
 * - /ec2/instance-id (EC2 with CloudWatch agent)
 *
 * @param {string} region - AWS region
 * @param {string} prefix - Optional: Filter by name prefix
 * @returns {Array} List of log groups with storage info
 */
async function listLogGroups(region, prefix = null) {
    const client = getLogsClient(region);

    const params = { limit: 50 };
    if (prefix) {
        params.logGroupNamePrefix = prefix;
    }

    const response = await client.send(new DescribeLogGroupsCommand(params));

    return (response.logGroups || []).map(lg => ({
        name: lg.logGroupName,
        storedBytes: lg.storedBytes,
        storedBytesFormatted: formatBytes(lg.storedBytes || 0),
        creationTime: lg.creationTime ? new Date(lg.creationTime) : null,
        retentionInDays: lg.retentionInDays || 'Never expire',
        arn: lg.arn
    }));
}

/**
 * List log streams within a log group.
 * Each stream is a separate source - for Lambda, each container gets its own stream.
 *
 * @param {string} logGroupName - Name of the log group
 * @param {string} region - AWS region
 * @param {string} orderBy - How to sort: 'LastEventTime' or 'LogStreamName'
 * @returns {Array} List of log streams with timestamps
 */
async function listLogStreams(logGroupName, region, orderBy = 'LastEventTime') {
    const client = getLogsClient(region);

    const response = await client.send(new DescribeLogStreamsCommand({
        logGroupName: logGroupName,
        orderBy: orderBy,
        descending: true,  // Most recent first
        limit: 50
    }));

    return (response.logStreams || []).map(ls => ({
        name: ls.logStreamName,
        creationTime: ls.creationTime ? new Date(ls.creationTime) : null,
        firstEventTime: ls.firstEventTimestamp ? new Date(ls.firstEventTimestamp) : null,
        lastEventTime: ls.lastEventTimestamp ? new Date(ls.lastEventTimestamp) : null,
        lastIngestionTime: ls.lastIngestionTime ? new Date(ls.lastIngestionTime) : null,
        storedBytes: ls.storedBytes,
        storedBytesFormatted: formatBytes(ls.storedBytes || 0)
    }));
}

/**
 * Get log events from a specific stream.
 * Returns the actual log messages with timestamps.
 *
 * @param {string} logGroupName - Name of the log group
 * @param {string} logStreamName - Name of the log stream
 * @param {string} region - AWS region
 * @param {object} options - Optional parameters
 * @param {number} options.limit - Max events to return (default: 100)
 * @param {boolean} options.startFromHead - Start from oldest (default: false = newest first)
 * @param {number} options.startTime - Filter events after this timestamp
 * @param {number} options.endTime - Filter events before this timestamp
 * @param {string} options.nextToken - Pagination token
 * @returns {object} Log events with pagination tokens
 */
async function getLogEvents(logGroupName, logStreamName, region, options = {}) {
    const client = getLogsClient(region);

    const params = {
        logGroupName: logGroupName,
        logStreamName: logStreamName,
        limit: options.limit || 100,
        startFromHead: options.startFromHead || false
    };

    if (options.startTime) {
        params.startTime = options.startTime;
    }

    if (options.endTime) {
        params.endTime = options.endTime;
    }

    if (options.nextToken) {
        params.nextToken = options.nextToken;
    }

    const response = await client.send(new GetLogEventsCommand(params));

    return {
        logGroupName: logGroupName,
        logStreamName: logStreamName,
        events: (response.events || []).map(event => ({
            timestamp: new Date(event.timestamp),
            message: event.message,
            ingestionTime: new Date(event.ingestionTime)
        })),
        nextForwardToken: response.nextForwardToken,
        nextBackwardToken: response.nextBackwardToken
    };
}

/**
 * Search/filter log events across all streams in a group.
 * Much more powerful than getLogEvents - can search with patterns!
 *
 * Filter patterns support:
 * - Simple text: "ERROR" matches any log containing ERROR
 * - Multiple terms: "ERROR timeout" matches logs with both
 * - OR pattern: "?ERROR ?WARN" matches ERROR or WARN
 * - JSON field: { $.level = "error" } for JSON logs
 *
 * @param {string} logGroupName - Name of the log group
 * @param {string} region - AWS region
 * @param {object} options - Search options
 * @param {string} options.filterPattern - Pattern to search for
 * @param {number} options.startTime - Start of time range (epoch ms)
 * @param {number} options.endTime - End of time range (epoch ms)
 * @param {number} options.limit - Max results (default: 100)
 * @param {Array} options.logStreamNames - Specific streams to search
 * @param {string} options.logStreamNamePrefix - Stream name prefix filter
 * @returns {object} Matching log events
 */
async function filterLogEvents(logGroupName, region, options = {}) {
    const client = getLogsClient(region);

    const now = Date.now();
    const defaultStartTime = now - (60 * 60 * 1000); // Default: last hour

    const params = {
        logGroupName: logGroupName,
        startTime: options.startTime || defaultStartTime,
        endTime: options.endTime || now,
        limit: options.limit || 100
    };

    if (options.filterPattern) {
        params.filterPattern = options.filterPattern;
    }

    if (options.logStreamNames) {
        params.logStreamNames = options.logStreamNames;
    }

    if (options.logStreamNamePrefix) {
        params.logStreamNamePrefix = options.logStreamNamePrefix;
    }

    if (options.nextToken) {
        params.nextToken = options.nextToken;
    }

    const response = await client.send(new FilterLogEventsCommand(params));

    return {
        logGroupName: logGroupName,
        filterPattern: options.filterPattern || null,
        events: (response.events || []).map(event => ({
            timestamp: new Date(event.timestamp),
            message: event.message,
            logStreamName: event.logStreamName,
            eventId: event.eventId,
            ingestionTime: new Date(event.ingestionTime)
        })),
        nextToken: response.nextToken,
        searchedLogStreams: response.searchedLogStreams?.length || 0
    };
}

/**
 * Get recent logs from a log group (convenience function).
 * Automatically expands search to 24 hours if no results found in initial range.
 *
 * @param {string} logGroupName - Name of the log group
 * @param {string} region - AWS region
 * @param {number} minutes - How far back to look (default: 60)
 * @param {string} filterPattern - Optional search pattern
 * @returns {object} Recent log events
 */
async function getRecentLogs(logGroupName, region, minutes = 60, filterPattern = null) {
    const now = Date.now();
    let startTime = now - (minutes * 60 * 1000);

    let result = await filterLogEvents(logGroupName, region, {
        startTime: startTime,
        endTime: now,
        filterPattern: filterPattern,
        limit: 100
    });

    // If no events found and we searched less than 24 hours, expand the search
    // This helps when logs are sparse
    if ((!result.events || result.events.length === 0) && minutes < 1440) {
        startTime = now - (24 * 60 * 60 * 1000);
        result = await filterLogEvents(logGroupName, region, {
            startTime: startTime,
            endTime: now,
            filterPattern: filterPattern,
            limit: 100
        });
    }

    return result;
}

/**
 * Search for errors in logs.
 * Uses a comprehensive filter pattern to catch various error formats.
 *
 * Searches for: ERROR, Error, error, EXCEPTION, Exception, exception,
 * FATAL, Fatal, fatal
 *
 * @param {string} logGroupName - Name of the log group
 * @param {string} region - AWS region
 * @param {number} minutes - How far back to search (default: 60)
 * @returns {object} Log events containing errors
 */
async function searchErrors(logGroupName, region, minutes = 60) {
    return await getRecentLogs(
        logGroupName,
        region,
        minutes,
        '?ERROR ?Error ?error ?EXCEPTION ?Exception ?exception ?FATAL ?Fatal ?fatal'
    );
}

/**
 * Get logs for a Lambda function.
 * Convenience function that constructs the correct log group name.
 *
 * Lambda log groups follow the pattern: /aws/lambda/{function-name}
 *
 * @param {string} functionName - Name of the Lambda function
 * @param {string} region - AWS region
 * @param {number} minutes - How far back to look (default: 30)
 * @returns {object} Lambda function logs
 */
async function getLambdaLogs(functionName, region, minutes = 30) {
    const logGroupName = `/aws/lambda/${functionName}`;
    return await getRecentLogs(logGroupName, region, minutes);
}

/**
 * Get logs for an EC2 instance.
 * Requires CloudWatch agent to be installed on the instance.
 *
 * Tries common log group patterns:
 * 1. /ec2/{instance-id}
 * 2. /aws/ec2/{instance-id}
 *
 * @param {string} instanceId - EC2 instance ID
 * @param {string} region - AWS region
 * @param {number} minutes - How far back to look (default: 30)
 * @returns {object} EC2 instance logs
 */
async function getEC2Logs(instanceId, region, minutes = 30) {
    const logGroupName = `/ec2/${instanceId}`;

    try {
        return await getRecentLogs(logGroupName, region, minutes);
    } catch (error) {
        // Try alternative log group pattern
        try {
            return await getRecentLogs(`/aws/ec2/${instanceId}`, region, minutes);
        } catch (e) {
            throw new Error(`No logs found for instance ${instanceId}. CloudWatch agent may not be installed.`);
        }
    }
}

/**
 * Get a summary of log groups in the region.
 * Shows total storage used and groups by prefix.
 *
 * @param {string} region - AWS region
 * @returns {object} Summary with counts and storage info
 */
async function getLogsSummary(region) {
    const logGroups = await listLogGroups(region);

    let totalStoredBytes = 0;
    const byPrefix = {};

    for (const lg of logGroups) {
        totalStoredBytes += lg.storedBytes || 0;

        // Group by prefix (first 3 path segments)
        // e.g., /aws/lambda/function-name -> /aws/lambda
        const prefix = lg.name.split('/').slice(0, 3).join('/');
        byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
    }

    return {
        totalLogGroups: logGroups.length,
        totalStoredBytes: totalStoredBytes,
        totalStoredBytesFormatted: formatBytes(totalStoredBytes),
        byPrefix: byPrefix
    };
}

/**
 * Create a new log group.
 * Optionally set a retention policy (logs auto-delete after X days).
 *
 * @param {string} logGroupName - Name for the new log group
 * @param {string} region - AWS region
 * @param {number} retentionInDays - Optional: Days to retain logs
 * @returns {object} Confirmation of creation
 */
async function createLogGroup(logGroupName, region, retentionInDays = null) {
    const client = getLogsClient(region);

    await client.send(new CreateLogGroupCommand({
        logGroupName: logGroupName
    }));

    // Set retention if specified (saves money by auto-deleting old logs)
    if (retentionInDays) {
        await client.send(new PutRetentionPolicyCommand({
            logGroupName: logGroupName,
            retentionInDays: retentionInDays
        }));
    }

    return {
        logGroupName: logGroupName,
        created: true,
        message: `Log group ${logGroupName} created successfully`
    };
}

/**
 * Delete a log group.
 * WARNING: This permanently deletes all logs in the group!
 *
 * @param {string} logGroupName - Name of the log group to delete
 * @param {string} region - AWS region
 * @returns {object} Confirmation of deletion
 */
async function deleteLogGroup(logGroupName, region) {
    const client = getLogsClient(region);

    await client.send(new DeleteLogGroupCommand({
        logGroupName: logGroupName
    }));

    return {
        logGroupName: logGroupName,
        deleted: true,
        message: `Log group ${logGroupName} deleted successfully`
    };
}

module.exports = {
    listLogGroups,
    listLogStreams,
    getLogEvents,
    filterLogEvents,
    getRecentLogs,
    searchErrors,
    getLambdaLogs,
    getEC2Logs,
    getLogsSummary,
    createLogGroup,
    deleteLogGroup
};
