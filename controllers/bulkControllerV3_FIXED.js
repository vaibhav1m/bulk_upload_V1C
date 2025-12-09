const sql = require("../database/sqldb");
const { getPresignedPutUrl, getPresignedGetUrl, fileExists } = require("../utils/minioClient");
const { validateCreateBulkSchedule, validateCheckConflict, validateUpdateSchedule } = require("../validations/validateBulkController_FIXED");
const { v4: uuidv4 } = require("uuid");

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Standardized response formatter
 */
const sendResponse = (res, statusCode, status, message, data = null) => {
    const response = { status, message };
    if (data !== null) response.data = data;
    return res.status(statusCode).json(response);
};

/**
 * Standardized error handler
 */
const handleError = (res, error, context) => {
    console.error(`❌ ${context}:`, error);

    // Don't expose internal errors to client
    const safeMessage = error.code === '23505'
        ? 'Duplicate entry found'
        : error.code === '23503'
            ? 'Referenced record not found'
            : 'An error occurred while processing your request';

    return sendResponse(res, 500, "error", safeMessage);
};

// ============================================
// MODULE 1: SCHEDULE CREATION
// ============================================

/**
 * 0. Get Presigned URL for File Upload
 * GET /api/v1/brand/bulk/getUploadUrl
 */
exports.getUploadUrl = async (req, res) => {
    const { app_id, brand_id, platform_id, file_name } = req.query;

    // Validation
    if (!app_id || !brand_id || !platform_id || !file_name) {
        return sendResponse(res, 400, "fail", "app_id, brand_id, platform_id, and file_name are required");
    }

    try {
        // Sanitize filename - remove special chars, spaces
        const cleanName = file_name
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .replace(/_{2,}/g, "_");

        // Create hierarchical key
        const timestamp = Date.now();
        const uniqueId = uuidv4();
        const key = `${app_id}/${brand_id}/${platform_id}/bulk_uploads/${timestamp}_${uniqueId}_${cleanName}`;

        // Generate presigned PUT URL (15 minutes expiry)
        const url = await getPresignedPutUrl(key, 900);

        return sendResponse(res, 200, "success", "Upload URL generated", {
            uploadUrl: url,
            file_id: key,
            expiresIn: 900
        });

    } catch (error) {
        return handleError(res, error, "getUploadUrl");
    }
};

/**
 * 1. Get Amazon Profiles
 * GET /api/v1/brand/bulk/getProfiles
 */
exports.getAmazonProfiles = async (req, res) => {
    const { brand_id } = req.query;

    if (!brand_id) {
        return sendResponse(res, 400, "fail", "brand_id is required");
    }

    try {
        const query = `
    SELECT 
        row_number() OVER () AS id,
        additional_data->>'profile_obj' AS profile_data
    FROM public.neo_brand_platform_cred_master
    WHERE infytrix_brand_id = $1 
    AND platform_type = 'Amazon Ads API'
    ORDER BY created_time_stamp DESC
`;


        const result = await sql.query(query, [brand_id]);

        const profiles = result.rows.map(row => {
            try {
                return {
                    id: row.id,
                    ...JSON.parse(row.profile_data || '{}')
                };
            } catch (e) {
                return { id: row.id, error: 'Invalid profile data' };
            }
        });

        return sendResponse(res, 200, "success", "Profiles retrieved", profiles);

    } catch (error) {
        return handleError(res, error, "getAmazonProfiles");
    }
};

/**
 * 2. Validate Schedule Name (Fixed)
 * POST /api/v1/brand/bulk/validate
 */
