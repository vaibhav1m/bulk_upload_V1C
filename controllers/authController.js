const { verifyJwt } = require("../utils/auth/jwt");
const AppError = require("../utils/errorHandling/AppError");
const sql = require("../database/sqldb");
const { validateLoginBody } = require("../validations/validateUserController");
const { logUserRequest } = require("../auth/userLogs");
const { checkPassword, hashPassword } = require("../auth/password");
const bcrypt = require("bcrypt");
const { getJwt } = require("../auth/jwt");
const { sendEmail } = require("../utils/sendMail/sendMailController");
const { validateProtectBrand, validateProtectCountry, validateProtectPlatform, validateProtectDashboard, validateSendOTP, validateUpdatePassword } = require("../validations/validateAuthController");
const axios = require("axios");

exports.protectRoute = async (req, res, next) => {
 
    const { authorization } = req.headers;
    if (!authorization) {
      return next(new AppError(401, "Please provide authorization field and it's value in headers."));
    }
    const token = authorization.split(" ")[1];
    if (!token) {
      return next(new AppError(401, "You have been logged out, please login again."));
    }
  
    try {
      const value = await verifyJwt(token, process.env.JWT_PRIVATE_KEY);
      if (!value.status) {
        return next(new AppError(401, value.message));
      }
      const { id, iat, exp } = value.decoded;
  
      const dbQuery = "SELECT * FROM public.v3_t_master_users where user_id = $1";
      let dbQueryValues = [id];
      const result = await sql.query(dbQuery, dbQueryValues);
      if (result['rows'].length == 0) {
        return next(new AppError(404, `Unable to find user with given token`));
      }
      const user = result['rows'][0];
      if(user.status != "ACTIVE"){
        return next(new AppError(401, "Your status is not active. Please contact support for assistance."));
      }
      const token_generated_timestamp = iat * 1000 + 10000;
      const last_login_timestamp = new Date(user.last_login_timestamp).getTime();
  
      if (token_generated_timestamp < last_login_timestamp) {
        return next(new AppError(401, "Token expired, please login again."));
      }
  
      req.user = user;
      next();
  
    } catch (error) {
      return next(new AppError(500, "Internal Server Error."))
    }
  
};

exports.login = async (req, res, next) => {

  try {
    const validateStatus = await validateLoginBody(req.body);
    if (!validateStatus.status) {
      return next(new AppError(400, validateStatus.error));
    }
    let { value: { email, password } } = validateStatus;
    email = email.trim(), password = password.trim();
    let dbQuery = "SELECT status, user_id,user_type ,password,full_name FROM v3_t_master_users WHERE email = $1";
    let dbQueryValues = [email];

    const result = await sql.query(dbQuery, dbQueryValues);
    if (result['rows'].length == 0) {
      return next(new AppError(404, `Unable to find user with given email: ${email}`));
    }
    const user = result['rows'][0];
    //logUserRequest
    const current_time_stamp = new Date();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    logUserRequest(user.user_id,clientIp,req.get('User-Agent'),"login",current_time_stamp);
      //
    const { status, message } = await checkPassword({
      hashedPassword: user.password,
      password,
    });

    if (!status) {
      return next(new AppError(401, message));
    }

    const last_login_time_stamp = new Date();
    const tokenObj = getJwt(user.user_id, process.env.JWT_EXPIRES_IN);
    if (!tokenObj.status) {
      return next(new AppError(500, tokenObj.message));
    }
    const { token } = tokenObj;
    dbQuery = "UPDATE v3_t_master_users SET last_login_time_stamp = $1 WHERE user_id = $2";
    dbQueryValues = [last_login_time_stamp, user.user_id];
    await sql.query(dbQuery, dbQueryValues);
    res.status(200).json({
      status: "success",
      data: {
        message: "You are logged in successfully.",
        token,
        user: {
          full_name: user.full_name,
          user_type: user.user_type
        }
      }
    });
  } catch (error) {
    return next(new AppError(500, "Internal Server Error."));
  }
}

exports.protectBrand = async (req, res, next) => {

  const validateStatus = await validateProtectBrand(req.query);
  if (!validateStatus.status) {
    return next(new AppError(400, validateStatus.error));
  }
  const { user_id: authUserId, user_type: authUserType } = req.user;
  if (authUserType?.toUpperCase() != "ADMIN") {
    const { brand_id } = validateStatus?.value;
    let dbQuery = `
      select b.brand_id from public.v3_t_user_brand_mapping tubm
      RIGHT JOIN public.neo_brand_master b 
      ON tubm.brand_id = b.brand_id
      WHERE tubm.user_id = $1
      AND tubm.brand_id = $2 AND tubm.status = $3 AND b.status = $3
   `;
    let dbQueryValues = [authUserId, brand_id, 'ACTIVE'];
    const result = await sql.query(dbQuery, dbQueryValues);

    if (result["rows"].length === 0) {
      return next(new AppError(400, "You do not have premission to access this brand."));
    }
  }
  next();
}

