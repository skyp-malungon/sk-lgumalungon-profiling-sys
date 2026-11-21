// ===============================================================
// SK YOUTH PROFILING SYSTEM - CLIENT-SIDE CSV INGESTION ENGINE
// Municipality of Malungon, Province of Sarangani
// ===============================================================

const MALUNGON_MAPS = {
  sex: { M: 'Male', F: 'Female', P: 'Prefer not to say' },
  civilStatus: { S: 'Single', M: 'Married', W: 'Widowed', D: 'Separated' },
  tribe: { BLA: 'Blaan', TAG: 'Tagakaulo' },
  educStatus: { ISY: 'In-School Youth', OSY: 'Out-of-School Youth' },
  highestEduc: {
    E: 'Elementary', JH: 'Junior HS', SH: 'Senior HS',
    V: 'Vocational', C: 'College', PG: 'Post-Graduate'
  },
  jobs: { ST: 'Student', E: 'Employed', SE: 'Self-Employed', U: 'Unemployed' },
  natureOfWork: {
    ADM: 'Administrative / Clerical', PRO: 'Professional / Technical',
    EDU: 'Education / Teaching', HLT: 'Health / Medical Services',
    SOC: 'Social & Community Development', SEC: 'Protective & Security Services',
    AGR: 'Agriculture / Forestry / Fisheries', SKL: 'Skilled Trades / Technical Services',
    MAN: 'Manufacturing / Production', SAL: 'Sales / Service / Hospitality',
    TRN: 'Transport / Logistics', ICT: 'ICT / Digital Services',
    CRE: 'Creative / Arts / Media', BUS: 'Business / Entrepreneurship',
    DOM: 'Domestic / Personal Services', OFW: 'Overseas / Contractual Work',
    STU: 'Student / Not Currently Employed'
  },
  languages: {
    BLA: 'Blaan', TAG: 'Tagakaulo', FIL: 'Filipino (Tagalog)', ENG: 'English',
    CEB: 'Cebuano (Bisaya)', HIL: 'Hiligaynon (Ilonggo)', ILO: 'Ilocano',
    WAR: 'Waray', KAP: 'Kapampangan', PAN: 'Pangasinense', BIC: 'Bicolano',
    CHA: 'Chavacano', MAR: 'Maranao', MAG: 'Maguindanaon', TAU: 'Tausug',
    SAM: 'Sama-Bajau', MAN: 'Manobo', TBO: "T'boli", HIG: 'Higaonon',
    SUB: 'Subanen', KAN: 'Kankanaey', IFU: 'Ifugao', KAL: 'Kalinga',
    IBA: 'Ibanag', IVA: 'Ivatan', AKL: 'Aklanon', MAS: 'Masbateño', SUR: 'Surigaonon'
  },
  income: {
    B1: 'Below ₱10,000', B2: '₱10,001–₱20,000',
    B3: '₱20,001–₱30,000', A3: 'Above ₱30,000'
  },
  internetAccess: { Y: 'Yes', N: 'No' },
  internetType: { MD: 'Mobile Data', WF: 'Wi-Fi', NO: 'None' },
  interest: {
    Educ: 'Education', Heal: 'Health', Envi: 'Environment', Spor: 'Sports',
    Arts: 'Arts & Culture', Live: 'Livelihood', Gove: 'Governance',
    Digi: 'Digital Innovation', Disa: 'Disaster Response', Gend: 'Gender Equality',
    Entr: 'Entrepreneurship'
  },
  sector: {
    OSY: 'Out-of-School Youth', ISY: 'In-School Youth', WRK: 'Working Youth',
    PWD: 'Youth with Disability (PWD)', IND: 'Indigenous Youth',
    SPY: 'Single Parent Youth', LGBT: 'LGBTQIA+ Youth',
    CICL: 'Youth in Conflict with the Law (CICL)'
  },
  announce: {
    TXT: 'Text Message', FBM: 'Facebook Messenger',
    BRG: 'Barangay Posting', EML: 'Email'
  },
  program: {
    SKL: 'Skills Training', SCH: 'Scholarships', JOB: 'Job Opportunities',
    SPA: 'Sports & Arts Activities', HLT: 'Health & Wellness',
    YLC: 'Youth Leadership Camps', MNT: 'Mental Health Support',
    ENT: 'Entrepreneurship / Livelihood', ENV: 'Environmental Programs'
  },
  participation: {
    VOL: 'As a Volunteer', LDR: 'As a Leader',
    PLN: 'As a Planner', PAR: 'As a Participant'
  }
};

function expandMultiCodes(str, map) {
  if (!str || typeof str !== 'string' || str.trim() === '') return str || '';
  return str.split(';')
    .map(s => s.trim())
    .filter(s => s !== '')
    .map(code => map[code] || code)
    .join('; ');
}

