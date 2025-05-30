// server.js - Simple Express server with BOL.com and PostNL API integration
// Updated for immediate label creation on item pick
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

// Import API scripts with error handling
let fetchOrders, generatePickingList, createLabels, createShipments;

console.log('📦 Loading API scripts...');

try {
  const bolFetchModule = require('./scripts/bol-fetch-orders.js');
  fetchOrders = bolFetchModule.fetchOrders;
  console.log('✅ BOL fetch orders script loaded');
} catch (error) {
  console.warn('⚠️ BOL fetch orders script not available:', error.message);
  fetchOrders = async () => ({ success: false, message: 'BOL fetch script not available: ' + error.message });
}

try {
  const bolUpdateModule = require('./scripts/bol-picking-list.js');
  generatePickingList = bolUpdateModule.generatePickingList;
  console.log('✅ BOL picking list script loaded');
} catch (error) {
  console.warn('⚠️ BOL picking list script not available:', error.message);
  generatePickingList = async () => ({ success: false, message: 'Picking list script not available: ' + error.message });
}

try {
  const postnlModule = require('./scripts/postnl-create-labels.js');
  createLabels = postnlModule.createLabels;
  console.log('✅ PostNL create labels script loaded');
} catch (error) {
  console.warn('⚠️ PostNL create labels script not available:', error.message);
  createLabels = async () => ({ success: false, message: 'PostNL labels script not available: ' + error.message });
}

try {
  const bolShipmentsModule = require('./scripts/bol-create-shipments.js');
  createShipments = bolShipmentsModule.createShipments;
  console.log('✅ BOL create shipments script loaded');
} catch (error) {
  console.warn('⚠️ BOL create shipments script not available:', error.message);
  createShipments = async () => ({ success: false, message: 'Shipments script not available: ' + error.message });
}

console.log('');

const app = express();
const PORT = process.env.PORT || 3000;

// Authentication
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('build'));

// In-memory storage (replace with database in production)
let currentOrders = [];
let currentPickingList = [];
let sessions = new Map();
let activityLog = [];

// Ensure data directory exists
async function setupDirectories() {
  try {
    await fs.mkdir('data', { recursive: true });
    await fs.mkdir('uploads', { recursive: true });
    await fs.mkdir('uploads/labels', { recursive: true });
  } catch (error) {
    console.log('Directory setup completed');
  }
}

// Load persisted data
async function loadData() {
  try {
    const ordersData = await fs.readFile('data/orders.json', 'utf8');
    currentOrders = JSON.parse(ordersData);
    console.log(`✅ Loaded ${currentOrders.length} orders`);
  } catch {
    console.log('ℹ️ No previous orders found');
  }

  try {
    const pickingData = await fs.readFile('data/picking-list.json', 'utf8');
    currentPickingList = JSON.parse(pickingData);
    console.log(`✅ Loaded ${currentPickingList.length} picking items`);
  } catch {
    console.log('ℹ️ No previous picking list found');
  }
}

// Save data
async function saveData() {
  try {
    await fs.writeFile('data/orders.json', JSON.stringify(currentOrders, null, 2));
    await fs.writeFile('data/picking-list.json', JSON.stringify(currentPickingList, null, 2));
  } catch (error) {
    console.error('❌ Failed to save data:', error.message);
  }
}

// Activity logging
function logActivity(type, message, status = 'info') {
  const activity = {
    id: Date.now().toString(),
    type,
    message,
    status,
    timestamp: new Date().toISOString()
  };
  
  activityLog.unshift(activity);
  if (activityLog.length > 100) {
    activityLog = activityLog.slice(0, 100);
  }
  
  const icon = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }[status] || 'ℹ️';
  console.log(`${icon} [${type.toUpperCase()}] ${message}`);
}

// Authentication middleware
function requireAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  const session = sessions.get(sessionId);
  
  if (!session || Date.now() - session.created > 8 * 60 * 60 * 1000) { // 8 hours
    if (session) sessions.delete(sessionId);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }
  
  session.lastAccessed = Date.now();
  next();
}

// Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const sessionId = Math.random().toString(36).substring(2) + Date.now();
    sessions.set(sessionId, {
      username,
      created: Date.now(),
      lastAccessed: Date.now()
    });
    
    logActivity('auth', `User ${username} logged in`, 'success');
    
    res.json({
      success: true,
      sessionId,
      message: 'Login successful'
    });
  } else {
    logActivity('auth', `Failed login attempt for ${username}`, 'warning');
    res.status(401).json({
      success: false,
      message: 'Invalid username or password'
    });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) sessions.delete(sessionId);
  res.json({ success: true, message: 'Logged out successfully' });
});

