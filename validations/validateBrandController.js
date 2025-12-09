const Joi = require("joi");


exports.validateDownloadCustomReport = async (body) => {
    const schema = Joi.object({
        // Change version: ["uuidv4"] to version: "uuidv4"
        transaction_id: Joi.string().required().guid({ version: "uuidv4" }) 
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        console.error('Validation error in downloadCustomReport:', error.message);
        return { status: false, error: error.message }
    }
}
exports.validateGetEmbedToken = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        app_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        authUserId: Joi.string().required().guid({ version: "uuidv4" }),
    });


    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateGetKeywordRecommendations = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        page: Joi.number().required(),
        limit: Joi.number().required(),
        sort_type: Joi.string().valid('ASC', 'DESC', '').required()
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validatePostKeywordRecommendations = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        id: Joi.string().required().guid({ version: "uuidv4" }),
        bcgType: Joi.string().valid('BRAND', 'GENERIC', 'COMPETITION').required()
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateGetCstBcgMapping = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        page: Joi.number().required(),
        limit: Joi.number().required()
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validatePostCstBcgMapping = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        id: Joi.string().required().guid({ version: "uuidv4" }),
        bcgType: Joi.string().valid('BRAND', 'GENERIC', 'COMPETITION').required()
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateGetCustomReports = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        page: Joi.number().required(),
        limit: Joi.number().required(),
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateGetCustomReportJobs = async (body) => {
    const schema = Joi.object({
        report_id: Joi.string().required().guid({ version: "uuidv4" }),
        page: Joi.number().required(),
        limit: Joi.number().required()
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}