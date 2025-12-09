'use strict';

/**
 * ============================================================================
 * COST EXPLORER SERVICE MODULE
 * ============================================================================
 *
 * Handles AWS Cost Explorer operations for billing and cost analysis.
 * Cost Explorer gives you visibility into your AWS spending - see what
 * services cost money, track trends, and forecast future costs.
 *
 * Features:
 * - Get cost and usage data by service, tag, or time period
 * - View month-to-date spending
 * - Compare costs between periods
 * - Forecast future costs
 * - See daily spending trends
 * - Identify top cost drivers
 *
 * Important Notes:
 * - Cost Explorer API itself has charges (~$0.01 per request)
 * - Data may be delayed by 24-48 hours
 * - Always uses us-east-1 region (Cost Explorer is a global service)
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    GetCostAndUsageCommand,
    GetCostForecastCommand,
    GetDimensionValuesCommand
} = require("@aws-sdk/client-cost-explorer");

const { getCostExplorerClient } = require("../utils/aws-clients");
const { formatCurrency, getDateRange, getServiceEmoji } = require("../utils/helpers");

/**
 * Get raw cost and usage data from AWS.
 * This is the base function - other functions build on top of it.
 *
 * @param {string} startDate - Start date (YYYY-MM-DD format)
 * @param {string} endDate - End date (YYYY-MM-DD format)
 * @param {string} granularity - Time granularity: 'DAILY', 'MONTHLY', or 'HOURLY'
 * @param {string} groupBy - How to group: 'SERVICE', 'REGION', 'LINKED_ACCOUNT', etc.
 * @returns {Array} Raw cost data from AWS
 */
async function getCostAndUsage(startDate, endDate, granularity = 'DAILY', groupBy = 'SERVICE') {
    const client = getCostExplorerClient();

    const params = {
        TimePeriod: {
            Start: startDate,
            End: endDate
        },
        Granularity: granularity,
        Metrics: ['UnblendedCost', 'UsageQuantity']
    };

    if (groupBy) {
        params.GroupBy = [{ Type: 'DIMENSION', Key: groupBy }];
    }

    const response = await client.send(new GetCostAndUsageCommand(params));

    return response.ResultsByTime;
}

/**
 * Get costs for a time period with nice formatting.
 * Aggregates by service and provides summary statistics.
 *
 * @param {string} period - Time period: 'today', 'week', 'month', 'quarter'
 * @param {string} groupBy - How to group costs (default: 'SERVICE')
 * @returns {object} Formatted cost data with totals and breakdowns
 */
async function getCostsByPeriod(period = 'week', groupBy = 'SERVICE') {
    const { startDate, endDate } = getDateRange(period);
    const rawData = await getCostAndUsage(startDate, endDate, 'DAILY', groupBy);

    // Process and aggregate the raw data
    let totalCost = 0;
    const serviceCosts = {};
    const dailyCosts = [];

    for (const day of rawData) {
        let dayTotal = 0;

        for (const group of day.Groups || []) {
            const service = group.Keys[0];
            const amount = parseFloat(group.Metrics.UnblendedCost.Amount);

            dayTotal += amount;
            serviceCosts[service] = (serviceCosts[service] || 0) + amount;
        }

        totalCost += dayTotal;
        dailyCosts.push({
            date: day.TimePeriod.Start,
            cost: dayTotal
        });
    }

    // Sort services by cost (highest first)
    const sortedServices = Object.entries(serviceCosts)
        .sort((a, b) => b[1] - a[1])
        .map(([service, cost]) => ({
            service: service,
            emoji: getServiceEmoji(service),
            cost: cost,
            costFormatted: formatCurrency(cost),
            percentage: totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : 0
        }));

    return {
        period: period,
        startDate: startDate,
        endDate: endDate,
        totalCost: totalCost,
        totalCostFormatted: formatCurrency(totalCost),
        dailyAverage: totalCost / dailyCosts.length,
        dailyAverageFormatted: formatCurrency(totalCost / dailyCosts.length),
        byService: sortedServices,
        daily: dailyCosts,
        currency: 'USD'
    };
}