exports.validateScheduleName = async (req, res) => {
    const { app_id, brand_id, platform_id, schedule_name } = req.body;

    // Validation
    if (!app_id || !brand_id || !platform_id || !schedule_name) {
        return sendResponse(res, 400, "fail", "All fields (app_id, brand_id, platform_id, schedule_name) are required");
    }

    if (schedule_name.trim().length < 3) {
        return sendResponse(res, 400, "fail", "Schedule name must be at least 3 characters");
    }

    try {
        // FIXED: Use child_id IS NULL to identify parent records
        const query = `
            SELECT 1 
            FROM public.v3_t_brands_bulk_file_scheduling_detail
            WHERE app_id = $1 
            AND brand_id = $2 
            AND platform_id = $3
            AND LOWER(TRIM(schedule_name)) = LOWER(TRIM($4))
            AND child_id IS NULL
           AND status NOT IN ('CANCELLED', 'DELETED')
            LIMIT 1
        `;

        const result = await sql.query(query, [app_id, brand_id, platform_id, schedule_name]);

        if (result.rowCount > 0) {
            return sendResponse(res, 409, "fail", "Schedule name already exists for this platform");
        }

        return sendResponse(res, 200, "success", "Schedule name is available");

    } catch (error) {
        return handleError(res, error, "validateScheduleName");
    }
};

/**
 * 3. Check Schedule Conflicts (Fixed SQL Injection)
 * POST /api/v1/brand/bulk/checkConflict
 */
exports.checkConflicts = async (req, res) => {
    const validation = await validateCheckConflict(req.body);
    if (!validation.status) {
        return sendResponse(res, 400, "fail", validation.error);
    }

    const {
        app_id,
        brand_id,
        platform_id,
        start_date,
        end_date,
        time_slot,
        days,
        recurring_type,
        exclude_parent_id // For edit scenario
    } = req.body;

    try {
        let query, values;

        if (recurring_type === "WEEKLY" && days?.length > 0) {
            // FIXED: Use parameterized query instead of string interpolation
            query = `
                SELECT 
                    schedule_date::text,
                    schedule_name
                FROM public.v3_t_brands_bulk_file_scheduling_detail
                WHERE app_id = $1
                AND brand_id = $2
                AND platform_id = $3
                AND child_id IS NOT NULL
                AND schedule_date BETWEEN $4 AND $5
                AND schedule_time = $6::time
                AND EXTRACT(DOW FROM schedule_date)::int = ANY($7::int[])
                AND status IN ('ACTIVE', 'UPCOMING', 'PENDING')
                ${exclude_parent_id ? 'AND parent_id != $8' : ''}
                ORDER BY schedule_date ASC
            `;

            values = exclude_parent_id
                ? [app_id, brand_id, platform_id, start_date, end_date, time_slot, days, exclude_parent_id]
                : [app_id, brand_id, platform_id, start_date, end_date, time_slot, days];

        } else {
            // DAILY frequency
            query = `
                SELECT 
                    schedule_date::text,
                    schedule_name
                FROM public.v3_t_brands_bulk_file_scheduling_detail
                WHERE app_id = $1
                AND brand_id = $2
                AND platform_id = $3
                AND child_id IS NOT NULL
                AND schedule_date BETWEEN $4 AND $5
                AND schedule_time = $6::time
                AND status IN ('ACTIVE', 'UPCOMING', 'PENDING')
                ${exclude_parent_id ? 'AND parent_id != $7' : ''}
                ORDER BY schedule_date ASC
            `;

            values = exclude_parent_id
                ? [app_id, brand_id, platform_id, start_date, end_date, time_slot, exclude_parent_id]
                : [app_id, brand_id, platform_id, start_date, end_date, time_slot];
        }

        const result = await sql.query(query, values);

        const conflicts = result.rows.map(row => ({
            date: row.schedule_date,
            existingSchedule: row.schedule_name
        }));

        return sendResponse(res, 200, "success",
            result.rowCount > 0
                ? "Conflicts found on selected dates"
                : "No conflicts found",
            {
                hasConflict: result.rowCount > 0,
                conflictCount: result.rowCount,
                conflicts
            }
        );

    } catch (error) {
        return handleError(res, error, "checkConflicts");
    }
};

/**
 * 4. Create Bulk Schedule (With Better Validation)
 * POST /api/v1/brand/bulk/create
 */