exports.protectCountry = async (req, res, next) => {

  const validateStatus = await validateProtectCountry(req.query);
  if (!validateStatus.status) {
    return next(new AppError(400, validateStatus.error));
  }
  const { user_id: authUserId, user_type: authUserType } = req.user;
  if (authUserType?.toUpperCase() != "ADMIN") {
    const { brand_id, country_id } = validateStatus?.value;
    let dbQuery = `
      select c.country_id from public.v3_t_user_brand_country_mapping tubcm
      RIGHT JOIN public.v3_t_master_countries c
      ON tubcm.country_id = c.country_id
      WHERE tubcm.user_id = $1 
      AND tubcm.brand_id = $2 
      AND tubcm.country_id = $3 
      AND tubcm.status = $4 AND c.status = $4
   `;
    let dbQueryValues = [authUserId, brand_id, country_id, 'ACTIVE'];
    const result = await sql.query(dbQuery, dbQueryValues);

    if (result["rows"].length === 0) {
      return next(new AppError(400, "You do not have premission to access this Country."));
    }
  }
  next();
}

exports.protectDashboard = async (req, res, next) => {

  const validateStatus = await validateProtectDashboard(req.query);
  if (!validateStatus.status) {
    return next(new AppError(400, validateStatus.error));
  }
  const { user_id: authUserId, user_type: authUserType } = req.user;
  if (authUserType?.toUpperCase() != "ADMIN") {
    const { brand_id, country_id, app_id } = validateStatus?.value;
    let dbQuery = `
      select d.master_power_bi_dashboard_type_id from public.v3_t_user_brand_country_dashboard_mapping tubcdm
      RIGHT JOIN public.v3_t_master_power_bi_dashboard_type d
      ON tubcdm.dashboard_type_id = d.master_power_bi_dashboard_type_id
      WHERE tubcdm.user_id = $1
      AND tubcdm.brand_id = $2 
      AND tubcdm.country_id = $3 
      AND tubcdm.dashboard_type_id = $4
      AND tubcdm.status = $5 AND d.status = $5
   `;
    let dbQueryValues = [authUserId, brand_id, country_id, app_id, 'ACTIVE'];
    const result = await sql.query(dbQuery, dbQueryValues);

    if (result["rows"].length === 0) {
      return next(new AppError(400, "You do not have premission to access this Dashboard."));
    }
  }
  next();
}

exports.protectPlatform = async (req, res, next) => {

  const validateStatus = await validateProtectPlatform(req.query);
  if (!validateStatus.status) {
    return next(new AppError(400, validateStatus.error));
  }
  const { user_id: authUserId, user_type: authUserType } = req.user;
  if (authUserType?.toUpperCase() != "ADMIN") {
    const { brand_id, country_id, app_id, platform_id } = validateStatus?.value;
    let dbQuery = `
      select p.platform_id from public.v3_t_user_brand_country_dashboard_platform_mapping tubcdpm
      RIGHT JOIN public.v3_t_master_platforms p
      ON tubcdpm.platform_id = p.platform_id
      WHERE tubcdpm.user_id = $1 
      AND tubcdpm.brand_id = $2
      AND tubcdpm.country_id = $3 
      AND tubcdpm.dashboard_type_id = $4
      AND tubcdpm.platform_id = $5
      AND tubcdpm.status = $6 AND p.status = $6
   `;
    let dbQueryValues = [authUserId, brand_id, country_id, app_id, platform_id, 'ACTIVE'];
    const result = await sql.query(dbQuery, dbQueryValues);

    if (result["rows"].length === 0) {
      return next(new AppError(400, "You do not have premission to access this Platform."));
    }
  }
  next();
}

exports.accessToOnly = (...userTypeArray) => {
  return (req, res, next) => {
    const { user_type } = req.user;
    if (!userTypeArray.includes(user_type)) {
      return next(new AppError(401, "You are not authorized to perform this action."))
    }
    next();
  }
}

