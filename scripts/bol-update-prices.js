// scripts/bol-update-prices.js - BOL.com price update functionality
require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

// Access environment variables directly
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

console.log(`🔍 BOL Price Updates - CLIENT_ID: ${CLIENT_ID ? 'loaded' : 'missing'}`);
console.log(`🔍 BOL Price Updates - CLIENT_SECRET: ${CLIENT_SECRET ? 'loaded' : 'missing'}`);

// Config & helpers
const REQUEST_TIMEOUT = 10000;
const POLL_TIMEOUT = 5000;
const MAX_POLL_REQUESTS = 29;
const POLL_INTERVAL = 1000;
const delay = ms => new Promise(r => setTimeout(r, ms));

let token = null;
let tokenTimestamp = 0;

// Progress tracking
let currentProgress = {
  stage: 'idle',
  message: 'Ready to start',
  progress: 0,
  totalItems: 0,
  processedItems: 0,
  successCount: 0,
  errorCount: 0,
  isRunning: false,
  results: [],
  startTime: null,
  endTime: null
};

// Get BOL.com access token
async function getToken() {
  const maxAge = 4 * 60 * 1000; // 4 minutes
  if (!token || Date.now() - tokenTimestamp > maxAge) {
    try {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('BOL.com API credentials not configured');
      }

      const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const response = await axios.post(
        'https://login.bol.com/token?grant_type=client_credentials',
        null,
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            Accept: 'application/json'
          },
          timeout: REQUEST_TIMEOUT
        }
      );

      if (!response.data.access_token) {
        throw new Error('No access token received from BOL.com');
      }

      token = response.data.access_token;
      tokenTimestamp = Date.now();
      console.log('🔑 BOL.com token obtained for price updates');
      return token;
    } catch (error) {
      throw new Error(`BOL.com authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }
  return token;
}

// Update progress
function updateProgress(stage, message, progress = null, additionalData = {}) {
  currentProgress.stage = stage;
  currentProgress.message = message;
  if (progress !== null) currentProgress.progress = progress;
  
  Object.assign(currentProgress, additionalData);
  
  console.log(`📊 [${stage.toUpperCase()}] ${message} (${currentProgress.progress}%)`);
}

// Export offers from BOL.com
async function requestExport() {
  await getToken();
  const response = await axios.post(
    'https://api.bol.com/retailer/offers/export',
    { format: 'CSV' },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.retailer.v10+json',
        Accept: 'application/vnd.retailer.v10+json'
      },
      timeout: REQUEST_TIMEOUT
    }
  );
  
  console.log('✅ Export gestart, psId =', response.data.processStatusId);
  return response.data.processStatusId;
}

// Poll export status
async function pollExportStatus(psId) {
  while (true) {
    await getToken();
    const response = await axios.get(
      `https://api.bol.com/shared/process-status/${psId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.retailer.v10+json'
        },
        timeout: POLL_TIMEOUT
      }
    );
    
    console.log(`🔄 Export-status: ${response.data.status}`);
    
    if (response.data.status === 'SUCCESS') return response.data.entityId;
    if (response.data.status === 'FAILURE') {
      throw new Error(`Export mislukt: ${response.data.errorMessage}`);
    }
    
    await delay(5000);
  }
}