exports.createBulkSchedule = async (req, res) => {
    const validation = await validateCreateBulkSchedule(req.body);
    if (!validation.status) {
        return sendResponse(res, 400, "fail", validation.error);
    }

    const {
        app_id, brand_id, platform_id, schedule_name, file_id, file_name,
        emails, profile_obj, type, recurring_type, start_date, end_date,
        schedule_time, days
    } = req.body;

    const user_id = req.user?.user_id;

    // Additional validations
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (startDate < today) {
        return sendResponse(res, 400, "fail", "Start date cannot be in the past");
    }

    if (endDate <= startDate) {
        return sendResponse(res, 400, "fail", "End date must be after start date");
    }

    if (recurring_type === 'WEEKLY' && (!days || days.length === 0)) {
        return sendResponse(res, 400, "fail", "Days selection is required for weekly schedules");
    }

    try {
        // Verify file exists in MinIO
        const exists = await fileExists(file_id);
        // if (!exists) {
        //     return sendResponse(res, 404, "fail", "Uploaded file not found in storage");
        // }

        // Call stored procedure
        const query = `
            SELECT public.sp_v3B_create_bulk_schedule(
                $1::uuid,   -- app_id
                $2::uuid,   -- brand_id
                $3::uuid,   -- platform_id
                $4,         -- schedule_name
                $5,         -- file_name
                $6,         -- file_id
                $7,         -- emails
                $8::jsonb,  -- profile_obj
                $9,         -- type
                $10,        -- recurring_type
                $11::date,  -- start_date
                $12::date,  -- end_date
                $13::time,  -- schedule_time
                $14::int[], -- days
                $15::uuid   -- user_id
            ) as result_data
        `;

        const values = [
            app_id, brand_id, platform_id, schedule_name, file_name, file_id,
            emails, JSON.stringify(profile_obj), type, recurring_type,
            start_date, end_date, schedule_time, days || [], user_id
        ];

        const result = await sql.query(query, values);
        const responseData = result.rows[0]?.result_data;

        if (!responseData) {
            throw new Error("Stored procedure returned no data");
        }

        // Check if stored procedure returned error
        if (responseData.status === 'error') {
            return sendResponse(res, 400, "fail", responseData.message);
        }

        return sendResponse(res, 201, "success", "Schedule created successfully", responseData);

    } catch (error) {
        return handleError(res, error, "createBulkSchedule");
    }
};

// ============================================
// MODULE 2: USER DIRECTORY
// ============================================

/**
 * 5. Search User Directory (Fixed with Pagination)
 * GET /api/v1/brand/bulk/user/directory/search
 */
exports.searchUserDirectory = async (req, res) => {
    const { search = '', page = 1, limit = 10 } = req.query;
    const { user_id } = req.user;

    const offset = (page - 1) * limit;

    try {
        const query = `
            SELECT 
                user_id,
                first_name,
                last_name,
                email,
                contact_number,
                organisation
            FROM public.v3_t_user_directory
            WHERE created_by = $1
            AND status = 'ACTIVE'
            AND (
                LOWER(first_name) LIKE LOWER($2) 
                OR LOWER(last_name) LIKE LOWER($2)
                OR LOWER(email) LIKE LOWER($2)
            )
            ORDER BY first_name ASC, last_name ASC
            LIMIT $3 OFFSET $4
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM public.v3_t_user_directory
            WHERE created_by = $1
            AND status = 'ACTIVE'
            AND (
                LOWER(first_name) LIKE LOWER($2) 
                OR LOWER(last_name) LIKE LOWER($2)
                OR LOWER(email) LIKE LOWER($2)
            )
        `;

        const searchPattern = `%${search}%`;

        const [dataResult, countResult] = await Promise.all([
            sql.query(query, [user_id, searchPattern, limit, offset]),
            sql.query(countQuery, [user_id, searchPattern])
        ]);

        return sendResponse(res, 200, "success", "Directory entries retrieved", {
            users: dataResult.rows,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit)
        });

    } catch (error) {
        return handleError(res, error, "searchUserDirectory");
    }
};

/**
 * 6. Add User to Directory (With Better Validation)
 * POST /api/v1/brand/bulk/user/directory/add
 */
