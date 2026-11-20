# SK Youth Profiling System (SKYMS)
## Official Operations, User, and Administrator Manual
**Municipality of Malungon, Province of Sarangani**  
*Office of the Sangguniang Kabataan Federation*

---

## Table of Contents
1. [System Overview & Legal Mandate](#1-system-overview--legal-mandate)
2. [System Architecture & Technology Stack](#2-system-architecture--technology-stack)
3. [User Roles & Access Control (RBAC)](#3-user-roles--access-control-rbac)
4. [End-to-End Operational Workflow](#4-end-to-end-operational-workflow)
   - [Step 1: Survey Form Generation & Printing](#step-1-survey-form-generation--printing)
   - [Step 2: Field Data Collection & Offline Encoding](#step-2-field-data-collection--offline-encoding)
   - [Step 3: CSV Export, Transfer & Cloud Ingestion](#step-3-csv-export-transfer--cloud-ingestion)
   - [Step 4: Monitoring, Analytics & Program Intervention](#step-4-monitoring-analytics--program-intervention)
5. [User Interface & Feature Walkthrough](#5-user-interface--feature-walkthrough)
   - [5.1 Authentication & Account Registration](#51-authentication--account-registration)
   - [5.2 Analytics Dashboard](#52-analytics-dashboard)
   - [5.3 Youth Registry & Inline Record Management](#53-youth-registry--inline-record-management)
   - [5.4 Generating Official Reports & Masterlists](#54-generating-official-reports--masterlists)
   - [5.5 Audit Trail & Security Logs](#55-audit-trail--security-logs)
   - [5.6 Auxiliary Modules (CSV Uploader & Form Generator)](#56-auxiliary-modules-csv-uploader--form-generator)
6. [Data Dictionary & Standardization Coding Guide](#6-data-dictionary--standardization-coding-guide)
7. [System Administration & Cloud Maintenance](#7-system-administration--cloud-maintenance)
   - [7.1 Firebase Hosting Deployment](#71-firebase-hosting-deployment)
   - [7.2 Google Apps Script REST API Deployment](#72-google-apps-script-rest-api-deployment)
   - [7.3 Google Sheets Database Architecture](#73-google-sheets-database-architecture)
   - [7.4 Web Form Synchronization (Online Staging)](#74-web-form-synchronization-online-staging)
8. [Troubleshooting & Support Protocols](#8-troubleshooting--support-protocols)

---

## 1. System Overview & Legal Mandate

The **SK Youth Profiling System (SKYMS)** is an integrated data management and analytics platform engineered specifically for the 31 barangays comprising the **Municipality of Malungon, Sarangani Province**. 

### 1.1 Objective
The system replaces fragmented paper records and disparate spreadsheets with a unified, real-time demographic repository. It equips the Sangguniang Kabataan (SK) Federation, Barangay SK Councils, and Local Youth Development Officers (LYDO) with data-backed intelligence to formulate evidence-based youth policies, scholarship distributions, sports and arts initiatives, Alternative Learning System (ALS) enrollments, and livelihood interventions.

### 1.2 Legal Framework & Compliance
- **Republic Act No. 10742 (Sangguniang Kabataan Reform Act of 2015)** as amended by **Republic Act No. 11768**: Mandates the profiling of youth aged 15 to 30 years old in every barangay and the maintenance of a comprehensive youth registry.
- **Republic Act No. 10173 (Data Privacy Act of 2012)**: Strictly safeguards personally identifiable information (PII) collected during survey operations. The system incorporates explicit consent verification, data masking, role-scoped barangay isolation, and an immutable audit trail.

---

## 2. System Architecture & Technology Stack

The platform operates on a hybrid serverless architecture that combines high-performance edge hosting with cloud-based database operations:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Browser / User Device                 │
│         (HTML5, CSS3, Bootstrap 5.3, JavaScript ES6+,           │
│             Google Charts API, SweetAlert2 v11)                 │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                   HTTPS / Zero-Trust API Traffic
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              Static Web Hosting (Firebase Hosting)              │
│       • Global SSD Edge Cache / CDN                             │
│       • Auto SSL/TLS Encryption                                 │
│       • Live Endpoint: sk-lgumalungon-profiling-sys.web.app     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                    JSON Payloads via HTTPS REST
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│            Application Server (Google Apps Script API)          │
│       • REST API Router (doGet / doPost)                        │
│       • Authentication, Token Management & Permission Checks    │
│       • Demographic Metrics Calculation & Age Categorization    │
│       • Data Cleaning & Multi-field Dictionary Expansion        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                Google Apps Script Native Service API
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               Data Storage Layer (Google Sheets DB)             │
│       • skypDatabase   : Master Youth Profiles (42+ Columns)    │
│       • skypUsers      : User Registry, Roles & Active Tokens   │
│       • skypLogs       : Tamper-Evident Audit Trail             │
│       • Online_Staging : Intermediate Online Submission Queue   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. User Roles & Access Control (RBAC)

The system enforces strict multi-tenant isolation so that barangay personnel can only access and manipulate records within their jurisdiction, while municipal administrators maintain oversight across all 31 barangays.

| Capability / Permission | Barangay User | Municipal Admin |
| :--- | :---: | :---: |
| View Barangay Demographic Dashboard | Yes (Own Barangay Only) | Yes (All 31 Barangays) |
| Multi-Barangay Comparative Filtering | Restricted | Unrestricted |
| Search & Browse Youth Registry | Yes (Own Barangay Only) | Yes (All 31 Barangays) |
| Edit Existing Youth Profiles | Yes (Own Barangay Only) | Yes (All Records) |
| Delete Records (with Audit Logging) | Yes (Own Barangay Only) | Yes (All Records) |
| Generate Printable Official Reports | Yes (Own Barangay Only) | Yes (Any Barangay / Municipal) |
| Inspect System Audit Trail (Logs) | Restricted | Full Access |
| Sync Online Web Forms to Staging | Restricted | Full Access |
| Register New Admin Accounts | Restricted | Requires Master Password |

---

## 4. End-to-End Operational Workflow

The profiling process operates along a 4-step pipeline that transitions data from paper forms in remote sitios into actionable dashboard metrics:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     Step 1      │       │     Step 2      │       │     Step 3      │       │     Step 4      │
│  Generate &     │ ────> │ Field Profiling │ ────> │ CSV Export &    │ ────> │  Dashboard &    │
│  Print Forms    │       │ & App Encoding  │       │ Cloud Ingestion │       │ Program Action  │
└─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Step 1: Survey Form Generation & Printing
1. The Barangay SK Secretary or Enumeration Lead accesses the **Form Generator** tool.
2. Select the target **Barangay** and profiling **Year**.
3. Specify the quantity of forms needed (e.g., 50 forms).
4. The system automatically stamps every form with a unique, serialized Control Number (e.g., `SK-Mal-05-25-00001`) and a corresponding scannable QR placeholder.
5. Print the customized double-sided questionnaires on standard **Legal Size (8.5" × 13.5")** paper.

### Step 2: Field Data Collection & Offline Encoding
1. **Field Interview**: Enumerators visit households across all sitios/puroks.
2. **Consent First**: The youth respondent reviews and signs Section G (Data Privacy Consent Form).
3. **Questionnaire Completion**: The respondent or enumerator completes Sections A through F.
4. **Offline Mobile Encoding**: Enumerators input the responses into the offline mobile survey application on their mobile phone.
5. **Efficiency Through Shortcodes**: To prevent typing errors and accelerate encoding in the field, standardized shortcodes are used (e.g., `BLA` for Blaan, `OSY` for Out-of-School Youth, `U` for Unemployed).

### Step 3: CSV Export, Transfer & Cloud Ingestion
1. **Mobile Export**: Once surveying is concluded, the enumerator opens the mobile app settings and taps **Export Data to CSV**. The file is generated (e.g., `SK_Survey_Banate.csv`).
2. **File Transfer**: The enumerator transfers the file to a PC using one of three standard methods:
   - USB Cable (Direct file copy via MTP).
   - Google Drive / Email attachment.
   - Local sharing (Nearby Share / Bluetooth / Messenger).
3. **Cloud Ingestion**:
   - The user opens the **CSV Uploader** tool.
   - Drag and drop or browse to select the `.csv` file.
   - The uploader automatically validates the column structure, translates all shortcodes into full text strings, assigns a system `UID` (UUIDv4) to every youth record, and appends the normalized records directly to `skypDatabase`.

### Step 4: Monitoring, Analytics & Program Intervention
1. The SK Council or Municipal Admin logs in to the dashboard at `https://sk-lgumalungon-profiling-sys.web.app`.
2. The newly uploaded records appear instantaneously in both the KPI statistics cards and the live Registry table.
3. The Council applies targeted filters (e.g., *Barangay: Alkikan*, *Educational Status: Out-of-School Youth*) to extract eligible candidates for upcoming municipal training programs, ALS enrollments, or livelihood grant allocations.

---

## 5. User Interface & Feature Walkthrough

### 5.1 Authentication & Account Registration
- **URL**: `https://sk-lgumalungon-profiling-sys.web.app/login.html`
- **Signing In**: Enter the designated Username and Password. Upon successful verification, an encrypted session token is stored in the browser's `sessionStorage`.
- **Registering a Barangay Account**: Click *"Register here"*, select your Barangay from the dropdown list of 31 barangays, choose your username and password, and submit.
- **Registering a System Admin**: Select **"🌟 System Admin"** in the dropdown. An additional field—**Default Admin Password**—will appear. The registration will be denied unless the correct administrative master key is provided.

### 5.2 Analytics Dashboard
The default landing view delivers instant demographic intelligence:
- **KPI Summary Cards**:
  - *Total Qualified Youth*: Counts residents strictly aged between 15 and 30 years old.
  - *Male vs. Female Ratio*: Gender distribution of qualified youth.
  - *Organization Membership*: Total youth participating in youth organizations.
  - *Over-Aged Count*: Profiles on record aged 31+ for audit monitoring.
  - *Indigenous Youth Count*: Total youth affiliated with indigenous tribes (e.g., Blaan, Tagakaulo).
- **Interactive Visualizations (Google Charts)**:
  - *Age Bracket Distribution*: Segregated into `<15`, `Youth (15–17)`, `Youth (18–24)`, `Youth (25–29)`, and `30+`.
  - *Educational Attainment*: Elementary, Junior HS, Senior HS, Vocational, College, Post-Graduate.
  - *Employment & Economic Activity*: Student, Employed, Self-Employed, Unemployed.
  - *Youth Sectors*: In-School, Out-of-School, Working Youth, PWD, Indigenous Youth, Single Parents, LGBTQIA+.
- **Dynamic Filter Controls**:
  - Filter across Barangay, Sitio/Purok, Sex, Tribe, and Voter Registration status.
  - *Note*: For Barangay-level accounts, the Barangay dropdown is permanently locked to their assigned territory.

### 5.3 Youth Registry & Inline Record Management
- **Search Engine**: Real-time multi-attribute search across Full Name, Nickname, Sitio/Purok, Contact Number, and Course/Strand.
- **Pagination**: High-performance client-side paging (10 records per page) with record counters.
- **Record Inspection (View Modal)**: Displays all 42 survey attributes in a clean, multi-tab modal window.
- **Inline Record Editing**:
  - Clicking the **Edit** icon enables field modification.
  - Submitting changes sends an update request to the Google Apps Script backend.
  - Every modified field is recorded with previous and new values in the Audit Trail.
- **Record Deletion**:
  - Protected with a SweetAlert2 confirmation dialog.
  - Non-admin users cannot delete records outside their assigned barangay.
  - Deleted entries are permanently purged from `skypDatabase` and logged with the operator's identity.

### 5.4 Generating Official Reports & Masterlists
- Navigate to the **Reports** tab.
- Choose between:
  1. **Official Youth Masterlist**: A tabulated register complete with Control Number, Full Name, Age, Sex, Civil Status, Address, and Contact Number.
  2. **Demographic Statistical Summary**: Aggregate numbers categorized by Age Group, Sex, Educational Attainment, and Employment Status.
- **Signatory Blocks**: Built-in verification blocks formatted for the **SK Chairperson**, **SK Secretary**, and **LYDO / Municipal Officials**.
- **Print / PDF Export**: Optimized print stylesheet (`@media print`) that removes web navigation bars and formats the report cleanly for letter/legal paper.

### 5.5 Audit Trail & Security Logs
- Accessible to Municipal Administrators via the **Audit Trail** tab.
- Displays an immutable history of system events:
  - **Action Types**: `LOGIN`, `EDIT`, `DELETE`, `SYNC`.
  - **Timestamp**: Recorded down to the second.
  - **User & Barangay**: The username and origin of the operator.
  - **Target Record**: Name of the youth profile altered.
  - **Detailed Log**: Specific field-level diffs (e.g., `Highest Educational Attainment: 'Junior HS' to 'College'`).

### 5.6 Auxiliary Modules (CSV Uploader & Form Generator)
Accessible directly through the header navigation pill bar:
- **CSV Uploader**: Hosted on Google Apps Script, handling file intake, code translation, and sheet insertion.
- **Form Generator**: Browser-based page layout engine calibrated for Legal paper printing, producing barcode-ready profiling forms.

---

## 6. Data Dictionary & Standardization Coding Guide

To maintain data integrity across hundreds of field enumerators, the system adheres to strict standard shortcodes. When encoding via mobile apps or spreadsheets, the following codes must be used:

### 6.1 Basic Demographics
| Field | Shortcode | Database Value |
| :--- | :---: | :--- |
| **Sex** | `M` | Male |
| | `F` | Female |
| | `P` | Prefer not to say |
| **Civil Status** | `S` | Single |
| | `M` | Married |
| | `W` | Widowed |
| | `D` | Separated |
| **Tribe / Ethnicity** | `BLA` | Blaan |
| | `TAG` | Tagakaulo |
| | *(Text)* | Custom / Non-IP |

### 6.2 Education & Employment
| Field | Shortcode | Database Value |
| :--- | :---: | :--- |
| **Educational Status** | `ISY` | In-School Youth |
| | `OSY` | Out-of-School Youth |
| **Highest Education** | `E` | Elementary |
| | `JH` | Junior HS |
| | `SH` | Senior HS |
| | `V` | Vocational |
| | `C` | College |
| | `PG` | Post-Graduate |
| **Employment Status** | `ST` | Student |
| | `E` | Employed |
| | `SE` | Self-Employed |
| | `U` | Unemployed |

### 6.3 Nature of Work Codes
| Code | Standard Classification | Code | Standard Classification |
| :---: | :--- | :---: | :--- |
| `ADM` | Administrative / Clerical | `SKL` | Skilled Trades / Technical Services |
| `PRO` | Professional / Technical | `MAN` | Manufacturing / Production |
| `EDU` | Education / Teaching | `SAL` | Sales / Service / Hospitality |
| `HLT` | Health / Medical Services | `TRN` | Transport / Logistics |
| `SOC` | Social & Community Development | `ICT` | ICT / Digital Services |
| `SEC` | Protective & Security Services | `CRE` | Creative / Arts / Media |
| `AGR` | Agriculture / Forestry / Fisheries | `STU` | Student / Not Currently Employed |

### 6.4 Youth Classification & Sectors (Multi-select, separated by `;`)
| Code | Youth Sector Meaning |
| :---: | :--- |
| `ISY` | In-School Youth |
| `OSY` | Out-of-School Youth |
| `WRK` | Working Youth |
| `PWD` | Youth with Disability (PWD) |
| `IND` | Indigenous Youth |
| `SPY` | Single Parent Youth |
| `LGBT` | LGBTQIA+ Youth |
| `CICL` | Youth in Conflict with the Law |

### 6.5 Economic & Connectivity Indicators
| Field | Code | Value |
| :--- | :---: | :--- |
| **Household Monthly Income** | `B1` | Below ₱10,000 |
| | `B2` | ₱10,001–₱20,000 |
| | `B3` | ₱20,001–₱30,000 |
| | `A3` | Above ₱30,000 |
| **Internet Access** | `Y` / `N` | Yes / No |
| **Connection Type** | `MD` / `WF` / `NO` | Mobile Data / Wi-Fi / None |

---

## 7. System Administration & Cloud Maintenance

### 7.1 Firebase Hosting Deployment
The frontend is deployed to Firebase Hosting. When modifications are made to any file in `public/`:
1. Open PowerShell or Terminal in the project root (`D:\JnnlCre8tor\skypxfirebase`).
2. Verify you are authenticated with an authorized Google Account:
   ```bash
   firebase login
   ```
3. Verify the target project is set to `sk-lgumalungon-profiling-sys`:
   ```bash
   firebase use sk-lgumalungon-profiling-sys
   ```
4. Deploy to the live production server:
   ```bash
   firebase deploy --only hosting
   ```
5. Confirm live status:
   - Primary: `https://sk-lgumalungon-profiling-sys.web.app`
   - Secondary: `https://sk-lgumalungon-profiling-sys.firebaseapp.com`

### 7.2 Google Apps Script REST API Deployment
If backend logic in `public/code.gs` is updated:
1. Open [Google Apps Script Dashboard](https://script.google.com).
2. Locate the linked script project for the Malungon Youth Profiling Database.
3. Replace the script editor code with the updated contents of [code.gs](file:///d:/JnnlCre8tor/skypxfirebase/public/code.gs).
4. Click **Deploy** > **Manage Deployments**.
5. Click the Edit pencil icon, increment the version to **New version**, and click **Deploy**.
6. Ensure settings are:
   - *Execute as*: **Me (your Google account)**.
   - *Who has access*: **Anyone**.
7. If the URL changed, update `const API_URL` in [app.js](file:///d:/JnnlCre8tor/skypxfirebase/public/app.js#L4) and [login.html](file:///d:/JnnlCre8tor/skypxfirebase/public/login.html#L172), then re-deploy to Firebase.

### 7.3 Google Sheets Database Architecture
The backend Google Sheet (`ID: 1shTi8-72Zdue1AnjOxRxDBM8Z5CfGmmYYz56trYCeYc`) consists of 4 required sheets:

1. **`skypDatabase`**:
   - Contains all 42 survey fields with an additional `UID` column at the end.
   - The system automatically triggers `generateMissingUIDs()` to issue UUIDs to any manually inserted rows.
2. **`skypUsers`**:
   - Columns: `Username | Password | Barangay | Role | Token`
   - Holds credentials and active session tokens.
3. **`skypLogs`**:
   - Columns: `Timestamp | User | Barangay | Action | Record | Details`
   - Automatically appended every time an action occurs.
4. **`Online_Staging`**:
   - Receives raw online form submissions before being merged into the master database.

### 7.4 Web Form Synchronization (Online Staging)
When youth self-register online via public Google Forms:
1. Online submissions land in the `eProfiling` sheet of the online intake workbook.
2. The System Admin logs in to the dashboard and clicks **Sync Online Data**.
3. The API copies new records into the `Online_Staging` tab of the master database, stamps the source rows as `Synced`, and logs the operation in the audit trail.
4. The Admin can inspect and verify staged entries before appending them to `skypDatabase`.

---

## 8. Troubleshooting & Support Protocols

### Issue 1: "Unauthorized Access. Please login."
- **Root Cause**: The session token has expired, been wiped from browser memory, or the user's row in `skypUsers` was modified.
- **Resolution**: Clear your browser cache/cookies, navigate back to `login.html`, and log in again.

### Issue 2: Demographic Charts fail to render
- **Root Cause**: Client device lacks an internet connection to load Google Charts from `https://www.gstatic.com/charts/loader.js`, or a browser ad-blocker is intercepting the script.
- **Resolution**: Disable ad-blocking extensions for `sk-lgumalungon-profiling-sys.web.app` and ensure network access to Google Static CDN domains.

### Issue 3: CSV Uploader returns "Mismatched Columns" or "No Data"
- **Root Cause**: The exported CSV has modified headers, missing columns, or was saved in a format other than UTF-8 CSV.
- **Resolution**: Ensure the mobile app exports standard CSV format. Do not rename or delete header columns in Excel prior to uploading.

### Issue 4: Updates to `code.gs` not taking effect
- **Root Cause**: Google Apps Script was edited but not redeployed under a **New Version**.
- **Resolution**: In Google Apps Script, always create a **New Version** when deploying web app modifications. Testing in the development editor does not update the live `/exec` endpoint.

---
*Manual Version: 1.0 (2026 Edition)*  
*Prepared for: Sangguniang Kabataan Federation of Malungon, Sarangani Province*  
*Document Repository: `D:\JnnlCre8tor\skypxfirebase\MANUAL.md`*
