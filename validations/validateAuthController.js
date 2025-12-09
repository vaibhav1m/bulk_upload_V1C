const Joi = require("joi");

exports.validateProtectBrand = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateProtectCountry = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        country_id: Joi.string().required().guid({ version: "uuidv4" }),
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateProtectDashboard = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        country_id: Joi.string().required().guid({ version: "uuidv4" }),
        app_id: Joi.string().required().guid({ version: "uuidv4" }),
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateProtectPlatform = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        country_id: Joi.string().required().guid({ version: "uuidv4" }),
        app_id: Joi.string().required().guid({ version: "uuidv4" }),
        platform_id: Joi.string().required().guid({ version: "uuidv4" }),
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateSendOTP = async (body) => {
    const schema = Joi.object({
        email: Joi.string().required().email({ tlds: { allow: false } }),
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateUpdatePassword = async (body) => {
    const schema = Joi.object({
        email: Joi.string().required().email({ tlds: { allow: false } }),
        otp: Joi.string().required().min(4).max(4),
        newPassword: Joi.string().required().min(8).max(50),
        confirmPassword: Joi.string().required().min(8).max(50),
    }).unknown(true);

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}