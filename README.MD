# Simple BOL.com PostNL Picking & Shipping App

A simple, secure order picking and shipping application with **real BOL.com and PostNL API integration**.

## Features

- 🔐 **Secure Login** - Session-based authentication
- 📦 **Real BOL.com Integration** - Fetch actual FBR orders
- ✅ **Picking Management** - Mark items as picked with warehouse locations
- 🏷️ **PostNL Label Creation** - Generate real shipping labels with PDFs
- 🚚 **BOL.com Shipments** - Register shipments back to BOL.com with tracking
- 📊 **Simple Dashboard** - Clear status overview and progress tracking

## API Integration

This application includes **complete API integration** with:

### BOL.com Partner API
- Fetch open FBR (Fulfilled By Retailer) orders
- Generate picking lists from order data
- Create shipments with PostNL tracking codes
- Uses TNT transporter code for PostNL shipments

### PostNL API  
- Create shipping labels with PDF generation
- Generate valid PostNL tracking codes (3S format)
- Save label PDFs for download/printing
- Support for different package types (3085, 2928)

## Quick Start

### Prerequisites
- Node.js 18+
- BOL.com Partner API credentials
- PostNL API credentials

### Local Development

1. **Setup project:**
   ```bash
   git clone <your-repo>
   cd simple-picking-app
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API credentials
   ```

3. **Build and start:**
   ```bash
   npm run build
   npm start
   ```

4. **Access app:**
   - Open: http://localhost:3000
   - Login: admin / admin123

### Railway Deployment

1. **Push to GitHub**
2. **Connect to Railway**
3. **Set Environment Variables (see below)**
4. **Deploy automatically**

## Environment Variables

### Required for Authentication
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
```

### Required for BOL.com API
```env
CLIENT_ID=your_bol_client_id
CLIENT_SECRET=your_bol_client_secret
```

### Required for PostNL API
```env
API_KEY=your_postnl_api_key
API_URL=https://api-sandbox.postnl.nl
CUSTOMER_CODE=your_4_digit_code
CUSTOMER_NUMBER=your_8_digit_number
COLLECTION_LOCATION=your_location_code
```

### Required for Shipping Labels
```env
SENDER_NAME=Your Company Name
SENDER_EMAIL=shipping@yourcompany.com
COMPANY_NAME=Your Company
COMPANY_STREET=Your Street Name
COMPANY_HOUSENR=123
COMPANY_ZIP=1234AB
COMPANY_CITY=Amsterdam
COMPANY_COUNTRY=NL
DEFAULT_WEIGHT=1000
```

## Complete Workflow

### 1. Login
- Secure authentication with configurable credentials

### 2. Fetch Orders
- Connects to BOL.com API
- Fetches all open FBR orders
- Generates picking list with warehouse locations

### 3. Pick Items  
- View orders with customer details and addresses
- Mark individual items as picked
- Track picking progress per order
- Automatic status updates (open → picking → ready)

### 4. Ship Orders
- Creates PostNL shipping label via API
- Generates PDF label file
- Creates BOL.com shipment with tracking number
- Updates order status to shipped

### 5. Track Results
- PostNL tracking codes (3S format)
- Direct links to PostNL tracking
- Order history and activity logging

## API Endpoints

The application includes these backend endpoints:

- `POST /api/login` - User authentication
- `POST /api/fetch-orders` - Fetch from BOL.com API
- `GET /api/orders` - Get current orders/picking list
- `POST /api/orders/:id/items/:itemId/pick` - Mark item picked  
- `POST /api/orders/:id/ship` - Create label and shipment
- `GET /api/status` - System status and configuration check

## File Structure

```
simple-picking-app/
├── server.js                    # Express server with API endpoints
├── scripts/                     # API integration scripts
│   ├── bol-fetch-orders.js      # BOL.com order fetching
│   ├── bol-picking-list.js      # Picking list generation
│   ├── postnl-create-labels.js  # PostNL label creation
│   └── bol-create-shipments.js  # BOL.com shipment creation
├── src/App.js                   # React frontend
├── data/                        # Persistent data storage
└── uploads/labels/              # Generated PDF labels
```

## Security Features

- Session-based authentication with timeout
- Environment variable configuration (no hardcoded credentials)
- Input validation and error handling
- CORS protection
- Session cleanup

## Error Handling

The application includes comprehensive error handling for:

- BOL.com API connection issues
- PostNL API errors
- Invalid credentials
- Network timeouts  
- Data validation errors
- Missing configuration

## Production Notes  

### Before Deploying:
- ✅ Change default admin password
- ✅ Set all required environment variables
- ✅ Test with BOL.com sandbox/production
- ✅ Test with PostNL sandbox/production
- ✅ Verify webhook endpoints if needed
- ✅ Set up monitoring and logging

### Recommended:
- Use a proper database instead of JSON files
- Add SSL/HTTPS termination
- Set up backup procedures for label files
- Monitor API rate limits
- Add comprehensive logging

## API Credentials Setup

### BOL.com Partner API:
1. Register at https://partnerpanel.bol.com
2. Create API credentials
3. Note: Requires approved partner status for production

### PostNL API:
1. Register at https://developer.postnl.nl  
2. Get sandbox credentials for testing
3. Apply for production credentials

## Support

This is a **fully functional** but simplified version. Features included:

✅ Real BOL.com API integration  
✅ Real PostNL API integration  
✅ Complete picking workflow  
✅ Label generation with PDFs  
✅ Shipment tracking  
✅ Secure authentication  
✅ Railway deployment ready  

For advanced features like batch processing, inventory management, or detailed reporting, consider extending this foundation.

## License

MIT License - Free to use and modify for your business needs.