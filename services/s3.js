'use strict';

/**
 * ============================================================================
 * S3 SERVICE MODULE
 * ============================================================================
 *
 * Handles all Amazon S3 (Simple Storage Service) operations.
 * S3 provides object storage with industry-leading scalability.
 *
 * Features:
 * - List and browse S3 buckets
 * - Navigate bucket contents (files and folders)
 * - Upload files (direct and from URL)
 * - Generate presigned URLs for secure downloads/uploads
 * - Create and delete buckets
 * - Search objects within buckets
 *
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 *
 * ============================================================================
 */

const {
    ListBucketsCommand,
    ListObjectsV2Command,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadBucketCommand,
    HeadObjectCommand,
    PutObjectCommand,
    GetBucketLocationCommand,
    CreateBucketCommand,
    DeleteBucketCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { getS3Client } = require("../utils/aws-clients");
const { formatBytes } = require("../utils/helpers");

/*
 * Maximum file size for uploads: 50MB
 * This limit is set to keep uploads reasonably fast and prevent timeout issues.
 * For larger files, users should use AWS Console or CLI directly.
 */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * List all S3 buckets owned by the AWS account.
 * Also fetches the region for each bucket (buckets are region-specific).
 *
 * @param {string} region - AWS region for the S3 client
 * @returns {Array} List of buckets with name, creation date, and region
 */
async function listBuckets(region) {
    const client = getS3Client(region);

    const response = await client.send(new ListBucketsCommand({}));

    // Fetch region for each bucket in parallel for better performance
    const bucketsWithRegion = await Promise.all(
        (response.Buckets || []).map(async (bucket) => {
            let bucketRegion = 'us-east-1';
            try {
                const locationResponse = await client.send(new GetBucketLocationCommand({
                    Bucket: bucket.Name
                }));
                // Empty LocationConstraint means us-east-1 (AWS quirk)
                bucketRegion = locationResponse.LocationConstraint || 'us-east-1';
            } catch (error) {
                // If we can't get location, default to us-east-1
                console.log(`Could not get location for bucket ${bucket.Name}: ${error.message}`);
            }
            return {
                name: bucket.Name,
                creationDate: bucket.CreationDate,
                region: bucketRegion
            };
        })
    );

    return bucketsWithRegion;
}

/**
 * Get detailed information about a specific bucket.
 * Counts objects and calculates total size (limited to first 10000 objects for performance).
 *
 * @param {string} bucketName - Name of the bucket
 * @param {string} region - AWS region
 * @returns {object} Bucket info with object count and total size
 */
async function getBucketInfo(bucketName, region) {
    const client = getS3Client(region);

    // First, verify bucket exists and get its region
    let location = null;
    try {
        const locationResponse = await client.send(new GetBucketLocationCommand({
            Bucket: bucketName
        }));
        location = locationResponse.LocationConstraint || 'us-east-1';
    } catch (error) {
        throw new Error(`Bucket ${bucketName} not found or access denied`);
    }

    // Count objects and calculate total size
    let totalSize = 0;
    let totalObjects = 0;
    let continuationToken = null;

    // Paginate through objects (S3 returns max 1000 per request)
    do {
        const params = {
            Bucket: bucketName,
            MaxKeys: 1000
        };

        if (continuationToken) {
            params.ContinuationToken = continuationToken;
        }

        const response = await client.send(new ListObjectsV2Command(params));

        for (const obj of response.Contents || []) {
            totalSize += obj.Size || 0;
            totalObjects++;
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : null;

        // Limit to first 10000 objects for performance (avoid timeout)
        if (totalObjects >= 10000) break;

    } while (continuationToken);

    return {
        name: bucketName,
        region: location,
        totalObjects: totalObjects,
        totalSize: totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        approximateCount: totalObjects >= 10000
    };
}

/**
 * List objects (files and folders) in a bucket at a specific path.
 * Uses delimiter '/' to simulate folder structure.
 *
 * @param {string} bucketName - Name of the bucket
 * @param {string} prefix - Path prefix (folder path)
 * @param {string} region - AWS region
 * @param {number} maxKeys - Maximum number of results
 * @returns {object} Lists of folders and files at this path
 */
async function listObjects(bucketName, prefix = '', region, maxKeys = 100) {
    const client = getS3Client(region);

    const response = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
        Delimiter: '/'  // This makes S3 return "folders" as CommonPrefixes
    }));

    // Format folders (CommonPrefixes in S3 terminology)
    const folders = (response.CommonPrefixes || []).map(cp => ({
        key: cp.Prefix,
        name: cp.Prefix.replace(prefix, '').replace('/', ''),
        type: 'folder'
    }));

    // Format files (actual objects)
    const files = (response.Contents || [])
        .filter(obj => obj.Key !== prefix)  // Exclude the prefix itself
        .map(obj => ({
            key: obj.Key,
            name: obj.Key.split('/').pop(),
            size: obj.Size,
            sizeFormatted: formatBytes(obj.Size),
            lastModified: obj.LastModified,
            type: 'file',
            extension: obj.Key.split('.').pop()?.toLowerCase()
        }));

    return {
        bucket: bucketName,
        prefix: prefix,
        folders: folders,
        files: files,
        totalFolders: folders.length,
        totalFiles: files.length,
        isTruncated: response.IsTruncated,
        nextContinuationToken: response.NextContinuationToken
    };
}

