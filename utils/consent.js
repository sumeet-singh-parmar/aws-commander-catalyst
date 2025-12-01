'use strict';

/**
 * User Consent Service
 * Tracks per-user consent for paid API actions
 * 
 * Stores in Catalyst Data Store table: user_consent
 */

// In-memory cache (for when DB is not available or for quick lookups)
const consentCache = new Map();

// Paid action categories
const PAID_CATEGORIES = {
    cost_explorer: {
        name: 'Cost Explorer',
        description: 'AWS Cost & Usage Reports',
        costInfo: '$0.01 per API call',
        actions: ['cost:getUsage', 'cost:byPeriod', 'cost:forecast', 'cost:monthToDate', 'cost:comparison', 'cost:topServices', 'cost:trend', 'cost:byTag']
    },
    bedrock_ai: {
        name: 'Bedrock AI (Claude)',
        description: 'AI-powered assistance using Amazon Bedrock',
        costInfo: '~$0.01-0.15 per query',
        actions: ['bedrock:chat', 'bedrock:chatWithContext', 'bedrock:generateCfn', 'bedrock:generateIam', 'bedrock:generateLambda', 'bedrock:troubleshoot', 'bedrock:optimize', 'bedrock:reviewArchitecture', 'bedrock:explain', 'bedrock:generateCli']
    },
    lambda_invoke: {
        name: 'Lambda Invocation',
        description: 'Execute Lambda functions',
        costInfo: 'Depends on function (uses your Lambda quota)',
        actions: ['lambda:invoke']
    },
    sns_publish: {
        name: 'SNS Notifications',
        description: 'Send messages via SNS',
        costInfo: '$0.50 per 1M publishes + SMS costs',
        actions: ['sns:publish', 'sns:publishDirect']
    }
};

/**
 * Get category for an action
 */
function getCategoryForAction(service, action) {
    const actionKey = `${service}:${action}`;
    
    for (const [categoryId, category] of Object.entries(PAID_CATEGORIES)) {
        if (category.actions.includes(actionKey)) {
            return {
                categoryId,
                ...category
            };
        }
    }
    
    return null;
}

/**
 * Check if action requires consent
 */
function requiresConsent(service, action) {
    return getCategoryForAction(service, action) !== null;
}

/**
 * Get user consent status from cache
 */
function getUserConsentFromCache(userId, categoryId) {
    const key = `${userId}:${categoryId}`;
    return consentCache.get(key);
}

/**
 * Set user consent in cache
 */
function setUserConsentInCache(userId, categoryId, consent) {
    const key = `${userId}:${categoryId}`;
    consentCache.set(key, {
        consent,
        timestamp: new Date().toISOString()
    });
}

/**
 * Check if user has consented to a paid action category
 * Returns: { hasConsent: boolean, category: object }
 */
async function checkUserConsent(userId, service, action, catalystApp = null) {
    const category = getCategoryForAction(service, action);
    
    // Not a paid action
    if (!category) {
        return { hasConsent: true, isPaidAction: false };
    }
    
    // Check cache first
    const cached = getUserConsentFromCache(userId, category.categoryId);
    if (cached && cached.consent === true) {
        return { 
            hasConsent: true, 
            isPaidAction: true,
            category,
            source: 'cache'
        };
    }
    
    // Check database if Catalyst app provided
    if (catalystApp) {
        try {
            const datastore = catalystApp.datastore();
            const table = datastore.table('user_consent');
            
            // Query for user's consent
            const query = `SELECT * FROM user_consent WHERE user_id = '${userId}' AND category_id = '${category.categoryId}' AND consent = true`;
            const response = await table.executeQuery(query);
            
            if (response && response.length > 0) {
                // User has consented, update cache
                setUserConsentInCache(userId, category.categoryId, true);
                return {
                    hasConsent: true,
                    isPaidAction: true,
                    category,
                    source: 'database',
                    consentedAt: response[0].consented_at
                };
            }
        } catch (error) {
            console.error('Error checking consent from DB:', error.message);
            // Continue without DB - will ask for consent
        }
    }
    
    // No consent found
    return {
        hasConsent: false,
        isPaidAction: true,
        category,
        consentRequired: {
            categoryId: category.categoryId,
            name: category.name,
            description: category.description,
            costInfo: category.costInfo,
            message: `This action uses ${category.name} which costs ${category.costInfo}. Do you want to enable this for your account?`,
            howToConsent: 'Include "consent": true and "userId": "your-user-id" in your request to accept'
        }
    };
}

/**
 * Record user consent
 */