exports.addUserToDirectory = async (req, res) => {
    const { first_name, last_name, email, contact_number, organisation } = req.body;
    const { user_id } = req.user;

    // Validation
    if (!email || !first_name) {
        return sendResponse(res, 400, "fail", "Email and first name are required");
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return sendResponse(res, 400, "fail", "Invalid email format");
    }

    try {
        const insertQuery = `
            INSERT INTO public.v3_t_user_directory (
                first_name,
                last_name,
                email,
                contact_number,
                organisation,
                created_by,
                status,
                created_time_stamp
            ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW())
            RETURNING user_id, first_name, last_name, email
        `;

        const result = await sql.query(insertQuery, [
            first_name.trim(),
            last_name?.trim() || null,
            email.trim().toLowerCase(),
            contact_number?.trim() || null,
            organisation?.trim() || null,
            user_id
        ]);

        return sendResponse(res, 201, "success", "Contact added to directory", result.rows[0]);

    } catch (error) {
        // Handle duplicate email (unique constraint violation)
        if (error.code === '23505') {
            return sendResponse(res, 409, "fail", "This email already exists in your directory");
        }

        return handleError(res, error, "addUserToDirectory");
    }
};

// ============================================
// MODULE 3: DASHBOARD
// ============================================

/**
 * 7. Get All Schedules (Optimized Query)
 * GET /api/v1/brand/bulk/list
 */
exports.getAllSchedules = async (req, res) => {
    const {
        app_id,
        brand_id,
        platform_id,
        page = 1,
        limit = 10,
        search = ''
    } = req.query;

    if (!app_id || !brand_id || !platform_id) {
        return sendResponse(res, 400, "fail", "app_id, brand_id, and platform_id are required");
    }

    const offset = (page - 1) * limit;

    try {
        let searchClause = "";
        let values = [app_id, brand_id, platform_id];
        let param = 4;

        if (search) {
            searchClause = `AND LOWER(schedule_name) LIKE LOWER($${param})`;
            values.push(`%${search}%`);
            param++;
        }

        const query = `
            WITH latest_child AS (
                SELECT DISTINCT ON (parent_id)
                    parent_id,
                    schedule_name,
                    file_name,
                    file_id,
                    type,
                    recurring_type,
                    start_date,
                    end_date,
                    schedule_time,
                    status,
                    emails,
                    created_time_stamp
                FROM public.v3_t_brands_bulk_file_scheduling_detail
                WHERE app_id = $1
                AND brand_id = $2
                AND platform_id = $3
                ${searchClause}
                ORDER BY parent_id, created_time_stamp DESC
            ),
            stats AS (
                SELECT 
                    parent_id,
                    COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) AS completed_count,
                    COUNT(CASE WHEN status IN ('ACTIVE', 'UPCOMING', 'PENDING') THEN 1 END) AS pending_count,
                    COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed_count,
                    MIN(CASE 
                        WHEN status IN ('ACTIVE','UPCOMING','PENDING') 
                        AND schedule_date >= CURRENT_DATE 
                    THEN schedule_date END) AS next_run_date,
                    MAX(CASE 
                        WHEN status IN ('SUCCESS','FAILED') 
                    THEN schedule_date END) AS last_run_date
                FROM public.v3_t_brands_bulk_file_scheduling_detail
                WHERE app_id = $1
                AND brand_id = $2
                AND platform_id = $3
                GROUP BY parent_id
            )

            SELECT 
                lc.*,
                COALESCE(s.completed_count, 0) AS completed_count,
                COALESCE(s.pending_count, 0) AS pending_count,
                COALESCE(s.failed_count, 0) AS failed_count,
                s.next_run_date,
                s.last_run_date
            FROM latest_child lc
            LEFT JOIN stats s ON lc.parent_id = s.parent_id
            ORDER BY lc.created_time_stamp DESC
            LIMIT $${param} OFFSET $${param + 1}
        `;

        values.push(limit, offset);

        // COUNT QUERY (NO parent rows needed!)
        const countQuery = `
            SELECT COUNT(DISTINCT parent_id) AS total
            FROM public.v3_t_brands_bulk_file_scheduling_detail
            WHERE app_id = $1
            AND brand_id = $2
            AND platform_id = $3
            ${searchClause}
        `;

        const countValues = search
            ? [app_id, brand_id, platform_id, `%${search}%`]
            : [app_id, brand_id, platform_id];

        const [dataResult, countResult] = await Promise.all([
            sql.query(query, values),
            sql.query(countQuery, countValues)
        ]);

        return sendResponse(res, 200, "success", "Schedules retrieved", {
            schedules: dataResult.rows,
            total: Number(countResult.rows[0]?.total || 0),
            page: Number(page),
            limit: Number(limit)
        });

    } catch (error) {
        return handleError(res, error, "getAllSchedules");
    }
};


