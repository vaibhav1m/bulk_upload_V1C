const Joi = require("joi");

exports.validateGetUploadUrl = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        file_name: Joi.string().required().max(500)
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message };
    }
};

exports.validateConfirmUpload = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        type: Joi.string().required().valid(
            'MASTER_PRODUCT',
            'MASTER_TARGETING', 
            'MASTER_CAMPAIGN',
            'UNMAPPED_PRODUCT',
            'UNMAPPED_TARGETING',
            'UNMAPPED_CAMPAIGN',
            'UPDATE_PRODUCT',
            'UPDATE_TARGETING',
            'UPDATE_CAMPAIGN',
            'COMPLETE_MASTER'
        ),
        file_key: Joi.string().required().max(1000),
        original_file_name: Joi.string().required().max(500)
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message };
    }
};

exports.validateGetUnmappedData = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
        type: Joi.string().required().valid('PRODUCT', 'TARGETING', 'CAMPAIGN'),
        page: Joi.number().integer().min(1).required(),
        limit: Joi.number().integer().min(1).max(100).required(),
        search: Joi.string().allow('', null).optional()
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message };
    }
};