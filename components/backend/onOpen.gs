// =========================================================================
// SPREADSHEET UI SCRIPT (Container-Bound)
// This handles the custom menu, data scanning, and approvals.
// =========================================================================

const CONFIG = {
  SHEET_NAME: 'skypDatabase',
  LOGS_SHEET_NAME: 'skypLogs',
  STAGING_SHEET_NAME: 'Online_Staging'
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Admin Actions')
      .addItem('1. Scan Staged Data (QA)', 'scanStagedData')
      .addItem('2. Approve Staged Records to Master', 'approveStagedToMaster')
      .addToUi();
}

// --- 1. THE SCANNER ---
function scanStagedData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stagingSheet = ss.getSheetByName(CONFIG.STAGING_SHEET_NAME);
  const masterSheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  const stagingData = stagingSheet.getDataRange().getValues();
  if (stagingData.length <= 1) {
    SpreadsheetApp.getUi().alert('No records to scan. The Staging tab is empty.');
    return;
  }

  const masterData = masterSheet.getDataRange().getValues();
  const mHeaders = masterData[0];
  const sHeaders = stagingData[0];
  const nameCol = sHeaders.indexOf('Full Name');
  const dobCol = sHeaders.indexOf('Date of Birth');

  const existingYouths = new Set();
  for (let i = 1; i < masterData.length; i++) {
    let name = String(masterData[i][nameCol]).trim().toLowerCase();
    let dob = masterData[i][dobCol];
    if (dob instanceof Date) dob = dob.toLocaleDateString();
    existingYouths.add(name + "|" + dob);
  }

  let qaColIdx = sHeaders.indexOf('QA Status');
  if (qaColIdx === -1) {
    qaColIdx = sHeaders.length;
    stagingSheet.getRange(1, qaColIdx + 1).setValue('QA Status');
  }

  const qaStatuses = [];
  const backgroundColors = [];

  for (let i = 1; i < stagingData.length; i++) {
    let name = String(stagingData[i][nameCol] || "").trim().toLowerCase();
    let dob = stagingData[i][dobCol];
    if (dob instanceof Date) dob = dob.toLocaleDateString();

    let rowKey = name + "|" + dob;
    let rowColors = new Array(qaColIdx + 1).fill(null); 

    if (!name || name === "") {
       qaStatuses.push(['❌ MISSING DATA']);
       rowColors.fill('#fce8e8'); 
    } else if (existingYouths.has(rowKey)) {
       qaStatuses.push(['⚠️ DUPLICATE FOUND']);
       rowColors.fill('#fff3cd'); 
    } else {
       qaStatuses.push(['✅ CLEAR (READY)']);
       rowColors.fill('#d1e7dd'); 
    }
    backgroundColors.push(rowColors);
  }

  stagingSheet.getRange(2, qaColIdx + 1, qaStatuses.length, 1).setValues(qaStatuses);
  stagingSheet.getRange(2, 1, backgroundColors.length, backgroundColors[0].length).setBackgrounds(backgroundColors);

  SpreadsheetApp.getUi().alert('Scan Complete!', 'Check the QA Status column. Delete any red or yellow rows before approving.', SpreadsheetApp.getUi().ButtonSet.OK);
}

// --- 2. THE APPROVER ---
// --- 2. THE SMART APPROVER ---
function approveStagedToMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stagingSheet = ss.getSheetByName(CONFIG.STAGING_SHEET_NAME);
  const masterSheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  const stagingDataRange = stagingSheet.getDataRange();
  const stagingData = stagingDataRange.getValues();
  const stagingBackgrounds = stagingDataRange.getBackgrounds();

  if (stagingData.length <= 1) {
    SpreadsheetApp.getUi().alert('No records to approve. The Staging tab is empty.');
    return;
  }

  // Find the QA column
  const headers = stagingData[0];
  const qaColIdx = headers.indexOf('QA Status');

  if (qaColIdx === -1) {
    SpreadsheetApp.getUi().alert('Action Required', 'Please run "1. Scan Staged Data (QA)" first before approving.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Confirm Smart Approval', `This will move ONLY the Green (Clear) records to the Master Database. \n\nRed and Yellow records will remain here for you to fix. Proceed?`, ui.ButtonSet.YES_NO);

  if (response !== ui.Button.YES) return;

  let recordsToMove = [];
  let keptValues = [];
  let keptBackgrounds = [];

  // Sort rows into "Move" and "Keep" buckets (starting at 1 to skip headers)
  for (let i = 1; i < stagingData.length; i++) {
    let row = stagingData[i];
    let bgRow = stagingBackgrounds[i];
    let status = String(row[qaColIdx] || '');

    if (status.includes('✅ CLEAR')) {
      // Good Data: Remove QA column and prepare for Master
      let cleanRow = [...row];
      cleanRow.splice(qaColIdx, 1); 
      recordsToMove.push(cleanRow);
    } else {
      // Bad Data: Keep the row and its colors
      keptValues.push(row);
      keptBackgrounds.push(bgRow);
    }
  }

  // If there are no green rows at all
  if (recordsToMove.length === 0) {
    ui.alert('No valid records found!', 'All records have errors or are duplicates. Please fix or delete them manually.', ui.ButtonSet.OK);
    return;
  }

  // 1. Send the clean data to the Master DB
  masterSheet.getRange(masterSheet.getLastRow() + 1, 1, recordsToMove.length, recordsToMove[0].length).setValues(recordsToMove);

  // 2. Clear the entire Staging Sheet (leaving Row 1 Headers intact)
  const lastRow = stagingSheet.getLastRow();
  if (lastRow > 1) {
    stagingSheet.getRange(2, 1, lastRow - 1, stagingSheet.getLastColumn()).clearContent();
    stagingSheet.getRange(2, 1, lastRow - 1, stagingSheet.getLastColumn()).setBackground(null);
  }

  // 3. Write the bad data (Red/Yellow) back to Staging
  if (keptValues.length > 0) {
    stagingSheet.getRange(2, 1, keptValues.length, keptValues[0].length).setValues(keptValues);
    stagingSheet.getRange(2, 1, keptBackgrounds.length, keptBackgrounds[0].length).setBackgrounds(keptBackgrounds);
  }

  // 4. Finalize
  generateMissingUIDs();
  logAction('APPROVE', 'Web Batch', `Smart Approved ${recordsToMove.length} clean records. Left ${keptValues.length} for review.`);
  ui.alert('Success!', `Moved ${recordsToMove.length} clean records to Master.\n\nLeft ${keptValues.length} problem records in Staging for review.`, ui.ButtonSet.OK);
}

// --- HELPER FUNCTIONS ---
function generateMissingUIDs() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
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

function logAction(action, recordName, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(CONFIG.LOGS_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.LOGS_SHEET_NAME);
    logSheet.appendRow(['Timestamp', 'Action', 'Record Name', 'Details', 'User']);
    logSheet.getRange('A1:E1').setFontWeight('bold');
  }
  // Grabs the email of the admin currently clicking the button
  const userName = Session.getActiveUser().getEmail() || 'Local Admin';
  logSheet.appendRow([new Date().toLocaleString(), action, recordName, details, userName]);
}