/**
 * 8. Download File (With Validation)
 * GET /api/v1/brand/bulk/download
 */
exports.downloadFile = async (req, res) => {
    const { file_id, parent_id } = req.query;

    if (!file_id && !parent_id) {
        return sendResponse(res, 400, "fail", "Either file_id or parent_id is required");
    }

    try {
        let fileKey = file_id;

        // If parent_id provided, get file_id from database
        if (parent_id && !file_id) {
            const query = `
                SELECT file_id
                FROM public.v3_t_brands_bulk_file_scheduling_detail
                WHERE parent_id = $1
                AND child_id IS NULL
                LIMIT 1
            `;
            const result = await sql.query(query, [parent_id]);

            if (result.rowCount === 0) {
                return sendResponse(res, 404, "fail", "Schedule not found");
            }

            fileKey = result.rows[0].file_id;
        }

        // Verify file exists in MinIO
        const exists = await fileExists(fileKey);
        if (!exists) {
            return sendResponse(res, 404, "fail", "File not found in storage");
        }

        // Generate presigned GET URL (5 minutes expiry)
        const url = await getPresignedGetUrl(fileKey, 300);

        return sendResponse(res, 200, "success", "Download URL generated", {
            downloadUrl: url,
            expiresIn: 300,
            fileName: fileKey.split('/').pop()
        });

    } catch (error) {
        return handleError(res, error, "downloadFile");
    }
};

// ============================================
// MODULE 4: SCHEDULE MANAGEMENT
// ============================================

/**
 * 9. Get Schedule Details (With Hierarchy Validation)
 * GET /api/v1/brand/bulk/details/:parent_id
 */
exports.getScheduleDetails = async (req, res) => {
    const { parent_id } = req.params;
    const { app_id, brand_id, platform_id } = req.query;

    // Validation
    if (!app_id || !brand_id || !platform_id) {
        return sendResponse(res, 400, "fail", "app_id, brand_id, and platform_id are required");
    }

    try {
        // Get parent info
        const parentQuery = `
            SELECT *
            FROM public.v3_t_brands_bulk_file_scheduling_detail
            WHERE parent_id = $1
            AND app_id = $2
            AND brand_id = $3
            AND platform_id = $4
            
            LIMIT 1
        `;

        const parentResult = await sql.query(parentQuery, [parent_id, app_id, brand_id, platform_id]);

        if (parentResult.rowCount === 0) {
            return sendResponse(res, 404, "fail", "Schedule not found");
        }

        // Get children
        const childQuery = `
            SELECT 
                child_id,
                schedule_date,
                schedule_time,
                status,
                schedule_status,
                updated_time_stamp as execution_time,
                weekday
            FROM public.v3_t_brands_bulk_file_scheduling_detail
            WHERE parent_id = $1
            AND child_id IS NOT NULL
            ORDER BY schedule_date ASC
        `;

        const childResult = await sql.query(childQuery, [parent_id]);

        return sendResponse(res, 200, "success", "Schedule details retrieved", {
            parent: parentResult.rows[0],
            children: childResult.rows,
            totalChildren: childResult.rowCount,
            completedCount: childResult.rows.filter(c => c.status === 'SUCCESS').length,
            pendingCount: childResult.rows.filter(c => c.status === 'UPCOMING' || c.status === 'ACTIVE').length,
            failedCount: childResult.rows.filter(c => c.status === 'FAILED').length
        });

    } catch (error) {
        return handleError(res, error, "getScheduleDetails");
    }
};

/**
 * 10. Update Status (Fixed with Validation)
 * PUT /api/v1/brand/bulk/status
 */
