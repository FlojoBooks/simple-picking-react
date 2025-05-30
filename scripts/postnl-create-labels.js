// scripts/postnl-create-labels.js - Enhanced with detailed logging for debugging
require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// PostNL API Configuration
const POSTNL_CONFIG = {
  API_KEY: process.env.API_KEY,
  API_URL: process.env.API_URL || 'https://api-sandbox.postnl.nl',
  CUSTOMER_NUMBER: process.env.CUSTOMER_NUMBER,
  CUSTOMER_CODE: process.env.CUSTOMER_CODE,
  COLLECTION_LOCATION: process.env.COLLECTION_LOCATION
};

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

// Labels directory
const LABELS_DIR = path.join(__dirname, '..', 'uploads', 'labels');

// Enhanced logging function
function detailedLog(category, message, data = null, level = 'info') {
  const timestamp = new Date().toISOString();
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', debug: '🔍' };
  const icon = icons[level] || 'ℹ️';
  
  console.log(`${icon} [${timestamp}] [POSTNL-${category.toUpperCase()}] ${message}`);
  
  if (data) {
    console.log(`   📊 Data:`, JSON.stringify(data, null, 2));
  }
}

// Ensure labels directory exists
async function ensureLabelsDirectory() {
  try {
    await fs.access(LABELS_DIR);
    detailedLog('setup', `Labels directory exists: ${LABELS_DIR}`, null, 'debug');
  } catch {
    await fs.mkdir(LABELS_DIR, { recursive: true });
    detailedLog('setup', `Created labels directory: ${LABELS_DIR}`, null, 'success');
  }
}

// Validate PostNL configuration
function validatePostNLConfig() {
  const requiredFields = ['API_KEY', 'CUSTOMER_NUMBER', 'CUSTOMER_CODE', 'COLLECTION_LOCATION'];
  const missingFields = requiredFields.filter(field => !POSTNL_CONFIG[field]);
  
  detailedLog('config', 'Validating PostNL configuration', {
    requiredFields,
    configStatus: requiredFields.map(field => ({
      field,
      hasValue: !!POSTNL_CONFIG[field],
      valueLength: POSTNL_CONFIG[field] ? POSTNL_CONFIG[field].length : 0,
      isPlaceholder: POSTNL_CONFIG[field] && POSTNL_CONFIG[field].includes('your_')
    })),
    missingFields,
    apiUrl: POSTNL_CONFIG.API_URL
  }, 'debug');
  
  if (missingFields.length > 0) {
    throw new Error(`PostNL configuration incomplete. Missing: ${missingFields.join(', ')}`);
  }
  
  detailedLog('config', 'PostNL configuration validated successfully', null, 'success');
}

