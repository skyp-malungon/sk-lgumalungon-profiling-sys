/**
 * SK YOUTH MANAGEMENT SYSTEM - REST API BACKEND
 */

const CONFIG = {
  SPREADSHEET_ID: '1shTi8-72Zdue1AnjOxRxDBM8Z5CfGmmYYz56trYCeYc',
  SHEET_NAME: 'skypDatabase',
  LOGS_SHEET_NAME: 'skypLogs',
  USERS_SHEET_NAME: 'skypUsers', 
  
  // --- NEW: ONLINE DB CONFIG ---
  ONLINE_DB_ID: '1shTi8-72Zdue1AnjOxRxDBM8Z5CfGmmYYz56trYCeYc', // <-- Replace with the ID of your Web Form spreadsheet
  ONLINE_SHEET_NAME: 'eProfiling',         // <-- Check if your online tab is named this
  STAGING_SHEET_NAME: 'Online_Staging',          // <-- The new tab you will create in your Admin DB
  
  // --- MASTER AUTHENTICATION CREDENTIALS ---
  ADMIN_USER: 'admin',
  ADMIN_PASS: 'malungonsk2024', 
  AUTH_TOKEN: 'sk_secure_token_98765' 
};

// --- USER MANAGEMENT HELPERS ---

function getUserSheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.USERS_SHEET_NAME);
}

// Validates token and returns user info
function getUserByToken(token) {
  if (!token) return null;
  if (token === CONFIG.AUTH_TOKEN) return { role: 'Admin', barangay: 'All' }; // Master Admin

  const sheet = getUserSheet();
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  const headers = data[0].map(h => String(h || '').trim());
  const tokenIdx = headers.indexOf('Token');
  const roleIdx = headers.indexOf('Role');
  const brgyIdx = headers.indexOf('Barangay');

  if (tokenIdx === -1) return null;

  const trimmedToken = String(token).trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][tokenIdx] || '').trim() === trimmedToken) {
      return {
        role: data[i][roleIdx] || 'Barangay User',
        barangay: data[i][brgyIdx] || ''
      };
    }
  }
  return null;
}

// --- API ROUTING ---

function doGet(e) {
  if (!e || !e.parameter || !e.parameter.action) {
    return toJSON({ success: false, message: 'No action specified.' });
  }

  const currentUser = getUserByToken(e.parameter.token);
  if (!currentUser) {
     return toJSON({ success: false, message: 'Unauthorized Access. Please login.' });
  }

  const action = e.parameter.action;
  let result;

  try {
    if (action === 'getDashboardData') {
      result = getDashboardData(currentUser);
    } else if (action === 'getFilteredDashboardData') {
      let filterBrgy = e.parameter.barangay;
      if (currentUser.role !== 'Admin') filterBrgy = currentUser.barangay;
      
      // NEW: Pass "sitio" parameter to the function
      result = getFilteredDashboardData(filterBrgy, e.parameter.sitio, e.parameter.sex, e.parameter.tribe, e.parameter.eligibility, currentUser);
    } else if (action === 'getAuditLogs') {
      result = { success: true, logs: getAuditLogs(currentUser) };
    } else {
      result = { success: false, message: 'Unknown GET action' };
    }
  } catch (error) {
    result = { success: false, message: error.toString() };
  }

  return toJSON(result);
}

function doPost(e) {
  let result;
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    // --- 1. HANDLE LOGIN & REGISTRATION ---
    if (action === 'login') {
      return toJSON(processLogin(payload.username, payload.password));
    }
    if (action === 'register') {
      // NEW: Pass the masterKey to the registration function
      return toJSON(registerUser(payload.username, payload.password, payload.barangay, payload.masterKey));
    }

    // --- 2. SECURITY CHECK ---
    const currentUser = getUserByToken(payload.token);
    if (!currentUser) {
       return toJSON({ success: false, message: 'Unauthorized Access.' });
    }

    // --- 3. PROCESS SECURE ACTIONS ---
   if (action === 'updateRecord') {
      result = updateRecord(payload.uid, payload.updatedData, currentUser);
    } else if (action === 'deleteRecord') {
      result = deleteRecord(payload.uid, currentUser);
    } else if (action === 'syncOnlineData') {
      // NEW: Route for the sync button
      result = syncOnlineData(currentUser); 
    } else {
      result = { success: false, message: 'Unknown POST action' };
    }
  } catch (error) {
    result = { success: false, message: error.toString() };
  }

  return toJSON(result);
}