exports.updateStatus = async (req, res) => {
    const { action, parent_id, child_id, app_id, brand_id, platform_id } = req.body;

    // Validation
    if (!action || !parent_id || !app_id || !brand_id || !platform_id) {
        return sendResponse(res, 400, "fail", "action, parent_id, app_id, brand_id, and platform_id are required");
    }

    // FIXED: Validate action
    const validActions = ['PAUSE', 'RESUME', 'ACTIVE', 'CANCEL'];
    if (!validActions.includes(action)) {
        return sendResponse(res, 400, "fail", `Invalid action. Must be one of: ${validActions.join(', ')}`);
    }

    // FIXED: Better status mapping
    const statusMap = {
        'PAUSE': 'PAUSED',
        'RESUME': 'ACTIVE',
        'ACTIVE': 'ACTIVE',
        'CANCEL': 'CANCELLED'
    };

    const newStatus = statusMap[action];

    try {
        let query, values;

        if (child_id) {
            // Update single child (date instance)
            // FIXED: Add check to prevent updating completed/failed
            query = `
                UPDATE public.v3_t_brands_bulk_file_scheduling_detail
                SET 
                    status = $1,
                    updated_by = $2,
                    updated_time_stamp = NOW()
                WHERE child_id = $3
                AND parent_id = $4
                AND app_id = $5
                AND brand_id = $6
                AND platform_id = $7
                AND status NOT IN ('SUCCESS', 'FAILED')
                RETURNING child_id, schedule_date, status
            `;

            values = [newStatus, req.user?.user_id, child_id, parent_id, app_id, brand_id, platform_id];

        } else {
            // Update entire schedule (parent and all pending children)
            query = `
                UPDATE public.v3_t_brands_bulk_file_scheduling_detail
                SET 
                    status = $1,
                    updated_by = $2,
                    updated_time_stamp = NOW()
                WHERE parent_id = $3
                AND app_id = $4
                AND brand_id = $5
                AND platform_id = $6
                AND status NOT IN ('SUCCESS', 'FAILED')
                RETURNING parent_id, child_id, status
            `;

            values = [newStatus, req.user?.user_id, parent_id, app_id, brand_id, platform_id];
        }

        const result = await sql.query(query, values);

        if (result.rowCount === 0) {
            return sendResponse(res, 404, "fail", "No records updated. Schedule may be already completed or not found");
        }

        return sendResponse(res, 200, "success", `Successfully ${action.toLowerCase()}d ${result.rowCount} record(s)`, {
            updatedCount: result.rowCount,
            updatedRecords: result.rows
        });

    } catch (error) {
        return handleError(res, error, "updateStatus");
    }
};
 
/**
 * 11. Update Schedule (WITH EDIT VALIDATION LOGIC)
 * PUT /api/v1/brand/bulk/update
 */
// exports.updateBulkSchedule = async (req, res) => {


//     const validation = await validateUpdateSchedule(req.body);
//     if (!validation.status) {
//         return sendResponse(res, 400, "fail", validation.error);
//     }

//     const {
//         parent_id, brand_id, platform_id, app_id,
//         start_date, end_date, schedule_time, emails,
//         recurring_type, days
//     } = req.body;

//     const user_id = req.user?.user_id;

//     try {
//         // STEP 1: Get current schedule to determine edit case
//         const currentQuery = `
//     SELECT DISTINCT ON (parent_id)
//         parent_id,
//         start_date,
//         end_date,
//         schedule_time,
//         status,
//         recurring_type,
//         created_time_stamp
//     FROM public.v3_t_brands_bulk_file_scheduling_detail
//     WHERE parent_id = $1
//     AND app_id = $2
//     AND brand_id = $3
//     AND platform_id = $4
//     ORDER BY parent_id, created_time_stamp DESC
// `;

//         const currentResult = await sql.query(currentQuery, [
//             parent_id,
//             app_id,
//             brand_id,
//             platform_id
//         ]);

//         if (currentResult.rowCount === 0) {
//             return sendResponse(res, 404, "fail", "Schedule not found");
//         }

//         const current = currentResult.rows[0];
//         const now = new Date();
//         const currentStartDate = new Date(current.start_date);
//         const currentEndDate = new Date(current.end_date);
//         const newStartDate = start_date ? new Date(start_date) : currentStartDate;
//         const newEndDate = end_date ? new Date(end_date) : currentEndDate;