function calculateAgeFromDob(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function getAgeBracketLabel(age) {
  if (age === null || age === undefined || isNaN(age)) return 'Unknown';
  if (age < 15) return 'Below 15';
  if (age >= 15 && age <= 17) return 'Youth (15–17)';
  if (age >= 18 && age <= 24) return 'Youth (18–24)';
  if (age >= 25 && age <= 29) return 'Youth (25–29)';
  return '30+';
}

/**
 * Parses raw CSV text exported from the Android App,
 * normalizes columns, and expands all shortcodes.
 */
function parseAndNormalizeCsvText(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      skipEmptyLines: true,
      complete: (results) => {
        let rows = results.data;
        if (!rows || rows.length === 0) {
          return reject(new Error('CSV file is empty.'));
        }

        // Identify if row 0 is header
        const isHeader = (r) => {
          if (!r || !r.length) return false;
          const col0 = String(r[0] || '').trim().toLowerCase();
          const col1 = String(r[1] || '').trim().toLowerCase();
          return col0.includes('timestamp') || col0.includes('time') || col1.includes('form');
        };

        const startIndex = isHeader(rows[0]) ? 1 : 0;
        const normalizedRecords = [];

        for (let i = startIndex; i < rows.length; i++) {
          let r = rows[i];
          if (!r || r.length < 5) continue;

          // Legacy 42-column alignment (insert Sitio at col 13)
          if (r.length === 42) {
            r.splice(13, 0, '');
          }

          const rawDob = r[6] || '';
          const calculatedAge = calculateAgeFromDob(rawDob) || (r[7] ? parseInt(r[7], 10) : null);
          const rawBarangay = (r[2] || '').trim();
          const rawName = (r[3] || '').trim();

          if (!rawName || !rawBarangay) continue;

          const authCtx = window.CURRENT_USER_CONTEXT || {};
          const sessionRole = authCtx.role || 'Barangay User';
          const sessionBrgy = authCtx.barangay || '';
          const effectiveBarangay = (sessionRole !== 'Admin' && sessionBrgy && sessionBrgy !== 'All')
            ? sessionBrgy
            : rawBarangay;

          const rawUid = r[43] ? String(r[43]).trim().replace(/[^a-zA-Z0-9_-]/g, '') : '';

          const record = {
            'Timestamp': r[0] || new Date().toISOString(),
            'FormNo.': r[1] || '',
            'Barangay': effectiveBarangay,
            'Full Name': rawName,
            'Nickname': r[4] || '',
            'Sex': MALUNGON_MAPS.sex[r[5]] || r[5] || '',
            'Date of Birth': rawDob,
            'Age': calculatedAge || '',
            'calculatedAge': calculatedAge,
            'ageBracket': getAgeBracketLabel(calculatedAge),
            'Place of Birth': r[8] || '',
            'Civil Status': MALUNGON_MAPS.civilStatus[r[9]] || r[9] || '',
            'Tribe': MALUNGON_MAPS.tribe[r[10]] || r[10] || 'Not Specified',
            'Citizenship': r[11] || 'Filipino',
            'Religion': r[12] || '',
            'Sitio/Purok': r[13] || '',
            'Complete Address': r[14] || '',
            'Contact Number': r[15] || '',
            'Email Address': r[16] || '',
            'Educational Status': MALUNGON_MAPS.educStatus[r[17]] || r[17] || '',
            'Highest Educational Attainment': MALUNGON_MAPS.highestEduc[r[18]] || r[18] || '',
            'School/Institution': r[19] || '',
            'Course/Strand': r[20] || '',
            'Employment Status': MALUNGON_MAPS.jobs[r[21]] || r[21] || '',
            'Nature of Work': MALUNGON_MAPS.natureOfWork[r[22]] || r[22] || '',
            'Skills/Talents': r[23] || '',
            'Languages Spoken': expandMultiCodes(r[24], MALUNGON_MAPS.languages),
            'Member of Youth Organization': r[25] || 'No',
            'Organizations': r[26] || '',
            'Leadership Position': r[27] || '',
            'Volunteer Activities': r[28] || '',
            'Areas of Interest': expandMultiCodes(r[29], MALUNGON_MAPS.interest),
            'Youth Sector': expandMultiCodes(r[30], MALUNGON_MAPS.sector),
            'Total Household Members': r[31] || '',
            'Household Income': MALUNGON_MAPS.income[r[32]] || r[32] || '',
            'Internet Access': MALUNGON_MAPS.internetAccess[r[33]] || r[33] || '',
            'Internet Connection Type': MALUNGON_MAPS.internetType[r[34]] || r[34] || '',
            'Preferred Announcement Mode': expandMultiCodes(r[35], MALUNGON_MAPS.announce),
            '5-Year Goals': r[36] || '',
            'Desired Programs': expandMultiCodes(r[37], MALUNGON_MAPS.program),
            'Participation Mode': expandMultiCodes(r[38], MALUNGON_MAPS.participation),
            'Data Consent': r[39] || 'Yes',
            'Date Accomplished': r[40] || '',
            'SK Data Collector': r[41] || '',
            'Date Received': r[42] || '',
            'uid': rawUid || ('YOUTH_' + crypto.randomUUID().replace(/-/g, ''))
          };

          normalizedRecords.push(record);
        }

        resolve(normalizedRecords);
      },
      error: (err) => reject(err)
    });
  });
}

/**
 * Uploads normalized records in batches of 500 to Cloud Firestore.
 */
async function uploadRecordsToFirestore(records, onProgress) {
  if (!records || records.length === 0) {
    throw new Error('No records to upload.');
  }

  const BATCH_SIZE = 450; // Under Firestore's 500 max limit
  const total = records.length;
  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach(record => {
      const docRef = db.collection('youth_profiles').doc(record.uid);
      batch.set(docRef, record, { merge: true });
    });

    await batch.commit();
    processed += chunk.length;
    if (typeof onProgress === 'function') {
      onProgress(Math.min(processed, total), total);
    }
  }

  // Record upload in system audit log
  try {
    const authCtx = window.CURRENT_USER_CONTEXT || {};
    const currentUser = authCtx.username || authCtx.barangay || 'Admin';
    const detectedBrgy = records[0]?.Barangay || authCtx.barangay || 'All';
    await db.collection('audit_logs').add({
      action: 'CSV_IMPORT',
      recordName: `Batch (${total} profiles)`,
      details: `Imported ${total} youth records for Barangay ${detectedBrgy}`,
      barangay: detectedBrgy,
      user: currentUser,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (logErr) {
    console.warn('[Audit Log] Failed to write CSV import log:', logErr);
  }

  return { success: true, count: total, barangay: records[0]?.Barangay || 'Various' };
}