async function recordUserConsent(userId, categoryId, consent, catalystApp = null, metadata = {}) {
    const category = PAID_CATEGORIES[categoryId];
    
    if (!category) {
        throw new Error(`Invalid category: ${categoryId}`);
    }
    
    // Update cache
    setUserConsentInCache(userId, categoryId, consent);
    
    // Store in database if Catalyst app provided
    if (catalystApp) {
        try {
            const datastore = catalystApp.datastore();
            const table = datastore.table('user_consent');
            
            // Check if record exists
            const query = `SELECT ROWID FROM user_consent WHERE user_id = '${userId}' AND category_id = '${categoryId}'`;
            const existing = await table.executeQuery(query);
            
            const record = {
                user_id: userId,
                category_id: categoryId,
                category_name: category.name,
                consent: consent,
                consented_at: new Date().toISOString(),
                user_name: metadata.userName || null,
                user_email: metadata.userEmail || null
            };
            
            if (existing && existing.length > 0) {
                // Update existing
                record.ROWID = existing[0].ROWID;
                await table.updateRow(record);
            } else {
                // Insert new
                await table.insertRow(record);
            }
            
            return {
                success: true,
                userId,
                categoryId,
                consent,
                message: consent 
                    ? `You have enabled ${category.name}. You can now use these features.`
                    : `You have disabled ${category.name}.`,
                source: 'database'
            };
        } catch (error) {
            console.error('Error recording consent to DB:', error.message);
            // Still return success since cache is updated
            return {
                success: true,
                userId,
                categoryId,
                consent,
                message: consent 
                    ? `You have enabled ${category.name} (session only - DB save failed).`
                    : `You have disabled ${category.name} (session only).`,
                source: 'cache',
                dbError: error.message
            };
        }
    }
    
    return {
        success: true,
        userId,
        categoryId,
        consent,
        message: consent 
            ? `You have enabled ${category.name} for this session.`
            : `You have disabled ${category.name} for this session.`,
        source: 'cache'
    };
}

/**
 * Get all consent status for a user
 */
async function getUserConsentStatus(userId, catalystApp = null) {
    const status = {};
    
    for (const [categoryId, category] of Object.entries(PAID_CATEGORIES)) {
        const cached = getUserConsentFromCache(userId, categoryId);
        
        status[categoryId] = {
            name: category.name,
            description: category.description,
            costInfo: category.costInfo,
            consent: cached?.consent || false,
            consentedAt: cached?.timestamp || null,
            source: cached ? 'cache' : 'none'
        };
    }
    
    // Check database if available
    if (catalystApp) {
        try {
            const datastore = catalystApp.datastore();
            const table = datastore.table('user_consent');
            
            const query = `SELECT * FROM user_consent WHERE user_id = '${userId}'`;
            const records = await table.executeQuery(query);
            
            for (const record of records || []) {
                if (status[record.category_id]) {
                    status[record.category_id].consent = record.consent;
                    status[record.category_id].consentedAt = record.consented_at;
                    status[record.category_id].source = 'database';
                }
            }
        } catch (error) {
            console.error('Error fetching consent status from DB:', error.message);
        }
    }
    
    return {
        userId,
        categories: status,
        summary: {
            total: Object.keys(PAID_CATEGORIES).length,
            consented: Object.values(status).filter(s => s.consent).length
        }
    };
}

/**
 * Revoke consent for a category
 */
async function revokeConsent(userId, categoryId, catalystApp = null) {
    return await recordUserConsent(userId, categoryId, false, catalystApp);
}

/**
 * Revoke all consents for a user
 */
async function revokeAllConsents(userId, catalystApp = null) {
    const results = [];
    
    for (const categoryId of Object.keys(PAID_CATEGORIES)) {
        const result = await revokeConsent(userId, categoryId, catalystApp);
        results.push(result);
    }
    
    return {
        userId,
        revoked: results.length,
        message: 'All paid feature consents have been revoked.'
    };
}

/**
 * Get all paid categories info
 */
function getPaidCategories() {
    return Object.entries(PAID_CATEGORIES).map(([id, category]) => ({
        categoryId: id,
        name: category.name,
        description: category.description,
        costInfo: category.costInfo,
        actionCount: category.actions.length
    }));
}

/**
 * Generate consent request response
 */
function generateConsentRequest(userId, service, action) {
    const category = getCategoryForAction(service, action);
    
    if (!category) {
        return null;
    }
    
    return {
        requiresConsent: true,
        userId: userId || 'unknown',
        category: {
            id: category.categoryId,
            name: category.name,
            description: category.description,
            costInfo: category.costInfo
        },
        message: `⚠️ This action requires your consent as it incurs AWS charges.`,
        details: `${category.name}: ${category.costInfo}`,
        actions: {
            accept: {
                description: 'Enable this feature for your account',
                request: {
                    service: 'consent',
                    action: 'grant',
                    userId: userId,
                    categoryId: category.categoryId
                }
            },
            decline: {
                description: 'Cancel this request',
                message: 'No charges will be incurred'
            },
            viewAll: {
                description: 'View all paid features',
                request: {
                    service: 'consent',
                    action: 'list'
                }
            }
        }
    };
}

module.exports = {
    PAID_CATEGORIES,
    getCategoryForAction,
    requiresConsent,
    checkUserConsent,
    recordUserConsent,
    getUserConsentStatus,
    revokeConsent,
    revokeAllConsents,
    getPaidCategories,
    generateConsentRequest
};