function processLogin(username, password) {
  // Check Master Admin first
  if (username === CONFIG.ADMIN_USER && password === CONFIG.ADMIN_PASS) {
    return { success: true, token: CONFIG.AUTH_TOKEN, role: 'Admin', barangay: 'All' };
  }

  const sheet = getUserSheet();
  if(!sheet) return { success: false, message: 'System configuration error. Users sheet missing.' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: 'Invalid username or password' };
  
  const headers = data[0].map(h => String(h || '').trim());
  const userIdx = headers.indexOf('Username');
  const passIdx = headers.indexOf('Password');
  let tokenIdx = headers.indexOf('Token');

  if (tokenIdx === -1) {
    tokenIdx = headers.length;
    sheet.getRange(1, tokenIdx + 1).setValue('Token');
  }

  for (let i = 1; i < data.length; i++) {
    // FIX: Convert both sheet data and input to Strings so numbers match text perfectly
    let sheetUser = String(data[i][userIdx]).trim();
    let sheetPass = String(data[i][passIdx]).trim();
    let inputUser = String(username).trim();
    let inputPass = String(password).trim();

    if (sheetUser === inputUser && sheetPass === inputPass) {
      const newToken = Utilities.getUuid(); // Generate secure session token
      sheet.getRange(i + 1, tokenIdx + 1).setValue(newToken);
      
      return {
        success: true,
        token: newToken,
        role: data[i][headers.indexOf('Role')] || 'Barangay User',
        barangay: data[i][headers.indexOf('Barangay')]
      };
    }
  }
  return { success: false, message: 'Invalid username or password' };
}

function registerUser(username, password, barangay, masterKey) {
  const sheet = getUserSheet();
  if(!sheet) return { success: false, message: 'System error: Users sheet missing.' };
  if(!username || !password || !barangay) return { success: false, message: 'All fields are required.' };

  let role = 'Barangay User';
  let assignedBarangay = barangay;

  // --- NEW: ADMIN REGISTRATION LOGIC ---
  if (barangay === 'System Admin') {
    // Check against the default password in CONFIG
    if (masterKey !== CONFIG.ADMIN_PASS) {
      return { success: false, message: 'Incorrect Default Admin Password! Registration denied.' };
    }
    role = 'Admin';
    assignedBarangay = 'All'; // Admins have access to everything
  }

  const data = sheet.getDataRange().getValues();
  if(data.length > 1) {
    const userIdx = data[0].indexOf('Username');
    for(let i=1; i<data.length; i++) {
      if(String(data[i][userIdx]).trim() === String(username).trim()) {
        return { success: false, message: 'Username already exists!' };
      }
    }
  }

  // Save the new user to the skypUsers sheet
  sheet.appendRow([username, password, assignedBarangay, role, '']);
  return { success: true, message: 'Account created successfully! You can now log in.' };
}

function toJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// --- CORE LOGIC ---

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function getAgeBracket(age) {
  if (age === null || age === undefined) return 'Unknown';
  if (age < 15) return 'Below 15';
  if (age >= 15 && age <= 17) return 'Youth (15–17)';
  if (age >= 18 && age <= 24) return 'Youth (18–24)';
  if (age >= 25 && age <= 29) return 'Youth (25–29)';
  return '30+';
}

function cleanTribeData(tribe) {
  if (!tribe) return 'Not Specified';
  const tribeStr = tribe.toString().trim();
  if (['', 'none', 'n/a', 'not applicable', 'na'].includes(tribeStr.toLowerCase())) return 'Not Specified';
  return tribeStr;
}

function getSheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
}

