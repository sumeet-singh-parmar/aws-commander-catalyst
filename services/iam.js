'use strict';

/**
 * ============================================================================
 * IAM SERVICE MODULE
 * ============================================================================
 *
 * Handles AWS Identity and Access Management (IAM) operations.
 * IAM is the security backbone of AWS - it controls WHO can do WHAT
 * on WHICH resources.
 *
 * Features:
 * - List and inspect IAM users
 * - List and inspect IAM roles
 * - List IAM policies
 * - Get account security summary
 * - Security status checks and recommendations
 *
 * IAM Key Concepts:
 * - Users: Human identities (people who log in)
 * - Roles: Machine identities (assumed by services or users)
 * - Policies: Permission documents (what actions are allowed)
 * - Groups: Collections of users with shared permissions
 * - MFA: Multi-Factor Authentication (extra security layer)
 *
 * Important: IAM is a GLOBAL service - it doesn't have regions.
 * All IAM operations use us-east-1 automatically.
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    ListUsersCommand,
    ListRolesCommand,
    ListPoliciesCommand,
    GetAccountSummaryCommand,
    ListAccessKeysCommand,
    ListMFADevicesCommand,
    GetUserCommand,
    GetRoleCommand,
    ListAttachedUserPoliciesCommand,
    ListAttachedRolePoliciesCommand,
    ListGroupsForUserCommand
} = require("@aws-sdk/client-iam");

const { getIAMClient } = require("../utils/aws-clients");

/**
 * List all IAM users in the account.
 * Paginates through all results (max 100 per request).
 *
 * Returns basic info - use getUser() for full details.
 *
 * @returns {Array} List of users with basic info
 */
async function listUsers() {
    const client = getIAMClient();

    const users = [];
    let marker = null;

    // Paginate through all users
    do {
        const params = { MaxItems: 100 };
        if (marker) params.Marker = marker;

        const response = await client.send(new ListUsersCommand(params));

        for (const user of response.Users || []) {
            users.push({
                name: user.UserName,
                id: user.UserId,
                arn: user.Arn,
                path: user.Path,
                createdAt: user.CreateDate,
                passwordLastUsed: user.PasswordLastUsed
            });
        }

        marker = response.IsTruncated ? response.Marker : null;
    } while (marker);

    return users;
}

/**
 * Get detailed information about a specific user.
 * Includes access keys, MFA devices, policies, and group memberships.
 *
 * This makes multiple API calls in parallel for efficiency.
 *
 * @param {string} userName - Name of the IAM user
 * @returns {object} Complete user details
 */
async function getUser(userName) {
    const client = getIAMClient();

    // Fetch all user details in parallel
    const [userResponse, accessKeysResponse, mfaResponse, policiesResponse, groupsResponse] = await Promise.all([
        client.send(new GetUserCommand({ UserName: userName })),
        client.send(new ListAccessKeysCommand({ UserName: userName })),
        client.send(new ListMFADevicesCommand({ UserName: userName })),
        client.send(new ListAttachedUserPoliciesCommand({ UserName: userName })),
        client.send(new ListGroupsForUserCommand({ UserName: userName }))
    ]);

    const user = userResponse.User;

    return {
        name: user.UserName,
        id: user.UserId,
        arn: user.Arn,
        path: user.Path,
        createdAt: user.CreateDate,
        passwordLastUsed: user.PasswordLastUsed,
        accessKeys: (accessKeysResponse.AccessKeyMetadata || []).map(key => ({
            id: key.AccessKeyId,
            status: key.Status,
            createdAt: key.CreateDate
        })),
        mfaDevices: (mfaResponse.MFADevices || []).map(mfa => ({
            serialNumber: mfa.SerialNumber,
            enableDate: mfa.EnableDate
        })),
        hasMFA: (mfaResponse.MFADevices || []).length > 0,
        attachedPolicies: (policiesResponse.AttachedPolicies || []).map(p => ({
            name: p.PolicyName,
            arn: p.PolicyArn
        })),
        groups: (groupsResponse.Groups || []).map(g => ({
            name: g.GroupName,
            id: g.GroupId,
            arn: g.Arn
        }))
    };
}

