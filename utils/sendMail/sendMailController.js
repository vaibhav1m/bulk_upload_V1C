const { default: axios } = require("axios");
const { FLASK_GMAIL_API } = require("../../constants/flaskGmailAPI");


exports.sendEmail = async (gmail, ag_body, ag_subject) => {
    try {
        const res = await axios.post(`${FLASK_GMAIL_API}api/email/send`,
            {
                sender: "partner",
                recipient: String(gmail).toLocaleLowerCase(),
                recipient_cc: "",
                recipient_bcc: "",
                subject: ag_subject,
                body: ag_body
            },
            {
                headers: {
                    "client-id": process.env.FLASK_GMAIL_API_CLIENT_ID,
                    "client-secret": process.env.FLASK_GMAIL_API_CLIENT_SECRET
                }
            }
        );
        const {status, data} = res;
        return {status, data}
    } catch (error) {
        console.log(error);
    }
}