/**
 * Get cost forecast for a future time period.
 * AWS uses machine learning to predict your future costs based on history.
 *
 * Note: Forecast only works for FUTURE dates. If you pass past dates,
 * it will automatically adjust to start from today.
 *
 * @param {string} startDate - Forecast start date (YYYY-MM-DD)
 * @param {string} endDate - Forecast end date (YYYY-MM-DD)
 * @param {string} granularity - 'DAILY' or 'MONTHLY'
 * @returns {object} Cost forecast with confidence intervals
 */
async function getCostForecast(startDate, endDate, granularity = 'MONTHLY') {
    const client = getCostExplorerClient();

    // Forecast requires future dates - adjust if needed
    const today = new Date().toISOString().split('T')[0];
    const forecastStart = startDate > today ? startDate : today;

    const response = await client.send(new GetCostForecastCommand({
        TimePeriod: {
            Start: forecastStart,
            End: endDate
        },
        Metric: 'UNBLENDED_COST',
        Granularity: granularity
    }));

    return {
        total: {
            amount: parseFloat(response.Total?.Amount || 0),
            amountFormatted: formatCurrency(parseFloat(response.Total?.Amount || 0)),
            unit: response.Total?.Unit || 'USD'
        },
        forecast: (response.ForecastResultsByTime || []).map(f => ({
            startDate: f.TimePeriod.Start,
            endDate: f.TimePeriod.End,
            meanValue: parseFloat(f.MeanValue),
            meanValueFormatted: formatCurrency(parseFloat(f.MeanValue)),
            predictionIntervalLowerBound: parseFloat(f.PredictionIntervalLowerBound || 0),
            predictionIntervalUpperBound: parseFloat(f.PredictionIntervalUpperBound || 0)
        }))
    };
}

/**
 * Get month-to-date costs.
 * Shows spending from the 1st of the current month until today.
 *
 * @returns {object} Month-to-date cost data
 */
async function getMonthToDateCosts() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = startOfMonth.toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];

    return await getCostsByPeriod('month');
}

/**
 * Compare costs between this month and last month.
 * Compares the same number of days for fair comparison.
 *
 * Example: If today is the 15th, compares:
 * - This month: 1st to 15th
 * - Last month: 1st to 15th
 *
 * @returns {object} Cost comparison with trends
 */
async function getCostComparison() {
    const now = new Date();

    // This month (1st to today)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const thisMonthEnd = now.toISOString().split('T')[0];

    // Last month (same number of days for fair comparison)
    const dayOfMonth = now.getDate();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth).toISOString().split('T')[0];

    // Fetch both periods
    const thisMonthData = await getCostAndUsage(thisMonthStart, thisMonthEnd, 'MONTHLY', null);
    const lastMonthData = await getCostAndUsage(lastMonthStart, lastMonthEnd, 'MONTHLY', null);

    const thisMonthCost = parseFloat(thisMonthData[0]?.Total?.UnblendedCost?.Amount || 0);
    const lastMonthCost = parseFloat(lastMonthData[0]?.Total?.UnblendedCost?.Amount || 0);

    // Calculate difference and trend
    const difference = thisMonthCost - lastMonthCost;
    const percentChange = lastMonthCost > 0 ? ((difference / lastMonthCost) * 100) : 0;

    return {
        thisMonth: {
            period: `${thisMonthStart} to ${thisMonthEnd}`,
            cost: thisMonthCost,
            costFormatted: formatCurrency(thisMonthCost)
        },
        lastMonth: {
            period: `${lastMonthStart} to ${lastMonthEnd}`,
            cost: lastMonthCost,
            costFormatted: formatCurrency(lastMonthCost)
        },
        difference: {
            amount: difference,
            amountFormatted: formatCurrency(Math.abs(difference)),
            percentChange: percentChange.toFixed(1),
            trend: difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'stable',
            trendEmoji: difference > 0 ? '📈' : difference < 0 ? '📉' : '➡️'
        }
    };
}

