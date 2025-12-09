'use strict';

/**
 * ============================================================================
 * CLOUDWATCH SERVICE MODULE
 * ============================================================================
 *
 * Handles Amazon CloudWatch alarms and metrics monitoring.
 * CloudWatch is AWS's monitoring service - it collects metrics from all your
 * AWS resources and lets you set alarms when things go wrong.
 *
 * Features:
 * - List and manage CloudWatch alarms
 * - Get alarm history and state changes
 * - Fetch metric statistics for any AWS resource
 * - Create and delete alarms
 * - Get aggregated Lambda metrics
 * - Generate alarm summaries
 *
 * Alarm States:
 * - OK: Everything is fine, metric is within threshold
 * - ALARM: Metric breached the threshold - something needs attention!
 * - INSUFFICIENT_DATA: Not enough data points to evaluate
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    DescribeAlarmsCommand,
    GetMetricStatisticsCommand,
    PutMetricAlarmCommand,
    DeleteAlarmsCommand,
    SetAlarmStateCommand,
    DescribeAlarmHistoryCommand,
    ListMetricsCommand
} = require("@aws-sdk/client-cloudwatch");

const { getCloudWatchClient } = require("../utils/aws-clients");
const { getAlarmStateEmoji } = require("../utils/helpers");

/**
 * List all CloudWatch alarms in the region.
 * Optionally filter by state (OK, ALARM, or INSUFFICIENT_DATA).
 *
 * @param {string} region - AWS region
 * @param {string} stateValue - Optional: Filter by alarm state
 * @returns {Array} List of alarms with full configuration details
 */