// Download CSV from BOL.com
async function downloadCsv(reportId) {
  await getToken();
  const response = await axios.get(
    `https://api.bol.com/retailer/offers/export/${reportId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.retailer.v10+csv'
      },
      responseType: 'text',
      timeout: REQUEST_TIMEOUT
    }
  );
  
  return response.data;
}

// Parse CSV data
function parseCsv(csvData) {
  const lines = csvData.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
  }
  
  return rows;
}

// Filter offers for price updates
function filterOffers(offers) {
  return offers
    .filter(offer => offer.offerId && offer.ean && offer.conditionName && offer.bundlePricesPrice)
    .map(offer => ({
      offerId: offer.offerId.trim(),
      ean: offer.ean.trim(),
      conditionName: offer.conditionName.toUpperCase().replace(/\s+/g, '_'),
      bundlePricesPrice: parseFloat(offer.bundlePricesPrice.replace(',', '.')) || 0
    }));
}

// Fetch competitor offers for EAN
async function fetchOffers(ean) {
  await getToken();
  let attempt = 0;
  
  while (true) {
    try {
      const response = await axios.get(
        `https://api.bol.com/retailer/products/${ean}/offers`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.retailer.v10+json'
          },
          params: {
            'country-code': 'NL',
            'best-offer-only': 'false',
            condition: 'ALL',
            page: 1
          },
          timeout: REQUEST_TIMEOUT
        }
      );
      
      return response.data.offers || [];
    } catch (err) {
      if (err.response?.status === 429 && attempt < 3) {
        const sec = err.response.headers['retry-after']
          ? +err.response.headers['retry-after']
          : Math.pow(2, attempt + 1);
        console.warn(`🔃 429 ontvangen, retry in ${sec}s (attempt ${attempt + 1})`);
        await delay(sec * 1000);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

// Calculate lowest prices per condition
function lowestPerCondition(offers) {
  const out = { NEW: 'N/A', AS_NEW: 'N/A', GOOD: 'N/A', REASONABLE: 'N/A', MODERATE: 'N/A' };
  
  for (const offer of offers) {
    if (out[offer.condition] === 'N/A' || offer.price < out[offer.condition]) {
      out[offer.condition] = offer.price;
    }
  }
  
  return out;
}

// Calculate advised price based on competition
function advisePrice(myPrice, myCond, competitors) {
  const explanation = [];
  const has = cond => competitors[cond] !== 'N/A';
  
  // Fallback if no competition
  if (!Object.values(competitors).some(v => v !== 'N/A')) {
    explanation.push('geen concurrentie, fallback €45,00');
    return { price: 45.00, explanation: explanation.join('; ') };
  }
  
  const candidates = [];
  
  switch (myCond) {
    case 'AS_NEW':
      if (has('AS_NEW')) candidates.push({ val: competitors.AS_NEW === myPrice ? myPrice : competitors.AS_NEW - 0.05, desc: 'AS_NEW -0.05' });
      if (has('GOOD')) candidates.push({ val: competitors.GOOD * 1.225, desc: 'GOOD×1.225' });
      if (has('REASONABLE')) candidates.push({ val: competitors.REASONABLE * 1.45, desc: 'REASONABLE×1.45' });
      if (!candidates.length && has('MODERATE')) candidates.push({ val: competitors.MODERATE * 1.625, desc: 'MODERATE×1.625' });
      break;
    case 'GOOD':
      if (has('GOOD')) candidates.push({ val: competitors.GOOD === myPrice ? myPrice : competitors.GOOD - 0.05, desc: 'GOOD -0.05' });
      else if (has('REASONABLE')) candidates.push({ val: competitors.REASONABLE * 1.225, desc: 'REASONABLE×1.225' });
      else if (has('AS_NEW')) candidates.push({ val: competitors.AS_NEW * 0.775, desc: 'AS_NEW×0.775' });
      else if (has('MODERATE')) candidates.push({ val: competitors.MODERATE * 1.45, desc: 'MODERATE×1.45' });
      break;
    case 'REASONABLE':
      if (has('REASONABLE')) candidates.push({ val: competitors.REASONABLE === myPrice ? myPrice : competitors.REASONABLE - 0.05, desc: 'REASONABLE -0.05' });
      else if (has('GOOD')) candidates.push({ val: competitors.GOOD * 0.775, desc: 'GOOD×0.775' });
      else if (has('AS_NEW')) candidates.push({ val: competitors.AS_NEW * 0.70 * 0.775, desc: 'AS_NEW×0.70×0.775' });
      else if (has('MODERATE')) candidates.push({ val: competitors.MODERATE * 1.225, desc: 'MODERATE×1.225' });
      break;
    case 'MODERATE':
      candidates.push({ val: has('MODERATE') ? competitors.MODERATE - 0.05 : myPrice, desc: 'MODERATE -0.05' });
      break;
    case 'NEW':
      if (has('NEW')) candidates.push({ val: competitors.NEW === myPrice ? myPrice : competitors.NEW - 0.01, desc: 'NEW -0.01' });
      break;
  }
  
  let { val: rec, desc } = candidates.reduce((a, b) => a.val <= b.val ? a : b);
  explanation.push(`keuze: ${desc}`);

  // Enforce 22.5% discount compared to higher condition
  const CONDITIONS = ['NEW', 'AS_NEW', 'GOOD', 'REASONABLE', 'MODERATE'];
  const idx = CONDITIONS.indexOf(myCond);
  
  for (let j = idx - 1; j >= 0; j--) {
    const up = CONDITIONS[j];
    if (has(up)) {
      const threshold = competitors[up] * Math.pow(0.775, idx - j);
      if (rec > threshold) {
        explanation.push(`enforce ≤${threshold.toFixed(2)} (22,5% korting vanaf ${up})`);
        rec = threshold;
      }
      break;
    }
  }

  // Minimum price
  if (rec < 7.5) {
    explanation.push('ondergrens €7,50');
    rec = 7.5;
  }
  
  rec = parseFloat(rec.toFixed(2));
  explanation.push(`afrond → ${rec}`);

  return { price: rec, explanation: explanation.join('; ') };
}

// Update offer price
async function updateOfferPrice(offerId, price) {
  await getToken();
  const response = await axios.put(
    `https://api.bol.com/retailer/offers/${offerId}/price`,
    { pricing: { bundlePrices: [{ quantity: 1, unitPrice: price }] } },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.retailer.v10+json',
        'Content-Type': 'application/vnd.retailer.v10+json'
      },
      timeout: REQUEST_TIMEOUT
    }
  );
  
  console.log(`🔃 Update gestart voor ${offerId} (psId=${response.data.processStatusId})`);
  return response.data.processStatusId;
}