/**
 * Get the top services by cost.
 * Quick way to see what's costing you the most money.
 *
 * @param {string} period - Time period to analyze
 * @param {number} limit - How many services to return (default: 10)
 * @returns {object} Top services by cost
 */
async function getTopServices(period = 'month', limit = 10) {
    const costs = await getCostsByPeriod(period);

    return {
        period: period,
        totalCost: costs.totalCost,
        totalCostFormatted: costs.totalCostFormatted,
        topServices: costs.byService.slice(0, limit)
    };
}

/**
 * Get daily cost trend over a period.
 * Shows how costs are changing day by day and calculates overall trend.
 *
 * @param {number} days - How many days to analyze (default: 30)
 * @returns {object} Daily costs with trend analysis
 */
async function getDailyCostTrend(days = 30) {
    const { startDate, endDate } = getDateRange('month');
    const rawData = await getCostAndUsage(startDate, endDate, 'DAILY', null);

    const dailyCosts = rawData.map(day => ({
        date: day.TimePeriod.Start,
        cost: parseFloat(day.Total?.UnblendedCost?.Amount || 0),
        costFormatted: formatCurrency(parseFloat(day.Total?.UnblendedCost?.Amount || 0))
    }));

    // Calculate trend by comparing first half vs second half
    if (dailyCosts.length >= 2) {
        const firstHalf = dailyCosts.slice(0, Math.floor(dailyCosts.length / 2));
        const secondHalf = dailyCosts.slice(Math.floor(dailyCosts.length / 2));

        const firstAvg = firstHalf.reduce((sum, d) => sum + d.cost, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, d) => sum + d.cost, 0) / secondHalf.length;

        const trend = secondAvg > firstAvg ? 'increasing' : secondAvg < firstAvg ? 'decreasing' : 'stable';

        return {
            daily: dailyCosts,
            trend: trend,
            trendEmoji: trend === 'increasing' ? '📈' : trend === 'decreasing' ? '📉' : '➡️',
            average: dailyCosts.reduce((sum, d) => sum + d.cost, 0) / dailyCosts.length,
            averageFormatted: formatCurrency(dailyCosts.reduce((sum, d) => sum + d.cost, 0) / dailyCosts.length)
        };
    }

    return { daily: dailyCosts };
}

/**
 * Get costs grouped by a specific tag.
 * Great for cost allocation - see costs by project, team, environment, etc.
 *
 * Note: Resources must be tagged for this to work. Untagged resources
 * show up as "Untagged".
 *
 * @param {string} tagKey - The tag key to group by (e.g., 'Project', 'Environment')
 * @param {string} period - Time period to analyze
 * @returns {object} Costs grouped by tag value
 */
async function getCostByTag(tagKey, period = 'month') {
    const { startDate, endDate } = getDateRange(period);
    const client = getCostExplorerClient();

    const response = await client.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: startDate, End: endDate },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'TAG', Key: tagKey }]
    }));

    const tagCosts = {};
    let totalCost = 0;

    for (const result of response.ResultsByTime || []) {
        for (const group of result.Groups || []) {
            // AWS returns tag values as "tagKey$tagValue"
            const tagValue = group.Keys[0].replace(`${tagKey}$`, '') || 'Untagged';
            const amount = parseFloat(group.Metrics.UnblendedCost.Amount);

            tagCosts[tagValue] = (tagCosts[tagValue] || 0) + amount;
            totalCost += amount;
        }
    }

    return {
        tagKey: tagKey,
        period: period,
        totalCost: totalCost,
        totalCostFormatted: formatCurrency(totalCost),
        byTagValue: Object.entries(tagCosts)
            .sort((a, b) => b[1] - a[1])
            .map(([value, cost]) => ({
                tagValue: value,
                cost: cost,
                costFormatted: formatCurrency(cost),
                percentage: ((cost / totalCost) * 100).toFixed(1)
            }))
    };
}

module.exports = {
    getCostAndUsage,
    getCostsByPeriod,
    getCostForecast,
    getMonthToDateCosts,
    getCostComparison,
    getTopServices,
    getDailyCostTrend,
    getCostByTag
};
