// scripts/postnl-create-labels.js - MAXIMUM DEBUGGING VERSION
require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// ===== ENVIRONMENT VARIABLE DEBUGGING =====
console.log('\n🔍 ===== ENVIRONMENT VARIABLES DEBUG =====');
const envVars = [
  'API_KEY', 'API_URL', 'CUSTOMER_NUMBER', 'CUSTOMER_CODE', 'COLLECTION_LOCATION',
  'SENDER_NAME', 'SENDER_EMAIL', 'COMPANY_NAME', 'COMPANY_STREET', 'COMPANY_HOUSENR',
  'COMPANY_HOUSEEXT', 'COMPANY_ZIP', 'COMPANY_CITY', 'COMPANY_COUNTRY', 'DEFAULT_WEIGHT'
];

envVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`${varName}: ${value ? `"${value}" (length: ${value.length})` : 'NOT SET'}`);
});
console.log('===== END ENVIRONMENT VARIABLES =====\n');

// PostNL API Configuration
const POSTNL_CONFIG = {
  API_KEY: process.env.API_KEY,
  API_URL: process.env.API_URL || 'https://api.postnl.nl/shipment/v2_2/label?confirm=true',
  CUSTOMER_NUMBER: process.env.CUSTOMER_NUMBER,
  CUSTOMER_CODE: process.env.CUSTOMER_CODE,
  COLLECTION_LOCATION: process.env.COLLECTION_LOCATION
};

console.log('🔧 POSTNL_CONFIG loaded:', JSON.stringify(POSTNL_CONFIG, null, 2));

// Sender information
const SENDER_INFO = {
  companyName: process.env.COMPANY_NAME || 'Your Company',
  firstName: '',
  lastName: process.env.SENDER_NAME || 'Shipping Department',
  street: process.env.COMPANY_STREET || 'Logistics Street',
  houseNumber: process.env.COMPANY_HOUSENR || '1',
  houseNumberExt: process.env.COMPANY_HOUSEEXT || '',
  zipcode: process.env.COMPANY_ZIP || '1234AB',
  city: process.env.COMPANY_CITY || 'Amsterdam',
  countryCode: process.env.COMPANY_COUNTRY || 'NL',
  email: process.env.SENDER_EMAIL || 'shipping@company.com'
};

console.log('📍 SENDER_INFO loaded:', JSON.stringify(SENDER_INFO, null, 2));

// Labels directory
const LABELS_DIR = path.join(__dirname, '..', 'uploads', 'labels');
console.log('📁 LABELS_DIR set to:', LABELS_DIR);

// Enhanced logging function with even more detail
function detailedLog(category, message, data = null, level = 'info') {
  const timestamp = new Date().toISOString();
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', debug: '🔍' };
  const icon = icons[level] || 'ℹ️';
  
  console.log(`\n${icon} [${timestamp}] [POSTNL-${category.toUpperCase()}] ${message}`);
  
  if (data) {
    console.log(`📊 DETAILED DATA:`, JSON.stringify(data, null, 2));
  }
  console.log(''); // Add blank line for readability
}

// Ensure labels directory exists
async function ensureLabelsDirectory() {
  try {
    console.log(`🔍 Checking if labels directory exists: ${LABELS_DIR}`);
    await fs.access(LABELS_DIR);
    console.log('✅ Labels directory exists');
    return true;
  } catch (error) {
    console.log(`⚠️ Labels directory doesn't exist, creating: ${LABELS_DIR}`);
    try {
      await fs.mkdir(LABELS_DIR, { recursive: true });
      console.log('✅ Created labels directory successfully');
      return true;
    } catch (createError) {
      console.error('❌ Failed to create labels directory:', createError);
      throw createError;
    }
  }
}

// Validate PostNL configuration
function validatePostNLConfig() {
  console.log('\n🔍 ===== VALIDATING POSTNL CONFIGURATION =====');
  
  const requiredFields = ['API_KEY', 'CUSTOMER_NUMBER', 'CUSTOMER_CODE', 'COLLECTION_LOCATION'];
  const missingFields = [];
  const invalidFields = [];
  
  requiredFields.forEach(field => {
    const value = POSTNL_CONFIG[field];
    console.log(`Checking ${field}:`);
    console.log(`  - Has value: ${!!value}`);
    console.log(`  - Value length: ${value ? value.length : 0}`);
    console.log(`  - Is placeholder: ${value && value.includes('your_')}`);
    
    if (!value) {
      missingFields.push(field);
    } else if (value.includes('your_')) {
      invalidFields.push(field);
    }
  });
  
  console.log('Missing fields:', missingFields);
  console.log('Invalid/placeholder fields:', invalidFields);
  
  if (missingFields.length > 0) {
    throw new Error(`PostNL configuration incomplete. Missing: ${missingFields.join(', ')}`);
  }
  
  if (invalidFields.length > 0) {
    throw new Error(`PostNL configuration has placeholders. Fix: ${invalidFields.join(', ')}`);
  }
  
  console.log('✅ PostNL configuration validation passed');
  console.log('===== END CONFIGURATION VALIDATION =====\n');
}