/**
 * List all IAM roles in the account.
 * Roles are used by AWS services and for cross-account access.
 *
 * Common roles you'll see:
 * - Lambda execution roles
 * - EC2 instance profiles
 * - ECS task roles
 * - Cross-account access roles
 *
 * @returns {Array} List of roles with basic info
 */
async function listRoles() {
    const client = getIAMClient();

    const roles = [];
    let marker = null;

    // Paginate through all roles
    do {
        const params = { MaxItems: 100 };
        if (marker) params.Marker = marker;

        const response = await client.send(new ListRolesCommand(params));

        for (const role of response.Roles || []) {
            roles.push({
                name: role.RoleName,
                id: role.RoleId,
                arn: role.Arn,
                path: role.Path,
                createdAt: role.CreateDate,
                description: role.Description,
                maxSessionDuration: role.MaxSessionDuration
            });
        }

        marker = response.IsTruncated ? response.Marker : null;
    } while (marker);

    return roles;
}

/**
 * Get detailed information about a specific role.
 * Includes the trust policy (who can assume this role) and attached policies.
 *
 * @param {string} roleName - Name of the IAM role
 * @returns {object} Complete role details including trust policy
 */
async function getRole(roleName) {
    const client = getIAMClient();

    // Fetch role details and attached policies in parallel
    const [roleResponse, policiesResponse] = await Promise.all([
        client.send(new GetRoleCommand({ RoleName: roleName })),
        client.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }))
    ]);

    const role = roleResponse.Role;

    return {
        name: role.RoleName,
        id: role.RoleId,
        arn: role.Arn,
        path: role.Path,
        createdAt: role.CreateDate,
        description: role.Description,
        maxSessionDuration: role.MaxSessionDuration,
        // Trust policy defines WHO can assume this role
        assumeRolePolicyDocument: JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument)),
        attachedPolicies: (policiesResponse.AttachedPolicies || []).map(p => ({
            name: p.PolicyName,
            arn: p.PolicyArn
        }))
    };
}

/**
 * List IAM policies.
 * Policies are JSON documents that define permissions.
 *
 * Scope options:
 * - 'Local': Only customer-created policies
 * - 'AWS': Only AWS-managed policies
 * - 'All': Both
 *
 * @param {string} scope - Which policies to list (default: 'Local')
 * @returns {Array} List of policies
 */
async function listPolicies(scope = 'Local') {
    const client = getIAMClient();

    const policies = [];
    let marker = null;

    // Paginate through all policies
    do {
        const params = {
            MaxItems: 100,
            Scope: scope
        };
        if (marker) params.Marker = marker;

        const response = await client.send(new ListPoliciesCommand(params));

        for (const policy of response.Policies || []) {
            policies.push({
                name: policy.PolicyName,
                id: policy.PolicyId,
                arn: policy.Arn,
                path: policy.Path,
                createdAt: policy.CreateDate,
                updatedAt: policy.UpdateDate,
                attachmentCount: policy.AttachmentCount,
                isAttachable: policy.IsAttachable,
                description: policy.Description
            });
        }

        marker = response.IsTruncated ? response.Marker : null;
    } while (marker);

    return policies;
}

/**
 * Get account-wide IAM summary.
 * Shows counts and quotas for all IAM resource types.
 *
 * This is great for a quick overview of your IAM setup.
 *
 * @returns {object} Account summary with counts and quotas
 */
async function getAccountSummary() {
    const client = getIAMClient();

    const response = await client.send(new GetAccountSummaryCommand({}));

    const data = response.SummaryMap;

    return {
        users: {
            count: data.Users,
            quota: data.UsersQuota
        },
        groups: {
            count: data.Groups,
            quota: data.GroupsQuota
        },
        roles: {
            count: data.Roles,
            quota: data.RolesQuota
        },
        policies: {
            count: data.Policies,
            quota: data.PoliciesQuota
        },
        accessKeys: {
            active: data.AccessKeysPerUserQuota
        },
        mfaDevices: data.MFADevices,
        accountMFAEnabled: data.AccountMFAEnabled === 1,
        serverCertificates: data.ServerCertificates,
        signingCertificates: data.SigningCertificatesPerUserQuota,
        instanceProfiles: data.InstanceProfiles,
        providers: data.Providers
    };
}

