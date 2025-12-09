'use strict';

/**
 * ============================================================================
 * LAMBDA WIDGET CONTROLLER
 * ============================================================================
 * 
 * Handles Lambda function operations for the interactive dashboard widget.
 * Provides function invocation, configuration, logs, and code updates.
 * 
 * Author: AWS Cloud Commander
 * ============================================================================
 */

const lambdaService = require('../../services/lambda');
const { successResponse, errorResponse } = require('../../utils/helpers');

/**
 * Lambda Widget Controller
 * Handles all Lambda function operations from the dashboard widget
 */
async function handleLambdaWidget(req, res) {
  try {
    const { action, functionName, payload, updates, limit, userId, region = 'ap-south-1' } = req.body;

    console.log(`[Lambda Widget] ${action} - user: ${userId}, function: ${functionName || 'N/A'}`);

    if (!userId) {
      return res.status(400).json(errorResponse('User ID is required', 'NO_USER_ID'));
    }

    // Route to appropriate handler based on action
    switch (action) {
      // GET Actions
      case 'list':
        return await handleListFunctions(res, region);

      case 'getConfiguration':
        return await handleGetConfiguration(res, functionName, region);

      case 'getLogs':
        return await handleGetLogs(res, functionName, region, limit);

      // POST Actions
      case 'invoke':
        return await handleInvoke(res, functionName, payload, region);

      case 'updateCode':
        return await handleUpdateCode(req, res, functionName, region);

      case 'updateConfiguration':
        return await handleUpdateConfiguration(res, functionName, updates, region);

      default:
        return res.status(400).json(errorResponse(`Unknown action: ${action}`, 'INVALID_ACTION'));
    }
  } catch (error) {
    console.error('[Lambda Widget] Error:', error);
    return res.status(500).json(errorResponse(error.message, 'SERVER_ERROR'));
  }
}

async function handleListFunctions(res, region) {
  try {
    const result = await lambdaService.listFunctions(region, 1, 10000);
    const functions = result.functions || result; // Support both old and new format
    return res.json(successResponse({ functions: functions }));
  } catch (error) {
    console.error('[Lambda] Error listing functions:', error);
    return res.status(500).json(errorResponse(error.message, 'LIST_FAILED'));
  }
}

/**
 * Get function configuration
 */
async function handleGetConfiguration(res, functionName, region) {
  try {
    if (!functionName) {
      return res.status(400).json(errorResponse('Function name is required', 'MISSING_FUNCTION_NAME'));
    }

    const functionData = await lambdaService.getFunction(functionName, region);
    return res.json(successResponse({ function: functionData }));
  } catch (error) {
    console.error('[Lambda] Error getting function configuration:', error);
    return res.status(500).json(errorResponse(error.message, 'GET_CONFIG_FAILED'));
  }
}

/**
 * Get CloudWatch logs for function
 */
async function handleGetLogs(res, functionName, region, limit = 100) {
  try {
    if (!functionName) {
      return res.status(400).json(errorResponse('Function name is required', 'MISSING_FUNCTION_NAME'));
    }

    const logs = await lambdaService.getFunctionLogs(functionName, region, limit);
    return res.json(successResponse({ logs: logs }));
  } catch (error) {
    console.error('[Lambda] Error getting function logs:', error);
    return res.status(500).json(errorResponse(error.message, 'GET_LOGS_FAILED'));
  }
}

/**
 * Invoke Lambda function
 */
async function handleInvoke(res, functionName, payload, region) {
  try {
    if (!functionName) {
      return res.status(400).json(errorResponse('Function name is required', 'MISSING_FUNCTION_NAME'));
    }

    // Parse payload if it's a string
    let parsedPayload = payload;
    if (typeof payload === 'string' && payload.trim()) {
      try {
        parsedPayload = JSON.parse(payload);
      } catch (e) {
        return res.status(400).json(errorResponse('Invalid JSON payload', 'INVALID_PAYLOAD'));
      }
    }

    const result = await lambdaService.invokeFunction(functionName, parsedPayload, region);
    return res.json(successResponse({ invocation: result }));
  } catch (error) {
    console.error('[Lambda] Error invoking function:', error);
    return res.status(500).json(errorResponse(error.message, 'INVOKE_FAILED'));
  }
}

/**
 * Update Lambda function code
 * Expects multipart/form-data with ZIP file
 */
async function handleUpdateCode(req, res, functionName, region) {
  try {
    if (!functionName) {
      return res.status(400).json(errorResponse('Function name is required', 'MISSING_FUNCTION_NAME'));
    }

    if (!req.file) {
      return res.status(400).json(errorResponse('ZIP file is required', 'MISSING_FILE'));
    }

    const result = await lambdaService.updateFunctionCode(functionName, req.file.buffer, region);
    return res.json(successResponse({ function: result }));
  } catch (error) {
    console.error('[Lambda] Error updating function code:', error);
    return res.status(500).json(errorResponse(error.message, 'UPDATE_CODE_FAILED'));
  }
}

/**
 * Update Lambda function configuration
 */
async function handleUpdateConfiguration(res, functionName, updates, region) {
  try {
    if (!functionName) {
      return res.status(400).json(errorResponse('Function name is required', 'MISSING_FUNCTION_NAME'));
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json(errorResponse('Configuration updates are required', 'MISSING_UPDATES'));
    }

    const result = await lambdaService.updateFunctionConfiguration(functionName, updates, region);
    return res.json(successResponse({ configuration: result }));
  } catch (error) {
    console.error('[Lambda] Error updating function configuration:', error);
    return res.status(500).json(errorResponse(error.message, 'UPDATE_CONFIG_FAILED'));
  }
}

module.exports = {
  handleLambdaWidget
};
