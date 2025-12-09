const Minio = require('minio');

// --------------------------------------------------
// 1. Create MinIO Client
// --------------------------------------------------
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT || "9000"),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

const bucketName = process.env.MINIO_BUCKET_NAME;

// --------------------------------------------------
// 2. Connection Test (Runs Once on Server Start)
// --------------------------------------------------
(async () => {
    try {
        console.log("📡 Testing MinIO Connection...");
        await minioClient.listBuckets();
        console.log("✅ MinIO Connected Successfully");
    } catch (err) {
        console.error("❌ MinIO Connection Failed:", err.message);
    }
})();

// --------------------------------------------------
// 3. Ensure Bucket Exists
// --------------------------------------------------
(async () => {
    try {
        const exists = await minioClient.bucketExists(bucketName);
        if (!exists) {
            console.log(`🪣 Bucket "${bucketName}" does not exist. Creating...`);
            await minioClient.makeBucket(bucketName, "us-east-1");
            console.log(`✅ Bucket "${bucketName}" created.`);
        } else {
            console.log(`🪣 Bucket "${bucketName}" already exists.`);
        }
    } catch (err) {
        console.error("❌ Bucket Initialization Error:", err.message);
    }
})();

// --------------------------------------------------
// 4. Upload (Presigned PUT URL)
// --------------------------------------------------
exports.getPresignedPutUrl = async (key, expiry = 900) => {
    try {
        return await minioClient.presignedPutObject(bucketName, key, expiry);
    } catch (error) {
        console.error("❌ MinIO PUT URL Error:", error.message);
        throw new Error("Failed to generate upload URL");
    }
};

// --------------------------------------------------
// 5. Download (Presigned GET URL)
// --------------------------------------------------
exports.getPresignedGetUrl = async (key, expiry = 900) => {
    try {
        return await minioClient.presignedGetObject(bucketName, key, expiry);
    } catch (error) {
        console.error("❌ MinIO GET URL Error:", error.message);
        throw new Error("Failed to generate download URL");
    }
};

// --------------------------------------------------
// 6. File Exists Check
// --------------------------------------------------
exports.fileExists = async (key) => {
    try {
        await minioClient.statObject(bucketName, key);
        return true;
    } catch (error) {
        if (error.code === "NotFound") return false;
        throw error; // Serious error → throw up
    }
};

// --------------------------------------------------
// 7. Delete File
// --------------------------------------------------
exports.deleteFile = async (key) => {
    try {
        await minioClient.removeObject(bucketName, key);
        console.log(`🗑️ Deleted file from MinIO: ${key}`);
        return true;
    } catch (error) {
        console.error("❌ MinIO Delete Error:", error.message);
        throw new Error("Failed to delete file");
    }
};

// Export the raw client if needed
exports.minioClient = minioClient;
