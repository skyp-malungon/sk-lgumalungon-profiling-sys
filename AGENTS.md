# Sangguniang Kabataan Youth Profiling & Management System (SKYMS)
## Municipality of Malungon, Province of Sarangani

### 1. Repository Architecture & Layout
- `public/`: Production assets hosted on Firebase Hosting.
  - `index.html`: Admin and Barangay analytics dashboard, youth registry table, reports preview, audit logs, and account management views.
  - `login.html`: Unified authentication portal supporting Google Sign-In and Username/Password with Admin Approval enforcement.
  - `app.js`: Core client-side controller managing Firestore reads/writes, dynamic age recomputation, chart rendering (Google Charts), and user access controls.
  - `csv-parser.js`: In-browser PapaParse engine for parsing 42/43-column survey CSVs, auto-expanding Malungon demographic shortcodes, and concurrently committing records to Firestore.
  - `ui-alerts.js`: SweetAlert2 notification system for alerts, confirmations, toasts, and loading spinners supporting Light and Dark themes.
  - `firebase-config.js`: Firebase client initialization with offline IndexedDB persistence.
  - `style.css`: Modern responsive styles, printing rules, and full dark-theme overrides.
- `firestore.rules`: Cloud Firestore Security Rules v2 enforcing multi-tenant Barangay isolation, role-based access control, strict type checking, and AST budget compliance.
- `firestore.indexes.json`: Composite indexes for querying youth profiles, users, and audit logs.
- `firebase.json`: Firebase Hosting and Firestore configuration.
- `components/`: Reference Google Apps Script, form generator templates, and Android survey APK.

---

### 2. Multi-Tenant Role-Based Access Control (RBAC)
- **Municipal Administrator (`role: 'Admin'`):**
  - Jurisdiction: All 31 Barangays of Malungon.
  - Privileges: Cross-barangay comparative analytics, youth profile management, web form sync from `online_submissions`, audit log oversight, and user account review/approval/deactivation.
- **Barangay Council User (`role: 'Barangay User'`):**
  - Jurisdiction: Scoped strictly to assigned Barangay (`userData.barangay`).
  - Restrictions: Can only query and mutate youth records and audit logs belonging to their own barangay. Cannot approve accounts or sync global web submissions.
- **Fail-Closed Approval System:**
  - All new registrations (Google or Password) start as `status: 'Pending', isApproved: false`.
  - Non-approved users are immediately rejected by `auth.onAuthStateChanged()` on the frontend and blocked by `isApprovedUser()` in Firestore Security Rules.

---

### 3. Firestore Rules Guidelines & Constraints
- Rules Version: `rules_version = '2';`.
- Max AST & Evaluation Budget: Avoid deeply nested map operations and excessive `get()` calls (max 10 `get()` per evaluation, and batch writes count against 20 lookups).
- Data Nullability: Helper validators (`isShortStr`, `isLongStr`, `isDateVal`, `isAgeVal`, `isCalcAgeVal`, `isHouseholdMembersVal`) MUST allow `null` or absent values to accommodate optional survey fields.
- Document Keys: `isValidYouthProfile` and `isValidYouthProfileUpdate` enforce strict whitelist matching `youthProfileKeys()`.

---

### 4. Deployment & Maintenance Runbook
- **Test Firestore Rules:**
  ```bash
  firebase deploy --only firestore:rules --dry-run
  ```
- **Deploy to Production:**
  ```bash
  firebase deploy --only hosting,firestore
  ```
- **Git Push:**
  ```bash
  git add .
  git commit -m "..."
  git push origin main
  ```