/**
 * Get metadata for a specific object (file).
 * Uses HEAD request to get info without downloading the file.
 *
 * @param {string} bucketName - Name of the bucket
 * @param {string} key - Object key (file path)
 * @param {string} region - AWS region
 * @returns {object} Object metadata (size, type, last modified, etc.)
 */
async function getObjectInfo(bucketName, key, region) {
    const client = getS3Client(region);

    const response = await client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: key
    }));

    return {
        bucket: bucketName,
        key: key,
        size: response.ContentLength,
        sizeFormatted: formatBytes(response.ContentLength),
        contentType: response.ContentType,
        lastModified: response.LastModified,
        etag: response.ETag,
        metadata: response.Metadata,
        storageClass: response.StorageClass || 'STANDARD'
    };
}

/**
 * Generate a presigned URL for downloading an object.
 * The URL is temporary and expires after the specified time.
 *
 * @param {string} bucketName - Name of the bucket
 * @param {string} key - Object key (file path)
 * @param {string} region - AWS region
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {object} Presigned URL and expiration info
 */
async function getPresignedUrl(bucketName, key, region, expiresIn = 3600) {
    const client = getS3Client(region);

    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key
    });

    const url = await getSignedUrl(client, command, { expiresIn });

    return {
        bucket: bucketName,
        key: key,
        url: url,
        expiresIn: expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
    };
}

/**
 * Delete an object from a bucket.
 *
 * @param {string} bucketName - Name of the bucket
 * @param {string} key - Object key to delete
 * @param {string} region - AWS region
 * @returns {object} Confirmation of deletion
 */
async function deleteObject(bucketName, key, region) {
    const client = getS3Client(region);

    await client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key
    }));

    return {
        bucket: bucketName,
        key: key,
        deleted: true,
        message: `Object ${key} deleted from ${bucketName}`
    };
}

/**
 * Get a summary of all buckets (count, oldest, newest).
 *
 * @param {string} region - AWS region
 * @returns {object} Summary statistics
 */
async function getBucketsSummary(region) {
    const buckets = await listBuckets(region);

    return {
        totalBuckets: buckets.length,
        buckets: buckets.map(b => b.name),
        oldestBucket: buckets.length > 0 ?
            buckets.reduce((oldest, b) => b.creationDate < oldest.creationDate ? b : oldest) : null,
        newestBucket: buckets.length > 0 ?
            buckets.reduce((newest, b) => b.creationDate > newest.creationDate ? b : newest) : null
    };
}

/**
 * Search for objects in a bucket by name.
 * Performs a case-insensitive search on object keys.
 *
 * @param {string} bucketName - Name of the bucket
 * @param {string} searchTerm - Text to search for in object names
 * @param {string} region - AWS region
 * @param {number} maxResults - Maximum results to return
 * @returns {object} Matching objects
 */
async function searchObjects(bucketName, searchTerm, region, maxResults = 50) {
    const client = getS3Client(region);

    // List objects (up to 1000) and filter client-side
    const response = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1000
    }));

    const matches = (response.Contents || [])
        .filter(obj => obj.Key.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, maxResults)
        .map(obj => ({
            key: obj.Key,
            name: obj.Key.split('/').pop(),
            size: obj.Size,
            sizeFormatted: formatBytes(obj.Size),
            lastModified: obj.LastModified
        }));

    return {
        bucket: bucketName,
        searchTerm: searchTerm,
        matches: matches,
        totalMatches: matches.length
    };
}

/**
 * Upload an object directly to S3.
 * Used for server-side uploads where we have the file buffer.
 *
 * @param {string} bucketName - Target bucket
 * @param {string} key - Object key (file path in bucket)
 * @param {Buffer} body - File content
 * @param {string} contentType - MIME type
 * @param {string} region - AWS region
 * @returns {object} Upload confirmation
 */
async function uploadObject(bucketName, key, body, contentType, region) {
    const client = getS3Client(region);

    await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType
    }));

    return {
        bucket: bucketName,
        key: key,
        uploaded: true,
        message: `File uploaded to ${bucketName}/${key}`
    };
}

