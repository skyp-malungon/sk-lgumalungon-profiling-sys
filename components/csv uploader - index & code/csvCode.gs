const DB_SHEET_ID   = '1shTi8-72Zdue1AnjOxRxDBM8Z5CfGmmYYz56trYCeYc';
const DB_SHEET_NAME = 'skypDatabase';

// Optional: serve HTML uploader named "Index"
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('CSV Uploader');
}

function importCsvText(csvText) {
  if (!csvText) return { status: 'NO_DATA', barangay: 'No data', totalRespondents: 0 };

  let rows = Utilities.parseCsv(csvText);        // parse full CSV into 2D array
  if (!rows.length) {
    return { status: 'NO_ROWS', barangay: 'No data', totalRespondents: 0 };
  }

  // remove empty last line if present
  if (rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  // ---- MAPPING TABLES FOR CODES ----
  const sexMap = { M:'Male', F:'Female', P:'Prefer not to say' };

  const civilStatusMap = {
    S: 'Single',
    M: 'Married',
    W: 'Widowed',
    D: 'Separated'
  };

  // Tribe mapping
  const tribeMap = {
    BLA: 'Blaan',
    TAG: 'Tagakaulo'
  };

  const educStatusMap = {
    ISY:'In-School Youth',
    OSY:'Out-of-School Youth'
  };

  const highestEducMap = {
    E:'Elementary',
    JH:'Junior HS',
    SH:'Senior HS',
    V:'Vocational',
    C:'College',
    PG:'Post-Graduate'
  };

  const jobsMap = {
    ST:'Student',
    E:'Employed',
    SE:'Self-Employed',
    U:'Unemployed'
  };

  // Nature of Work mapping
  const natureOfWorkMap = {
    ADM: 'Administrative / Clerical',
    PRO: 'Professional / Technical',
    EDU: 'Education / Teaching',
    HLT: 'Health / Medical Services',
    SOC: 'Social & Community Development',
    SEC: 'Protective & Security Services',
    AGR: 'Agriculture / Forestry / Fisheries',
    SKL: 'Skilled Trades / Technical Services',
    MAN: 'Manufacturing / Production',
    SAL: 'Sales / Service / Hospitality',
    TRN: 'Transport / Logistics',
    ICT: 'ICT / Digital Services',
    CRE: 'Creative / Arts / Media',
    BUS: 'Business / Entrepreneurship',
    DOM: 'Domestic / Personal Services',
    OFW: 'Overseas / Contractual Work',
    STU: 'Student / Not Currently Employed'
  };

  // Languages Spoken mapping
  const languagesMap = {
    BLA: 'Blaan',
    TAG: 'Tagakaulo',
    FIL: 'Filipino (Tagalog)',
    ENG: 'English',
    CEB: 'Cebuano (Bisaya)',
    HIL: 'Hiligaynon (Ilonggo)',
    ILO: 'Ilocano',
    WAR: 'Waray',
    KAP: 'Kapampangan',
    PAN: 'Pangasinense',
    BIC: 'Bicolano',
    CHA: 'Chavacano',
    MAR: 'Maranao',
    MAG: 'Maguindanaon',
    TAU: 'Tausug',
    SAM: 'Sama-Bajau',
    MAN: 'Manobo',
    TBO: 'T\'boli',
    HIG: 'Higaonon',
    SUB: 'Subanen',
    KAN: 'Kankanaey',
    IFU: 'Ifugao',
    KAL: 'Kalinga',
    IBA: 'Ibanag',
    IVA: 'Ivatan',
    AKL: 'Aklanon',
    MAS: 'Masbateño',
    SUR: 'Surigaonon'
  };

  const incomeMap = {
    B1:'Below ₱10,000',
    B2:'₱10,001–₱20,000',
    B3:'₱20,001–₱30,000',
    A3:'Above ₱30,000'
  };

  const internetAccessMap = { Y:'Yes', N:'No' };
  const internetTypeMap = { MD:'Mobile Data', WF:'Wi‑Fi', NO:'None' };

  const interestMap = {
    Educ:'Education',
    Heal:'Health',
    Envi:'Environment',
    Spor:'Sports',
    Arts:'Arts & Culture',
    Live:'Livelihood',
    Gove:'Governance',
    Digi:'Digital Innovation',
    Disa:'Disaster Response',
    Gend:'Gender Equality',
    Entr:'Entrepreneurship'
  };

  const sectorMap = {
    OSY: 'Out-of-School Youth',
    ISY: 'In-School Youth',
    WRK: 'Working Youth',
    PWD: 'Youth with Disability (PWD)',
    IND: 'Indigenous Youth',
    SPY: 'Single Parent Youth',
    LGBT: 'LGBTQIA+ Youth',
    CICL: 'Youth in Conflict with the Law (CICL)'
  };

  const announceMap = {
    TXT:'Text Message',
    FBM:'Facebook Messenger',
    BRG:'Barangay Posting',
    EML:'Email'
  };

  const programMap = {
    SKL:'Skills Training',
    SCH:'Scholarships',
    JOB:'Job Opportunities',
    SPA:'Sports & Arts Activities',
    HLT:'Health & Wellness',
    YLC:'Youth Leadership Camps',
    MNT:'Mental Health Support',
    ENT:'Entrepreneurship / Livelihood',
    ENV:'Environmental Programs'
  };

  const participationMap = {
    VOL:'As a Volunteer',
    LDR:'As a Leader',
    PLN:'As a Planner',
    PAR:'As a Participant'
  };

  function expandMulti(str, map) {
    if (!str || str.trim() === '') return str;
    return str.split(';')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(code => map[code] || code)
      .join('; ');
  }

  // ---- EXPAND EACH ROW ----
  rows = rows.map(r => {
    if (!r || !r.length) return r;

    // Check if this row is a header row
    if (/^(timestamp|date\s*time|time)$/i.test(String(r[0] || '').trim()) &&
        /^form\s*no\.?$/i.test(String(r[1] || '').trim())) {
      return r;
    }

    // Auto-normalize legacy 42-column CSVs (which lacked separate Sitio/Purok at index 13)
    // In 43-column CSV: r[13]=Sitio/Purok, r[14]=Complete Address, r[15]=Contact Number, r[16]=Email, r[17]=Educ Status
    // In legacy 42-column CSV: r[13]=Complete Address, r[14]=Contact Number, r[15]=Email, r[16]=Educ Status
    if (r.length === 42) {
      r.splice(13, 0, ''); // insert blank Sitio/Purok to align with 43-column layout
    }

    // Standardized 43-column structure:
    // 0: Timestamp (t)
    // 1: FormNo. (fno)
    // 2: Barangay (b)
    // 3: Full Name (fn)
    // 4: Nickname (nk)
    // 5: Sex (sx) - code
    // 6: Date of Birth (dob)
    // 7: Age (age)
    // 8: Place of Birth (pob)
    // 9: Civil Status (cs) - code
    // 10: Tribe (trb) - code
    // 11: Citizenship (cit)
    // 12: Religion (rel)
    // 13: Sitio/Purok (sitio)
    // 14: Complete Address (addr)
    // 15: Contact Number (ph)
    // 16: Email Address (em)
    // 17: Educational Status (es) - code
    // 18: Highest Educational Attainment (he) - code
    // 19: School/Institution (sch)
    // 20: Course/Strand (crs)
    // 21: Employment Status (jobs) - code
    // 22: Nature of Work (nw) - code
    // 23: Skills/Talents (skl)
    // 24: Languages Spoken (lang) - code
    // 25: Member of Youth Organization (yom)
    // 26: Organizations (org)
    // 27: Leadership Position (lp)
    // 28: Volunteer Activities (vol)
    // 29: Areas of Interest (intr) - codes separated by ;
    // 30: Youth Sector (sec) - codes separated by ;
    // 31: Total Household Members (hhm)
    // 32: Household Income (inc) - code
    // 33: Internet Access (ia) - code
    // 34: Internet Connection Type (it) - code
    // 35: Preferred Announcement Mode (am) - codes separated by ;
    // 36: 5-Year Goals (gl)
    // 37: Desired Programs (pgm) - codes separated by ;
    // 38: Participation Mode (pm) - code
    // 39: Data Consent (consent)
    // 40: Date Accomplished (dac)
    // 41: SK Data Collector (dc)
    // 42: Date Received (dr)

    // Expand single-code fields
    if (r[5]) r[5] = sexMap[r[5]] || r[5];                                // Sex
    if (r[9]) r[9] = civilStatusMap[r[9]] || r[9];                        // Civil Status
    if (r[10]) r[10] = tribeMap[r[10]] || r[10];                          // Tribe
    if (r[17]) r[17] = educStatusMap[r[17]] || r[17];                     // Educational Status
    if (r[18]) r[18] = highestEducMap[r[18]] || r[18];                   // Highest Education
    if (r[21]) r[21] = jobsMap[r[21]] || r[21];                           // Employment Status
    if (r[22]) r[22] = natureOfWorkMap[r[22]] || r[22];                   // Nature of Work
    if (r[24]) r[24] = expandMulti(r[24], languagesMap);                 // Languages Spoken (single or multi)
    if (r[32]) r[32] = incomeMap[r[32]] || r[32];                         // Household Income
    if (r[33]) r[33] = internetAccessMap[r[33]] || r[33];                 // Internet Access
    if (r[34]) r[34] = internetTypeMap[r[34]] || r[34];                   // Internet Type
    if (r[38]) r[38] = expandMulti(r[38], participationMap);              // Participation Mode

    // Expand multi-code fields
    if (r[29]) r[29] = expandMulti(r[29], interestMap);                   // Areas of Interest
    if (r[30]) r[30] = expandMulti(r[30], sectorMap);                     // Youth Sector
    if (r[35]) r[35] = expandMulti(r[35], announceMap);                   // Preferred Announcement Mode
    if (r[37]) r[37] = expandMulti(r[37], programMap);                    // Desired Programs

    return r;
  });

  // ---- COMPUTE SUMMARY FROM THIS CSV (COLUMN C: Barangay) ----
  let totalRespondents = 0;
  let firstBarangay = null;

  // Skip header row if present
  const isFirstRowHeader = rows[0] && (
    /^(timestamp|date\s*time|time)$/i.test(String(rows[0][0] || '').trim()) ||
    /^form\s*no\.?$/i.test(String(rows[0][1] || '').trim()) ||
    /^barangay$/i.test(String(rows[0][2] || '').trim())
  );

  const startIndex = isFirstRowHeader ? 1 : 0;

  for (let i = startIndex; i < rows.length; i++) {
    const barangayCell = rows[i][2]; // column C in CSV (Barangay)
    if (barangayCell && barangayCell !== '' && barangayCell != null) {
      totalRespondents++;
      if (!firstBarangay) {
        firstBarangay = barangayCell;
      }
    }
  }

  if (!firstBarangay) {
    firstBarangay = 'No barangay in column C';
  }

  // ---- WRITE INTO SHEET ----
  const ss = SpreadsheetApp.openById(DB_SHEET_ID);
  const sh = ss.getSheetByName(DB_SHEET_NAME);
  
  // If sheet is empty, initialize headers including UID
  if (sh.getLastRow() === 0) {
    const headers = [
      'Timestamp', 'FormNo.', 'Barangay', 'Full Name', 'Nickname', 'Sex',
      'Date of Birth', 'Age', 'Place of Birth', 'Civil Status', 'Tribe',
      'Citizenship', 'Religion', 'Sitio/Purok', 'Complete Address', 'Contact Number', 'Email Address',
      'Educational Status', 'Highest Educational Attainment', 'School/Institution',
      'Course/Strand', 'Employment Status', 'Nature of Work', 'Skills/Talents',
      'Languages Spoken', 'Member of Youth Organization', 'Organizations',
      'Leadership Position', 'Volunteer Activities', 'Areas of Interest', 'Youth Sector',
      'Total Household Members', 'Household Income', 'Internet Access',
      'Internet Connection Type', 'Preferred Announcement Mode', '5-Year Goals',
      'Desired Programs', 'Participation Mode', 'Data Consent', 'Date Accomplished',
      'SK Data Collector', 'Date Received', 'UID'
    ];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Ensure UID column exists
  const sheetHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  let uidColIdx = sheetHeaders.indexOf('UID');
  if (uidColIdx === -1) {
    uidColIdx = sheetHeaders.length;
    sh.getRange(1, uidColIdx + 1).setValue('UID');
  }

  const startRow = sh.getLastRow() + 1;
  const rowsToAppend = isFirstRowHeader ? rows.slice(1) : rows;
  
  if (rowsToAppend.length > 0) {
    // Generate UUID for each appended row so every profile is viewable/editable/deletable
    const preparedRows = rowsToAppend.map(r => {
      const rowCopy = [...r];
      while (rowCopy.length < uidColIdx) {
        rowCopy.push('');
      }
      if (rowCopy.length === uidColIdx || !rowCopy[uidColIdx]) {
        rowCopy[uidColIdx] = Utilities.getUuid();
      }
      return rowCopy;
    });

    sh.getRange(startRow, 1, preparedRows.length, preparedRows[0].length)
      .setValues(preparedRows);
  }

  // Return structured summary
  return {
    status: 'OK',
    appendedRows: rowsToAppend.length,
    barangay: firstBarangay,
    totalRespondents: totalRespondents
  };
}