async function listAlarms(region, stateValue = null, page = 1, limit = 5) {
    const client = getCloudWatchClient(region);

    // Fetch all alarms (handle AWS pagination internally)
    const allAlarms = [];
    let nextToken = null;
    
    do {
    const params = {};
    if (stateValue) {
        params.StateValue = stateValue;
    }
        if (nextToken) {
            params.NextToken = nextToken;
        }

    const response = await client.send(new DescribeAlarmsCommand(params));

        for (const alarm of response.MetricAlarms || []) {
            allAlarms.push({
        name: alarm.AlarmName,
        description: alarm.AlarmDescription,
        state: alarm.StateValue,
        stateEmoji: getAlarmStateEmoji(alarm.StateValue),
        stateReason: alarm.StateReason,
        stateUpdatedAt: alarm.StateUpdatedTimestamp,
        metric: alarm.MetricName,
        namespace: alarm.Namespace,
        statistic: alarm.Statistic,
        period: alarm.Period,
        threshold: alarm.Threshold,
        comparisonOperator: alarm.ComparisonOperator,
        evaluationPeriods: alarm.EvaluationPeriods,
        dimensions: alarm.Dimensions,
        actionsEnabled: alarm.ActionsEnabled,
        alarmActions: alarm.AlarmActions,
        okActions: alarm.OKActions
            });
        }
        
        nextToken = response.NextToken;
    } while (nextToken);

    // Apply in-memory pagination
    const totalItems = allAlarms.length;
    const itemsPerPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedAlarms = allAlarms.slice(startIndex, endIndex);

    return {
        alarms: paginatedAlarms,
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
 * Get only alarms that are currently in ALARM state.
 * These are the ones that need immediate attention!
 *
 * @param {string} region - AWS region
 * @returns {Array} List of active alarms
 */
async function getActiveAlarms(region, page = 1, limit = 5) {
    return await listAlarms(region, 'ALARM', page, limit);
}

/**
 * Get detailed information about a specific alarm.
 * Includes all configuration, thresholds, and action settings.
 *
 * @param {string} alarmName - Name of the alarm to fetch
 * @param {string} region - AWS region
 * @returns {object} Complete alarm details
 */
async function getAlarm(alarmName, region) {
    const client = getCloudWatchClient(region);

    const response = await client.send(new DescribeAlarmsCommand({
        AlarmNames: [alarmName]
    }));

    if (!response.MetricAlarms || response.MetricAlarms.length === 0) {
        throw new Error(`Alarm ${alarmName} not found`);
    }

    const alarm = response.MetricAlarms[0];

    return {
        name: alarm.AlarmName,
        description: alarm.AlarmDescription,
        state: alarm.StateValue,
        stateEmoji: getAlarmStateEmoji(alarm.StateValue),
        stateReason: alarm.StateReason,
        stateUpdatedAt: alarm.StateUpdatedTimestamp,
        metric: alarm.MetricName,
        namespace: alarm.Namespace,
        statistic: alarm.Statistic,
        period: alarm.Period,
        threshold: alarm.Threshold,
        comparisonOperator: alarm.ComparisonOperator,
        evaluationPeriods: alarm.EvaluationPeriods,
        datapointsToAlarm: alarm.DatapointsToAlarm,
        dimensions: alarm.Dimensions,
        actionsEnabled: alarm.ActionsEnabled,
        alarmActions: alarm.AlarmActions,
        okActions: alarm.OKActions,
        insufficientDataActions: alarm.InsufficientDataActions,
        arn: alarm.AlarmArn
    };
}

/**
 * Get the history of an alarm - when it changed state, was modified, etc.
 * Great for debugging why an alarm fired or tracking configuration changes.
 *
 * History types:
 * - ConfigurationUpdate: Alarm settings were changed
 * - StateUpdate: Alarm state changed (OK -> ALARM, etc.)
 * - Action: An action was triggered (SNS notification, etc.)
 *
 * @param {string} alarmName - Name of the alarm
 * @param {string} region - AWS region
 * @param {string} historyType - Optional: Filter by history type
 * @returns {Array} List of history events
 */
async function getAlarmHistory(alarmName, region, historyType = null) {
    const client = getCloudWatchClient(region);

    const params = {
        AlarmName: alarmName,
        MaxRecords: 50
    };

    if (historyType) {
        params.HistoryItemType = historyType;
    }

    const response = await client.send(new DescribeAlarmHistoryCommand(params));

    return (response.AlarmHistoryItems || []).map(item => ({
        timestamp: item.Timestamp,
        type: item.HistoryItemType,
        summary: item.HistorySummary,
        data: item.HistoryData ? JSON.parse(item.HistoryData) : null
    }));
}

/**
 * Get metric statistics from CloudWatch.
 * Works with any metric from any namespace (EC2, Lambda, RDS, custom, etc.).
 *
 * Period is automatically adjusted based on time range:
 * - Under 24 hours: 5-minute intervals
 * - 1-7 days: 1-hour intervals
 * - Over 7 days: 1-day intervals
 *
 * @param {string} namespace - AWS namespace (e.g., 'AWS/EC2', 'AWS/Lambda')
 * @param {string} metricName - Name of the metric (e.g., 'CPUUtilization')
 * @param {Array} dimensions - Dimensions to filter by (e.g., InstanceId)
 * @param {string} region - AWS region
 * @param {number} hours - How many hours of data to fetch (default: 1)
 * @param {string} stat - Which statistic to get (default: 'Average')
 * @returns {object} Metric data with datapoints and summary
 */
async function getMetrics(namespace, metricName, dimensions, region, hours = 1, stat = 'Average') {
    const client = getCloudWatchClient(region);

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Adjust period based on time range for appropriate granularity
    let period = 300;      // 5 minutes for short ranges
    if (hours > 24) period = 3600;   // 1 hour for day+ ranges
    if (hours > 168) period = 86400; // 1 day for week+ ranges

    const response = await client.send(new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensions,
        StartTime: startTime,
        EndTime: endTime,
        Period: period,
        Statistics: [stat]
    }));

    // Sort datapoints chronologically
    const datapoints = (response.Datapoints || []).sort((a, b) =>
        new Date(a.Timestamp) - new Date(b.Timestamp)
    );

    return {
        namespace: namespace,
        metricName: metricName,
        dimensions: dimensions,
        period: period,
        statistic: stat,
        unit: datapoints[0]?.Unit || 'N/A',
        datapoints: datapoints.map(dp => ({
            timestamp: dp.Timestamp,
            value: dp[stat]
        })),
        summary: datapoints.length > 0 ? {
            latest: datapoints[datapoints.length - 1]?.[stat],
            average: datapoints.reduce((sum, dp) => sum + (dp[stat] || 0), 0) / datapoints.length,
            max: Math.max(...datapoints.map(dp => dp[stat] || 0)),
            min: Math.min(...datapoints.map(dp => dp[stat] || Infinity))
        } : null
    };
}