// NEW: Data is filtered at the root level based on the logged-in user
function getAllData(currentUser) {
  try {
    // Automatically ensure all records have UIDs
    generateMissingUIDs();

    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const headers = data[0].map(h => String(h || '').trim());
    const dobIdx = headers.indexOf('Date of Birth');
    const uidIdx = headers.indexOf('UID');
    const brgyIdx = headers.indexOf('Barangay');

    let records = data.slice(1).map((row, index) => {
      const record = {};
      headers.forEach((header, colIndex) => {
        let val = row[colIndex];
        if (val instanceof Date) val = val.toLocaleDateString();
        record[header] = val !== undefined && val !== null ? val : '';
      });

      const calculatedAge = dobIdx !== -1 ? calculateAge(row[dobIdx]) : null;
      record.calculatedAge = calculatedAge;
      record.ageBracket = getAgeBracket(calculatedAge);
      record['Tribe'] = cleanTribeData(record['Tribe']);
      record.rowIndex = index + 2;
      record.uid = (uidIdx !== -1 && row[uidIdx]) ? String(row[uidIdx]).trim() : ('REC_' + (index + 2)); 
      
      return record;
    });

    // CRITICAL: Filter data so users only see their barangay
    if (currentUser && currentUser.role !== 'Admin') {
       const userBrgy = String(currentUser.barangay || '').trim().toLowerCase();
       records = records.filter(r => String(r.Barangay || '').trim().toLowerCase() === userBrgy);
    }

    return records;
  } catch (error) { return []; }
}

function getDashboardStats(data) {
  const stats = {
    totalRecords: data.length, qualifiedYouth: 0, overAgedCount: 0,
    totalBarangays: new Set(data.map(r => r.Barangay).filter(Boolean)).size,
    genderCount: { Male: 0, Female: 0 },
    qualifiedGender: { Male: 0, Female: 0 },
    organizationMembers: 0,
    tribeCount: new Set(data.map(r => r['Tribe']).filter(t => t !== 'Not Specified')).size
  };

  data.forEach(record => {
    const age = record.calculatedAge;
    if (age >= 15 && age <= 30) {
      stats.qualifiedYouth++;
      if (record.Sex === 'Male') stats.qualifiedGender.Male++;
      if (record.Sex === 'Female') stats.qualifiedGender.Female++;
    } else if (age > 30) stats.overAgedCount++;

    if (record.Sex === 'Male') stats.genderCount.Male++;
    if (record.Sex === 'Female') stats.genderCount.Female++;
    if (record['Member of Youth Organization'] && record['Member of Youth Organization'].toString().toLowerCase().includes('yes')) stats.organizationMembers++;
  });
  stats.totalYouth = stats.qualifiedYouth; 
  return stats;
}

function getChartData(data) {
  const countByKey = (key) => {
    const counts = {};
    data.forEach(r => { const k = r[key] || 'Unknown'; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };
  return {
    barangay: countByKey('Barangay'), education: countByKey('Highest Educational Attainment'),
    employment: countByKey('Employment Status'), ageBracket: countByKey('ageBracket'),
    tribe: countByKey('Tribe'), sector: countByKey('Youth Sector')
  };
}

// Changed to extract from unfiltered source for dropdowns (but we lock UI for non-admins anyway)
function getFilterOptions() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { barangays: [], tribes: [] };
  const headers = data[0].map(h => String(h || '').trim());
  const brgyIdx = headers.indexOf('Barangay');
  const tribeIdx = headers.indexOf('Tribe');
  
  const allRecords = data.slice(1);
  return {
    barangays: brgyIdx !== -1 ? [...new Set(allRecords.map(r => String(r[brgyIdx] || '').trim()).filter(Boolean))].sort() : [],
    tribes: tribeIdx !== -1 ? [...new Set(allRecords.map(r => cleanTribeData(r[tribeIdx])).filter(t => t !== 'Not Specified'))].sort() : []
  };
}

function getDashboardData(currentUser) {
  try {
    const allData = getAllData(currentUser);
    return {
      success: true, stats: getDashboardStats(allData),
      filters: getFilterOptions(), charts: getChartData(allData), rawData: allData
    };
  } catch (error) { return { success: false, message: error.toString() }; }
}

function getFilteredDashboardData(barangay, sitio, sex, tribe, eligibility, currentUser) {
  try {
    let data = getAllData(currentUser);
    if (barangay && barangay !== "") data = data.filter(r => r.Barangay === barangay);
    
    // NEW: Safe filtering for Sitio
    if (sitio && sitio !== "") {
      data = data.filter(r => {
        const key = Object.keys(r).find(k => k.trim().toLowerCase() === 'sitio/purok');
        return key && r[key] && r[key].toString().trim() === sitio;
      });
    }

    if (sex && sex !== "") data = data.filter(r => r.Sex === sex);
    if (tribe && tribe !== "") data = data.filter(r => r.Tribe === tribe);
    if (eligibility === 'qualified') data = data.filter(r => r.calculatedAge >= 15 && r.calculatedAge <= 30);
    if (eligibility === 'overaged') data = data.filter(r => r.calculatedAge > 30);
    
    return { success: true, stats: getDashboardStats(data), charts: getChartData(data) };
  } catch (error) { return { success: false, message: error.toString() }; }
}

function getRowIndexByUid(uid) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const uidIndex = headers.indexOf('UID');
  if (uidIndex === -1) throw new Error("UID column not found.");
  for (let i = 1; i < data.length; i++) if (data[i][uidIndex] === uid) return i + 1;
  return -1;
}