// Fetch orders from BOL.com
app.post('/api/fetch-orders', requireAuth, async (req, res) => {
  try {
    logActivity('orders', 'Starting BOL.com order fetch', 'info');
    
    // Check if BOL credentials are configured
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
      return res.status(400).json({
        success: false,
        message: 'BOL.com API credentials not configured. Please set CLIENT_ID and CLIENT_SECRET environment variables.'
      });
    }
    
    const result = await fetchOrders();
    
    if (result.success) {
      currentOrders = result.ordersData || [];
      
      // Generate picking list from fetched orders
      const pickingResult = await generatePickingList();
      if (pickingResult.success) {
        currentPickingList = pickingResult.pickingList || [];
      }
      
      await saveData();
      
      logActivity('orders', `Successfully fetched ${currentOrders.length} orders`, 'success');
      
      res.json({
        success: true,
        message: `Successfully fetched ${currentOrders.length} orders`,
        ordersCount: currentOrders.length,
        pickingItemsCount: currentPickingList.length
      });
    } else {
      logActivity('orders', `Order fetch failed: ${result.message}`, 'error');
      res.status(500).json({
        success: false,
        message: result.message || 'Failed to fetch orders'
      });
    }
  } catch (error) {
    logActivity('orders', `Order fetch error: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Updated orders API to include label info per item
app.get('/api/orders', requireAuth, (req, res) => {
  // Convert picking list to order format for frontend
  const orderMap = new Map();
  
  currentPickingList.forEach(item => {
    const orderId = item.MessageID;
    
    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        id: orderId,
        customer: `${item.FirstName} ${item.LastName}`.trim(),
        address: `${item.ShipStreet} ${item.ShipHouseNr}, ${item.ShipZipcode} ${item.ShipCity}`,
        email: item.ReceiverEmail || '',
        items: [],
        status: 'open',
        shipped: false,
        trackingNumbers: [],
        allItemsShipped: false
      });
    }
    
    const order = orderMap.get(orderId);
    order.items.push({
      id: item.OrderItemID || `item_${Date.now()}_${Math.random()}`,
      name: item.ProductTitle || 'Unknown Product',
      sku: item.EAN || 'N/A',
      quantity: item.quantity || 1,
      location: item.location || 'Unknown',
      picked: item.picked || false,
      productCode: item.productCode || null,
      trackingNumber: item.trackingNumber || null,
      labelFilename: item.labelFilename || null,
      labelCreated: item.labelCreated || false
    });
    
    // Update order status based on items
    const allPicked = order.items.every(item => item.picked);
    if (allPicked && order.items.length > 0) {
      order.status = 'ready';
    } else if (order.items.some(item => item.picked)) {
      order.status = 'picking';
    }
    
    // Update shipping status
    if (item.shipped) {
      order.allItemsShipped = orderMap.get(orderId).items.every(orderItem => {
        const pickingItem = currentPickingList.find(pi => 
          pi.MessageID === orderId && pi.OrderItemID === orderItem.id
        );
        return pickingItem?.shipped || false;
      });
      
      if (order.allItemsShipped) {
        order.shipped = true;
        order.status = 'shipped';
      }
      
      // Collect tracking numbers
      if (item.trackingNumber && !order.trackingNumbers.includes(item.trackingNumber)) {
        order.trackingNumbers.push(item.trackingNumber);
      }
    }
  });
  
  const orders = Array.from(orderMap.values());
  
  res.json({
    success: true,
    orders: orders,
    count: orders.length
  });
});

// Mark item as picked with immediate label creation
app.post('/api/orders/:orderId/items/:itemId/pick', requireAuth, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { productCode = '3085' } = req.body;
    
    logActivity('picking', `Starting pick process for item ${itemId} in order ${orderId}`, 'info');
    
    // Check PostNL configuration first
    const requiredPostNLVars = [
      'API_KEY', 'API_URL', 'CUSTOMER_CODE', 'CUSTOMER_NUMBER', 'COLLECTION_LOCATION',
      'SENDER_NAME', 'SENDER_EMAIL', 'COMPANY_NAME', 'COMPANY_STREET', 'COMPANY_HOUSENR',
      'COMPANY_ZIP', 'COMPANY_CITY', 'COMPANY_COUNTRY'
    ];
    
    const missingVars = requiredPostNLVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      return res.status(400).json({
        success: false,
        message: `PostNL configuration incomplete. Missing: ${missingVars.join(', ')}`
      });
    }
    
    // Find the item in picking list
    const item = currentPickingList.find(item => 
      item.MessageID === orderId && 
      (item.OrderItemID === itemId || item.EAN === itemId)
    );
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    // Prepare shipment data for PostNL label creation
    const shipmentData = [{
      orderId: `${orderId}_${itemId}`, // Unique ID for this item
      orderItemId: itemId,
      firstName: item.FirstName || 'Customer',
      lastName: item.LastName || 'Customer',
      street: item.ShipStreet || 'Unknown Street',
      houseNumber: item.ShipHouseNr || '1',
      houseNumberExt: item.ShipHouseNrExt || '',
      zipcode: item.ShipZipcode || '1000AA',
      city: item.ShipCity || 'Amsterdam',
      email: item.ReceiverEmail || '',
      productCode: productCode,
      weight: 1000 // Default weight
    }];
    
    logActivity('picking', `Creating PostNL label for item ${item.ProductTitle} as ${productCode === '2928' ? 'mailbox package' : 'normal package'}`, 'info');
    
    // Create PostNL label immediately
    const labelResult = await createLabels(shipmentData);
    
    if (!labelResult.success || !labelResult.labels || labelResult.labels.length === 0) {
      logActivity('picking', `PostNL label creation failed: ${labelResult.message}`, 'error');
      return res.status(500).json({
        success: false,
        message: `Failed to create shipping label: ${labelResult.message}`
      });
    }
    
    const label = labelResult.labels[0];
    const trackingNumber = label.trackAndTrace;
    const labelFilename = label.labelFilename;
    
    // Update the item with pick status, product code, and label info
    item.picked = true;
    item.pickTimestamp = new Date().toISOString();
    item.productCode = productCode;
    item.trackingNumber = trackingNumber;
    item.labelFilename = labelFilename;
    item.labelCreated = true;
    item.labelCreatedAt = new Date().toISOString();
    
    await saveData();
    
    const packageType = productCode === '2928' ? 'mailbox package' : 'normal package';
    logActivity('picking', `Item picked and label created: ${item.ProductTitle} for order ${orderId} as ${packageType} with tracking ${trackingNumber}`, 'success');
    
    res.json({
      success: true,
      message: `Item picked as ${packageType} and label created!`,
      trackingNumber: trackingNumber,
      labelFilename: labelFilename
    });
    
  } catch (error) {
    logActivity('picking', `Error in pick process: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Updated ship order - Only register with BOL.com (labels already created)
app.post('/api/orders/:orderId/ship', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    logActivity('shipping', `Starting BOL.com shipment registration for order ${orderId}`, 'info');
    
    // Check if BOL credentials are configured
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
      return res.status(400).json({
        success: false,
        message: 'BOL.com API credentials not configured. Please set CLIENT_ID and CLIENT_SECRET environment variables.'
      });
    }
    
    // Get order items from picking list
    const orderItems = currentPickingList.filter(item => item.MessageID === orderId);
    
    if (orderItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if all items are picked
    const unpickedItems = orderItems.filter(item => !item.picked);
    if (unpickedItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot ship order. ${unpickedItems.length} items not yet picked.`
      });
    }
    
    // Check if all items have labels created
    const itemsWithoutLabels = orderItems.filter(item => !item.trackingNumber);
    if (itemsWithoutLabels.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot ship order. ${itemsWithoutLabels.length} items don't have labels created.`
      });
    }
    
    // Prepare order items for BOL shipment creation (using existing tracking numbers)
    const bolOrderItems = orderItems.map(item => ({
      orderItemId: item.OrderItemID,
      orderId: orderId,
      trackAndTrace: item.trackingNumber, // Use the tracking number from label creation
      firstName: item.FirstName,
      lastName: item.LastName
    }));
    
    logActivity('shipping', `Registering ${bolOrderItems.length} items with BOL.com`, 'info');
    
    // Create BOL.com shipment using existing tracking numbers
    const shipmentResult = await createShipments(bolOrderItems);
    
    if (shipmentResult.success) {
      // Update picking list items as shipped
      orderItems.forEach(item => {
        item.shipped = true;
        item.shippedAt = new Date().toISOString();
        item.bolShipmentRegistered = true;
      });
      
      await saveData();
      
      // Collect all tracking numbers for response
      const trackingNumbers = orderItems.map(item => item.trackingNumber);
      const uniqueTrackingNumbers = [...new Set(trackingNumbers)];
      
      logActivity('shipping', `Order ${orderId} shipped successfully. Registered ${uniqueTrackingNumbers.length} tracking numbers with BOL.com`, 'success');
      
      res.json({
        success: true,
        trackingNumbers: uniqueTrackingNumbers,
        itemCount: orderItems.length,
        message: `Order shipped successfully! ${uniqueTrackingNumbers.length} labels already created and registered with BOL.com`,
        labelCreated: true,
        bolShipmentRegistered: true
      });
    } else {
      logActivity('shipping', `BOL shipment registration failed: ${shipmentResult.message}`, 'error');
      
      res.status(500).json({
        success: false,
        message: `Failed to register shipment with BOL.com: ${shipmentResult.message}. Labels were already created successfully.`
      });
    }
    
  } catch (error) {
    logActivity('shipping', `BOL.com registration error: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Download individual item label
app.get('/api/labels/item/:orderId/:itemId/:trackingCode', requireAuth, async (req, res) => {
  try {
    const { orderId, itemId, trackingCode } = req.params;
    
    // Look for label file in uploads/labels directory
    const labelsDir = path.join(__dirname, 'uploads', 'labels');
    
    try {
      const files = await fs.readdir(labelsDir);
      
      // Find the label file that matches the order, item and tracking code
      const labelFile = files.find(file => 
        file.includes(`${orderId}_${itemId}`) && 
        file.includes(trackingCode) && 
        file.endsWith('.pdf')
      );
      
      if (!labelFile) {
        return res.status(404).json({
          success: false,
          message: 'Label file not found'
        });
      }
      
      const labelPath = path.join(labelsDir, labelFile);
      
      // Check if file exists
      await fs.access(labelPath);
      
      // Set appropriate headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${labelFile}"`);
      
      // Stream the file
      const fileBuffer = await fs.readFile(labelPath);
      res.send(fileBuffer);
      
      logActivity('labels', `Item label downloaded: ${labelFile}`, 'success');
      
    } catch (error) {
      res.status(404).json({
        success: false,
        message: 'Label file not found or cannot be accessed'
      });
    }
    
  } catch (error) {
    logActivity('labels', `Error downloading item label: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Legacy label download endpoint (for backward compatibility)
app.get('/api/labels/:orderId/:trackingCode', requireAuth, async (req, res) => {
  try {
    const { orderId, trackingCode } = req.params;
    
    // Look for label file in uploads/labels directory
    const labelsDir = path.join(__dirname, 'uploads', 'labels');
    
    try {
      const files = await fs.readdir(labelsDir);
      
      // Find the label file that matches the order and tracking code
      const labelFile = files.find(file => 
        file.includes(orderId) && 
        file.includes(trackingCode) && 
        file.endsWith('.pdf')
      );
      
      if (!labelFile) {
        return res.status(404).json({
          success: false,
          message: 'Label file not found'
        });
      }
      
      const labelPath = path.join(labelsDir, labelFile);
      
      // Check if file exists
      await fs.access(labelPath);
      
      // Set appropriate headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${labelFile}"`);
      
      // Stream the file
      const fileBuffer = await fs.readFile(labelPath);
      res.send(fileBuffer);
      
      logActivity('labels', `Label downloaded: ${labelFile}`, 'success');
      
    } catch (error) {
      res.status(404).json({
        success: false,
        message: 'Label file not found or cannot be accessed'
      });
    }
    
  } catch (error) {
    logActivity('labels', `Error downloading label: ${error.message}`, 'error');
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get system status
app.get('/api/status', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const apiKey = process.env.API_KEY;
  const customerCode = process.env.CUSTOMER_CODE;
  const customerNumber = process.env.CUSTOMER_NUMBER;
  
  const bolConfigured = clientId && clientSecret && 
    !clientId.includes('your_bol') && 
    !clientSecret.includes('your_bol') &&
    clientId.length > 10 && 
    clientSecret.length > 10;

  const postnlConfigured = apiKey && customerCode && customerNumber &&
    !apiKey.includes('your_postnl') &&
    !customerCode.includes('your_') &&
    !customerNumber.includes('your_') &&
    apiKey.length > 10;
  
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    currentOrders: currentOrders.length,
    pickingItems: currentPickingList.length,
    activeSessions: sessions.size,
    environment: process.env.NODE_ENV || 'development',
    bolConfigured: bolConfigured,
    postnlConfigured: postnlConfigured,
    credentialsDebug: {
      CLIENT_ID: clientId ? (clientId.includes('your_bol') ? 'placeholder' : 'real') : 'missing',
      CLIENT_SECRET: clientSecret ? (clientSecret.includes('your_bol') ? 'placeholder' : 'real') : 'missing',
      API_KEY: apiKey ? (apiKey.includes('your_postnl') ? 'placeholder' : 'real') : 'missing',
      CUSTOMER_CODE: customerCode ? (customerCode.includes('your_') ? 'placeholder' : 'real') : 'missing',
      CUSTOMER_NUMBER: customerNumber ? (customerNumber.includes('your_') ? 'placeholder' : 'real') : 'missing'
    }
  });
});