//         // STEP 1.1: Validate time change (new time must be at least 1 hour from now)
//         if (schedule_time) {
//             const now = new Date();
//             const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

//             // Calculate the datetime for today's schedule time
//             const todayScheduleDateTime = new Date();
//             const [hh, mm, ss] = schedule_time.split(':');
//             todayScheduleDateTime.setHours(hh, mm, ss ?? 0, 0);

//             // Case 1: If new time is today and within 1 hour → reject
//             if (todayScheduleDateTime < oneHourLater && currentStartDate <= now && currentEndDate >= now) {
//                 return sendResponse(
//                     res,
//                     400,
//                     "fail",
//                     "New schedule time must be at least 1 hour from now"
//                 );
//             }
//         }

//         // STEP 2: Determine edit case
//         let editCase = '';
//         let allowedFields = [];

//         if (currentEndDate < now) {
//             // Case A: PASSED - No edits allowed
//             editCase = 'PASSED';
//             return sendResponse(res, 400, "fail", "Cannot edit schedule - all dates have passed");

//         } else if (currentStartDate <= now && currentEndDate >= now) {
//             // Case B: RUNNING - Only emails and end_date allowed
//             editCase = 'RUNNING';
//             allowedFields = ['emails', 'end_date'];

//             // Validate restrictions
//             if (schedule_time && schedule_time !== current.schedule_time) {
//                 return sendResponse(res, 400, "fail", "Cannot change schedule time for running schedules");
//             }

//             if (start_date && start_date !== current.start_date) {
//                 return sendResponse(res, 400, "fail", "Cannot change start date for running schedules");
//             }

//         } else if (currentStartDate > now) {
//             // Case C: UPCOMING - All fields allowed
//             editCase = 'UPCOMING';
//             allowedFields = ['start_date', 'end_date', 'schedule_time', 'emails', 'recurring_type', 'days'];
//         }

//         // STEP 3: Validate date logic
//         if (newStartDate >= newEndDate) {
//             return sendResponse(res, 400, "fail", "End date must be after start date");
//         }

//         if (editCase === 'UPCOMING' && newStartDate < now) {
//             return sendResponse(res, 400, "fail", "Start date cannot be in the past");
//         }

//         // STEP 4: Call stored procedure
//         const query = `
//             CALL public.sp_v3B_create_bulk_schedule(
//                 $1::uuid,   -- parent_id
//                 $2::uuid,   -- brand_id
//                 $3::uuid,   -- platform_id
//                 $4::uuid,   -- app_id
//                 $5::uuid,   -- user_id
//                 $6::date,   -- start_date
//                 $7::date,   -- end_date
//                 $8::time,   -- schedule_time
//                 $9::int[],  -- days
//                 $10,        -- emails
//                 $11,        -- recurring_type
//                 NULL        -- OUT r_data
//             )
//         `;

//         const values = [
//             parent_id,
//             brand_id,
//             platform_id,
//             app_id,
//             user_id,
//             start_date || current.start_date,
//             end_date || current.end_date,
//             schedule_time || current.schedule_time,
//             days || [],
//             emails,
//             recurring_type || current.recurring_type
//         ];

//         const result = await sql.query(query, values);
//         const responseData = result.rows[0]?.r_data;

//         return sendResponse(res, 200, "success", "Schedule updated successfully", {
//             editCase,
//             ...responseData
//         });

//     } catch (error) {
//         return handleError(res, error, "updateBulkSchedule");
//     }
// };

