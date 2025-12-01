'use strict';

/**
 * ============================================================================
 * BEDROCK AI SERVICE MODULE
 * ============================================================================
 *
 * Handles Amazon Bedrock operations for AI-powered assistance.
 * Bedrock is AWS's managed AI service that gives access to foundation models
 * like Claude, Llama, and others.
 *
 * This module powers the AI assistant in AWS Cloud Commander, providing:
 * - General AWS Q&A and help
 * - Troubleshooting assistance
 * - Cost optimization recommendations
 * - Security analysis
 * - Architecture reviews
 * - Code and template generation
 *
 * The AI assistant is context-aware - it can see your current AWS state
 * (EC2 instances, costs, alarms, etc.) and provide relevant advice.
 *
 * Note: Bedrock is currently only available in certain regions.
 * We use us-east-1 by default as it has the best model availability.
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { getBedrockClient, config } = require("../utils/aws-clients");

/**
 * System prompts for different AI modes.
 * Each mode gives the AI different expertise and focus areas.
 * This helps get more relevant and focused responses.
 */
const SYSTEM_PROMPTS = {
    // General AWS assistant - jack of all trades
    general: `You are an expert AWS cloud architect assistant integrated into Zoho Cliq.
Your role is to help users manage their AWS infrastructure, answer questions, troubleshoot issues, and provide best practices.

Guidelines:
- Be concise and practical
- Use markdown formatting for better readability
- When showing data, use tables and bullet points
- Provide actionable advice
- Always consider security and cost implications
- If you're unsure, say so rather than guessing`,

    // Troubleshooting specialist
    troubleshoot: `You are an AWS troubleshooting expert. Help diagnose and fix AWS issues.
When troubleshooting:
1. Ask clarifying questions if needed
2. List potential causes
3. Provide step-by-step solutions
4. Suggest preventive measures
5. Reference relevant AWS documentation when helpful`,

    // Cost optimization specialist
    optimize: `You are an AWS cost optimization expert.
When analyzing costs:
1. Identify cost drivers
2. Suggest specific optimizations
3. Estimate potential savings
4. Consider performance trade-offs
5. Recommend AWS services that could reduce costs`,

    // Security specialist
    security: `You are an AWS security expert.
When analyzing security:
1. Identify potential vulnerabilities
2. Reference AWS security best practices
3. Suggest IAM improvements
4. Recommend security services (GuardDuty, Security Hub, etc.)
5. Consider compliance requirements`,

    // Solutions architect
    architecture: `You are an AWS solutions architect.
When reviewing architecture:
1. Evaluate against AWS Well-Architected Framework
2. Consider scalability, reliability, security, performance, and cost
3. Suggest improvements
4. Recommend appropriate AWS services
5. Provide diagram suggestions when helpful`
};

/**
 * Core chat function - invokes the Bedrock model.
 * This is the foundation that all other functions build on.
 *
 * @param {string} prompt - The user's message/question
 * @param {object} options - Configuration options
 * @param {string} options.systemPrompt - Custom system prompt
 * @param {string} options.mode - Use a predefined mode (general, troubleshoot, etc.)
 * @param {Array} options.conversationHistory - Previous messages for context
 * @param {number} options.maxTokens - Max response length (default: 2048)
 * @param {number} options.temperature - Creativity level 0-1 (default: 0.7)
 * @returns {object} AI response with usage stats
 */
async function chat(prompt, options = {}) {
    const client = getBedrockClient();

    // Select the appropriate system prompt
    const systemPrompt = options.systemPrompt ||
        SYSTEM_PROMPTS[options.mode] ||
        SYSTEM_PROMPTS.general;

    // Build the messages array
    const messages = [];

    // Include conversation history if provided (for multi-turn conversations)
    if (options.conversationHistory && Array.isArray(options.conversationHistory)) {
        messages.push(...options.conversationHistory);
    }

    // Add the current user message
    messages.push({ role: "user", content: prompt });

    // Construct the request body for Claude
    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        system: systemPrompt,
        messages: messages
    });

    // Call the Bedrock API
    const response = await client.send(new InvokeModelCommand({
        modelId: config.bedrockModelId,
        contentType: "application/json",
        accept: "application/json",
        body: body
    }));

    // Parse the response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return {
        response: responseBody.content[0].text,
        model: config.bedrockModelId,
        usage: {
            inputTokens: responseBody.usage?.input_tokens,
            outputTokens: responseBody.usage?.output_tokens,
            totalTokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0)
        },
        stopReason: responseBody.stop_reason
    };
}

