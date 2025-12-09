'use strict';

/**
 * ============================================================================
 * S3 WIDGET CONTROLLER
 * ============================================================================
 * 
 * Handles S3 operations for the interactive dashboard widget.
 * Provides bucket browsing, file upload/download/delete.
 * 
 * Author: Nisha Kumari
 * Project: AWS Cloud Commander for Zoho Cliqtrix 2025
 * ============================================================================
 */

const s3Service = require('../../services/s3');
const { successResponse, errorResponse } = require('../../utils/helpers');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
}).single('file');

// Helper to get user credentials from database
async function getUserCredentials(userId, catalystApp, req) {
    if (!userId) {
        return { error: 'NO_USER_ID', message: 'User ID is required' };
    }

    try {
        const catalystInstance = catalystApp.initialize(req);
        const credDatastore = catalystInstance.datastore();
        const credTable = credDatastore.table('user_credentials');
        
        const allCreds = await credTable.getAllRows();
        const userCredentials = allCreds.find(row => row.user_id === userId);
        
        if (!userCredentials) {
            return { error: 'NO_CREDENTIALS', message: 'AWS credentials not configured' };
        }
        
        return { 
            valid: true,
            credentials: {
                accessKeyId: userCredentials.access_key_id,
                secretAccessKey: userCredentials.secret_access_key,
                region: userCredentials.region || 'ap-south-1',
                sessionToken: userCredentials.session_token || undefined
            }
        };
    } catch (error) {
        console.error('Credential fetch failed:', error);
        return { error: 'VERIFICATION_FAILED', message: 'Failed to fetch credentials' };
    }
}

/**
 * Browse S3 Bucket
 * Lists objects (files and folders) in a bucket with optional prefix
 */
async function browse(req, res) {
    const { bucket, prefix, userId, region, continuationToken, maxKeys } = req.query;

    console.log(`[Widget S3 Browse] Bucket: ${bucket}, Prefix: ${prefix || '/'}, User: ${userId}, ContinuationToken: ${continuationToken ? 'Yes' : 'No'}, MaxKeys: ${maxKeys || 100}`);

    // Validate required parameters
    if (!bucket) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        const result = await s3Service.listObjects(bucket, prefix || '', region, parseInt(maxKeys) || 100, credCheck.credentials, continuationToken || null);

        console.log(`[Widget S3 Browse] Success - ${result.totalFolders} folders, ${result.totalFiles} files`);
        
        return res.json(successResponse({
            bucket: bucket,
            prefix: prefix || '',
            folders: result.folders,
            files: result.files,
            totalFolders: result.totalFolders,
            totalFiles: result.totalFiles,
            isTruncated: result.isTruncated,
            nextContinuationToken: result.nextContinuationToken
        }));

    } catch (error) {
        console.error('[Widget S3 Browse] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to list files in this bucket. Check your AWS IAM permissions for s3:ListBucket.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to browse bucket', 'BROWSE_FAILED'));
    }
}

/**
 * Upload File to S3
 * Handles multipart file upload
 */
async function uploadFile(req, res) {
    // Use multer middleware to handle file upload
    upload(req, res, async function (err) {
        if (err) {
            console.error('[Widget S3 Upload] Multer error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json(errorResponse('File size exceeds 50MB limit'));
            }
            return res.status(400).json(errorResponse('File upload failed: ' + err.message));
        }

        const { bucket, prefix, userId, region } = req.body;
        const file = req.file;

        console.log(`[Widget S3 Upload] Bucket: ${bucket}, File: ${file?.originalname}, User: ${userId}`);

        // Validate required parameters
        if (!bucket) {
            return res.status(400).json(errorResponse('Bucket name is required'));
        }

        if (!file) {
            return res.status(400).json(errorResponse('No file provided'));
        }

        if (!region) {
            return res.status(400).json(errorResponse('Region is required'));
        }

        // Get user credentials
        const catalystApp = require('zcatalyst-sdk-node');
        const credCheck = await getUserCredentials(userId, catalystApp, req);
        
        if (credCheck.error) {
            return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
        }

        try {
            // Construct full key (path) for the object
            const key = prefix ? `${prefix}${file.originalname}` : file.originalname;

            // Upload file to S3
            const result = await s3Service.uploadObject(
                bucket,
                key,
                file.buffer,
                file.mimetype,
                region,
                credCheck.credentials
            );

            console.log(`[Widget S3 Upload] Success - Key: ${key}`);
            
            return res.json(successResponse({
                message: `File "${file.originalname}" uploaded successfully`,
                bucket: bucket,
                key: key,
                size: file.size,
                etag: result.ETag
            }));

        } catch (error) {
            console.error('[Widget S3 Upload] Failed:', error);
            
            if (error.name === 'NoSuchBucket') {
                return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
            }
            
            if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
                return res.status(403).json(errorResponse('You don\'t have permission to upload files to this bucket. Check your AWS IAM permissions for s3:PutObject.', 'ACCESS_DENIED'));
            }

            return res.status(500).json(errorResponse(error.message || 'Failed to upload file', 'UPLOAD_FAILED'));
        }
    });
}

