'use strict';

/**
 * ============================================================================
 * LAMBDA SERVICE MODULE
 * ============================================================================
 *
 * Handles all AWS Lambda operations.
 * Lambda lets you run code without provisioning servers.
 *
 * Features:
 * - List all Lambda functions
 * - Get function configuration and details
 * - Invoke functions (requires user consent)
 * - View event source mappings (triggers)
 * - Get summary statistics
 *
 * Note: Function invocation requires user consent because:
 * 1. It executes actual code
 * 2. It may trigger external systems
 * 3. It incurs AWS charges
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    ListFunctionsCommand,
    GetFunctionCommand,
    InvokeCommand,
    GetFunctionConfigurationCommand,
    ListEventSourceMappingsCommand
} = require("@aws-sdk/client-lambda");

const { getLambdaClient } = require("../utils/aws-clients");
const { formatBytes } = require("../utils/helpers");

/**
 * List all Lambda functions in the region.
 * Paginates through results to get all functions.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of functions with configuration details
 */
async function listFunctions(region) {
    const client = getLambdaClient(region);

    const functions = [];
    let marker = null;

    // Paginate through all functions (Lambda returns max 50 per request)
    do {
        const params = { MaxItems: 50 };
        if (marker) params.Marker = marker;

        const response = await client.send(new ListFunctionsCommand(params));

        for (const fn of response.Functions || []) {
            functions.push({
                name: fn.FunctionName,
                runtime: fn.Runtime,
                handler: fn.Handler,
                memory: fn.MemorySize,
                timeout: fn.Timeout,
                codeSize: fn.CodeSize,
                codeSizeFormatted: formatBytes(fn.CodeSize),
                lastModified: fn.LastModified,
                description: fn.Description || '',
                role: fn.Role,
                arn: fn.FunctionArn,
                state: fn.State,
                packageType: fn.PackageType
            });
        }

        marker = response.NextMarker;
    } while (marker);

    return functions;
}

/**
 * Get detailed configuration for a specific function.
 * Includes environment variables (names only, not values for security),
 * layers, VPC config, and more.
 *
 * @param {string} functionName - Name or ARN of the function
 * @param {string} region - AWS region
 * @returns {object} Detailed function configuration
 */
async function getFunction(functionName, region) {
    const client = getLambdaClient(region);

    const response = await client.send(new GetFunctionCommand({
        FunctionName: functionName
    }));

    const config = response.Configuration;

    return {
        name: config.FunctionName,
        runtime: config.Runtime,
        handler: config.Handler,
        memory: config.MemorySize,
        timeout: config.Timeout,
        codeSize: config.CodeSize,
        codeSizeFormatted: formatBytes(config.CodeSize),
        lastModified: config.LastModified,
        description: config.Description || '',
        role: config.Role,
        arn: config.FunctionArn,
        state: config.State,
        stateReason: config.StateReason,
        packageType: config.PackageType,
        architectures: config.Architectures,
        // Only show env var NAMES, not values (security)
        environment: config.Environment?.Variables ?
            Object.keys(config.Environment.Variables) : [],
        layers: (config.Layers || []).map(l => ({
            arn: l.Arn,
            codeSize: l.CodeSize
        })),
        vpcConfig: config.VpcConfig ? {
            vpcId: config.VpcConfig.VpcId,
            subnetIds: config.VpcConfig.SubnetIds,
            securityGroupIds: config.VpcConfig.SecurityGroupIds
        } : null,
        codeLocation: response.Code?.Location ? 'S3' : 'Inline'
    };
}

/**
 * Invoke a Lambda function.
 * This actually RUNS the function code!
 *
 * Invocation types:
 * - RequestResponse: Synchronous, wait for result (default)
 * - Event: Asynchronous, fire and forget
 * - DryRun: Validate parameters without executing
 *
 * @param {string} functionName - Function to invoke
 * @param {object} payload - Input data for the function
 * @param {string} region - AWS region
 * @param {string} invocationType - How to invoke (default: RequestResponse)
 * @returns {object} Invocation result with response and logs
 */