function logAction(action, recordName, details, currentUser) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let logSheet = ss.getSheetByName(CONFIG.LOGS_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.LOGS_SHEET_NAME);
    logSheet.appendRow(['Timestamp', 'Action', 'Record Name', 'Details', 'User']);
    logSheet.getRange('A1:E1').setFontWeight('bold');
  }
  const userName = currentUser ? (currentUser.barangay || 'Admin') : 'System';
  logSheet.appendRow([new Date().toLocaleString(), action, recordName, details, userName]);
}

function getAuditLogs(currentUser) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(CONFIG.LOGS_SHEET_NAME);
    if (!logSheet) return [];
    const data = logSheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    let logs = data.slice(1).map(row => {
      let log = {};
      headers.forEach((header, index) => log[header] = row[index]);
      return log;
    });
    
    // Filter logs if user is not admin (optional, but good for privacy)
    if (currentUser && currentUser.role !== 'Admin') {
       logs = logs.filter(log => log.User === currentUser.barangay);
    }
    
    return logs.filter(log => log.Action && log.Action.trim() !== '').reverse(); 
  } catch (e) { return []; }
}

function updateRecord(uid, updatedData, currentUser) {
  try {
    const sheet = getSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowIndex = getRowIndexByUid(uid);
    if (rowIndex === -1) return { success: false, message: 'Record not found.' };

    const recordName = updatedData['Full Name'] || 'Unknown User';
    const oldRowData = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    
    // Security check: Don't allow updating records from other barangays
    const brgyCol = headers.indexOf('Barangay');
    if (currentUser.role !== 'Admin' && String(oldRowData[brgyCol] || '').trim().toLowerCase() !== String(currentUser.barangay || '').trim().toLowerCase()) {
        return { success: false, message: 'You can only edit records from your own Barangay.' };
    }

    let changesMade = []; 
    Object.keys(updatedData).forEach(key => {
      const colIndex = headers.indexOf(key);
      if (colIndex !== -1) {
        let oldValue = oldRowData[colIndex];
        let newValue = updatedData[key];
        
        let oldStr = "";
        let newStr = "";

        if (key === 'Date of Birth') {
          const formatToYMD = (val) => {
            if (!val) return "";
            const d = new Date(val);
            if (isNaN(d.getTime())) return val.toString().trim();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };
          oldStr = formatToYMD(oldValue);
          newStr = formatToYMD(newValue);
        } else {
          oldStr = (oldValue !== null && oldValue !== undefined) ? oldValue.toString().trim() : "";
          newStr = (newValue !== null && newValue !== undefined) ? newValue.toString().trim() : "";
        }

        if (oldStr !== newStr) {
          changesMade.push(`${key}: '${oldStr || 'Empty'}' to '${newStr || 'Empty'}'`);
          if (key === 'Date of Birth' && newValue) {
            sheet.getRange(rowIndex, colIndex + 1).setValue(new Date(newValue));
          } else {
            sheet.getRange(rowIndex, colIndex + 1).setValue(newValue);
          }
        }
      }
    });

    if (changesMade.length > 0) {
      let detailMessage = 'Updates: ' + changesMade.join(' | ');
      logAction('EDIT', recordName, detailMessage, currentUser); 
    }
    
    return { success: true, message: 'Record updated successfully' };
  } catch (error) { return { success: false, message: error.toString() }; }
}

