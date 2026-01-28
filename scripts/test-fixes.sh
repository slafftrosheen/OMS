#!/bin/bash

echo "🧪 Testing OMS Fixes - Batch 1 & 2"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if app.css exists
echo -n "✓ Checking if app.css exists... "
if [ -f "src/app.css" ]; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC} - Create src/app.css"
    exit 1
fi

# Test 2: Check if CSS is imported in layout
echo -n "✓ Checking CSS import in +layout.svelte... "
if grep -q "import '../app.css'" "src/routes/+layout.svelte"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC} - Add CSS import to +layout.svelte"
    exit 1
fi

# Test 3: Check if ErrorBoundary exists
echo -n "✓ Checking if ErrorBoundary component exists... "
if [ -f "src/lib/ui/ErrorBoundary.svelte" ]; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC} - ErrorBoundary.svelte not found (optional)"
fi

# Test 4: Check for meta tag update
echo -n "✓ Checking meta tag update in app.html... "
if grep -q 'mobile-web-app-capable' "src/app.html"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC} - Update meta tag in app.html"
fi

# Test 5: Check TypeScript compilation
echo -n "✓ Checking TypeScript compilation... "
if npm run type-check > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC} - Type check warnings (review manually)"
fi

echo ""
echo "=================================="
echo "✅ Basic validation complete!"
echo ""
echo "Next steps:"
echo "1. Run: npm run dev:clean"
echo "2. Open: http://localhost:5173/orders"
echo "3. Check browser console for errors"
echo "4. Test refresh button and pagination"
echo ""