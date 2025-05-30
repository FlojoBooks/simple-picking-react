// server.js - Enhanced with detailed logging for debugging and FIXED label download endpoints
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

// Enhanced logging function
function detailedLog(category, message, data = null, level = 'info') {
  const timestamp = new Date().toISOString();
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', debug: '🔍' };
  const icon = icons[level] || 'ℹ️';
  
  console.log(`${icon} [${timestamp}] [${category.toUpperCase()}] ${message}`);
  
  if (data) {
    console.log(`   📊 Data:`, JSON.stringify(data, null, 2));
  }
  
  // Also add to activity log
  logActivity(category, message, level);
}

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

// Enhanced pick endpoint with detailed logging
app.post('/api/orders/:orderId/items/:itemId/pick', requireAuth, async (req, res) => {
  const startTime = Date.now();
  const { orderId, itemId } = req.params;
  const { productCode = '3085' } = req.body;
  
  try {
    detailedLog('picking', `Starting pick process for item ${itemId} in order ${orderId}`, {
      orderId,
      itemId,
      productCode,
      timestamp: new Date().toISOString()
    }, 'info');
    
    // Check PostNL configuration first
    const requiredPostNLVars = [
      'API_KEY', 'API_URL', 'CUSTOMER_CODE', 'CUSTOMER_NUMBER', 'COLLECTION_LOCATION',
      'SENDER_NAME', 'SENDER_EMAIL', 'COMPANY_NAME', 'COMPANY_STREET', 'COMPANY_HOUSENR',
      'COMPANY_ZIP', 'COMPANY_CITY', 'COMPANY_COUNTRY'
    ];
    
    const missingVars = requiredPostNLVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      detailedLog('picking', 'PostNL configuration incomplete', { missingVars }, 'error');
      return res.status(400).json({
        success: false,
        message: `PostNL configuration incomplete. Missing: ${missingVars.join(', ')}`
      });
    }

    detailedLog('picking', 'PostNL configuration validated successfully', {
      configuredVars: requiredPostNLVars.filter(varName => process.env[varName]).map(varName => ({
        name: varName,
        hasValue: !!process.env[varName],
        valueLength: process.env[varName] ? process.env[varName].length : 0,
        startsWithPlaceholder: process.env[varName] && process.env[varName].includes('your_')
      }))
    }, 'debug');
    
    // Find the item in picking list
    const item = currentPickingList.find(item => 
      item.MessageID === orderId && 
      (item.OrderItemID === itemId || item.EAN === itemId)
    );
    
    if (!item) {
      detailedLog('picking', 'Item not found in picking list', {
        orderId,
        itemId,
        availableItems: currentPickingList.filter(i => i.MessageID === orderId).map(i => ({
          orderItemId: i.OrderItemID,
          ean: i.EAN,
          productTitle: i.ProductTitle
        }))
      }, 'error');
      
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    detailedLog('picking', 'Found item in picking list', {
      itemDetails: {
        orderItemId: item.OrderItemID,
        productTitle: item.ProductTitle,
        ean: item.EAN,
        firstName: item.FirstName,
        lastName: item.LastName,
        address: `${item.ShipStreet} ${item.ShipHouseNr}, ${item.ShipZipcode} ${item.ShipCity}`,
        email: item.ReceiverEmail
      }
    }, 'debug');
    
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
    
    detailedLog('picking', `Prepared shipment data for PostNL`, {
      shipmentData: shipmentData[0],
      packageType: productCode === '2928' ? 'mailbox package' : 'normal package'
    }, 'info');
    
    detailedLog('picking', `Creating PostNL label for item ${item.ProductTitle}`, {
      productCode,
      packageType: productCode === '2928' ? 'mailbox package' : 'normal package'
    }, 'info');
    
    // Create PostNL label immediately
    const labelResult = await createLabels(shipmentData);
    
    detailedLog('picking', 'PostNL createLabels response received', {
      success: labelResult.success,
      message: labelResult.message,
      labelsCreated: labelResult.labelsCreated,
      labelsErrored: labelResult.labelsErrored,
      totalProcessed: labelResult.totalProcessed,
      hasLabels: !!(labelResult.labels && labelResult.labels.length > 0),
      labelCount: labelResult.labels ? labelResult.labels.length : 0,
      firstLabelData: labelResult.labels && labelResult.labels.length > 0 ? {
        orderId: labelResult.labels[0].orderId,
        status: labelResult.labels[0].status,
        trackAndTrace: labelResult.labels[0].trackAndTrace,
        labelFilename: labelResult.labels[0].labelFilename,
        error: labelResult.labels[0].error
      } : null,
      error: labelResult.error
    }, labelResult.success ? 'success' : 'error');
    
    if (!labelResult.success || !labelResult.labels || labelResult.labels.length === 0) {
      const errorMsg = `PostNL label creation failed: ${labelResult.message}`;
      detailedLog('picking', errorMsg, {
        labelResult,
        shipmentData: shipmentData[0]
      }, 'error');
      
      return res.status(500).json({
        success: false,
        message: errorMsg
      });
    }
    
    const label = labelResult.labels[0];
    
    if (label.status === 'failed') {
      detailedLog('picking', 'PostNL label creation failed for individual item', {
        label,
        error: label.error
      }, 'error');
      
      return res.status(500).json({
        success: false,
        message: `Failed to create shipping label: ${label.error || 'Unknown error'}`
      });
    }
    
    const trackingNumber = label.trackAndTrace;
    const labelFilename = label.labelFilename;
    
    detailedLog('picking', 'PostNL label created successfully', {
      trackingNumber,
      labelFilename,
      labelPath: label.labelPath,
      customerName: label.customerName,
      productCode: label.productCode
    }, 'success');
    
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
    const duration = Date.now() - startTime;
    
    detailedLog('picking', `Pick process completed successfully in ${duration}ms`, {
      orderId,
      itemId,
      productTitle: item.ProductTitle,
      packageType,
      trackingNumber,
      labelFilename,
      duration: `${duration}ms`
    }, 'success');
    
    res.json({
      success: true,
      message: `Item picked as ${packageType} and label created!`,
      trackingNumber: trackingNumber,
      labelFilename: labelFilename
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    detailedLog('picking', `Error in pick process after ${duration}ms: ${error.message}`, {
      orderId,
      itemId,
      productCode,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      duration: `${duration}ms`
    }, 'error');
    
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

// FIXED: Download individual item label - searches by tracking code only
app.get('/api/labels/item/:orderId/:itemId/:trackingCode', requireAuth, async (req, res) => {
  try {
    const { orderId, itemId, trackingCode } = req.params;
    
    detailedLog('labels', `Attempting to download label for item`, {
      orderId,
      itemId,
      trackingCode
    }, 'debug');
    
    // Look for label file in uploads/labels directory
    const labelsDir = path.join(__dirname, 'uploads', 'labels');
    
    try {
      const files = await fs.readdir(labelsDir);
      
      detailedLog('labels', `Found ${files.length} files in labels directory`, {
        files: files.slice(0, 10), // Show first 10 files
        trackingCodeSearch: trackingCode
      }, 'debug');
      
      // FIXED: Look for file that matches the tracking code (which is how files are actually saved)
      // The file is saved as just "trackingCode.pdf", so search for that pattern
      const labelFile = files.find(file => 
        file === `${trackingCode}.pdf` || // Exact match first
        (file.includes(trackingCode) && file.endsWith('.pdf')) // Fallback: contains tracking code
      );
      
      if (!labelFile) {
        detailedLog('labels', 'Label file not found', {
          trackingCodeSearched: trackingCode,
          expectedFilename: `${trackingCode}.pdf`,
          availableFiles: files.filter(f => f.endsWith('.pdf')),
          availableTrackingCodes: files.filter(f => f.endsWith('.pdf')).map(f => f.replace('.pdf', ''))
        }, 'warning');
        
        return res.status(404).json({
          success: false,
          message: `Label file not found for tracking code: ${trackingCode}`
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
      
      detailedLog('labels', `Item label downloaded successfully`, {
        labelFile,
        fileSize: fileBuffer.length,
        orderId,
        itemId,
        trackingCode
      }, 'success');
      
    } catch (error) {
      detailedLog('labels', 'Error accessing label file', {
        error: error.message,
        labelsDir,
        trackingCode
      }, 'error');
      
      res.status(404).json({
        success: false,
        message: 'Label file not found or cannot be accessed'
      });
    }
    
  } catch (error) {
    detailedLog('labels', `Error downloading item label: ${error.message}`, {
      error: error.message,
      stack: error.stack
    }, 'error');
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// FIXED: Legacy label download endpoint (also fixed for backward compatibility)
app.get('/api/labels/:orderId/:trackingCode', requireAuth, async (req, res) => {
  try {
    const { orderId, trackingCode } = req.params;
    
    // Look for label file in uploads/labels directory
    const labelsDir = path.join(__dirname, 'uploads', 'labels');
    
    try {
      const files = await fs.readdir(labelsDir);
      
      // FIXED: Look for file that matches the tracking code
      const labelFile = files.find(file => 
        file === `${trackingCode}.pdf` || // Exact match first
        (file.includes(trackingCode) && file.endsWith('.pdf')) // Fallback
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

// NEW: Debug endpoint to list all available labels
app.get('/api/debug/labels', requireAuth, async (req, res) => {
  try {
    const labelsDir = path.join(__dirname, 'uploads', 'labels');
    
    try {
      const files = await fs.readdir(labelsDir);
      const labelFiles = files.filter(f => f.endsWith('.pdf'));
      
      const fileDetails = await Promise.all(
        labelFiles.map(async (file) => {
          try {
            const filePath = path.join(labelsDir, file);
            const stats = await fs.stat(filePath);
            return {
              filename: file,
              size: stats.size,
              created: stats.birthtime,
              trackingCode: file.replace('.pdf', '')
            };
          } catch (error) {
            return {
              filename: file,
              error: error.message
            };
          }
        })
      );
      
      res.json({
        success: true,
        labelsDirectory: labelsDir,
        totalFiles: labelFiles.length,
        files: fileDetails
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Cannot access labels directory: ' + error.message
      });
    }
    
  } catch (error) {
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
  
  // Test PostNL credentials (enhanced check)
  const apiKey = process.env.API_KEY;
  const apiUrl = process.env.API_URL || 'https://api-sandbox.postnl.nl';
  const customerNumber = process.env.CUSTOMER_NUMBER;
  const customerCode = process.env.CUSTOMER_CODE;
  
  if (apiKey && !apiKey.includes('your_postnl')) {
    try {
      // Try to make a simple API call to test authentication
      // Using a minimal test payload
      const testPayload = {
        Customer: {
          CustomerNumber: customerNumber,
          CustomerCode: customerCode,
          CollectionLocation: process.env.COLLECTION_LOCATION
        },
        Message: {
          MessageID: `TEST_${Date.now()}`,
          MessageTimeStamp: new Date().toISOString(),
          Printertype: 'GraphicFile|PDF'
        },
        Shipments: [{
          Addresses: [
            {
              AddressType: '01',
              CompanyName: 'Test Company',
              Name: 'Test Sender',
              Street: 'Test Street',
              HouseNr: '1',
              Zipcode: '1000AA',
              City: 'Amsterdam',
              Countrycode: 'NL'
            },
            {
              AddressType: '02',
              Name: 'Test Receiver',
              Street: 'Test Street',
              HouseNr: '1',
              Zipcode: '1000AA',
              City: 'Amsterdam',
              Countrycode: 'NL'
            }
          ],
          ProductCodeDelivery: '3085',
          PhaseCode: '1',
          Reference: 'TEST',
          DeliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          Barcode: '3STEST123456789NL',
          Dimension: {
            Weight: 1000
          },
          ProductOptions: [{
            Option: '01',
            Characteristic: '118'
          }]
        }]
      };

      const testResponse = await axios.post(
        `${apiUrl}/shipment/v2_2/label`,
        testPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'apikey': apiKey
          },
          timeout: 15000
        }
      );

      results.tests.postnl = {
        status: 'success',
        message: 'PostNL API credentials are valid and API is accessible',
        apiUrl: apiUrl,
        responseStatus: testResponse.status
      };
    } catch (error) {
      results.tests.postnl = {
        status: 'error',
        message: 'PostNL API test failed',
        apiUrl: apiUrl,
        error: {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.response?.data?.fault?.faultstring || error.message,
          data: error.response?.data
        }
      };
    }
  } else {
    results.tests.postnl = {
      status: 'not_configured',
      message: 'PostNL API key not configured or using placeholders'
    };
  }
  
  res.json(results);
});

// Debug endpoint for PostNL configuration
app.get('/api/debug/postnl-config', requireAuth, (req, res) => {
  const envVars = [
    'API_KEY', 'API_URL', 'CUSTOMER_NUMBER', 'CUSTOMER_CODE', 'COLLECTION_LOCATION',
    'SENDER_NAME', 'SENDER_EMAIL', 'COMPANY_NAME', 'COMPANY_STREET', 'COMPANY_HOUSENR',
    'COMPANY_ZIP', 'COMPANY_CITY', 'COMPANY_COUNTRY', 'DEFAULT_WEIGHT'
  ];

  const config = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    postnlConfig: {},
    configStatus: {}
  };

  envVars.forEach(varName => {
    const value = process.env[varName];
    config.postnlConfig[varName] = {
      hasValue: !!value,
      valueLength: value ? value.length : 0,
      isPlaceholder: value && value.includes('your_'),
      startsWithCorrectFormat: varName === 'API_KEY' ? (value && value.length > 20) : true
    };
  });

  // Overall status
  const requiredVars = ['API_KEY', 'CUSTOMER_NUMBER', 'CUSTOMER_CODE', 'COLLECTION_LOCATION'];
  const missingRequired = requiredVars.filter(varName => !process.env[varName]);
  const hasPlaceholders = envVars.filter(varName => process.env[varName] && process.env[varName].includes('your_'));

  config.configStatus = {
    allRequiredPresent: missingRequired.length === 0,
    missingRequired,
    hasPlaceholders: hasPlaceholders.length > 0,
    placeholderVars: hasPlaceholders,
    readyForProduction: missingRequired.length === 0 && hasPlaceholders.length === 0
  };

  res.json(config);
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