function deleteRecord(uid, currentUser) {
  try {
    const rowIndex = getRowIndexByUid(uid);
    if (rowIndex === -1) return { success: false, message: 'Record not found.' };
    
    const sheet = getSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Security check: Don't allow deleting records from other barangays
    const brgyCol = headers.indexOf('Barangay');
    if (currentUser.role !== 'Admin' && String(sheet.getRange(rowIndex, brgyCol + 1).getValue() || '').trim().toLowerCase() !== String(currentUser.barangay || '').trim().toLowerCase()) {
        return { success: false, message: 'You can only delete records from your own Barangay.' };
    }

    const nameColIndex = headers.indexOf('Full Name');
    const recordName = nameColIndex !== -1 ? sheet.getRange(rowIndex, nameColIndex + 1).getValue() : 'Unknown User';

    sheet.deleteRow(rowIndex);
    logAction('DELETE', recordName, 'Record was permanently deleted.', currentUser); 
    return { success: true, message: 'Record deleted successfully' };
  } catch (error) { return { success: false, message: error.toString() }; }
}

function onSheetChange(e) { generateMissingUIDs(); }
function generateMissingUIDs() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; 
  
  const headers = data[0];
  let uidIndex = headers.indexOf('UID');
  if (uidIndex === -1) {
    uidIndex = headers.length;
    sheet.getRange(1, uidIndex + 1).setValue('UID');
  }
  
  const uidColumnRange = sheet.getRange(2, uidIndex + 1, data.length - 1, 1);
  const uidColumnValues = uidColumnRange.getValues();
  let needsUpdate = false;
  
  for (let i = 0; i < uidColumnValues.length; i++) {
    let currentUid = uidColumnValues[i][0];
    if (!currentUid || currentUid.toString().trim() === '') {
      uidColumnValues[i][0] = Utilities.getUuid(); 
      needsUpdate = true;
    }
  }
  if (needsUpdate) uidColumnRange.setValues(uidColumnValues);
}

function syncOnlineData(currentUser) {
  try {
    // Security: Only Master Admin can trigger a global sync
    if (currentUser.role !== 'Admin') {
      return { success: false, message: 'Only the System Admin can sync online records.' };
    }

    const mainDb = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let stagingSheet = mainDb.getSheetByName(CONFIG.STAGING_SHEET_NAME);
    
    // Safety check if you forgot to make the tab
    if (!stagingSheet) {
      stagingSheet = mainDb.insertSheet(CONFIG.STAGING_SHEET_NAME);
      // You will need to manually copy your headers here later!
    }

    const onlineDb = SpreadsheetApp.openById(CONFIG.ONLINE_DB_ID);
    const onlineSheet = onlineDb.getSheetByName(CONFIG.ONLINE_SHEET_NAME);
    const onlineData = onlineSheet.getDataRange().getValues();
    
    if (onlineData.length <= 1) return { success: true, count: 0, message: 'No records found in Online DB.' };

    // Find the "Sync Status" column (assuming you put it at the very end)
    const syncColIndex = onlineData[0].length - 1; 
    let rowsToTransfer = [];
    let rowsToMarkSynced = [];

    // Loop through online data to find new ones
    for (let i = 1; i < onlineData.length; i++) {
      let row = onlineData[i];
      let status = row[syncColIndex];

      if (status !== 'Synced') {
        rowsToTransfer.push(row);
        rowsToMarkSynced.push(i + 1); 
      }
    }

    if (rowsToTransfer.length > 0) {
      // Push to Staging
      stagingSheet.getRange(stagingSheet.getLastRow() + 1, 1, rowsToTransfer.length, rowsToTransfer[0].length).setValues(rowsToTransfer);

      // Mark as synced in the Online DB
      rowsToMarkSynced.forEach(rowNum => {
        onlineSheet.getRange(rowNum, syncColIndex + 1).setValue('Synced');
      });
      
      logAction('SYNC', 'Web Forms', `Pulled ${rowsToTransfer.length} new records to Staging.`, currentUser);
      return { success: true, count: rowsToTransfer.length, message: `Successfully synced ${rowsToTransfer.length} new records to Staging.` };
    } else {
      return { success: true, count: 0, message: 'System is up to date. No new records to sync.' };
    }
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}