// Main price update function
async function updatePrices() {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting BOL.com price update process...');
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('BOL.com API credentials not configured');
    }

    // Reset progress
    currentProgress = {
      stage: 'starting',
      message: 'Initializing price update process...',
      progress: 0,
      totalItems: 0,
      processedItems: 0,
      successCount: 0,
      errorCount: 0,
      isRunning: true,
      results: [],
      startTime: new Date().toISOString(),
      endTime: null
    };

    // Step 1: Export offers
    updateProgress('exporting', 'Requesting offers export from BOL.com...', 5);
    const expPsId = await requestExport();
    
    updateProgress('exporting', 'Waiting for export to complete...', 10);
    const repId = await pollExportStatus(expPsId);
    
    updateProgress('downloading', 'Downloading offers data...', 20);
    const csvData = await downloadCsv(repId);
    
    updateProgress('processing', 'Processing offers data...', 25);
    const allOffers = parseCsv(csvData);
    const filteredOffers = filterOffers(allOffers);
    
    console.log(`📊 Found ${filteredOffers.length} offers to process`);
    currentProgress.totalItems = filteredOffers.length;
    
    // Step 2: Process each offer
    updateProgress('calculating', 'Calculating new prices...', 30);
    const results = [];
    
    for (let i = 0; i < filteredOffers.length; i++) {
      const offer = filteredOffers[i];
      currentProgress.processedItems = i + 1;
      currentProgress.progress = 30 + Math.round((i / filteredOffers.length) * 50);
      
      updateProgress('calculating', `Processing ${offer.ean} (${i + 1}/${filteredOffers.length})...`);
      
      try {
        // Fetch competitor offers
        const competitorOffers = await fetchOffers(offer.ean);
        const competitors = lowestPerCondition(competitorOffers);
        
        // Calculate advised price
        const { price: advisedPrice, explanation } = advisePrice(
          offer.bundlePricesPrice,
          offer.conditionName,
          competitors
        );
        
        // Update price if different
        let processStatusId = null;
        if (Math.abs(advisedPrice - offer.bundlePricesPrice) >= 0.01) {
          processStatusId = await updateOfferPrice(offer.offerId, advisedPrice);
        }
        
        const result = {
          ean: offer.ean,
          offerId: offer.offerId,
          condition: offer.conditionName,
          oldPrice: offer.bundlePricesPrice,
          newPrice: advisedPrice,
          explanation: explanation,
          processStatusId: processStatusId,
          status: processStatusId ? 'updating' : 'no_change',
          updatedAt: new Date().toISOString()
        };
        
        results.push(result);
        currentProgress.results = results;
        
        if (processStatusId) {
          currentProgress.successCount++;
        }
        
        // Rate limiting
        await delay(200);
        
      } catch (error) {
        console.error(`❌ Error processing ${offer.ean}:`, error.message);
        currentProgress.errorCount++;
        
        results.push({
          ean: offer.ean,
          offerId: offer.offerId,
          condition: offer.conditionName,
          oldPrice: offer.bundlePricesPrice,
          newPrice: 'ERROR',
          explanation: error.message,
          processStatusId: null,
          status: 'error',
          updatedAt: new Date().toISOString()
        });
      }
    }
    
    // Step 3: Poll for completion
    updateProgress('finalizing', 'Waiting for price updates to complete...', 85);
    const pending = new Set(results.filter(r => r.processStatusId).map(r => r.processStatusId));
    
    while (pending.size > 0) {
      const batch = Array.from(pending).slice(0, MAX_POLL_REQUESTS);
      
      await Promise.all(batch.map(async psId => {
        try {
          await getToken();
          const response = await axios.get(
            `https://api.bol.com/shared/process-status/${psId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.retailer.v10+json'
              },
              timeout: POLL_TIMEOUT
            }
          );
          
          if (response.data.status === 'SUCCESS') {
            pending.delete(psId);
            const result = results.find(r => r.processStatusId === psId);
            if (result) result.status = 'completed';
          } else if (response.data.status === 'FAILURE') {
            pending.delete(psId);
            const result = results.find(r => r.processStatusId === psId);
            if (result) {
              result.status = 'failed';
              result.explanation += ` (Update failed: ${response.data.errorMessage})`;
            }
          }
        } catch {
          // Ignore polling errors, try again later
        }
      }));
      
      if (pending.size > 0) {
        await delay(POLL_INTERVAL);
      }
    }
    
    // Step 4: Generate report
    updateProgress('reporting', 'Generating price update report...', 95);
    await generateReport(results);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    const completedUpdates = results.filter(r => r.status === 'completed').length;
    
    updateProgress('completed', `Price update completed! ${completedUpdates} prices updated successfully.`, 100, {
      isRunning: false,
      endTime: new Date().toISOString(),
      duration: `${duration}s`
    });
    
    console.log(`✅ Price update completed in ${duration}s`);
    console.log(`📊 Results: ${completedUpdates} updated, ${currentProgress.errorCount} errors`);
    
    return {
      success: true,
      message: `Price update completed! ${completedUpdates} prices updated successfully.`,
      totalProcessed: results.length,
      updatedCount: completedUpdates,
      errorCount: currentProgress.errorCount,
      duration: `${duration}s`,
      results: results
    };

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`❌ Price update failed after ${duration}s:`, error.message);
    
    updateProgress('error', `Price update failed: ${error.message}`, currentProgress.progress, {
      isRunning: false,
      endTime: new Date().toISOString(),
      error: error.message
    });
    
    return {
      success: false,
      message: `Price update failed: ${error.message}`,
      totalProcessed: 0,
      updatedCount: 0,
      errorCount: 1,
      duration: `${duration}s`,
      error: error.message
    };
  }
}

// Generate Excel report
async function generateReport(results) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Price Updates');
    
    ws.columns = [
      { header: 'EAN', width: 15 },
      { header: 'OfferId', width: 36 },
      { header: 'Condition', width: 12 },
      { header: 'Old Price (€)', width: 12 },
      { header: 'New Price (€)', width: 12 },
      { header: 'Explanation', width: 50 },
      { header: 'Status', width: 10 },
      { header: 'Updated At', width: 20 }
    ];
    
    results.forEach(result => {
      ws.addRow([
        result.ean,
        result.offerId,
        result.condition,
        result.oldPrice,
        result.newPrice,
        result.explanation,
        result.status === 'completed' ? '✅' : result.status === 'error' ? '❌' : '⏳',
        result.updatedAt
      ]);
    });
    
    // Ensure reports directory exists
    const reportsDir = path.join(process.cwd(), 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `price-update-report-${timestamp}.xlsx`;
    const filepath = path.join(reportsDir, filename);
    
    await wb.xlsx.writeFile(filepath);
    console.log('💾 Rapport opgeslagen als', filename);
    
    return filepath;
  } catch (error) {
    console.error('❌ Error generating report:', error.message);
    return null;
  }
}

// Get current progress
function getProgress() {
  return { ...currentProgress };
}

// Reset progress
function resetProgress() {
  currentProgress = {
    stage: 'idle',
    message: 'Ready to start',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    isRunning: false,
    results: [],
    startTime: null,
    endTime: null
  };
}

module.exports = {
  updatePrices,
  getProgress,
  resetProgress
};