exports.updateBulkSchedule = async (req, res) => {
    const validation = await validateUpdateSchedule(req.body);
    if (!validation.status) {
        return sendResponse(res, 400, "fail", validation.error);
    }

    const {
        parent_id, brand_id, platform_id, app_id,
        start_date, end_date, schedule_time, emails,
        recurring_type, days
    } = req.body;

    const user_id = req.user?.user_id;

    try {
        // ---------------------------------------------------------
        // STEP 1: Get current schedule (latest row for this parent)
        // ---------------------------------------------------------
        const currentQuery = `
            SELECT DISTINCT ON (parent_id)
                parent_id,
                start_date,
                end_date,
                schedule_time,
                status,
                recurring_type,
                days,
                created_time_stamp
            FROM public.v3_t_brands_bulk_file_scheduling_detail
            WHERE parent_id = $1
              AND app_id = $2
              AND brand_id = $3
              AND platform_id = $4
            ORDER BY parent_id, created_time_stamp DESC
        `;

        const currentResult = await sql.query(currentQuery, [
            parent_id, app_id, brand_id, platform_id
        ]);

        if (currentResult.rowCount === 0) {
            return sendResponse(res, 404, "fail", "Schedule not found");
        }

        const current = currentResult.rows[0];
        const now = new Date();

        const currentStartDate = new Date(current.start_date);
        const currentEndDate   = new Date(current.end_date);

        const newStartDate = start_date ? new Date(start_date) : currentStartDate;
        const newEndDate   = end_date   ? new Date(end_date)   : currentEndDate;

        // ---------------------------------------------------------
        // STEP 1.1:  Validate time change (1 hour rule)
        // ---------------------------------------------------------
        if (schedule_time) {
            const now = new Date();
            const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

            const todayScheduleDateTime = new Date();
            const [hh, mm, ss] = schedule_time.split(':');
            todayScheduleDateTime.setHours(hh, mm, ss ?? 0, 0);

            // Applies only if schedule includes TODAY
            if (
                todayScheduleDateTime < oneHourLater &&
                currentStartDate <= now &&
                currentEndDate >= now
            ) {
                return sendResponse(
                    res,
                    400,
                    "fail",
                    "New schedule time must be at least 1 hour from now"
                );
            }
        }

        // ---------------------------------------------------------
        // STEP 2: Determine edit case
        // ---------------------------------------------------------
        let editCase = '';

        if (currentEndDate < now) {
            editCase = 'PASSED';
            return sendResponse(res, 400, "fail", "Cannot edit schedule - all dates have passed");

        } else if (currentStartDate <= now && currentEndDate >= now) {
            editCase = 'RUNNING';

            // Time cannot change
            if (schedule_time && schedule_time !== current.schedule_time) {
                return sendResponse(res, 400, "fail", "Cannot change schedule time for running schedules");
            }

            // Start date cannot change
            if (start_date && start_date !== current.start_date) {
                return sendResponse(res, 400, "fail", "Cannot change start date for running schedules");
            }

        } else if (currentStartDate > now) {
            editCase = 'UPCOMING';
        }

        // ---------------------------------------------------------
        // STEP 3: Validate date logic
        // ---------------------------------------------------------
        if (newStartDate >= newEndDate) {
            return sendResponse(res, 400, "fail", "End date must be after start date");
        }

        if (editCase === 'UPCOMING' && newStartDate < now) {
            return sendResponse(res, 400, "fail", "Start date cannot be in the past");
        }

        // ---------------------------------------------------------
        // STEP 4: Call UPDATED FUNCTION (NOT old SP)
        // ---------------------------------------------------------
        const query = `
            SELECT public.sp_v3b_update_bulk_schedule(
                $1::uuid,   -- parent_id
                $2::uuid,   -- app_id
                $3::uuid,   -- brand_id
                $4::uuid,   -- platform_id
                $5::date,   -- start_date
                $6::date,   -- end_date
                $7::time,   -- schedule_time
                $8,         -- recurring_type
                $9::int[],  -- days
                $10,        -- emails
                $11::uuid   -- user_id
            ) AS result_data
        `;

        const values = [
            parent_id,
            app_id,
            brand_id,
            platform_id,
            newStartDate,
            newEndDate,
            schedule_time || current.schedule_time,
            recurring_type || current.recurring_type,
            days || current.days,
            emails || current.emails,
            user_id
        ];

        const result = await sql.query(query, values);
        const responseData = result.rows[0]?.result_data;

        if (!responseData) {
            return sendResponse(res, 500, "fail", "Update failed: no response from DB");
        }

        if (responseData.status === "error") {
            return sendResponse(res, 400, "fail", responseData.message);
        }

        return sendResponse(res, 200, "success", "Schedule updated successfully", {
            editCase,
            ...responseData
        });

    } catch (error) {
        return handleError(res, error, "updateBulkSchedule");
    }
};
