'use strict';

/**
 * ============================================================================
 * SNS SERVICE MODULE
 * ============================================================================
 *
 * Handles Amazon Simple Notification Service (SNS) operations.
 * SNS is a pub/sub messaging service - you create topics, subscribe
 * endpoints (email, SMS, Lambda, etc.), and publish messages.
 *
 * Features:
 * - List and manage SNS topics
 * - View and manage subscriptions
 * - Publish messages to topics
 * - Send direct messages (SMS)
 * - Create and delete topics
 * - Subscribe/unsubscribe endpoints
 *
 * How SNS Works:
 * 1. Create a Topic (like a channel)
 * 2. Subscribe endpoints (email addresses, phone numbers, Lambda functions)
 * 3. Publish a message to the topic
 * 4. SNS delivers to ALL subscribers
 *
 * Common Use Cases:
 * - Send alerts when CloudWatch alarms trigger
 * - Notify teams about deployments
 * - Fan-out processing to multiple Lambda functions
 * - Send SMS notifications to users
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    ListTopicsCommand,
    ListSubscriptionsCommand,
    ListSubscriptionsByTopicCommand,
    PublishCommand,
    GetTopicAttributesCommand,
    CreateTopicCommand,
    DeleteTopicCommand,
    SubscribeCommand,
    UnsubscribeCommand
} = require("@aws-sdk/client-sns");

const { getSNSClient } = require("../utils/aws-clients");

/**
 * List all SNS topics in the region.
 * Paginates through all results to get the complete list.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of topics with ARN and name
 */
async function listTopics(region) {
    const client = getSNSClient(region);

    const topics = [];
    let nextToken = null;

    // Paginate through all topics
    do {
        const params = {};
        if (nextToken) params.NextToken = nextToken;

        const response = await client.send(new ListTopicsCommand(params));

        for (const topic of response.Topics || []) {
            // Extract readable topic name from ARN
            // ARN format: arn:aws:sns:region:account-id:topic-name
            const arnParts = topic.TopicArn.split(':');
            topics.push({
                arn: topic.TopicArn,
                name: arnParts[arnParts.length - 1],
                region: arnParts[3]
            });
        }

        nextToken = response.NextToken;
    } while (nextToken);

    return topics;
}

/**
 * Get detailed information about a specific topic.
 * Includes subscription counts, delivery policies, and more.
 *
 * @param {string} topicArn - ARN of the topic
 * @param {string} region - AWS region
 * @returns {object} Topic details and configuration
 */
async function getTopic(topicArn, region) {
    const client = getSNSClient(region);

    const response = await client.send(new GetTopicAttributesCommand({
        TopicArn: topicArn
    }));

    const attrs = response.Attributes;
    const arnParts = topicArn.split(':');

    return {
        arn: topicArn,
        name: arnParts[arnParts.length - 1],
        displayName: attrs.DisplayName || null,
        owner: attrs.Owner,
        subscriptionsConfirmed: parseInt(attrs.SubscriptionsConfirmed || 0),
        subscriptionsPending: parseInt(attrs.SubscriptionsPending || 0),
        subscriptionsDeleted: parseInt(attrs.SubscriptionsDeleted || 0),
        deliveryPolicy: attrs.DeliveryPolicy ? JSON.parse(attrs.DeliveryPolicy) : null,
        effectiveDeliveryPolicy: attrs.EffectiveDeliveryPolicy ? JSON.parse(attrs.EffectiveDeliveryPolicy) : null,
        policy: attrs.Policy ? JSON.parse(attrs.Policy) : null
    };
}

/**
 * List all subscriptions across all topics in the region.
 * Shows what endpoints are listening to which topics.
 *
 * @param {string} region - AWS region
 * @returns {Array} List of all subscriptions
 */
async function listSubscriptions(region) {
    const client = getSNSClient(region);

    const subscriptions = [];
    let nextToken = null;

    // Paginate through all subscriptions
    do {
        const params = {};
        if (nextToken) params.NextToken = nextToken;

        const response = await client.send(new ListSubscriptionsCommand(params));

        for (const sub of response.Subscriptions || []) {
            subscriptions.push({
                arn: sub.SubscriptionArn,
                topicArn: sub.TopicArn,
                protocol: sub.Protocol,
                endpoint: sub.Endpoint,
                owner: sub.Owner
            });
        }

        nextToken = response.NextToken;
    } while (nextToken);

    return subscriptions;
}

/**
 * List subscriptions for a specific topic.
 * Shows all endpoints that will receive messages published to this topic.
 *
 * @param {string} topicArn - ARN of the topic
 * @param {string} region - AWS region
 * @returns {Array} List of subscriptions for this topic
 */
async function listTopicSubscriptions(topicArn, region) {
    const client = getSNSClient(region);

    const response = await client.send(new ListSubscriptionsByTopicCommand({
        TopicArn: topicArn
    }));

    return (response.Subscriptions || []).map(sub => ({
        arn: sub.SubscriptionArn,
        protocol: sub.Protocol,
        endpoint: sub.Endpoint,
        owner: sub.Owner
    }));
}

