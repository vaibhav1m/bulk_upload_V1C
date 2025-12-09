const Joi = require("joi");

/**
 * Validate Create Bulk Schedule
 */
exports.validateCreateBulkSchedule = async (body) => {
    const schema = Joi.object({
        app_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        brand_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        platform_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        
        schedule_name: Joi.string().trim().min(3).max(100).required(),
        
        file_id: Joi.string().min(10).max(500).required(),
        file_name: Joi.string().min(3).max(255).required(),
        
        // FIX: emails is a string, not email type
        emails: Joi.string().min(5).required()
            .messages({
                'string.min': 'emails must contain at least one valid email address'
            }),
        
        profile_obj: Joi.object().required()
            .messages({
                'object.base': 'profile_obj must be a valid JSON object'
            }),
        
        type: Joi.string().valid('ONE_TIME', 'RECURRING').required(),
        
        recurring_type: Joi.string().valid('DAILY', 'WEEKLY', '').allow('', null),
        
        start_date: Joi.date().iso().required()
            .messages({
                'date.format': 'start_date must be in YYYY-MM-DD format'
            }),
        
        end_date: Joi.date().iso().greater(Joi.ref('start_date')).required()
            .messages({
                'date.greater': 'end_date must be after start_date'
            }),
        
        schedule_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).required()
            .messages({
                'string.pattern.base': 'schedule_time must be in HH:MM or HH:MM:SS format'
            }),
        
        // FIX: when() must come before required/min
        days: Joi.when('recurring_type', {
            is: 'WEEKLY',
            then: Joi.array()
                .items(Joi.number().integer().min(0).max(6))
                .unique()
                .min(1)
                .required()
                .messages({
                    'array.min': 'At least one day must be selected for WEEKLY schedules',
                    'number.base': 'days must be integers between 0 (Sunday) and 6 (Saturday)',
                    'array.unique': 'days must not contain duplicates'
                }),
            otherwise: Joi.array()
                .items(Joi.number().integer().min(0).max(6))
                .optional()
                .default([])
        })
    }).unknown(true);

    try {
        const value = await schema.validateAsync(body, { abortEarly: false });
        return { status: true, value };
    } catch (error) {
        const errorMessage = error.details
            .map(detail => detail.message)
            .join('; ');
        return { status: false, error: errorMessage };
    }
};

/**
 * Validate Check Conflict
 */
exports.validateCheckConflict = async (body) => {
    const schema = Joi.object({
        app_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        brand_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        platform_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        
        start_date: Joi.date().iso().required(),
        end_date: Joi.date().iso().greater(Joi.ref('start_date')).required(),
        
        time_slot: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).required()
            .messages({
                'string.pattern.base': 'time_slot must be in HH:MM or HH:MM:SS format'
            }),
        
        recurring_type: Joi.string().valid('DAILY', 'WEEKLY').required(),
        
        days: Joi.when('recurring_type', {
            is: 'WEEKLY',
            then: Joi.array()
                .items(Joi.number().integer().min(0).max(6))
                .unique()
                .min(1)
                .required(),
            otherwise: Joi.array()
                .items(Joi.number().integer().min(0).max(6))
                .optional()
                .default([])
        }),
        
        exclude_parent_id: Joi.string().guid({ version: 'uuidv4' }).optional()
    }).unknown(true);

    try {
        const value = await schema.validateAsync(body, { abortEarly: false });
        return { status: true, value };
    } catch (error) {
        const errorMessage = error.details
            .map(detail => detail.message)
            .join('; ');
        return { status: false, error: errorMessage };
    }
};

/**
 * Validate Update Schedule
 */
exports.validateUpdateSchedule = async (body) => {
    const schema = Joi.object({
        parent_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        app_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        brand_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        platform_id: Joi.string().guid({ version: 'uuidv4' }).required(),
        
        start_date: Joi.date().iso().optional(),
        end_date: Joi.date().iso().optional(),
        
        schedule_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).optional(),
        
        emails: Joi.string().min(5).optional(),
        
        recurring_type: Joi.string().valid('DAILY', 'WEEKLY').optional(),
        
        days: Joi.array()
            .items(Joi.number().integer().min(0).max(6))
            .unique()
            .optional()
    }).unknown(true);

    try {
        const value = await schema.validateAsync(body, { abortEarly: false });
        
        // Additional validation: if end_date is provided, it must be after start_date
        if (value.start_date && value.end_date) {
            if (new Date(value.end_date) <= new Date(value.start_date)) {
                return { status: false, error: 'end_date must be after start_date' };
            }
        }
        
        return { status: true, value };
    } catch (error) {
        const errorMessage = error.details
            .map(detail => detail.message)
            .join('; ');
        return { status: false, error: errorMessage };
    }
};