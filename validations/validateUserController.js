const Joi = require("joi");

exports.validategetAuthUserCountries = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" })
    });

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validategetAuthUserPlatforms = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        country_id: Joi.string().required().guid({ version: "uuidv4" }),
        dashboard_type_id: Joi.string().required().guid({ version: "uuidv4" }),
        module_id: Joi.string().guid({ version: "uuidv4" })
    });

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validategetUserModules = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        country_id: Joi.string().required().guid({ version: "uuidv4" }),
        dashboard_type_id: Joi.string().required().guid({ version: "uuidv4" })
    });

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateGetPlatformsByModule = async (body) => {
    const schema = Joi.object({
        brand_id: Joi.string().required().guid({ version: "uuidv4" }),
        country_id: Joi.string().required().guid({ version: "uuidv4" }),
        dashboard_type_id: Joi.string().required().guid({ version: "uuidv4" }),
        module_id: Joi.string().required().guid({ version: "uuidv4" })
    });

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateLoginBody = async (body) => {
    const schema = Joi.object({
        email: Joi.string().required().email({ tlds: { allow: false } }),
        password: Joi.string().required().min(8).max(50),
    });

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}

exports.validateAddUser = async (body) => {
    const schema = Joi.object({
        first_name: Joi.string().required().min(3).max(50),
        last_name: Joi.string().required().min(3).max(50),
        contact_number: Joi.string().required().min(10).max(10),
        email: Joi.string().required().email({ tlds: { allow: false } }),
        user_type: Joi.string().required(),
        organisation: Joi.string().required().min(3).max(50)
    });

    try {
        const validate = await schema.validateAsync(body);
        return { status: true, value: validate };
    } catch (error) {
        return { status: false, error: error.message }
    }
}