exports.sendOTP = async (req, res, next) => {
  
  const validateStatus = await validateSendOTP(req.body);
  if (!validateStatus.status) {
    return next(new AppError(400, validateStatus.error));
  }
  const { email } = validateStatus?.value;

  try {
    const dbQuery = `SELECT * FROM public.v3_t_master_users WHERE email = $1`;
    const dbQueryValues = [email];
    
    const result = await sql.query(dbQuery, dbQueryValues);
    
    if (result['rows'].length == 0) {
      return  res.status(404).json({
          status: "fail",
          data: {
            message: `No user found with email: ${email}`,
          }
        });
    }
    
    const user = result['rows'][0];
    
    if (user.status !== 'ACTIVE') {
      return  res.status(403).json({
          status: "fail",
          data: {
            message: `User account is not active.`,
          }
        });
    }
    
    const chars = "0123456789";
    let password = "";
    for (let i = 0; i < 4; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      password += chars[randomIndex];
    } 

    const hashResult = await hashPassword(password);
    if (!hashResult || !hashResult.status) {
      return next(new AppError(500, "Unable to hash password."));
    }
    const newHashedPassword = hashResult.hashedPassword;

    const body = `
      <p>Dear User,</p>
      <p>Your One-Time Password (OTP) is: <strong>${password}</strong></p>
      <p>This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.</p>
      <p>If you did not request this, please ignore this email.</p>
    `;
  
    const isEmailSend = await sendEmail(email, body, "OTP");

    if(isEmailSend.status !== 200){
      return next(new AppError(500, "Failed to send OTP email. Please try again."));
    }
    
    const otpExpiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    const currentTimestamp = new Date();
    const updateQuery = `UPDATE public.v3_t_master_users SET otp = $1, otp_expired_time_stamp = $2, updated_by = $3, updated_time_stamp = $4 WHERE user_id = $5`;
    const updateValues = [newHashedPassword, otpExpiryTime, user.user_id, currentTimestamp, user.user_id];
    
    const updateResult = await sql.query(updateQuery, updateValues);
    
    if (updateResult.rowCount === 0) {
      return next(new AppError(500, "Failed to update OTP in database. No rows were affected."));
    }

    res.status(200).json({
      status: "success",
      data: {
        message: "OTP sent successfully to your email.",
      }
    });
    
  } catch (error) {
    return next(new AppError(500, "Internal Server Error."));
  }
}

exports.updatePassword = async (req, res, next) => {

  const validateStatus = await validateUpdatePassword(req.body);
  if (!validateStatus.status) {
    return next(new AppError(400, validateStatus.error));
  }
  const { email, otp, newPassword, confirmPassword } = validateStatus?.value;

  // Check if new password and confirm password match
  if (newPassword !== confirmPassword) {
    return next(new AppError(400, "New password and confirm password do not match."));
  }

  try {
    const dbQuery = `SELECT * FROM public.v3_t_master_users WHERE email = $1`;
    const dbQueryValues = [email];
    const result = await sql.query(dbQuery, dbQueryValues);
    
    if (result['rows'].length == 0) {
      return next(new AppError(404, `Unable to find user with given email: ${email}`));
    }
    
    const user = result['rows'][0];
    
    // Check if user is active
    if (user.status !== 'ACTIVE') {
      return next(new AppError(403, "User account is not active."));
    }
    
    // Check if OTP exists and is not expired
    if (!user.otp || !user.otp_expired_time_stamp) {
      return next(new AppError(400, "No valid OTP found. Please request a new OTP."));
    }
    
    // Check if OTP is expired
    const currentTime = new Date();
    const otpExpiryTime = new Date(user.otp_expired_time_stamp);
    if (currentTime > otpExpiryTime) {
      return next(new AppError(400, "OTP has expired. Please request a new OTP."));
    }
    
    // Validate OTP
    const isOtpValid = await bcrypt.compare(otp, user.otp);
    if (!isOtpValid) {
      return next(new AppError(400, "Invalid OTP. Please enter the correct OTP."));
    }
    
    // Hash the new password
    const hashResult = await hashPassword(newPassword);
    if (!hashResult || !hashResult.status) {
      return next(new AppError(500, "Unable to hash password."));
    }
    const hashedNewPassword = hashResult.hashedPassword;
    
    // Update password and clear OTP
    const updateQuery = `UPDATE public.v3_t_master_users 
                        SET password = $1, otp = NULL, otp_expired_time_stamp = NULL, 
                            updated_by = $2, updated_time_stamp = $3 
                        WHERE user_id = $4`;
    const updateValues = [hashedNewPassword, user.user_id, new Date(), user.user_id];
    
    const updateResult = await sql.query(updateQuery, updateValues);
    
    if (updateResult.rowCount === 0) {
      return next(new AppError(500, "Failed to update password."));
    }

    res.status(200).json({
      status: "success",
      data: {
        message: "Password updated successfully.",
      }
    });

  } catch (error) {
    return next(new AppError(500, "Internal Server Error."));
  }
}

exports.validatePlatformFromCentralAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }
    const { app_id, brand_id, platform_id } = req.query;

    const authResponse = await axios.get(
      `${process.env.AUTH_URL}/api/v1/auth/validatePlatform`,
      {
        params: { app_id: app_id, brand_id, platform_id },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const { data } = authResponse;

    if (data?.status === "fail") {
      return res.status(400).json({
        status: "error",
        message: data?.message
      });
    }

    req.user = data?.data;
    next()
  } catch (error) {
    return res.status(error.status).json(
      {
        status: "error",
        message: error.response.data.message
      }
    );
  }
}