const jwt = require("jsonwebtoken");

exports.getJwt =  (id,expiresIn) => {
    try {
        var token =  jwt.sign({ id }, process.env.JWT_PRIVATE_KEY, { algorithm: process.env.JWT_ALGORITHM },{ expiresIn});
        return { status: true, token };
    } catch (error) {
        console.log('--> jwt error', error)
        return { status: false, message: process.env.UNABLE_TO_CREATE_JWT_TOKEN }
    }
};

exports.verifyJwt = async (token,privateKey) => {
    try {
        const decoded = jwt.verify(token, privateKey,{ algorithm: process.env.JWT_ALGORITHM });
        
        return {
            status: true,
            decoded,
        };
    } catch (error) {
        let message;
        switch (error.message) {
            case "invalid signature":
                message = "Invalid token.";
                break;
            case "jwt expired":
                message = "Token expired.";
                break;
            default:
                message = error.message;
        }
        return {
            status: false,
            message,
        };
    }
};