/**
 * Publish a message to an SNS topic.
 * The message will be delivered to ALL confirmed subscribers.
 *
 * Message can be a string or object (will be JSON-stringified).
 *
 * @param {string} topicArn - ARN of the topic to publish to
 * @param {string|object} message - Message content
 * @param {string} subject - Optional subject (used for email subscriptions)
 * @param {string} region - AWS region
 * @returns {object} Publish confirmation with message ID
 */
async function publish(topicArn, message, subject = null, region) {
    const client = getSNSClient(region);

    const params = {
        TopicArn: topicArn,
        Message: typeof message === 'string' ? message : JSON.stringify(message)
    };

    if (subject) {
        params.Subject = subject;
    }

    const response = await client.send(new PublishCommand(params));

    return {
        messageId: response.MessageId,
        topicArn: topicArn,
        subject: subject,
        message: `Message published successfully`
    };
}

/**
 * Send a message directly to an endpoint (bypasses topics).
 * Currently supports SMS - sends directly to a phone number.
 *
 * Note: SMS requires phone number in E.164 format (+1234567890)
 *
 * @param {string} endpoint - Phone number for SMS
 * @param {string} message - Message to send
 * @param {string} region - AWS region
 * @returns {object} Send confirmation with message ID
 */
async function publishDirect(endpoint, message, region) {
    const client = getSNSClient(region);

    const response = await client.send(new PublishCommand({
        Message: message,
        PhoneNumber: endpoint
    }));

    return {
        messageId: response.MessageId,
        endpoint: endpoint,
        message: 'Message sent successfully'
    };
}

/**
 * Create a new SNS topic.
 * Topics are the core of SNS - they're like channels that messages flow through.
 *
 * @param {string} name - Name for the new topic
 * @param {string} region - AWS region
 * @param {object} attributes - Optional topic attributes
 * @returns {object} Created topic ARN
 */
async function createTopic(name, region, attributes = {}) {
    const client = getSNSClient(region);

    const params = {
        Name: name
    };

    if (Object.keys(attributes).length > 0) {
        params.Attributes = attributes;
    }

    const response = await client.send(new CreateTopicCommand(params));

    return {
        arn: response.TopicArn,
        name: name,
        message: `Topic ${name} created successfully`
    };
}

/**
 * Delete an SNS topic.
 * WARNING: This also removes all subscriptions to this topic!
 *
 * @param {string} topicArn - ARN of the topic to delete
 * @param {string} region - AWS region
 * @returns {object} Deletion confirmation
 */
async function deleteTopic(topicArn, region) {
    const client = getSNSClient(region);

    await client.send(new DeleteTopicCommand({
        TopicArn: topicArn
    }));

    return {
        topicArn: topicArn,
        deleted: true,
        message: 'Topic deleted successfully'
    };
}

/**
 * Subscribe an endpoint to a topic.
 * After subscribing, the endpoint receives all messages published to the topic.
 *
 * Supported protocols:
 * - email: Email address (requires confirmation)
 * - sms: Phone number
 * - http/https: Web endpoint URL
 * - lambda: Lambda function ARN
 * - sqs: SQS queue ARN
 * - application: Mobile push notification
 *
 * @param {string} topicArn - ARN of the topic
 * @param {string} protocol - Delivery protocol
 * @param {string} endpoint - Where to send messages
 * @param {string} region - AWS region
 * @returns {object} Subscription details
 */
async function subscribe(topicArn, protocol, endpoint, region) {
    const client = getSNSClient(region);

    const response = await client.send(new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: protocol,
        Endpoint: endpoint
    }));

    return {
        subscriptionArn: response.SubscriptionArn,
        topicArn: topicArn,
        protocol: protocol,
        endpoint: endpoint,
        message: response.SubscriptionArn === 'pending confirmation'
            ? 'Subscription pending confirmation'
            : 'Subscribed successfully'
    };
}

/**
 * Unsubscribe an endpoint from a topic.
 * The endpoint will no longer receive messages from this topic.
 *
 * @param {string} subscriptionArn - ARN of the subscription to remove
 * @param {string} region - AWS region
 * @returns {object} Unsubscription confirmation
 */
async function unsubscribe(subscriptionArn, region) {
    const client = getSNSClient(region);

    await client.send(new UnsubscribeCommand({
        SubscriptionArn: subscriptionArn
    }));

    return {
        subscriptionArn: subscriptionArn,
        unsubscribed: true,
        message: 'Unsubscribed successfully'
    };
}

/**
 * Get a summary of SNS resources in the region.
 * Shows total topics, subscriptions, and breakdown by protocol.
 *
 * @param {string} region - AWS region
 * @returns {object} SNS summary statistics
 */
async function getSNSSummary(region) {
    const topics = await listTopics(region);
    const subscriptions = await listSubscriptions(region);

    // Count subscriptions by protocol type
    const byProtocol = {};
    for (const sub of subscriptions) {
        byProtocol[sub.protocol] = (byProtocol[sub.protocol] || 0) + 1;
    }

    return {
        totalTopics: topics.length,
        totalSubscriptions: subscriptions.length,
        subscriptionsByProtocol: byProtocol
    };
}

module.exports = {
    listTopics,
    getTopic,
    listSubscriptions,
    listTopicSubscriptions,
    publish,
    publishDirect,
    createTopic,
    deleteTopic,
    subscribe,
    unsubscribe,
    getSNSSummary
};
