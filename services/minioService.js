const Minio = require('minio');
require("dotenv").config();

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
});

// Connection Check
(async () => {
    try {
        console.log(`📡 Testing MinIO Connection...`);
        await minioClient.listBuckets();
        console.log('✅ MinIO Connected');
    } catch (err) {
        console.error('❌ MinIO Failed:', err.message);
    }
})();

exports.getPresignedPutUrl = async (bucketName, key, expiry = 900) => {
    try {
        const bucketExists = await minioClient.bucketExists(bucketName);
        if (!bucketExists) {
            await minioClient.makeBucket(bucketName, 'us-east-1');
        }
        return await minioClient.presignedPutObject(bucketName, key, expiry);
    } catch (error) {
        throw error;
    }
};

exports.getPresignedGetUrl = async (bucketName, key, expiry = 3600) => {
    try {
        return await minioClient.presignedGetObject(bucketName, key, expiry);
    } catch (error) {
        throw error;
    }
};

exports.fileExists = async (bucketName, key) => {
    try {
        await minioClient.statObject(bucketName, key);
        return true;
    } catch (error) {
        if (error.code === 'NotFound') return false;
        throw error;
    }
};

exports.deleteFile = async (bucketName, key) => {
    try {
        await minioClient.removeObject(bucketName, key);
    } catch (error) {
        throw error;
    }
};