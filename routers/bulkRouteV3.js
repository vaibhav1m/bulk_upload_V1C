const express = require("express");
const router = express.Router();
const bulkController = require("../controllers/bulkControllerV3_FIXED");

// Creation Module
router.get("/getUploadUrl", bulkController.getUploadUrl);
router.get("/getProfiles", bulkController.getAmazonProfiles);
router.post("/validate", bulkController.validateScheduleName);
router.post("/checkConflict", bulkController.checkConflicts);
router.post("/create", bulkController.createBulkSchedule);

// User Directory
router.get("/user/directory/search", bulkController.searchUserDirectory);
router.post("/user/directory/add", bulkController.addUserToDirectory);

// Dashboard
router.get("/list", bulkController.getAllSchedules);
router.get("/download", bulkController.downloadFile);

// Management
router.get("/details/:parent_id", bulkController.getScheduleDetails);
router.put("/status", bulkController.updateStatus);
router.put("/update", bulkController.updateBulkSchedule);

module.exports = router;