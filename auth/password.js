const bcrypt = require("bcrypt");
const { pr } = require("util");

exports.checkPassword = async (obj) => {
  const { hashedPassword, password } = obj;
  const validatePassword = await bcrypt.compare(password, hashedPassword);
  if (!validatePassword) {
    return {
      status: false,
      message: "Please enter valid password.",
    };
  }
  return {
    status: true,
  };
};


exports.hashPassword = async (plainTextPassword) => {
  try {
    const hashedPassword = await bcrypt.hash(plainTextPassword, 10);
    return { status: true, hashedPassword }
  } catch (error) {
    return { status: false, message: "Unable to hash password." }
  }
}