// Generate PostNL tracking code
function generatePostNLTrackingCode() {
  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let trackingCode = '3S';
  
  for (let i = 0; i < 13; i++) {
    trackingCode += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  const finalCode = trackingCode + 'NL';
  detailedLog('tracking', `Generated tracking code: ${finalCode}`, null, 'debug');
  return finalCode;
}

// Validate tracking code format
function validateTrackingCode(trackingCode) {
  const pattern = /^3S[0-9A-Z]{13}NL$/;
  const isValid = pattern.test(trackingCode);
  detailedLog('tracking', `Tracking code validation`, {
    trackingCode,
    pattern: pattern.toString(),
    isValid
  }, isValid ? 'success' : 'warning');
  return isValid;
}

// Create PostNL shipping label
async function createPostNLLabel(shipmentData) {
  const startTime = Date.now();
  
  try {
    detailedLog('label-creation', 'Starting PostNL label creation', {
      shipmentData,
      timestamp: new Date().toISOString()
    }, 'info');
    
    if (!shipmentData.receiver) {
      throw new Error('Receiver information is required');
    }
    
    const apiUrl = `${POSTNL_CONFIG.API_URL}/shipment/v2_2/label`;
    const messageId = shipmentData.messageId || `MSG_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const trackingCode = shipmentData.trackingCode || generatePostNLTrackingCode();
    
    if (!validateTrackingCode(trackingCode)) {
      detailedLog('label-creation', `Invalid tracking code format: ${trackingCode}`, null, 'warning');
    }

    // Prepare delivery date (tomorrow by default)
    const deliveryDate = shipmentData.deliveryDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    detailedLog('label-creation', 'Prepared label request parameters', {
      apiUrl,
      messageId,
      trackingCode,
      deliveryDate,
      productCode: shipmentData.productCode || '3085',
      weight: parseInt(shipmentData.weight) || parseInt(process.env.DEFAULT_WEIGHT) || 1000
    }, 'debug');
    
    // Build the label payload
    const labelPayload = {
      Customer: {
        CustomerNumber: POSTNL_CONFIG.CUSTOMER_NUMBER,
        CustomerCode: POSTNL_CONFIG.CUSTOMER_CODE,
        CollectionLocation: POSTNL_CONFIG.COLLECTION_LOCATION
      },
      Message: {
        MessageID: messageId,
        MessageTimeStamp: new Date().toISOString(),
        Printertype: 'GraphicFile|PDF'
      },
      Shipments: [{
        Addresses: [
          {
            AddressType: '01', // Sender
            CompanyName: SENDER_INFO.companyName,
            FirstName: SENDER_INFO.firstName,
            Name: SENDER_INFO.lastName,
            Street: SENDER_INFO.street,
            HouseNr: SENDER_INFO.houseNumber,
            HouseNrExt: SENDER_INFO.houseNumberExt,
            Zipcode: SENDER_INFO.zipcode,
            City: SENDER_INFO.city,
            Countrycode: SENDER_INFO.countryCode,
            Email: SENDER_INFO.email
          },
          {
            AddressType: '02', // Receiver
            CompanyName: shipmentData.receiver.companyName || '',
            FirstName: shipmentData.receiver.firstName || '',
            Name: shipmentData.receiver.lastName || 'Receiver',
            Street: shipmentData.receiver.street || '',
            HouseNr: shipmentData.receiver.houseNumber || '1',
            HouseNrExt: shipmentData.receiver.houseNumberExt || '',
            Zipcode: shipmentData.receiver.zipcode || '1000AA',
            City: shipmentData.receiver.city || 'Amsterdam',
            Countrycode: shipmentData.receiver.countryCode || 'NL',
            Email: shipmentData.receiver.email || ''
          }
        ],
        ProductCodeDelivery: shipmentData.productCode || '3085',
        PhaseCode: '1',
        Reference: shipmentData.reference || trackingCode,
        DeliveryDate: deliveryDate,
        Barcode: trackingCode,
        Dimension: {
          Weight: parseInt(shipmentData.weight) || parseInt(process.env.DEFAULT_WEIGHT) || 1000
        },
        ProductOptions: [
          {
            Option: '01',
            Characteristic: shipmentData.productCode === '2928' ? '006' : '118'
          }
        ]
      }]
    };

    detailedLog('label-creation', `Prepared PostNL API payload`, {
      customer: labelPayload.Customer,
      message: labelPayload.Message,
      shipmentAddresses: labelPayload.Shipments[0].Addresses,
      productCode: labelPayload.Shipments[0].ProductCodeDelivery,
      weight: labelPayload.Shipments[0].Dimension.Weight,
      productOptions: labelPayload.Shipments[0].ProductOptions
    }, 'debug');

    detailedLog('label-creation', `Making API call to PostNL`, {
      url: apiUrl,
      method: 'POST',
      hasApiKey: !!POSTNL_CONFIG.API_KEY,
      apiKeyLength: POSTNL_CONFIG.API_KEY ? POSTNL_CONFIG.API_KEY.length : 0,
      receiverInfo: `${shipmentData.receiver.firstName} ${shipmentData.receiver.lastName}`,
      receiverAddress: `${shipmentData.receiver.street} ${shipmentData.receiver.houseNumber}, ${shipmentData.receiver.zipcode} ${shipmentData.receiver.city}`
    }, 'info');

    const response = await axios.post(apiUrl, labelPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': POSTNL_CONFIG.API_KEY
      },
      timeout: 30000
    });

    const duration = Date.now() - startTime;
    detailedLog('label-creation', `PostNL API response received in ${duration}ms`, {
      status: response.status,
      statusText: response.statusText,
      hasData: !!response.data,
      responseKeys: response.data ? Object.keys(response.data) : [],
      duration: `${duration}ms`
    }, 'success');
    
    // Log response structure for debugging
    if (response.data) {
      detailedLog('api-response', 'PostNL API response structure', {
        hasLabels: !!(response.data.Labels),
        labelsCount: response.data.Labels ? response.data.Labels.length : 0,
        hasResponseShipments: !!(response.data.ResponseShipments),
        responseShipmentsCount: response.data.ResponseShipments ? response.data.ResponseShipments.length : 0,
        firstLabelKeys: response.data.Labels && response.data.Labels.length > 0 ? Object.keys(response.data.Labels[0]) : [],
        responseDataKeys: Object.keys(response.data)
      }, 'debug');
      
      if (response.data.Labels && response.data.Labels.length > 0) {
        const firstLabel = response.data.Labels[0];
        detailedLog('api-response', 'First label details', {
          hasContent: !!firstLabel.Content,
          contentLength: firstLabel.Content ? firstLabel.Content.length : 0,
          contentType: firstLabel.Contenttype,
          labeltype: firstLabel.Labeltype
        }, 'debug');
      }
    }
    
    // Extract final tracking code from response
    let finalTrackingCode = trackingCode;
    if (response.data.ResponseShipments && response.data.ResponseShipments.length > 0) {
      const responseShipment = response.data.ResponseShipments[0];
      if (responseShipment.Barcode) {
        finalTrackingCode = responseShipment.Barcode;
        detailedLog('label-creation', `Updated tracking code from PostNL response: ${finalTrackingCode}`, null, 'info');
      }
    }

    return {
      ...response.data,
      trackingCode: finalTrackingCode,
      messageId: messageId,
      success: true
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    detailedLog('label-creation', `PostNL API error after ${duration}ms`, {
      error: {
        message: error.message,
        name: error.name,
        code: error.code
      },
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      } : null,
      request: error.request ? {
        method: error.request.method,
        url: error.request.url,
        timeout: error.request.timeout
      } : null,
      duration: `${duration}ms`
    }, 'error');
    
    // Enhanced error handling
    if (error.response?.data?.fault) {
      throw new Error(`PostNL API error: ${error.response.data.fault.faultstring}`);
    } else if (error.response?.status === 401) {
      throw new Error('PostNL API authentication failed. Check your API key.');
    } else if (error.response?.status === 400) {
      const errorMsg = error.response.data?.message || 'Invalid request data';
      detailedLog('label-creation', 'PostNL API bad request details', {
        requestData: error.config?.data ? JSON.parse(error.config.data) : null,
        responseData: error.response.data
      }, 'error');
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

// Save label PDF
async function saveLabelPDF(labelData, orderId, trackingCode) {
  try {
    detailedLog('pdf-save', 'Starting PDF save process', {
      orderId,
      trackingCode,
      hasLabels: !!(labelData.Labels),
      labelsCount: labelData.Labels ? labelData.Labels.length : 0
    }, 'debug');
    
    if (!labelData.Labels || labelData.Labels.length === 0) {
      detailedLog('pdf-save', 'No label data found in response', { labelData }, 'warning');
      return null;
    }
    
    const label = labelData.Labels[0];
    if (!label.Content) {
      detailedLog('pdf-save', 'No label content found in response', { label }, 'warning');
      return null;
    }
    
    // Ensure labels directory exists
    await ensureLabelsDirectory();
    
    // The label content is base64 encoded PDF
    const pdfBuffer = Buffer.from(label.Content, 'base64');
    
    // Create filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `label_${orderId}_${trackingCode}_${timestamp}.pdf`;
    const filePath = path.join(LABELS_DIR, filename);
    
    detailedLog('pdf-save', 'Writing PDF file', {
      filename,
      filePath,
      bufferSize: pdfBuffer.length,
      timestamp
    }, 'debug');
    
    await fs.writeFile(filePath, pdfBuffer);
    
    // Verify file was written
    const stats = await fs.stat(filePath);
    
    detailedLog('pdf-save', `Label PDF saved successfully`, {
      filename,
      fileSize: stats.size,
      writtenBytes: pdfBuffer.length,
      filePath
    }, 'success');
    
    return filePath;
    
  } catch (error) {
    detailedLog('pdf-save', 'Error saving label PDF', {
      error: {
        message: error.message,
        name: error.name,
        code: error.code
      },
      orderId,
      trackingCode
    }, 'error');
    return null;
  }
}

// Main export function
async function createLabels(shipments = null) {
  const startTime = Date.now();
  
  try {
    detailedLog('main', 'Starting PostNL label creation process', {
      shipmentsProvided: !!(shipments),
      shipmentsCount: shipments ? shipments.length : 0,
      timestamp: new Date().toISOString()
    }, 'info');
    
    // Validate PostNL configuration
    validatePostNLConfig();
    
    // Ensure labels directory exists
    await ensureLabelsDirectory();
    
    let labels = [];
    let successCount = 0;
    let errorCount = 0;

    // Process provided shipments
    if (shipments && Array.isArray(shipments) && shipments.length > 0) {
      detailedLog('main', `Processing ${shipments.length} shipments for label creation`, {
        shipments: shipments.map((s, i) => ({
          index: i,
          orderId: s.orderId,
          firstName: s.firstName,
          lastName: s.lastName,
          city: s.city,
          productCode: s.productCode
        }))
      }, 'info');
      
      for (let i = 0; i < shipments.length; i++) {
        const shipment = shipments[i];
        
        detailedLog('shipment-process', `Processing shipment ${i + 1}/${shipments.length}`, {
          shipmentIndex: i,
          orderId: shipment.orderId,
          customer: `${shipment.firstName} ${shipment.lastName}`,
          address: `${shipment.street} ${shipment.houseNumber}, ${shipment.zipcode} ${shipment.city}`
        }, 'info');
        
        try {
          // Validate shipment data
          if (!shipment.orderId) {
            throw new Error('Order ID is required');
          }
          
          // Prepare shipment data
          const messageId = `MSG_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const trackingCode = generatePostNLTrackingCode();
          
          const shipmentData = {
            messageId: messageId,
            trackingCode: trackingCode,
            receiver: {
              companyName: shipment.companyName || '',
              firstName: shipment.firstName || 'Customer',
              lastName: shipment.lastName || 'Customer',
              street: shipment.street || 'Unknown Street',
              houseNumber: shipment.houseNumber || '1',
              houseNumberExt: shipment.houseNumberExt || '',
              zipcode: shipment.zipcode || '1000AA',
              city: shipment.city || 'Amsterdam',
              countryCode: shipment.countryCode || 'NL',
              email: shipment.email || ''
            },
            productCode: shipment.productCode || '3085',
            reference: shipment.orderId || trackingCode,
            weight: parseInt(shipment.weight) || 1000
          };

          detailedLog('shipment-process', 'Prepared shipment data for API call', {
            shipmentData,
            messageId,
            trackingCode
          }, 'debug');

          // Create the label via PostNL API
          const result = await createPostNLLabel(shipmentData);
          
          if (!result.success) {
            throw new Error('PostNL API returned error response');
          }
          
          // Save PDF label
          const labelPath = await saveLabelPDF(result, shipment.orderId, result.trackingCode || trackingCode);
          const labelFilename = labelPath ? path.basename(labelPath) : null;
          
          // Get file size if label was saved
          let fileSize = 0;
          if (labelPath) {
            try {
              const stats = await fs.stat(labelPath);
              fileSize = stats.size;
            } catch (error) {
              detailedLog('shipment-process', 'Error getting file stats', { error: error.message }, 'warning');
            }
          }
          
          // Store label information
          labels.push({
            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,
            messageId: messageId,
            trackAndTrace: result.trackingCode || trackingCode,
            labelPath: labelPath,
            labelFilename: labelFilename,
            status: 'created',
            createdAt: new Date().toISOString(),
            customerName: `${shipment.firstName || ''} ${shipment.lastName || ''}`.trim(),
            address: `${shipment.street || ''} ${shipment.houseNumber || ''}, ${shipment.zipcode || ''} ${shipment.city || ''}`,
            productCode: shipmentData.productCode,
            weight: shipmentData.weight,
            printed: false, // Simplified - no printing integration
            printMessage: 'Label created successfully',
            trackingUrl: `https://postnl.nl/tracktrace/?B=${result.trackingCode || trackingCode}`,
            
            // Enhanced metadata
            apiResponse: {
              messageId: result.messageId,
              success: result.success
            },
            processingTime: new Date().toISOString(),
            fileSize: fileSize
          });
          
          successCount++;
          detailedLog('shipment-process', `Label created successfully for order ${shipment.orderId}`, {
            trackingCode: result.trackingCode || trackingCode,
            labelFilename,
            fileSize
          }, 'success');
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          errorCount++;
          detailedLog('shipment-process', `Failed to create label for order ${shipment.orderId}`, {
            error: {
              message: error.message,
              name: error.name,
              stack: error.stack
            },
            shipment
          }, 'error');
          
          labels.push({
            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,
            status: 'failed',
            error: error.message,
            createdAt: new Date().toISOString(),
            customerName: `${shipment.firstName || ''} ${shipment.lastName || ''}`.trim(),
            printed: false,
            printMessage: 'Label creation failed',
            
            // Error metadata
            errorDetails: {
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    } else {
      detailedLog('main', 'No shipments provided for label creation', null, 'warning');
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
    detailedLog('main', `PostNL label creation completed in ${duration}ms`, {
      successCount,
      errorCount,
      totalProcessed: successCount + errorCount,
      labelsDirectory: LABELS_DIR,
      duration: `${duration}ms`
    }, 'success');

    return {
      success: successCount > 0,
      message: `Created ${successCount} PostNL shipping labels${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
      labelsCreated: successCount,
      labelsErrored: errorCount,
      totalProcessed: successCount + errorCount,
      labels: labels,
      labelsDirectory: LABELS_DIR,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    detailedLog('main', `Critical error in createLabels after ${duration}ms`, {
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      duration: `${duration}ms`
    }, 'error');
    
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