async function invokeFunction(functionName, payload, region, invocationType = 'RequestResponse') {
    const client = getLambdaClient(region);

    const params = {
        FunctionName: functionName,
        InvocationType: invocationType,
        LogType: 'Tail'  // Include last 4KB of logs in response
    };

    if (payload) {
        params.Payload = JSON.stringify(payload);
    }

    // Track execution time
    const startTime = Date.now();
    const response = await client.send(new InvokeCommand(params));
    const duration = Date.now() - startTime;

    // Decode the response payload
    let responsePayload = null;
    if (response.Payload) {
        const payloadString = new TextDecoder().decode(response.Payload);
        try {
            responsePayload = JSON.parse(payloadString);
        } catch {
            responsePayload = payloadString;
        }
    }

    // Decode the logs (they're base64 encoded)
    let logs = null;
    if (response.LogResult) {
        logs = Buffer.from(response.LogResult, 'base64').toString('utf-8');
    }

    return {
        functionName: functionName,
        statusCode: response.StatusCode,
        executedVersion: response.ExecutedVersion,
        functionError: response.FunctionError,
        response: responsePayload,
        logs: logs,
        duration: duration,
        billedDuration: logs ? extractBilledDuration(logs) : null
    };
}

/**
 * Extract billed duration from Lambda logs.
 * Lambda logs include a line like "Billed Duration: 100 ms"
 *
 * @param {string} logs - Lambda execution logs
 * @returns {number|null} Billed duration in milliseconds
 */
function extractBilledDuration(logs) {
    const match = logs.match(/Billed Duration: (\d+) ms/);
    return match ? parseInt(match[1]) : null;
}

/**
 * Get summary statistics for all Lambda functions.
 * Groups functions by runtime, memory size, and state.
 *
 * @param {string} region - AWS region
 * @returns {object} Summary with counts and totals
 */
async function getFunctionsSummary(region) {
    const functions = await listFunctions(region);

    const summary = {
        total: functions.length,
        totalCodeSize: 0,
        byRuntime: {},
        byMemory: {},
        byState: {}
    };

    for (const fn of functions) {
        summary.totalCodeSize += fn.codeSize || 0;

        // Count by runtime (nodejs18.x, python3.11, etc.)
        summary.byRuntime[fn.runtime] = (summary.byRuntime[fn.runtime] || 0) + 1;

        // Count by memory allocation
        const memoryBucket = `${fn.memory}MB`;
        summary.byMemory[memoryBucket] = (summary.byMemory[memoryBucket] || 0) + 1;

        // Count by state (Active, Pending, etc.)
        const state = fn.state || 'Active';
        summary.byState[state] = (summary.byState[state] || 0) + 1;
    }

    summary.totalCodeSizeFormatted = formatBytes(summary.totalCodeSize);

    return summary;
}

/**
 * List event source mappings for a function.
 * Event sources are triggers like SQS queues, DynamoDB streams, etc.
 *
 * @param {string} functionName - Function to get mappings for
 * @param {string} region - AWS region
 * @returns {Array} List of event source mappings
 */
async function listEventSourceMappings(functionName, region) {
    const client = getLambdaClient(region);

    const response = await client.send(new ListEventSourceMappingsCommand({
        FunctionName: functionName
    }));

    return (response.EventSourceMappings || []).map(esm => ({
        uuid: esm.UUID,
        eventSourceArn: esm.EventSourceArn,
        functionArn: esm.FunctionArn,
        state: esm.State,
        batchSize: esm.BatchSize,
        lastModified: esm.LastModified
    }));
}

module.exports = {
    listFunctions,
    getFunction,
    invokeFunction,
    getFunctionsSummary,
    listEventSourceMappings
};