// Generate PostNL tracking code
function generatePostNLTrackingCode() {
  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let trackingCode = '3S';
  
  for (let i = 0; i < 13; i++) {
    trackingCode += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  const finalCode = trackingCode + 'NL';
  console.log(`🎯 Generated tracking code: ${finalCode}`);
  return finalCode;
}

// Build payload exactly like working script
function buildPayload(shipmentData) {
  console.log('\n🔍 ===== BUILDING POSTNL PAYLOAD =====');
  console.log('Input shipmentData:', JSON.stringify(shipmentData, null, 2));
  
  const weight = parseInt(shipmentData.weight) || parseInt(process.env.DEFAULT_WEIGHT) || 1000;
  const messageId = shipmentData.messageId || `MSG_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const trackingCode = shipmentData.trackingCode || generatePostNLTrackingCode();

  console.log('Calculated values:');
  console.log(`  - Weight: ${weight}`);
  console.log(`  - MessageID: ${messageId}`);
  console.log(`  - TrackingCode: ${trackingCode}`);

  // Build contact object
  const contact = { ContactType: '01' };
  if (shipmentData.receiver.email) contact.Email = shipmentData.receiver.email;
  if (shipmentData.receiver.sms) contact.SMSNr = shipmentData.receiver.sms;
  if (shipmentData.receiver.phone) contact.TelNr = shipmentData.receiver.phone;
  
  console.log('Contact object:', JSON.stringify(contact, null, 2));

  // Build full payload
  const payload = {
    Customer: {
      Address: {
        AddressType: '02',
        Street: SENDER_INFO.street,
        HouseNr: SENDER_INFO.houseNumber,
        HouseNrExt: SENDER_INFO.houseNumberExt,
        Zipcode: SENDER_INFO.zipcode,
        City: SENDER_INFO.city,
        Countrycode: SENDER_INFO.countryCode,
        CompanyName: SENDER_INFO.companyName
      },
      CollectionLocation: POSTNL_CONFIG.COLLECTION_LOCATION,
      ContactPerson: SENDER_INFO.lastName,
      CustomerCode: POSTNL_CONFIG.CUSTOMER_CODE,
      CustomerNumber: POSTNL_CONFIG.CUSTOMER_NUMBER,
      Email: SENDER_INFO.email,
      Name: SENDER_INFO.lastName
    },
    Message: {
      MessageID: messageId,
      MessageTimeStamp: new Date().toISOString(),
      Printertype: 'PDF'
    },
    Shipments: [
      {
        Addresses: [
          {
            AddressType: '01',
            FirstName: shipmentData.receiver.firstName || 'Customer',
            Name: shipmentData.receiver.lastName || 'Customer',
            Street: shipmentData.receiver.street || 'Unknown Street',
            HouseNr: shipmentData.receiver.houseNumber || '1',
            HouseNrExt: shipmentData.receiver.houseNumberExt || '',
            Zipcode: shipmentData.receiver.zipcode || '1000AA',
            City: shipmentData.receiver.city || 'Amsterdam',
            Countrycode: shipmentData.receiver.countryCode || 'NL'
          }
        ],
        Contacts: [contact],
        Dimension: { Weight: weight },
        ProductCodeDelivery: shipmentData.productCode || '3085'
      }
    ]
  };

  console.log('COMPLETE PAYLOAD:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('===== END PAYLOAD BUILDING =====\n');
  
  return payload;
}

// Create PostNL shipping label with maximum debugging
async function createPostNLLabel(shipmentData) {
  const startTime = Date.now();
  
  try {
    console.log('\n🚀 ===== STARTING POSTNL LABEL CREATION =====');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Input shipmentData:', JSON.stringify(shipmentData, null, 2));
    
    if (!shipmentData.receiver) {
      throw new Error('Receiver information is required');
    }
    
    // Build payload
    const payload = buildPayload(shipmentData);
    
    // Prepare request details
    const requestConfig = {
      method: 'POST',
      url: POSTNL_CONFIG.API_URL,
      headers: {
        apikey: POSTNL_CONFIG.API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      data: payload,
      timeout: 30000
    };

    console.log('\n🌐 ===== HTTP REQUEST DETAILS =====');
    console.log('Method:', requestConfig.method);
    console.log('URL:', requestConfig.url);
    console.log('Headers:', JSON.stringify(requestConfig.headers, null, 2));
    console.log('Timeout:', requestConfig.timeout);
    console.log('Request body size:', JSON.stringify(requestConfig.data).length, 'characters');
    console.log('===== END REQUEST DETAILS =====\n');

    console.log('🔄 Making HTTP request to PostNL API...');
    
    // Make the API call with detailed error handling
    let response;
    try {
      response = await axios(requestConfig);
    } catch (requestError) {
      console.log('\n❌ ===== HTTP REQUEST FAILED =====');
      console.log('Error name:', requestError.name);
      console.log('Error message:', requestError.message);
      console.log('Error code:', requestError.code);
      
      if (requestError.response) {
        console.log('Response status:', requestError.response.status);
        console.log('Response statusText:', requestError.response.statusText);
        console.log('Response headers:', JSON.stringify(requestError.response.headers, null, 2));
        console.log('Response data:', JSON.stringify(requestError.response.data, null, 2));
      } else if (requestError.request) {
        console.log('Request was made but no response received');
        console.log('Request details:', {
          method: requestError.request.method,
          url: requestError.request.url,
          headers: requestError.request._headers
        });
      } else {
        console.log('Error in setting up the request');
      }
      console.log('===== END REQUEST FAILURE =====\n');
      throw requestError;
    }

    const duration = Date.now() - startTime;
    
    console.log('\n✅ ===== HTTP REQUEST SUCCESSFUL =====');
    console.log('Duration:', duration, 'ms');
    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);
    console.log('Response headers:', JSON.stringify(response.headers, null, 2));
    console.log('Response data keys:', Object.keys(response.data));
    console.log('FULL RESPONSE DATA:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('===== END SUCCESSFUL RESPONSE =====\n');
    
    // Extract tracking code from response
    let finalTrackingCode = payload.Message.MessageID;
    if (response.data.ResponseShipments && response.data.ResponseShipments.length > 0) {
      const responseShipment = response.data.ResponseShipments[0];
      console.log('ResponseShipment found:', JSON.stringify(responseShipment, null, 2));
      
      if (responseShipment.Barcode) {
        finalTrackingCode = responseShipment.Barcode;
        console.log(`🎯 Updated tracking code from response: ${finalTrackingCode}`);
      }
    }

    const result = {
      ...response.data,
      trackingCode: finalTrackingCode,
      messageId: payload.Message.MessageID,
      success: true
    };
    
    console.log('Final result object:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.log('\n❌ ===== LABEL CREATION FAILED =====');
    console.log('Duration:', duration, 'ms');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
    
    if (error.response) {
      console.log('\n📥 ERROR RESPONSE DETAILS:');
      console.log('Status:', error.response.status);
      console.log('StatusText:', error.response.statusText);
      console.log('Headers:', JSON.stringify(error.response.headers, null, 2));
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
      
      // Special handling for PostNL-specific errors
      if (error.response.data?.fault) {
        console.log('PostNL Fault Details:', JSON.stringify(error.response.data.fault, null, 2));
      }
    }
    
    if (error.request) {
      console.log('\n📤 REQUEST DETAILS (NO RESPONSE):');
      console.log('Method:', error.request.method);
      console.log('URL:', error.request.url);
      console.log('Headers:', error.request._headers);
    }
    
    if (error.config) {
      console.log('\n⚙️ AXIOS CONFIG:');
      console.log('URL:', error.config.url);
      console.log('Method:', error.config.method);
      console.log('Headers:', error.config.headers);
      console.log('Timeout:', error.config.timeout);
    }
    
    console.log('===== END ERROR DETAILS =====\n');
    
    // Enhanced error handling
    if (error.response?.data?.fault) {
      throw new Error(`PostNL API error: ${error.response.data.fault.faultstring}`);
    } else if (error.response?.status === 401) {
      throw new Error('PostNL API authentication failed. Check your API key.');
    } else if (error.response?.status === 400) {
      const errorMsg = error.response.data?.message || error.response.data?.fault?.faultstring || 'Invalid request data';
      throw new Error(`PostNL API bad request: ${errorMsg}`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to PostNL API. Check your internet connection and API URL.');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('PostNL API request timed out. Please try again.');
    } else {
      throw new Error(`PostNL API error: ${error.message}`);
    }
  }
}

// Save label PDF with maximum debugging
async function saveLabelPDF(labelData, orderId, trackingCode) {
  try {
    console.log('\n💾 ===== STARTING PDF SAVE PROCESS =====');
    console.log('Order ID:', orderId);
    console.log('Tracking Code:', trackingCode);
    console.log('Label data keys:', Object.keys(labelData));
    
    console.log('Checking for ResponseShipments...');
    if (!labelData.ResponseShipments || labelData.ResponseShipments.length === 0) {
      console.log('❌ No ResponseShipments found in labelData');
      console.log('Available labelData:', JSON.stringify(labelData, null, 2));
      return null;
    }
    
    const responseShipment = labelData.ResponseShipments[0];
    console.log('ResponseShipment found:', JSON.stringify(responseShipment, null, 2));
    
    console.log('Checking for Labels in ResponseShipment...');
    if (!responseShipment.Labels || responseShipment.Labels.length === 0) {
      console.log('❌ No Labels found in ResponseShipment');
      return null;
    }
    
    const label = responseShipment.Labels[0];
    console.log('Label found:', JSON.stringify(label, null, 2));
    
    console.log('Checking for Content in Label...');
    if (!label.Content) {
      console.log('❌ No Content found in Label');
      return null;
    }
    
    console.log('✅ Label Content found, length:', label.Content.length);
    
    // Ensure labels directory exists
    await ensureLabelsDirectory();
    
    // The label content is base64 encoded PDF
    console.log('Converting base64 to buffer...');
    const pdfBuffer = Buffer.from(label.Content, 'base64');
    console.log('Buffer created, size:', pdfBuffer.length, 'bytes');
    
    // Create filename
    const filename = `${trackingCode}.pdf`;
    const filePath = path.join(LABELS_DIR, filename);
    
    console.log('Writing file to:', filePath);
    
    await fs.writeFile(filePath, pdfBuffer);
    
    // Verify file was written
    const stats = await fs.stat(filePath);
    
    console.log('✅ File written successfully');
    console.log('File size on disk:', stats.size, 'bytes');
    console.log('===== END PDF SAVE PROCESS =====\n');
    
    return filePath;
    
  } catch (error) {
    console.log('\n❌ ===== PDF SAVE ERROR =====');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
    console.log('===== END PDF SAVE ERROR =====\n');
    return null;
  }
}

// Main export function with maximum debugging
async function createLabels(shipments = null) {
  const startTime = Date.now();
  
  try {
    console.log('\n🎬 ===== STARTING MAIN createLabels FUNCTION =====');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Shipments provided:', !!(shipments));
    console.log('Shipments count:', shipments ? shipments.length : 0);
    
    if (shipments) {
      console.log('Shipments data:', JSON.stringify(shipments, null, 2));
    }
    
    // Validate PostNL configuration
    validatePostNLConfig();
    
    // Ensure labels directory exists
    await ensureLabelsDirectory();
    
    let labels = [];
    let successCount = 0;
    let errorCount = 0;

    // Process provided shipments
    if (shipments && Array.isArray(shipments) && shipments.length > 0) {
      console.log(`\n📦 Processing ${shipments.length} shipments for label creation`);
      
      for (let i = 0; i < shipments.length; i++) {
        const shipment = shipments[i];
        
        console.log(`\n🔄 ===== PROCESSING SHIPMENT ${i + 1}/${shipments.length} =====`);
        console.log('Shipment data:', JSON.stringify(shipment, null, 2));
        
        try {
          // Validate shipment data
          if (!shipment.orderId) {
            throw new Error('Order ID is required');
          }
          
          // Prepare shipment data
          const messageId = `MSG_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          const shipmentData = {
            messageId: messageId,
            receiver: {
              firstName: shipment.firstName || 'Customer',
              lastName: shipment.lastName || 'Customer',
              street: shipment.street || 'Unknown Street',
              houseNumber: shipment.houseNumber || '1',
              houseNumberExt: shipment.houseNumberExt || '',
              zipcode: shipment.zipcode || '1000AA',
              city: shipment.city || 'Amsterdam',
              countryCode: shipment.countryCode || 'NL',
              email: shipment.email || '',
              sms: shipment.sms || '',
              phone: shipment.phone || ''
            },
            productCode: shipment.productCode || '3085',
            reference: shipment.orderId,
            weight: parseInt(shipment.weight) || 1000
          };

          console.log('Prepared shipment data:', JSON.stringify(shipmentData, null, 2));

          // Create the label via PostNL API
          const result = await createPostNLLabel(shipmentData);
          
          if (!result.success) {
            throw new Error('PostNL API returned error response');
          }
          
          // Save PDF label
          const labelPath = await saveLabelPDF(result, shipment.orderId, result.trackingCode);
          const labelFilename = labelPath ? path.basename(labelPath) : null;
          
          // Get file size if label was saved
          let fileSize = 0;
          if (labelPath) {
            try {
              const stats = await fs.stat(labelPath);
              fileSize = stats.size;
            } catch (error) {
              console.log('⚠️ Error getting file stats:', error.message);
            }
          }
          
          // Store label information
          const labelInfo = {
            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,
            messageId: messageId,
            trackAndTrace: result.trackingCode,
            labelPath: labelPath,
            labelFilename: labelFilename,
            status: 'created',
            createdAt: new Date().toISOString(),
            customerName: `${shipment.firstName || ''} ${shipment.lastName || ''}`.trim(),
            address: `${shipment.street || ''} ${shipment.houseNumber || ''}, ${shipment.zipcode || ''} ${shipment.city || ''}`,
            productCode: shipmentData.productCode,
            weight: shipmentData.weight,
            printed: false,
            printMessage: 'Label created successfully',
            trackingUrl: `https://postnl.nl/tracktrace/?B=${result.trackingCode}`,
            apiResponse: {
              messageId: result.messageId,
              success: result.success
            },
            processingTime: new Date().toISOString(),
            fileSize: fileSize
          };
          
          labels.push(labelInfo);
          
          successCount++;
          console.log(`✅ SHIPMENT ${i + 1} SUCCESS:`, JSON.stringify(labelInfo, null, 2));
          
          // Rate limiting
          console.log('😴 Waiting 1 second before next shipment...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          errorCount++;
          console.log(`❌ SHIPMENT ${i + 1} FAILED:`, error.message);
          console.log('Error stack:', error.stack);
          
          const errorInfo = {
            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,
            status: 'failed',
            error: error.message,
            createdAt: new Date().toISOString(),
            customerName: `${shipment.firstName || ''} ${shipment.lastName || ''}`.trim(),
            printed: false,
            printMessage: 'Label creation failed',
            errorDetails: {
              message: error.message,
              timestamp: new Date().toISOString()
            }
          };
          
          labels.push(errorInfo);
        }
      }
    } else {
      console.log('⚠️ No shipments provided for label creation');
      return {
        success: false,
        message: 'No shipments provided for label creation',
        labelsCreated: 0,
        labelsErrored: 0,
        totalProcessed: 0,
        labels: [],
        timestamp: new Date().toISOString()
      };
    }

    const duration = Date.now() - startTime;
    
    console.log('\n🏁 ===== FINAL RESULTS =====');
    console.log('Duration:', duration, 'ms');
    console.log('Success count:', successCount);
    console.log('Error count:', errorCount);
    console.log('Total processed:', successCount + errorCount);
    console.log('Labels created:', JSON.stringify(labels, null, 2));
    console.log('===== END FINAL RESULTS =====\n');

    const finalResult = {
      success: successCount > 0,
      message: `Created ${successCount} PostNL shipping labels${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
      labelsCreated: successCount,
      labelsErrored: errorCount,
      totalProcessed: successCount + errorCount,
      labels: labels,
      labelsDirectory: LABELS_DIR,
      timestamp: new Date().toISOString()
    };
    
    console.log('Returning final result:', JSON.stringify(finalResult, null, 2));
    return finalResult;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.log('\n💥 ===== CRITICAL ERROR IN createLabels =====');
    console.log('Duration:', duration, 'ms');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
    console.log('===== END CRITICAL ERROR =====\n');
    
    return {
      success: false,
      message: `Label creation failed: ${error.message}`,
      labelsCreated: 0,
      labelsErrored: 1,
      totalProcessed: 0,
      labels: [],
      labelsDirectory: LABELS_DIR,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

module.exports = { createLabels };