/**
 * Chat with AWS context injected.
 * Gives the AI awareness of your current AWS state for more relevant answers.
 *
 * For example, if you ask "why is my bill high?" and the AI can see
 * your EC2 instances, it might notice you have large instances running.
 *
 * @param {string} prompt - The user's question
 * @param {object} awsContext - Current AWS state
 * @param {Array} awsContext.ec2Instances - List of EC2 instances
 * @param {Array} awsContext.s3Buckets - List of S3 buckets
 * @param {object} awsContext.costs - Recent cost data
 * @param {Array} awsContext.alarms - CloudWatch alarms
 * @param {object} options - Chat options (passed to chat())
 * @returns {object} AI response
 */
async function chatWithContext(prompt, awsContext, options = {}) {
    // Build a context string from the AWS state
    let contextStr = "Current AWS State:\n";

    // Add EC2 instance info (limit to 10 for token efficiency)
    if (awsContext.ec2Instances) {
        contextStr += `\nEC2 Instances (${awsContext.ec2Instances.length} total):\n`;
        for (const inst of awsContext.ec2Instances.slice(0, 10)) {
            contextStr += `- ${inst.name} (${inst.id}): ${inst.state}, ${inst.type}\n`;
        }
    }

    // Add S3 bucket names
    if (awsContext.s3Buckets) {
        contextStr += `\nS3 Buckets (${awsContext.s3Buckets.length} total): ${awsContext.s3Buckets.map(b => b.name).join(', ')}\n`;
    }

    // Add cost information
    if (awsContext.costs) {
        contextStr += `\nRecent Costs: ${awsContext.costs.totalCostFormatted} (${awsContext.costs.period})\n`;
    }

    // Add alarm status
    if (awsContext.alarms) {
        const activeAlarms = awsContext.alarms.filter(a => a.state === 'ALARM');
        contextStr += `\nCloudWatch Alarms: ${awsContext.alarms.length} total, ${activeAlarms.length} in ALARM state\n`;
    }

    // Combine context with user's question
    const enhancedPrompt = `${contextStr}\n\nUser Question: ${prompt}`;

    return await chat(enhancedPrompt, options);
}

/**
 * Generate a CloudFormation template based on requirements.
 * Great for quickly scaffolding infrastructure as code.
 *
 * @param {string} description - What infrastructure you need
 * @param {object} options - Chat options
 * @returns {object} Response with CloudFormation YAML template
 */
async function generateCloudFormation(description, options = {}) {
    const prompt = `Generate a CloudFormation template for the following requirement:

${description}

Requirements:
- Use YAML format
- Include appropriate parameters
- Add meaningful descriptions
- Follow AWS best practices
- Include outputs for important resources

Provide only the CloudFormation template, no explanation needed unless there are important caveats.`;

    return await chat(prompt, {
        ...options,
        systemPrompt: `You are an AWS CloudFormation expert. Generate production-ready CloudFormation templates.
Always use YAML format. Include parameters, descriptions, and outputs. Follow security best practices.`
    });
}

/**
 * Generate an IAM policy based on requirements.
 * Follows least privilege principle by default.
 *
 * @param {string} requirements - What permissions are needed
 * @param {object} options - Chat options
 * @returns {object} Response with IAM policy JSON
 */
async function generateIAMPolicy(requirements, options = {}) {
    const prompt = `Generate an IAM policy for the following requirements:

${requirements}

Requirements:
- Follow least privilege principle
- Use specific resource ARNs where possible
- Include appropriate conditions
- Add descriptions

Provide the policy in JSON format.`;

    return await chat(prompt, {
        ...options,
        systemPrompt: `You are an AWS IAM security expert. Generate secure IAM policies following least privilege.
Always use specific resources rather than wildcards when possible. Consider security implications.`
    });
}

/**
 * Generate Lambda function code.
 * Includes error handling, logging, and best practices.
 *
 * @param {string} description - What the function should do
 * @param {string} runtime - Lambda runtime (e.g., 'python3.9', 'nodejs18.x')
 * @param {object} options - Chat options
 * @returns {object} Response with Lambda function code
 */