/**
 * Create a new CloudWatch alarm.
 * The alarm will start monitoring immediately after creation.
 *
 * @param {object} params - Alarm configuration
 * @param {string} params.alarmName - Name for the alarm
 * @param {string} params.description - Human-readable description
 * @param {string} params.metricName - Metric to monitor
 * @param {string} params.namespace - AWS namespace
 * @param {string} params.statistic - Statistic to evaluate (default: 'Average')
 * @param {number} params.period - Evaluation period in seconds (default: 300)
 * @param {number} params.evaluationPeriods - How many periods to evaluate
 * @param {number} params.threshold - Threshold value
 * @param {string} params.comparisonOperator - How to compare (GreaterThanThreshold, etc.)
 * @param {Array} params.dimensions - Dimensions for the metric
 * @param {Array} params.alarmActions - SNS topic ARNs to notify on ALARM
 * @param {Array} params.okActions - SNS topic ARNs to notify on OK
 * @param {string} region - AWS region
 * @returns {object} Confirmation of alarm creation
 */
async function createAlarm(params, region) {
    const client = getCloudWatchClient(region);

    await client.send(new PutMetricAlarmCommand({
        AlarmName: params.alarmName,
        AlarmDescription: params.description,
        MetricName: params.metricName,
        Namespace: params.namespace,
        Statistic: params.statistic || 'Average',
        Period: params.period || 300,
        EvaluationPeriods: params.evaluationPeriods || 1,
        Threshold: params.threshold,
        ComparisonOperator: params.comparisonOperator,
        Dimensions: params.dimensions,
        ActionsEnabled: params.actionsEnabled !== false,
        AlarmActions: params.alarmActions || [],
        OKActions: params.okActions || []
    }));

    return {
        alarmName: params.alarmName,
        created: true,
        message: `Alarm ${params.alarmName} created successfully`
    };
}

/**
 * Delete a CloudWatch alarm.
 * The alarm will stop monitoring and be permanently removed.
 *
 * @param {string} alarmName - Name of the alarm to delete
 * @param {string} region - AWS region
 * @returns {object} Confirmation of deletion
 */
async function deleteAlarm(alarmName, region) {
    const client = getCloudWatchClient(region);

    await client.send(new DeleteAlarmsCommand({
        AlarmNames: [alarmName]
    }));

    return {
        alarmName: alarmName,
        deleted: true,
        message: `Alarm ${alarmName} deleted successfully`
    };
}

/**
 * Manually set the state of an alarm.
 * Useful for testing alarm actions without waiting for actual metrics.
 *
 * WARNING: This is for testing only! The alarm will return to its
 * actual state on the next evaluation period.
 *
 * @param {string} alarmName - Name of the alarm
 * @param {string} state - New state ('OK', 'ALARM', or 'INSUFFICIENT_DATA')
 * @param {string} reason - Reason for the state change
 * @param {string} region - AWS region
 * @returns {object} Confirmation of state change
 */
async function setAlarmState(alarmName, state, reason, region) {
    const client = getCloudWatchClient(region);

    await client.send(new SetAlarmStateCommand({
        AlarmName: alarmName,
        StateValue: state,
        StateReason: reason
    }));

    return {
        alarmName: alarmName,
        newState: state,
        message: `Alarm ${alarmName} state set to ${state}`
    };
}

/**
 * List all available metrics in CloudWatch.
 * Optionally filter by namespace to see metrics for a specific service.
 *
 * Results are grouped by namespace for easy browsing.
 *
 * @param {string} namespace - Optional: Filter by namespace (e.g., 'AWS/EC2')
 * @param {string} region - AWS region
 * @returns {object} Metrics grouped by namespace
 */
async function listMetrics(namespace, region) {
    const client = getCloudWatchClient(region);

    const params = {};
    if (namespace) {
        params.Namespace = namespace;
    }

    const response = await client.send(new ListMetricsCommand(params));

    // Group metrics by namespace for easier navigation
    const grouped = {};
    for (const metric of response.Metrics || []) {
        if (!grouped[metric.Namespace]) {
            grouped[metric.Namespace] = [];
        }
        grouped[metric.Namespace].push({
            name: metric.MetricName,
            dimensions: metric.Dimensions
        });
    }

    return grouped;
}

