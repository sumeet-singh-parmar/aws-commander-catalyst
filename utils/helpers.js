'use strict';

/**
 * Helper Utilities
 * Common functions used across services
 */

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

/**
 * Get date range for cost queries
 */
function getDateRange(period) {
    const end = new Date();
    const start = new Date();
    
    switch (period) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end.setDate(end.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            break;
        case 'week':
            start.setDate(start.getDate() - 7);
            break;
        case 'month':
            start.setDate(start.getDate() - 30);
            break;
        case 'quarter':
            start.setDate(start.getDate() - 90);
            break;
        case 'year':
            start.setFullYear(start.getFullYear(), 0, 1);
            break;
        default:
            start.setDate(start.getDate() - 7);
    }
    
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
    };
}

/**
 * Get state emoji for EC2
 */
function getEC2StateEmoji(state) {
    const states = {
        'running': '🟢',
        'stopped': '🔴',
        'pending': '🟡',
        'stopping': '🟠',
        'terminated': '⚫',
        'shutting-down': '🟠'
    };
    return states[state] || '⚪';
}

/**
 * Get alarm state emoji
 */
function getAlarmStateEmoji(state) {
    const states = {
        'ALARM': '🚨',
        'OK': '✅',
        'INSUFFICIENT_DATA': '❓'
    };
    return states[state] || '❓';
}

/**
 * Get service emoji
 */
function getServiceEmoji(serviceName) {
    const services = {
        'Amazon Elastic Compute Cloud': '💻',
        'Amazon EC2': '💻',
        'EC2 - Other': '💻',
        'Amazon Simple Storage Service': '📦',
        'Amazon S3': '📦',
        'Amazon RDS': '🗄️',
        'AWS Lambda': '⚡',
        'Amazon CloudWatch': '📊',
        'AmazonCloudWatch': '📊',
        'Amazon DynamoDB': '🗃️',
        'Amazon SNS': '🔔',
        'Amazon SQS': '📬',
        'AWS Cost Explorer': '💰',
        'Amazon Virtual Private Cloud': '🌐',
        'AWS Glue': '🔗',
        'AWS Key Management Service': '🔐',
        'AWS Secrets Manager': '🔒',
        'Amazon Bedrock': '🤖'
    };
    
    for (const [key, emoji] of Object.entries(services)) {
        if (serviceName.includes(key) || key.includes(serviceName)) {
            return emoji;
        }
    }
    return '☁️';
}

/**
 * Extract name from AWS tags
 */
function getNameFromTags(tags) {
    if (!tags || !Array.isArray(tags)) return 'Unnamed';
    
    const nameTag = tags.find(tag => tag.Key === 'Name');
    return nameTag ? nameTag.Value : 'Unnamed';
}

/**
 * Parse time duration string (e.g., "1h", "30m", "1d")
 */
function parseDuration(duration) {
    const match = duration.match(/^(\d+)([hdm])$/);
    if (!match) return 3600000; // Default 1 hour
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        default: return 3600000;
    }
}

/**
 * Create standard success response
 */
function successResponse(data) {
    return {
        success: true,
        data: data,
        timestamp: new Date().toISOString()
    };
}

/**
 * Create standard error response
 */
function errorResponse(message, code = 'ERROR') {
    return {
        success: false,
        error: message,
        code: code,
        timestamp: new Date().toISOString()
    };
}

/**
 * Truncate string with ellipsis
 */
function truncate(str, length = 100) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length - 3) + '...';
}

/**
 * Format timestamp to readable string
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

module.exports = {
    formatBytes,
    formatCurrency,
    getDateRange,
    getEC2StateEmoji,
    getAlarmStateEmoji,
    getServiceEmoji,
    getNameFromTags,
    parseDuration,
    successResponse,
    errorResponse,
    truncate,
    formatTimestamp
};