async function generateLambdaCode(description, runtime = 'python3.9', options = {}) {
    const prompt = `Generate a Lambda function for the following requirement:

${description}

Runtime: ${runtime}

Requirements:
- Include proper error handling
- Add logging
- Include type hints (for Python) or JSDoc (for Node.js)
- Follow AWS Lambda best practices
- Include sample event structure in comments

Provide the complete function code.`;

    return await chat(prompt, {
        ...options,
        systemPrompt: `You are an AWS Lambda expert. Generate production-ready Lambda function code.
Include proper error handling, logging, and documentation. Follow best practices for the specified runtime.`
    });
}

/**
 * Get help troubleshooting an AWS issue.
 * Provides systematic diagnosis and solutions.
 *
 * @param {string} issue - Description of the problem
 * @param {string} context - Additional context (error messages, logs, etc.)
 * @param {object} options - Chat options
 * @returns {object} Response with troubleshooting steps
 */
async function troubleshoot(issue, context = '', options = {}) {
    const prompt = `Help troubleshoot this AWS issue:

Issue: ${issue}

${context ? `Additional Context:\n${context}` : ''}

Please:
1. List possible causes
2. Provide diagnostic steps
3. Suggest solutions
4. Recommend preventive measures`;

    return await chat(prompt, {
        ...options,
        mode: 'troubleshoot'
    });
}

/**
 * Analyze costs and get optimization recommendations.
 * Takes your actual cost data and suggests ways to save money.
 *
 * @param {object} costData - Cost data from Cost Explorer
 * @param {object} options - Chat options
 * @returns {object} Response with optimization recommendations
 */
async function optimizeCosts(costData, options = {}) {
    const prompt = `Analyze these AWS costs and provide optimization recommendations:

${JSON.stringify(costData, null, 2)}

Please:
1. Identify the main cost drivers
2. Suggest specific optimizations for each service
3. Estimate potential savings
4. Prioritize recommendations by impact
5. Note any trade-offs`;

    return await chat(prompt, {
        ...options,
        mode: 'optimize'
    });
}

/**
 * Review architecture against AWS Well-Architected Framework.
 * Evaluates all six pillars and provides recommendations.
 *
 * @param {string} architecture - Description of your architecture
 * @param {object} options - Chat options
 * @returns {object} Response with architecture review
 */
async function reviewArchitecture(architecture, options = {}) {
    const prompt = `Review this AWS architecture against the Well-Architected Framework:

${architecture}

Evaluate:
1. Operational Excellence
2. Security
3. Reliability
4. Performance Efficiency
5. Cost Optimization
6. Sustainability

For each pillar, identify strengths and areas for improvement.`;

    return await chat(prompt, {
        ...options,
        mode: 'architecture'
    });
}

/**
 * Get a detailed explanation of an AWS concept.
 * Great for learning about AWS services and features.
 *
 * @param {string} concept - The AWS concept to explain
 * @param {object} options - Chat options
 * @returns {object} Response with detailed explanation
 */
async function explain(concept, options = {}) {
    const prompt = `Explain the AWS concept: ${concept}

Include:
1. What it is
2. Key features
3. Common use cases
4. Best practices
5. Pricing considerations
6. Related services`;

    return await chat(prompt, options);
}

/**
 * Generate an AWS CLI command for a task.
 * Includes explanations of each parameter.
 *
 * @param {string} description - What you want to do
 * @param {object} options - Chat options
 * @returns {object} Response with CLI command and explanation
 */
async function generateCLICommand(description, options = {}) {
    const prompt = `Generate the AWS CLI command for: ${description}

Provide:
1. The complete AWS CLI command
2. Explanation of each parameter
3. Example with sample values
4. Any important notes or warnings`;

    return await chat(prompt, {
        ...options,
        systemPrompt: 'You are an AWS CLI expert. Generate accurate and complete AWS CLI commands with explanations.'
    });
}

module.exports = {
    chat,
    chatWithContext,
    generateCloudFormation,
    generateIAMPolicy,
    generateLambdaCode,
    troubleshoot,
    optimizeCosts,
    reviewArchitecture,
    explain,
    generateCLICommand,
    SYSTEM_PROMPTS
};