/**
 * Get security status and recommendations.
 * Checks for common IAM security issues:
 * - Root account MFA
 * - Users without MFA
 * - Unused credentials (90+ days)
 *
 * Returns a security score (0-100) and actionable recommendations.
 *
 * @returns {object} Security status with issues and recommendations
 */
async function getSecurityStatus() {
    const [users, accountSummary] = await Promise.all([
        listUsers(),
        getAccountSummary()
    ]);

    const issues = [];
    const recommendations = [];

    // CRITICAL: Check if root account has MFA enabled
    if (!accountSummary.accountMFAEnabled) {
        issues.push({
            severity: 'HIGH',
            issue: 'Root account MFA not enabled',
            recommendation: 'Enable MFA for the root account immediately'
        });
    }

    // Check each user for MFA
    const client = getIAMClient();
    const usersWithoutMFA = [];

    for (const user of users) {
        const mfaResponse = await client.send(new ListMFADevicesCommand({ UserName: user.name }));
        if ((mfaResponse.MFADevices || []).length === 0) {
            usersWithoutMFA.push(user.name);
        }
    }

    if (usersWithoutMFA.length > 0) {
        issues.push({
            severity: 'MEDIUM',
            issue: `${usersWithoutMFA.length} users without MFA`,
            users: usersWithoutMFA,
            recommendation: 'Enable MFA for all IAM users'
        });
    }

    // Check for unused credentials (haven't logged in for 90+ days)
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const unusedUsers = users.filter(u =>
        u.passwordLastUsed && new Date(u.passwordLastUsed) < ninetyDaysAgo
    );

    if (unusedUsers.length > 0) {
        recommendations.push({
            type: 'CLEANUP',
            message: `${unusedUsers.length} users haven't logged in for 90+ days`,
            users: unusedUsers.map(u => u.name),
            recommendation: 'Review and potentially remove unused credentials'
        });
    }

    return {
        accountMFAEnabled: accountSummary.accountMFAEnabled,
        totalUsers: users.length,
        usersWithMFA: users.length - usersWithoutMFA.length,
        usersWithoutMFA: usersWithoutMFA.length,
        issues: issues,
        recommendations: recommendations,
        score: calculateSecurityScore(issues, recommendations)
    };
}

/**
 * Calculate a security score based on issues and recommendations.
 * Starts at 100 and deducts points for each issue.
 *
 * Deductions:
 * - HIGH severity: -30 points
 * - MEDIUM severity: -15 points
 * - LOW severity: -5 points
 * - Each recommendation: -5 points
 *
 * @param {Array} issues - List of security issues
 * @param {Array} recommendations - List of recommendations
 * @returns {number} Security score (0-100)
 */
function calculateSecurityScore(issues, recommendations) {
    let score = 100;

    for (const issue of issues) {
        if (issue.severity === 'HIGH') score -= 30;
        else if (issue.severity === 'MEDIUM') score -= 15;
        else score -= 5;
    }

    score -= recommendations.length * 5;

    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, score));
}

/**
 * Get a quick summary of IAM resources.
 * Perfect for dashboard views.
 *
 * @returns {object} Summary with counts for users, roles, policies
 */
async function getIAMSummary() {
    // Fetch all data in parallel for speed
    const [users, roles, policies, accountSummary] = await Promise.all([
        listUsers(),
        listRoles(),
        listPolicies('Local'),
        getAccountSummary()
    ]);

    return {
        users: {
            total: users.length,
            quota: accountSummary.users.quota
        },
        roles: {
            total: roles.length,
            quota: accountSummary.roles.quota
        },
        policies: {
            total: policies.length,
            quota: accountSummary.policies.quota
        },
        accountMFAEnabled: accountSummary.accountMFAEnabled,
        mfaDevices: accountSummary.mfaDevices
    };
}

module.exports = {
    listUsers,
    getUser,
    listRoles,
    getRole,
    listPolicies,
    getAccountSummary,
    getSecurityStatus,
    getIAMSummary
};
