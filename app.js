const express = require('express');
const cors = require('cors');
const app = express();
const morgan = require('morgan');

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Logging

// Mock Authentication Middleware (For Testing)
// In production, replace this with your actual authController.protectRoute
app.use((req, res, next) => {
    // Simulating a logged-in user
    req.user = { 
        user_id: '00000000-0000-0000-0000-000000000001',
        // user_id: '00000000-0000-0000-0000-000000000002',
        email: 'test@admin.com'
    }; 
    next();
});

// Import Routes
const bulkRouter = require('./routers/bulkRouteV3');

// Mount Routes
app.use('/api/v1/brand/bulk', bulkRouter);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("🔥 Error:", err);
    res.status(err.statusCode || 500).json({
        status: 'error',
        message: err.message
    });
});

module.exports = app;