/**
 * Generate a presigned URL for uploading an object.
 * Client can use this URL to upload directly to S3.
 *
 * @param {string} bucketName - Target bucket
 * @param {string} key - Object key
 * @param {string} contentType - Expected MIME type
 * @param {string} region - AWS region
 * @param {number} expiresIn - URL expiration in seconds
 * @returns {object} Presigned upload URL
 */
async function getUploadPresignedUrl(bucketName, key, contentType, region, expiresIn = 3600) {
    const client = getS3Client(region);

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType
    });

    const url = await getSignedUrl(client, command, { expiresIn });

    return {
        bucket: bucketName,
        key: key,
        uploadUrl: url,
        contentType: contentType,
        expiresIn: expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
    };
}

/**
 * Upload a file to S3 from a URL.
 * Downloads the file from source URL and uploads to S3.
 * Useful for Zoho-hosted files that can't be uploaded directly.
 *
 * @param {string} bucketName - Target bucket
 * @param {string} key - Object key in S3
 * @param {string} sourceUrl - URL to download file from
 * @param {string} contentType - MIME type (optional, will detect from response)
 * @param {string} region - AWS region
 * @returns {object} Upload confirmation with file size
 */
async function uploadFromUrl(bucketName, key, sourceUrl, contentType, region) {
    const client = getS3Client(region);

    // Download the file from the source URL
    const response = await fetch(sourceUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: ${response.status} ${response.statusText}`);
    }

    // Check file size before downloading
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds 50MB limit. Please upload a smaller file.`);
    }

    // Get file content as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Double-check size after download
    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds 50MB limit. Please upload a smaller file.`);
    }

    // Upload to S3
    await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType || response.headers.get('content-type') || 'application/octet-stream'
    }));

    return {
        bucket: bucketName,
        key: key,
        uploaded: true,
        size: buffer.length,
        sizeFormatted: formatBytes(buffer.length),
        message: `File uploaded successfully to ${bucketName}/${key}`
    };
}

/**
 * Create a new S3 bucket.
 * Bucket names must be globally unique across all AWS accounts.
 *
 * Naming rules:
 * - 3-63 characters
 * - Lowercase letters, numbers, hyphens, periods only
 * - Cannot start/end with hyphen or period
 * - Cannot look like an IP address
 *
 * @param {string} bucketName - Name for the new bucket
 * @param {string} region - AWS region to create bucket in
 * @returns {object} Creation confirmation
 */
async function createBucket(bucketName, region) {
    // Validate bucket name format
    const bucketNameRegex = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
    if (!bucketNameRegex.test(bucketName)) {
        throw new Error('Invalid bucket name. Must be 3-63 characters, lowercase letters, numbers, hyphens, and periods only. Cannot start or end with hyphen/period.');
    }

    // Check for invalid patterns
    if (bucketName.includes('..') || bucketName.includes('-.') || bucketName.includes('.-')) {
        throw new Error('Invalid bucket name. Cannot have consecutive periods or hyphens next to periods.');
    }

    // Cannot look like an IP address
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(bucketName)) {
        throw new Error('Invalid bucket name. Cannot be formatted as an IP address.');
    }

    const client = getS3Client(region);

    const params = {
        Bucket: bucketName
    };

    // For regions other than us-east-1, must specify LocationConstraint
    // (AWS quirk - us-east-1 is the default and doesn't need this)
    if (region && region !== 'us-east-1') {
        params.CreateBucketConfiguration = {
            LocationConstraint: region
        };
    }

    await client.send(new CreateBucketCommand(params));

    return {
        bucket: bucketName,
        region: region || 'us-east-1',
        created: true,
        message: `Bucket "${bucketName}" created successfully in ${region || 'us-east-1'}`
    };
}

/**
 * Delete an S3 bucket.
 * The bucket must be empty before it can be deleted.
 *
 * @param {string} bucketName - Name of bucket to delete
 * @param {string} region - AWS region
 * @returns {object} Deletion confirmation
 */
async function deleteBucket(bucketName, region) {
    const client = getS3Client(region);

    // First check if bucket is empty
    const listResponse = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1
    }));

    if (listResponse.Contents && listResponse.Contents.length > 0) {
        throw new Error(`Bucket "${bucketName}" is not empty. Please delete all objects first before deleting the bucket.`);
    }

    // Delete the bucket
    await client.send(new DeleteBucketCommand({
        Bucket: bucketName
    }));

    return {
        bucket: bucketName,
        deleted: true,
        message: `Bucket "${bucketName}" deleted successfully`
    };
}

module.exports = {
    listBuckets,
    getBucketInfo,
    listObjects,
    getObjectInfo,
    getPresignedUrl,
    deleteObject,
    getBucketsSummary,
    searchObjects,
    uploadObject,
    getUploadPresignedUrl,
    uploadFromUrl,
    createBucket,
    deleteBucket
};
