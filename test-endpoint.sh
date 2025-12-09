#!/bin/bash

# Test the getSchedules endpoint
echo "🧪 Testing getSchedules endpoint..."
echo ""

curl -v -X GET "http://localhost:8000/v1/bulk-schedules?app_id=d17799a6-88e9-4b05-91a8-246014326507&brand_id=951e0362-4382-4933-9070-59706c1e797b&platform_id=2b2c5687-6887-4f4c-9509-4abd7341b81e"

echo ""
echo ""
echo "✅ Test complete"