// Get recent activities
app.get('/api/activities', requireAuth, (req, res) => {
  res.json({
    success: true,
    activities: activityLog.slice(0, 20)
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Import axios for API testing
const axios = require('axios');

// Test API credentials endpoint
app.get('/api/test-credentials', requireAuth, async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  // Test BOL.com credentials
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  
  if (clientId && clientSecret && !clientId.includes('your_bol')) {
    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await axios.post(
        'https://login.bol.com/token?grant_type=client_credentials',
        null,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );
      
      results.tests.bol = {
        status: 'success',
        message: 'BOL.com API credentials are valid',
        hasToken: !!response.data.access_token
      };
    } catch (error) {
      results.tests.bol = {
        status: 'error',
        message: 'BOL.com API authentication failed',
        error: error.response?.data?.error_description || error.message
      };
    }
  } else {
    results.tests.bol = {
      status: 'skipped',
      message: 'BOL.com credentials not configured or using placeholders'
    };
  }
  
  // Test PostNL credentials (basic check)
  const apiKey = process.env.API_KEY;
  if (apiKey && !apiKey.includes('your_postnl')) {
    results.tests.postnl = {
      status: 'configured',
      message: 'PostNL API key is configured (connection test not implemented)'
    };
  } else {
    results.tests.postnl = {
      status: 'not_configured',
      message: 'PostNL API key not configured or using placeholders'
    };
  }
  
  res.json(results);
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start server and load data
app.listen(PORT, async () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Simple BOL.com PostNL Picking App`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Login: ${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'changeme123'}`);
  
  // Check API configuration status
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const apiKey = process.env.API_KEY;
  const customerCode = process.env.CUSTOMER_CODE;
  const customerNumber = process.env.CUSTOMER_NUMBER;
  
  const bolConfigured = clientId && clientSecret && 
    !clientId.includes('your_bol') && 
    !clientSecret.includes('your_bol') &&
    clientId.length > 10 && 
    clientSecret.length > 10;

  const postnlConfigured = apiKey && customerCode && customerNumber &&
    !apiKey.includes('your_postnl') &&
    !customerCode.includes('your_') &&
    !customerNumber.includes('your_') &&
    apiKey.length > 10;
  
  console.log(`🛒 BOL.com API: ${bolConfigured ? 'Configured ✅' : 'Missing/Placeholder ❌'}`);
  console.log(`📮 PostNL API: ${postnlConfigured ? 'Configured ✅' : 'Missing/Placeholder ❌'}`);
  
  // Setup directories and load data
  await setupDirectories();
  await loadData();
  
  console.log(`📦 Orders loaded: ${currentOrders.length}`);
  console.log(`📋 Picking items: ${currentPickingList.length}`);
  console.log(`\n🔗 Access: http://localhost:${PORT}`);
  console.log(`${'='.repeat(50)}\n`);
  
  logActivity('system', `Server started on port ${PORT}`, 'success');
  
  // Clean up sessions periodically
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
      if (now - session.lastAccessed > 8 * 60 * 60 * 1000) { // 8 hours
        sessions.delete(sessionId);
      }
    }
  }, 60 * 60 * 1000); // Check every hour
});
