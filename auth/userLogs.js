const sql = require("./../database/sqldb");
const fs = require("fs");
const logger = fs.createWriteStream('./access.log', { flags: 'a' });

exports.logUserRequest = async (user_id, client_ip, user_agent, controller_name, request_timestamp) => {
    const insertQuery = `
      INSERT INTO public.v3_t_users_logs (
        user_id, client_ip, user_agent, controller_name, request_timestamp
      ) VALUES ($1, $2, $3, $4, $5)
    `;
  
    const queryValues = [user_id, client_ip, user_agent, controller_name, request_timestamp];
   
    try {
      await sql.query(insertQuery, queryValues);
      logger.write(`User request logged successfully. ${user_id}`,);

    } catch (error) {
      logger.write(`Error logging user request: ${user_id} ${ JSON.stringify(error)}`);
    }
  };