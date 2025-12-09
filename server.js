const app = require("./app");
const sqldb = require("./database/sqldb"); // Ensure this path matches your structure
require("dotenv").config();

const PORT = process.env.PORT || 9000;

// Connect to Database
sqldb.connect((err) => {
    if (err) {
        console.error('❌ Database Connection Failed:', err);
        process.exit(1); // Exit if DB fails
    }
    
    console.log(`✅ SQL db connected successfully.`);
    
    // Start Server only after DB connects
    app.listen(PORT, () => {
        console.log(`🚀 App is running on PORT: ${PORT}`);
    });
});