/**
 * Delete S3 Object
 * Removes a file from the bucket
 * Uses POST method for destructive operation
 */
async function deleteObject(req, res) {
    // Accept from body (POST) or query (fallback)
    const params = req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
    const { bucket, key, userId, region } = params;

    console.log(`[Widget S3 Delete] Bucket: ${bucket}, Key: ${key}, User: ${userId}, Region: ${region}`);

    // Validate required parameters
    if (!bucket) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!key) {
        return res.status(400).json(errorResponse('Object key is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        console.error(`[Widget S3 Delete] Credential check failed: ${credCheck.error} - ${credCheck.message}`);
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        await s3Service.deleteObject(bucket, key, region, credCheck.credentials);

        console.log(`[Widget S3 Delete] Success`);
        
        return res.json(successResponse({
            message: `File deleted successfully`,
            bucket: bucket,
            key: key
        }));

    } catch (error) {
        console.error('[Widget S3 Delete] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'NoSuchKey') {
            return res.status(404).json(errorResponse('File not found', 'FILE_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to delete files from this bucket. Check your AWS IAM permissions for s3:DeleteObject.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to delete file', 'DELETE_FAILED'));
    }
}

/**
 * Get Download URL
 * Generates a presigned URL for secure file download
 */
async function getDownloadUrl(req, res) {
    const { bucket, key, userId, region, expiresIn } = req.query;

    const expirySeconds = parseInt(expiresIn) || 3600; // Default 1 hour
    
    console.log(`[Widget S3 Download] Bucket: ${bucket}, Key: ${key}, User: ${userId}, Expiry: ${expirySeconds}s`);

    // Validate required parameters
    if (!bucket) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!key) {
        return res.status(400).json(errorResponse('Object key is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        // Generate presigned URL with custom expiry
        const result = await s3Service.getPresignedUrl(bucket, key, region, expirySeconds, credCheck.credentials);

        console.log(`[Widget S3 Download] Success - URL generated (expires in ${expirySeconds}s)`);
        
        return res.json(successResponse({
            url: result.url,
            bucket: bucket,
            key: key,
            expiresIn: expirySeconds,
            expiresAt: result.expiresAt,
            fileName: key.split('/').pop()
        }));

    } catch (error) {
        console.error('[Widget S3 Download] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'NoSuchKey') {
            return res.status(404).json(errorResponse('File not found', 'FILE_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to download files from this bucket. Check your AWS IAM permissions for s3:GetObject.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to generate download URL', 'DOWNLOAD_FAILED'));
    }
}

/**
 * Get Bucket Info
 * Returns bucket statistics (region, size, object count)
 */
async function getBucketInfo(req, res) {
    const { bucket, userId, region } = req.query;

    console.log(`[Widget S3 BucketInfo] Bucket: ${bucket}, User: ${userId}`);

    if (!bucket) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        const info = await s3Service.getBucketInfo(bucket, region, credCheck.credentials);

        console.log(`[Widget S3 BucketInfo] Success - ${info.totalObjects} objects, ${info.totalSizeFormatted}`);
        
        return res.json(successResponse(info));

    } catch (error) {
        console.error('[Widget S3 BucketInfo] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to access bucket information. Check your AWS IAM permissions.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to get bucket info', 'INFO_FAILED'));
    }
}

/**
 * Delete Bucket
 * Removes an empty S3 bucket
 */
async function deleteBucket(req, res) {
    const params = req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
    const { bucket, userId, region } = params;

    console.log(`[Widget S3 DeleteBucket] Bucket: ${bucket}, User: ${userId}`);

    if (!bucket) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        await s3Service.deleteBucket(bucket, region, credCheck.credentials);

        console.log(`[Widget S3 DeleteBucket] Success`);
        
        return res.json(successResponse({
            message: `Bucket "${bucket}" deleted successfully`,
            bucket: bucket
        }));

    } catch (error) {
        console.error('[Widget S3 DeleteBucket] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'BucketNotEmpty') {
            return res.status(400).json(errorResponse('Cannot delete bucket - it contains objects. Please delete all files first.', 'BUCKET_NOT_EMPTY'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to delete this bucket. Check your AWS IAM permissions for s3:DeleteBucket.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to delete bucket', 'DELETE_FAILED'));
    }
}

/**
 * Search Files in Bucket
 * Searches for objects by name
 */
async function searchObjects(req, res) {
    const { bucket, searchTerm, userId, region } = req.query;

    console.log(`[Widget S3 Search] Bucket: ${bucket}, Term: ${searchTerm}, User: ${userId}`);

    if (!bucket) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!searchTerm) {
        return res.status(400).json(errorResponse('Search term is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        const results = await s3Service.searchObjects(bucket, searchTerm, region, 100, credCheck.credentials);

        console.log(`[Widget S3 Search] Success - ${results.totalMatches} matches`);
        
        return res.json(successResponse(results));

    } catch (error) {
        console.error('[Widget S3 Search] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to search in this bucket.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Search failed', 'SEARCH_FAILED'));
    }
}

/**
 * Get Object Info (File Metadata)
 * Returns detailed metadata for a specific file
 */
async function getObjectInfo(req, res) {
    const { bucket, key, userId, region } = req.query;

    console.log(`[Widget S3 Object Info] Bucket: ${bucket}, Key: ${key}, User: ${userId}`);

    // Validate required parameters
    if (!bucket || !key) {
        return res.status(400).json(errorResponse('Bucket name and key are required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        const result = await s3Service.getObjectInfo(bucket, key, region, credCheck.credentials);

        console.log(`[Widget S3 Object Info] Success - ${result.sizeFormatted}, ${result.contentType}`);
        
        return res.json(successResponse(result));

    } catch (error) {
        console.error('[Widget S3 Object Info] Failed:', error);
        
        if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
            return res.status(404).json(errorResponse('File not found', 'FILE_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to access this file.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to get file info', 'GET_INFO_FAILED'));
    }
}

/**
 * Create Folder
 * Creates a virtual folder by uploading an empty object with trailing slash
 */
async function createFolder(req, res) {
    const { bucket, folderName, prefix, userId, region } = req.body;

    console.log(`[Widget S3 Create Folder] Bucket: ${bucket}, Folder: ${folderName}, Prefix: ${prefix || ''}`);

    // Validate required parameters
    if (!bucket || !folderName) {
        return res.status(400).json(errorResponse('Bucket name and folder name are required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        const result = await s3Service.createFolder(bucket, folderName, prefix || '', region, credCheck.credentials);

        console.log(`[Widget S3 Create Folder] Success - ${result.key}`);
        
        return res.json(successResponse(result));

    } catch (error) {
        console.error('[Widget S3 Create Folder] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to create folders in this bucket.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to create folder', 'CREATE_FOLDER_FAILED'));
    }
}

/**
 * Delete Folder
 * Recursively deletes a folder and all its contents
 */
async function deleteFolder(req, res) {
    const { bucket, folderKey, userId, region } = req.body;

    console.log(`[Widget S3 Delete Folder] Bucket: ${bucket}, Folder: ${folderKey}`);

    // Validate required parameters
    if (!bucket || !folderKey) {
        return res.status(400).json(errorResponse('Bucket name and folder key are required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        const result = await s3Service.deleteFolder(bucket, folderKey, region, credCheck.credentials);

        console.log(`[Widget S3 Delete Folder] Success - ${result.objectsDeleted} objects deleted`);
        
        return res.json(successResponse(result));

    } catch (error) {
        console.error('[Widget S3 Delete Folder] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to delete folders in this bucket.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to delete folder', 'DELETE_FOLDER_FAILED'));
    }
}

/**
 * Get Detailed Bucket Statistics
 * Returns comprehensive stats including file type breakdown and largest files
 */
async function getDetailedBucketStats(req, res) {
    const { bucket, userId, region } = req.query;

    console.log(`[Widget S3 Detailed Stats] Bucket: ${bucket}, User: ${userId}`);

    // Validate required parameters
    if (!bucket) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        const result = await s3Service.getDetailedBucketStats(bucket, region, credCheck.credentials);

        console.log(`[Widget S3 Detailed Stats] Success - ${result.totalObjects} objects, ${result.fileTypes.length} types`);
        
        return res.json(successResponse(result));

    } catch (error) {
        console.error('[Widget S3 Detailed Stats] Failed:', error);
        
        if (error.name === 'NoSuchBucket') {
            return res.status(404).json(errorResponse('Bucket not found', 'BUCKET_NOT_FOUND'));
        }
        
        if (error.name === 'AccessDenied' || error.name === 'AccessDeniedException' || error.message?.includes('Access Denied')) {
            return res.status(403).json(errorResponse('You don\'t have permission to access this bucket.', 'ACCESS_DENIED'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to get bucket statistics', 'GET_STATS_FAILED'));
    }
}

/**
 * Create S3 Bucket
 */
async function createBucket(req, res) {
    const { bucketName, region, userId } = req.body;

    console.log(`[Widget S3] Create Bucket: ${bucketName}, Region: ${region}, User: ${userId}`);

    // Validate required parameters
    if (!bucketName) {
        return res.status(400).json(errorResponse('Bucket name is required'));
    }

    if (!region) {
        return res.status(400).json(errorResponse('Region is required'));
    }

    if (!userId) {
        return res.status(400).json(errorResponse('User ID is required'));
    }

    // Validate bucket name format
    const bucketNameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
    if (!bucketNameRegex.test(bucketName) || bucketName.length < 3 || bucketName.length > 63) {
        return res.status(400).json(errorResponse('Invalid bucket name format'));
    }

    // Get user credentials
    const catalystApp = require('zcatalyst-sdk-node');
    const credCheck = await getUserCredentials(userId, catalystApp, req);
    
    if (credCheck.error) {
        return res.status(401).json(errorResponse(credCheck.message, credCheck.error));
    }

    try {
        // Create bucket
        await s3Service.createBucket(bucketName, region);

        console.log(`[Widget S3] Bucket created successfully: ${bucketName}`);
        
        return res.json(successResponse({
            bucketName: bucketName,
            region: region,
            message: `Bucket ${bucketName} created successfully`
        }));

    } catch (error) {
        console.error('[Widget S3] Create bucket failed:', error);
        
        // Handle specific AWS errors
        if (error.name === 'BucketAlreadyExists' || error.message?.includes('already exists')) {
            return res.status(409).json(errorResponse('Bucket name already exists. Please choose a different name.', 'BUCKET_EXISTS'));
        }
        
        if (error.name === 'BucketAlreadyOwnedByYou') {
            return res.status(409).json(errorResponse('You already own a bucket with this name.', 'BUCKET_OWNED'));
        }
        
        if (error.name === 'InvalidBucketName') {
            return res.status(400).json(errorResponse('Invalid bucket name format.', 'INVALID_NAME'));
        }

        return res.status(500).json(errorResponse(error.message || 'Failed to create bucket', 'CREATE_FAILED'));
    }
}

module.exports = {
    browse,
    upload: uploadFile,
    deleteObject,
    getDownloadUrl,
    getBucketInfo,
    deleteBucket,
    searchObjects,
    getObjectInfo,
    createFolder,
    deleteFolder,
    getDetailedBucketStats,
    createBucket
};