/**
 * Get aggregated Lambda invocation metrics across all functions.
 * Perfect for getting a quick overview of Lambda activity.
 *
 * Returns:
 * - Total invocations
 * - Total errors
 * - Error rate percentage
 * - Average duration
 * - Time-series datapoints
 *
 * @param {string} region - AWS region
 * @param {number} hours - How many hours of data (default: 24)
 * @returns {object} Aggregated Lambda metrics
 */
async function getLambdaInvocations(region, hours = 24) {
    const client = getCloudWatchClient(region);

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Adjust period based on time range
    const period = hours <= 6 ? 300 : (hours <= 24 ? 3600 : 86400);

    // Fetch all three metrics in parallel for efficiency
    const [invocationsResp, errorsResp, durationResp] = await Promise.all([
        client.send(new GetMetricStatisticsCommand({
            Namespace: 'AWS/Lambda',
            MetricName: 'Invocations',
            StartTime: startTime,
            EndTime: endTime,
            Period: period,
            Statistics: ['Sum']
        })),
        client.send(new GetMetricStatisticsCommand({
            Namespace: 'AWS/Lambda',
            MetricName: 'Errors',
            StartTime: startTime,
            EndTime: endTime,
            Period: period,
            Statistics: ['Sum']
        })),
        client.send(new GetMetricStatisticsCommand({
            Namespace: 'AWS/Lambda',
            MetricName: 'Duration',
            StartTime: startTime,
            EndTime: endTime,
            Period: period,
            Statistics: ['Average']
        }))
    ]);

    // Sort all datapoints chronologically
    const invocations = (invocationsResp.Datapoints || []).sort((a, b) =>
        new Date(a.Timestamp) - new Date(b.Timestamp)
    );
    const errors = (errorsResp.Datapoints || []).sort((a, b) =>
        new Date(a.Timestamp) - new Date(b.Timestamp)
    );
    const durations = (durationResp.Datapoints || []).sort((a, b) =>
        new Date(a.Timestamp) - new Date(b.Timestamp)
    );

    // Calculate aggregate totals
    const totalInvocations = invocations.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
    const totalErrors = errors.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
    const avgDuration = durations.length > 0
        ? durations.reduce((sum, dp) => sum + (dp.Average || 0), 0) / durations.length
        : 0;

    return {
        period: period,
        hours: hours,
        totalInvocations: Math.round(totalInvocations),
        totalErrors: Math.round(totalErrors),
        errorRate: totalInvocations > 0 ? ((totalErrors / totalInvocations) * 100).toFixed(2) : 0,
        avgDuration: avgDuration.toFixed(0),
        datapoints: invocations.map((dp, i) => ({
            timestamp: dp.Timestamp,
            invocations: dp.Sum || 0,
            errors: errors[i]?.Sum || 0,
            duration: durations[i]?.Average || 0
        }))
    };
}

/**
 * Get a summary of all alarms in the region.
 * Groups alarms by state and namespace for a quick overview.
 *
 * @param {string} region - AWS region
 * @returns {object} Summary with counts by state and namespace
 */
async function getAlarmsSummary(region) {
    const alarmsResponse = await listAlarms(region, null, 1, 10000);
    // Extract alarms array from paginated response
    const alarms = Array.isArray(alarmsResponse) ? alarmsResponse : (alarmsResponse?.alarms || []);

    const summary = {
        total: alarms.length,
        byState: {
            ALARM: 0,
            OK: 0,
            INSUFFICIENT_DATA: 0
        },
        byNamespace: {}
    };

    for (const alarm of alarms) {
        // Count by state
        summary.byState[alarm.state] = (summary.byState[alarm.state] || 0) + 1;

        // Count by namespace (AWS/EC2, AWS/Lambda, etc.)
        summary.byNamespace[alarm.namespace] = (summary.byNamespace[alarm.namespace] || 0) + 1;
    }

    return summary;
}

module.exports = {
    listAlarms,
    getActiveAlarms,
    getAlarm,
    getAlarmHistory,
    getMetrics,
    createAlarm,
    deleteAlarm,
    setAlarmState,
    listMetrics,
    getAlarmsSummary,
    getLambdaInvocations
};
