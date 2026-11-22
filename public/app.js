// ===============================================================
// SK YOUTH MANAGEMENT SYSTEM - FIREBASE FIRESTORE CONTROLLER
// Municipality of Malungon, Province of Sarangani
// ===============================================================

// --- AUTHENTICATION CHECK (VERIFIED VIA FIREBASE AUTH + FIRESTORE) ---
let USER_ROLE = 'Barangay User';
let USER_BRGY = '';
let USERNAME = 'User';
let CURRENT_UID = null;
let authVerified = false;
let appBooted = false;
const APP_VERSION = 'v2.0.0';
let syncToastShown = false;

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const safeGet = (obj, searchKey) => {
    if (!obj) return '';
    const key = Object.keys(obj).find(k => k.trim().toLowerCase() === searchKey.toLowerCase());
    return key && obj[key] !== null && obj[key] !== undefined ? obj[key].toString() : '';
};

function logout() {
    authVerified = false;
    CURRENT_UID = null;
    window.CURRENT_USER_CONTEXT = null;
    ['sk_auth_token', 'sk_user_role', 'sk_user_barangay', 'sk_username', 'sk_status'].forEach(k => {
        sessionStorage.removeItem(k);
    });
    if (typeof auth !== 'undefined' && auth.signOut) {
        auth.signOut().catch(() => {}).finally(() => {
            window.location.replace('login.html');
        });
    } else {
        window.location.replace('login.html');
    }
}

function maybeBootDashboard() {
    if (authVerified && googleChartsLoaded && !appBooted) {
        appBooted = true;
        initializeApp();
    }
}

// Authoritative Firebase Auth + Firestore approval verification
if (typeof auth !== 'undefined' && auth.onAuthStateChanged) {
    auth.onAuthStateChanged(async (firebaseUser) => {
        if (!firebaseUser) {
            window.location.replace('login.html');
            return;
        }

        try {
            const docSnap = await db.collection('users').doc(firebaseUser.uid).get();
            if (!docSnap.exists) {
                console.warn('[Auth Monitor] User profile missing in Firestore. Signing out.');
                logout();
                return;
            }

            const userData = docSnap.data();
            // Fail-closed: require explicit Approved status and isApproved === true
            if (userData.status !== 'Approved' || userData.isApproved !== true) {
                console.warn('[Auth Monitor] Account status is ' + userData.status + '. Signing out.');
                logout();
                return;
            }

            USER_ROLE = userData.role === 'Admin' ? 'Admin' : 'Barangay User';
            USER_BRGY = USER_ROLE === 'Admin' ? 'All' : (userData.barangay || userData.Barangay || '');
            USERNAME = userData.username || userData.email || firebaseUser.email || 'User';
            CURRENT_UID = firebaseUser.uid;
            window.CURRENT_USER_CONTEXT = {
                uid: CURRENT_UID,
                role: USER_ROLE,
                barangay: USER_BRGY,
                username: USERNAME
            };

            if (USER_ROLE !== 'Admin' && !USER_BRGY) {
                console.warn('[Auth Monitor] Barangay user missing assigned jurisdiction. Signing out.');
                logout();
                return;
            }

            authVerified = true;
            maybeBootDashboard();
        } catch (err) {
            console.error('[Auth Monitor] Verification failed:', err);
            logout();
        }
    });
} else {
    window.location.replace('login.html');
}

// --- Global State ---
let globalData = [];
let filteredData = [];
let filteredTableData = [];
let currentPage = 1;
let rowsPerPage = 10;
let currentSortField = null;
let currentSortAsc = true;
let googleChartsLoaded = false;
let currentReportType = 'masterlist';
let currentEditData = null;
let currentChartData = null;
let pendingCsvRecords = [];

// Clock
setInterval(() => {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const versionEl = document.getElementById('appVersionBadge');
    if (versionEl) versionEl.textContent = `Version ${APP_VERSION}`;
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}, 1000);

google.charts.load('current', { 'packages': ['corechart'] });
google.charts.setOnLoadCallback(() => {
    googleChartsLoaded = true;
    maybeBootDashboard();
});

// Setup drag and drop events when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                handleCsvFileSelected(files[0]);
            }
        }, false);
    }
});

// --- CORE DATA ENGINE (FIRESTORE) ---

async function initializeApp() {
    if (!authVerified) return;
    const tbody = document.getElementById('registryTableBody');
    if (tbody) {
        tbody.innerHTML = Array(5).fill('').map(() => `<tr><td colspan="8" class="p-3"><div class="skeleton skeleton-text w-100"></div></td></tr>`).join('');
    }

    applyRoleBasedUI();

    try {
        let query = db.collection('youth_profiles');
        if (USER_ROLE !== 'Admin' && USER_BRGY && USER_BRGY !== 'All') {
            query = query.where('Barangay', '==', USER_BRGY);
        }

        const snapshot = await query.get();
        const records = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.uid = doc.id;
            // Recompute age dynamically from Date of Birth so age brackets stay current
            const dob = data['Date of Birth'];
            if (dob) {
                const liveAge = calculateAgeFromDob(dob);
                if (liveAge !== null) {
                    data.calculatedAge = liveAge;
                    data.ageBracket = getAgeBracketLabel(liveAge);
                }
            }
            records.push(data);
        });

        globalData = records;
        filteredData = [...globalData];
        filteredTableData = [...globalData];

        const filterOptions = extractFilterOptions(globalData);
        populateFilters(filterOptions);

        const stats = computeDashboardStats(filteredData);
        currentChartData = computeChartData(filteredData);

        renderDashboardStats(stats);
        renderCharts(currentChartData);
        renderTable();
        updateFilterSummary();
        if (USER_ROLE === 'Admin') {
            checkPendingSync();
            checkPendingUsersCount();
        }

        const totalRecordsLabel = document.getElementById('totalRecordsLabel');
        if (totalRecordsLabel) {
            totalRecordsLabel.textContent = `${globalData.length} total records in Cloud Firestore`;
        }
    } catch (err) {
        console.error('[Firestore Error]:', err);
        uiAlert({ type: 'error', title: 'Connection Error', text: 'Could not fetch data from Cloud Firestore. ' + err.message });
    }
}

function applyRoleBasedUI() {
    const roleBadge = document.getElementById('userRoleBadge');
    if (roleBadge) {
        if (USER_ROLE === 'Admin') {
            roleBadge.innerHTML = `<i class="bi bi-shield-check" aria-hidden="true"></i><span>Admin &bull; All Barangays</span>`;
        } else {
            roleBadge.innerHTML = `<i class="bi bi-geo-alt-fill" aria-hidden="true"></i><span>SK Council &bull; ${escapeHtml(USER_BRGY || 'Barangay')}</span>`;
        }
    }

    const tabUsersNav = document.getElementById('tab-users-nav-item');

    if (USER_ROLE === 'Admin') {
        if (tabUsersNav) tabUsersNav.style.display = 'list-item';
        checkPendingUsersCount();
    } else {
        if (tabUsersNav) tabUsersNav.style.display = 'none';

        const brgyHeader = document.querySelector('.brand-section p');
        if (brgyHeader) brgyHeader.innerText = `Barangay ${USER_BRGY}, Municipality of Malungon`;

        const filterBrgy = document.getElementById('barangayFilter');
        if (filterBrgy) {
            filterBrgy.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = USER_BRGY;
            opt.textContent = USER_BRGY;
            filterBrgy.appendChild(opt);
            filterBrgy.disabled = true;
        }

        const reportBrgy = document.getElementById('reportBarangaySelect');
        if (reportBrgy) {
            reportBrgy.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = USER_BRGY;
            opt.textContent = USER_BRGY;
            reportBrgy.appendChild(opt);
            reportBrgy.disabled = true;
        }

        const btnSyncWeb = document.getElementById('btnSyncWeb');
        if (btnSyncWeb) btnSyncWeb.style.setProperty('display', 'none', 'important');
    }
}

function extractFilterOptions(data) {
    const barangays = [...new Set(data.map(r => String(r.Barangay || '').trim()).filter(Boolean))].sort();
    const tribes = [...new Set(data.map(r => String(r.Tribe || '').trim()).filter(t => t && t !== 'Not Specified' && t !== 'none'))].sort();
    return { barangays, tribes };
}

function computeDashboardStats(data) {
    const stats = {
        totalRecords: data.length,
        qualifiedYouth: 0,
        overAgedCount: 0,
        totalBarangays: new Set(data.map(r => r.Barangay).filter(Boolean)).size,
        genderCount: { Male: 0, Female: 0 },
        qualifiedGender: { Male: 0, Female: 0 },
        organizationMembers: 0,
        tribeCount: new Set(data.map(r => r['Tribe']).filter(t => t && t !== 'Not Specified')).size
    };

    data.forEach(record => {
        const age = record.calculatedAge;
        if (age >= 15 && age <= 30) {
            stats.qualifiedYouth++;
            if (record.Sex === 'Male') stats.qualifiedGender.Male++;
            if (record.Sex === 'Female') stats.qualifiedGender.Female++;
        } else if (age > 30) {
            stats.overAgedCount++;
        }

        if (record.Sex === 'Male') stats.genderCount.Male++;
        if (record.Sex === 'Female') stats.genderCount.Female++;
        if (record['Member of Youth Organization'] && String(record['Member of Youth Organization']).toLowerCase().includes('yes')) {
            stats.organizationMembers++;
        }
    });

    stats.totalYouth = stats.qualifiedYouth;
    return stats;
}

function computeChartData(data) {
    const countByKey = (key) => {
        const counts = {};
        data.forEach(r => {
            const k = r[key] || 'Unknown';
            counts[k] = (counts[k] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    };

    return {
        barangay: countByKey('Barangay'),
        education: countByKey('Highest Educational Attainment'),
        employment: countByKey('Employment Status'),
        ageBracket: countByKey('ageBracket'),
        tribe: countByKey('Tribe'),
        sector: countByKey('Youth Sector')
    };
}

function updateSitioDropdown(selectedBarangay = '') {
    const sitioSelect = document.getElementById('sitioFilter');
    if (!sitioSelect) return;
    const currentVal = sitioSelect.value;
    while (sitioSelect.options.length > 1) sitioSelect.remove(1);

    const sourceData = selectedBarangay
        ? globalData.filter(r => (r.Barangay || '').trim() === selectedBarangay.trim())
        : globalData;

    const uniqueSitios = [...new Set(sourceData.map(r => safeGet(r, 'sitio/purok').trim()).filter(s => s !== '' && s.toLowerCase() !== 'unknown' && s.toLowerCase() !== 'n/a'))].sort();
    uniqueSitios.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        sitioSelect.appendChild(opt);
    });

    if (uniqueSitios.includes(currentVal)) {
        sitioSelect.value = currentVal;
    } else {
        sitioSelect.value = '';
    }
}

function populateFilters(filters) {
    if (USER_ROLE === 'Admin') {
        const populate = (id, data) => {
            const select = document.getElementById(id);
            if (!select) return;
            while (select.options.length > 1) select.remove(1);
            data.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item; opt.textContent = item;
                select.appendChild(opt);
            });
        };
        populate('barangayFilter', filters.barangays);
        populate('reportBarangaySelect', filters.barangays);

        const brgySelect = document.getElementById('barangayFilter');
        if (brgySelect && !brgySelect.dataset.hasChangeListener) {
            brgySelect.addEventListener('change', () => updateSitioDropdown(brgySelect.value));
            brgySelect.dataset.hasChangeListener = 'true';
        }
    }

    const activeBrgy = USER_ROLE === 'Admin' ? (document.getElementById('barangayFilter')?.value || '') : USER_BRGY;
    updateSitioDropdown(activeBrgy);
    bindFilterAutoApply();

    const tSelect = document.getElementById('tribeFilter');
    if (tSelect) {
        while (tSelect.options.length > 1) tSelect.remove(1);
        filters.tribes.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item; opt.textContent = item;
            tSelect.appendChild(opt);
        });
    }

    const rtSelect = document.getElementById('reportTribeSelect');
    if (rtSelect) {
        while (rtSelect.options.length > 1) rtSelect.remove(1);
        filters.tribes.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item; opt.textContent = item;
            rtSelect.appendChild(opt);
        });
    }
}


function updateFilterSummary() {
    const resultBadge = document.getElementById('filterResultBadge');
    const chipsBar = document.getElementById('activeFiltersBar');
    if (resultBadge) {
        resultBadge.textContent = `Showing ${filteredData.length.toLocaleString()} of ${globalData.length.toLocaleString()} records`;
    }
    if (!chipsBar) return;

    const chips = [];
    const brgy = USER_ROLE === 'Admin' ? document.getElementById('barangayFilter')?.value : USER_BRGY;
    const sitio = document.getElementById('sitioFilter')?.value;
    const sex = document.getElementById('sexFilter')?.value;
    const tribe = document.getElementById('tribeFilter')?.value;
    const eligibilityEl = document.getElementById('eligibilityFilter');
    const eligibilityText = eligibilityEl?.options[eligibilityEl.selectedIndex]?.text;

    if (brgy) chips.push(`Barangay: ${brgy}`);
    if (sitio) chips.push(`Sitio/Purok: ${sitio}`);
    if (sex) chips.push(`Sex: ${sex}`);
    if (tribe) chips.push(`Tribe: ${tribe}`);
    if (eligibilityEl && eligibilityEl.value !== 'all') chips.push(`Eligibility: ${eligibilityText}`);

    if (chips.length === 0) {
        chipsBar.classList.add('d-none');
        chipsBar.innerHTML = '';
    } else {
        chipsBar.classList.remove('d-none');
        chipsBar.innerHTML = `<span class="small text-muted fw-semibold me-1">Active:</span>` +
            chips.map(c => `<span class="filter-chip">${escapeHtml(c)}</span>`).join('');
    }
}

function bindFilterAutoApply() {
    const filterIds = ['barangayFilter', 'sitioFilter', 'sexFilter', 'tribeFilter', 'eligibilityFilter'];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.dataset.autoFilterBound) return;
        el.addEventListener('change', () => {
            if (id === 'barangayFilter') {
                updateSitioDropdown(el.value);
            }
            applyFilters();
        });
        el.dataset.autoFilterBound = 'true';
    });
}

function applyFilters() {
    const barangay = USER_ROLE === 'Admin' ? document.getElementById('barangayFilter').value : USER_BRGY;
    const sitio = document.getElementById('sitioFilter')?.value || '';
    const sex = document.getElementById('sexFilter')?.value || '';
    const tribe = document.getElementById('tribeFilter')?.value || '';
    const eligibility = document.getElementById('eligibilityFilter')?.value || 'all';

    filteredData = globalData.filter(record => {
        let match = true;
        const age = record.calculatedAge;
        if (barangay && record.Barangay !== barangay) match = false;
        if (sitio && safeGet(record, 'sitio/purok').trim() !== sitio) match = false;
        if (sex && record.Sex !== sex) match = false;
        if (tribe && record.Tribe !== tribe) match = false;
        if (eligibility === 'qualified' && (age < 15 || age > 30)) match = false;
        if (eligibility === 'overaged' && age <= 30) match = false;
        return match;
    });

    filteredTableData = [...filteredData];
    currentPage = 1;

    const stats = computeDashboardStats(filteredData);
    currentChartData = computeChartData(filteredData);

    renderDashboardStats(stats);
    renderCharts(currentChartData);
    renderTable();
    updateFilterSummary();
}

function clearFilters() {
    if (USER_ROLE === 'Admin') {
        const b = document.getElementById('barangayFilter');
        if (b) b.value = '';
    }
    document.getElementById('sitioFilter').value = '';
    document.getElementById('sexFilter').value = '';
    document.getElementById('tribeFilter').value = '';
    document.getElementById('eligibilityFilter').value = 'qualified';
    updateSitioDropdown(USER_ROLE === 'Admin' ? '' : USER_BRGY);
    applyFilters();
}

function renderDashboardStats(stats) {
    const total = filteredData.length;
    let employedCount = 0;
    let inSchoolCount = 0;
    const barangayCounts = {};
    let topBarangay = { name: 'N/A', count: 0 };
    const sitioCounts = {};
    let topSitio = { name: 'N/A', count: 0 };

    filteredData.forEach(r => {
        const empStatus = safeGet(r, 'employment status').toLowerCase();
        if (empStatus === 'employed' || empStatus === 'self-employed') employedCount++;

        const eduStatus = safeGet(r, 'educational status').toLowerCase();
        if (eduStatus.includes('in-school') || eduStatus.includes('in school')) inSchoolCount++;

        const brgy = r.Barangay || 'Unknown';
        barangayCounts[brgy] = (barangayCounts[brgy] || 0) + 1;
        if (barangayCounts[brgy] > topBarangay.count) {
            topBarangay.name = brgy;
            topBarangay.count = barangayCounts[brgy];
        }

        let sitio = safeGet(r, 'sitio/purok').trim();
        if (sitio !== '' && sitio.toLowerCase() !== 'unknown' && sitio.toLowerCase() !== 'n/a') {
            sitioCounts[sitio] = (sitioCounts[sitio] || 0) + 1;
            if (sitioCounts[sitio] > topSitio.count) {
                topSitio.name = sitio;
                topSitio.count = sitioCounts[sitio];
            }
        }
    });

    const employmentPercent = total > 0 ? ((employedCount / total) * 100).toFixed(1) + '%' : '0%';
    const topBrgyPercent = total > 0 ? ((topBarangay.count / total) * 100).toFixed(1) + '%' : '0%';
    const inSchoolPercent = total > 0 ? ((inSchoolCount / total) * 100).toFixed(1) + '%' : '0%';
    const topSitioPercent = total > 0 ? ((topSitio.count / total) * 100).toFixed(1) + '%' : '0%';

    const createCard = (title, value, subtext, icon, colorClass, bgClass) => `
        <div class="col-md-3">
            <div class="stat-card" style="border-left: 4px solid ${colorClass}">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="stat-label">${title}</div>
                    <div class="stat-icon-wrapper" style="background-color: ${bgClass}; color: ${colorClass}"><i class="bi ${icon}"></i></div>
                </div>
                <div class="stat-number">${value}</div>
                ${subtext ? `<div class="stat-subtext">${subtext}</div>` : ''}
            </div>
        </div>
    `;

    const genderSubtext = `Male: ${stats.qualifiedGender?.Male || 0} | Female: ${stats.qualifiedGender?.Female || 0}`;

    const cardsHtml = (USER_ROLE === 'Admin') ? [
        createCard('Total Youth', stats.totalYouth, genderSubtext, 'bi-people-fill', '#2563eb', 'var(--primary-light)'),
        createCard('Educational Status', inSchoolPercent, `${inSchoolCount} In-School Youths`, 'bi-book-fill', '#10b981', 'var(--success-soft)'),
        createCard('Employment', employmentPercent, `${employedCount} out of ${total} Employed`, 'bi-briefcase-fill', '#f59e0b', 'var(--warning-soft)'),
        createCard('Top Brgy', topBrgyPercent, `${escapeHtml(topBarangay.name)} (${topBarangay.count} youths)`, 'bi-award-fill', '#ef4444', 'var(--danger-soft)')
    ].join('') : [
        createCard('Total Youth', stats.totalYouth, genderSubtext, 'bi-people-fill', '#2563eb', 'var(--primary-light)'),
        createCard('Educational Status', inSchoolPercent, `${inSchoolCount} In-School Youths`, 'bi-book-fill', '#10b981', 'var(--success-soft)'),
        createCard('Employment', employmentPercent, `${employedCount} out of ${total} Employed`, 'bi-briefcase-fill', '#f59e0b', 'var(--warning-soft)'),
        createCard('Top Sitio/Purok', topSitioPercent, `${escapeHtml(topSitio.name)} (${topSitio.count} youths)`, 'bi-house-heart-fill', '#ef4444', 'var(--danger-soft)')
    ].join('');

    const statsContainer = document.getElementById('dashboardStats');
    if (statsContainer) statsContainer.innerHTML = cardsHtml;
}

function renderCharts(charts) {
    if (!googleChartsLoaded || !charts) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? '#1f2937' : '#e2e8f0';
    const commonOpts = {
        backgroundColor: 'transparent',
        chartArea: { width: '85%', height: '75%' },
        legend: { position: 'bottom', textStyle: { fontSize: 11, color: textColor } },
        hAxis: { textStyle: { color: textColor, fontSize: 11 }, gridlines: { color: gridColor } },
        vAxis: { textStyle: { color: textColor, fontSize: 11 }, gridlines: { color: gridColor }, baselineColor: gridColor },
        pieSliceBorderColor: isDark ? '#111827' : '#ffffff',
        colors: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
        fontName: 'Public Sans'
    };

    const safeArray = (arr, header1, header2) => {
        if (!arr || arr.length === 0) return [[header1, header2], ['None', 0]];
        return [[header1, header2], ...arr];
    };

    new google.visualization.ColumnChart(document.getElementById('barangayChart')).draw(
        google.visualization.arrayToDataTable(safeArray(charts.barangay, 'Barangay', 'Count')),
        { ...commonOpts, legend: { position: 'none' }, colors: ['#3b82f6'], hAxis: { slantedText: true, slantedTextAngle: 45, textStyle: { fontSize: 10, color: textColor } } }
    );
    new google.visualization.PieChart(document.getElementById('employmentChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.employment, 'Status', 'Count')), { ...commonOpts, pieHole: 0.4 });
    new google.visualization.PieChart(document.getElementById('educationChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.education, 'Level', 'Count')), commonOpts);
    new google.visualization.ColumnChart(document.getElementById('ageChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.ageBracket, 'Age', 'Count')), { ...commonOpts, legend: { position: 'none' }, colors: ['#8b5cf6'] });
    new google.visualization.PieChart(document.getElementById('tribeChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.tribe, 'Tribe', 'Count')), { ...commonOpts, pieHole: 0.4 });
    new google.visualization.PieChart(document.getElementById('sectorChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.sector, 'Sector', 'Count')), { ...commonOpts, pieHole: 0.4, colors: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'] });
}

window.addEventListener('sk-theme-changed', () => {
    if (googleChartsLoaded && currentChartData) {
        renderCharts(currentChartData);
    }
});

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (googleChartsLoaded && currentChartData && document.getElementById('dashboard-view')?.classList.contains('active')) {
            renderCharts(currentChartData);
        }
    }, 250);
});

document.querySelector('button[data-bs-target="#dashboard-view"]')?.addEventListener('shown.bs.tab', () => {
    if (googleChartsLoaded && currentChartData) renderCharts(currentChartData);
});

// --- REGISTRY TABLE ---

function renderTable() {
    const tbody = document.getElementById('registryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredTableData.slice(start, end);

    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2 opacity-25"></i>No records found in Cloud Firestore</td></tr>';
        document.getElementById('startIdx').innerText = 0;
        document.getElementById('endIdx').innerText = 0;
        document.getElementById('totalIdx').innerText = 0;
        return;
    }

    pageData.forEach(row => {
        const isOverAged = row.calculatedAge > 30;
        const tr = document.createElement('tr');
        if (isOverAged) tr.classList.add('row-overaged');

        tr.innerHTML = `
            <td class="text-secondary small font-monospace">${escapeHtml(row['FormNo.'] || '-')}</td>
            <td><div class="fw-semibold text-dark">${escapeHtml(row['Full Name'] || 'N/A')}</div>${isOverAged ? '<span class="badge bg-danger text-white py-1" style="font-size: 0.65rem;">OVER-AGED</span>' : ''}</td>
            <td>${escapeHtml(row.calculatedAge || '-')}</td>
            <td><span class="badge badge-modern ${row['Sex'] === 'Male' ? 'bg-info bg-opacity-10 text-info' : 'bg-danger bg-opacity-10 text-danger'}">${escapeHtml(row['Sex'] || '-')}</span></td>
            <td>${escapeHtml(row['Barangay'] || '')}</td>
            <td><span class="badge badge-modern bg-light text-dark border">${escapeHtml(row['Tribe'] || '-')}</span></td>
            <td class="small text-secondary">${escapeHtml(row['Civil Status'] || '-')}</td>
            <td class="text-end">
                <div class="btn-group">
                    <button type="button" class="btn btn-sm btn-light border text-primary" data-action="view" data-uid="${escapeHtml(row.uid)}" title="View Profile"><i class="bi bi-eye"></i></button>
                    <button type="button" class="btn btn-sm btn-light border text-warning" data-action="edit" data-uid="${escapeHtml(row.uid)}" title="Edit Record"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm btn-light border text-danger" data-action="delete" data-uid="${escapeHtml(row.uid)}" title="Delete Record"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (!tbody.dataset.delegatedBound) {
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action][data-uid]');
            if (!btn) return;
            const uid = btn.dataset.uid;
            const action = btn.dataset.action;
            if (action === 'view') openViewModal(uid);
            else if (action === 'edit') openEditModal(uid);
            else if (action === 'delete') confirmDelete(uid);
        });
        tbody.dataset.delegatedBound = 'true';
    }

    document.getElementById('startIdx').innerText = start + 1;
    document.getElementById('endIdx').innerText = Math.min(end, filteredTableData.length);
    document.getElementById('totalIdx').innerText = filteredTableData.length;
    renderPagination();
}

function renderPagination() {
    const ul = document.getElementById('paginationControls');
    if (!ul) return;
    ul.innerHTML = '';
    const totalPages = Math.ceil(filteredTableData.length / rowsPerPage);

    const createBtn = (text, page, disabled) => {
        const li = document.createElement('li');
        li.className = `page-item ${disabled ? 'disabled' : ''}`;
        li.innerHTML = `<button class="page-link text-dark ${disabled ? 'bg-light' : ''}" onclick="changePage(${page})">${text}</button>`;
        ul.appendChild(li);
    };

    createBtn('Prev', currentPage - 1, currentPage === 1);
    const li = document.createElement('li');
    li.className = 'page-item active';
    li.innerHTML = `<span class="page-link bg-primary border-primary">${currentPage}</span>`;
    ul.appendChild(li);
    createBtn('Next', currentPage + 1, currentPage === totalPages || totalPages === 0);
}

function changePage(page) {
    currentPage = page;
    renderTable();
}

function changePageSize(newSize) {
    rowsPerPage = parseInt(newSize, 10) || 10;
    currentPage = 1;
    renderTable();
}

function toggleSort(field) {
    if (currentSortField === field) {
        currentSortAsc = !currentSortAsc;
    } else {
        currentSortField = field;
        currentSortAsc = true;
    }

    filteredTableData.sort((a, b) => {
        let valA = a[field] !== undefined && a[field] !== null ? a[field] : '';
        let valB = b[field] !== undefined && b[field] !== null ? b[field] : '';

        // Handle numeric sorting for age and form numbers
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
            return currentSortAsc ? numA - numB : numB - numA;
        }

        const comp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
        return currentSortAsc ? comp : -comp;
    });

    // Update th visual classes and icons
    document.querySelectorAll('.th-sort-btn').forEach(btn => {
        const btnField = btn.getAttribute('data-sort');
        const icon = btn.querySelector('i');
        if (btnField === field) {
            btn.classList.add('is-sorted');
            if (icon) {
                icon.className = currentSortAsc ? 'bi bi-arrow-up text-primary small' : 'bi bi-arrow-down text-primary small';
            }
        } else {
            btn.classList.remove('is-sorted');
            if (icon) {
                icon.className = 'bi bi-arrow-down-up small opacity-50';
            }
        }
    });

    currentPage = 1;
    renderTable();
}

function filterTable() {
    const term = (document.getElementById('tableSearch')?.value || '').toLowerCase().trim();
    filteredTableData = filteredData.filter(row =>
        (row['Full Name'] && row['Full Name'].toLowerCase().includes(term)) ||
        (row['Barangay'] && row['Barangay'].toLowerCase().includes(term)) ||
        (row['FormNo.'] && row['FormNo.'].toString().toLowerCase().includes(term)) ||
        (row['Sitio/Purok'] && row['Sitio/Purok'].toLowerCase().includes(term)) ||
        (row['Tribe'] && row['Tribe'].toLowerCase().includes(term))
    );
    currentPage = 1;
    renderTable();
}

function clearTableSearch() {
    const input = document.getElementById('tableSearch');
    if (input) {
        input.value = '';
    }
    filterTable();
}

function exportToCSV() {
    if (!filteredTableData || filteredTableData.length === 0) {
        uiToast('info', 'Nothing to Export', 'No matching youth records found for the current filters.');
        return;
    }
    const columns = ['FormNo.', 'Full Name', 'Sex', 'Date of Birth', 'calculatedAge', 'Barangay', 'Sitio/Purok', 'Tribe', 'Civil Status', 'Contact Number', 'Educational Status', 'Highest Educational Attainment', 'Employment Status', 'Youth Sector', 'Member of Youth Organization'];
    const headers = ['Form Number', 'Full Name', 'Sex', 'Date of Birth', 'Age', 'Barangay', 'Sitio/Purok', 'Tribe', 'Civil Status', 'Contact Number', 'Educational Status', 'Education', 'Employment', 'Sector', 'Org Member'];

    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
    filteredTableData.forEach(row => {
        const rowData = columns.map(col => {
            let val = row[col] === null || row[col] === undefined ? '' : String(row[col]);
            val = val.replace(/"/g, '""');
            return `"${val}"`;
        });
        csvContent += rowData.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `SK_Youth_Registry_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- VIEW / EDIT / DELETE MODALS ---

function openViewModal(uid) {
    const data = globalData.find(r => r.uid === uid);
    if (!data) return;
    window.currentPrintData = data;
    const fields = [
        ['Form Number', 'FormNo.'], ['Full Name', 'Full Name'],
        ['Birth Date', 'Date of Birth'], ['Age', 'calculatedAge'],
        ['Sex', 'Sex'], ['Civil Status', 'Civil Status'],
        ['Tribe', 'Tribe'], ['Contact', 'Contact Number'],
        ['Barangay', 'Barangay'], ['Sitio/Purok', 'Sitio/Purok'],
        ['Education', 'Highest Educational Attainment'],
        ['Employment', 'Employment Status'], ['Sector', 'Youth Sector'],
        ['Org Member', 'Member of Youth Organization']
    ];

    let html = '<div class="row g-3">';
    fields.forEach(([label, key]) => {
        html += `<div class="col-md-6"><div class="p-2 border-bottom"><label class="d-block small text-secondary text-uppercase fw-bold" style="font-size: 0.7rem;">${label}</label><span class="text-dark fw-medium">${escapeHtml(safeGet(data, key) || '-')}</span></div></div>`;
    });
    html += '</div>';
    document.getElementById('viewModalBody').innerHTML = html;
    new bootstrap.Modal(document.getElementById('viewModal')).show();
}

function formatDateForInput(rawDate) {
    if (!rawDate) return '';
    if (rawDate.toDate && typeof rawDate.toDate === 'function') {
        rawDate = rawDate.toDate();
    }
    if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
        return rawDate.trim();
    }
    const parsed = new Date(rawDate);
    if (isNaN(parsed.getTime())) return '';
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function openEditModal(uid) {
    const data = globalData.find(r => r.uid === uid);
    if (!data) return;
    currentEditData = data;
    const fields = [
        { label: 'Full Name', key: 'Full Name', type: 'text', col: 12, required: true },
        { label: 'Date of Birth', key: 'Date of Birth', type: 'date', col: 6 },
        { label: 'Sex', key: 'Sex', type: 'select', options: ['Male', 'Female', 'Prefer not to say'], col: 6 },
        { label: 'Civil Status', key: 'Civil Status', type: 'select', options: ['Single', 'Married', 'Widowed', 'Separated'], col: 6 },
        { label: 'Tribe', key: 'Tribe', type: 'text', col: 6 },
        { label: 'Contact', key: 'Contact Number', type: 'text', col: 6 },
        { label: 'Barangay', key: 'Barangay', type: 'text', col: 6, locked: USER_ROLE !== 'Admin', required: true },
        { label: 'Sitio/Purok', key: 'Sitio/Purok', type: 'text', col: 6 },
        { label: 'Educational Status', key: 'Educational Status', type: 'select', options: ['In-School Youth', 'Out-of-School Youth'], col: 6 },
        { label: 'Employment', key: 'Employment Status', type: 'select', options: ['Employed', 'Unemployed', 'Student', 'Self-Employed'], col: 6 },
        { label: 'Sector', key: 'Youth Sector', type: 'text', col: 6 }
    ];

    let html = '<form id="editForm"><div class="row g-3">';
    fields.forEach(field => {
        let input = '';
        const cleanId = 'edit_' + field.key.replace(/[^a-zA-Z0-9]/g, '_');
        const currentVal = safeGet(data, field.key).trim();

        if (field.type === 'select') {
            const normalizedCurrent = currentVal.toLowerCase();
            const matchedOption = field.options.find(opt => opt.toLowerCase() === normalizedCurrent);
            input = `<select class="form-select form-control-modern" data-field-key="${escapeHtml(field.key)}" id="${cleanId}">`;
            input += `<option value="" ${!currentVal ? 'selected' : ''}>-- Not Specified --</option>`;
            if (currentVal && !matchedOption) {
                input += `<option value="${escapeHtml(currentVal)}" selected>${escapeHtml(currentVal)}</option>`;
            }
            field.options.forEach(opt => {
                input += `<option value="${escapeHtml(opt)}" ${matchedOption === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`;
            });
            input += '</select>';
        } else {
            const val = field.type === 'date' ? formatDateForInput(data[field.key] || currentVal) : currentVal;
            const disabledState = field.locked ? 'disabled' : '';
            const reqAttr = field.required ? 'required' : '';
            input = `<input type="${field.type}" class="form-control form-control-modern" data-field-key="${escapeHtml(field.key)}" id="${cleanId}" value="${escapeHtml(val)}" ${disabledState} ${reqAttr}>`;
        }
        html += `<div class="col-md-${field.col}"><label class="form-label-modern" for="${cleanId}">${field.label}</label>${input}</div>`;
    });
    html += '</div></form>';
    document.getElementById('editModalBody').innerHTML = html;
    new bootstrap.Modal(document.getElementById('editModal')).show();
}

async function saveEditedRecord() {
    if (!currentEditData) return;
    const updatedData = {};
    document.querySelectorAll('#editForm input, #editForm select').forEach(input => {
        const fieldKey = input.getAttribute('data-field-key') || input.id.replace('edit_', '');
        updatedData[fieldKey] = (input.value || '').trim();
    });

    if (USER_ROLE !== 'Admin') {
        updatedData['Barangay'] = USER_BRGY;
    }

    if (!updatedData['Full Name']) {
        uiAlert({ type: 'warning', title: 'Full Name Required', text: 'Please enter the youth full name before saving.' });
        return;
    }
    if (!updatedData['Barangay']) {
        uiAlert({ type: 'warning', title: 'Barangay Required', text: 'Please enter a valid Barangay before saving.' });
        return;
    }

    updatedData['Full Name'] = updatedData['Full Name'].slice(0, 150);
    updatedData['Barangay'] = updatedData['Barangay'].slice(0, 100);
    updatedData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    if (updatedData['Date of Birth']) {
        const rawAge = calculateAgeFromDob(updatedData['Date of Birth']);
        const calculatedAge = (rawAge !== null && Number.isFinite(rawAge) && rawAge >= 0 && rawAge <= 120)
            ? Math.floor(rawAge)
            : null;
        updatedData.calculatedAge = calculatedAge;
        updatedData.ageBracket = getAgeBracketLabel(calculatedAge);
    }

    const editModalEl = document.getElementById('editModal');
    const modalInst = bootstrap.Modal.getInstance(editModalEl);
    if (modalInst) modalInst.hide();
    uiLoading('Saving Changes', 'Updating youth profile in Cloud Firestore...');

    try {
        await db.collection('youth_profiles').doc(currentEditData.uid).set(updatedData, { merge: true });

        // Audit Trail (non-blocking if logging fails separately)
        try {
            await db.collection('audit_logs').add({
                action: 'EDIT',
                recordName: (updatedData['Full Name'] || 'Unknown').slice(0, 200),
                details: `Profile updated for ${updatedData['Full Name'] || 'Unknown'}`.slice(0, 2000),
                barangay: (updatedData['Barangay'] || USER_BRGY || 'All').slice(0, 100),
                user: (USERNAME || 'User').slice(0, 100),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (logErr) {
            console.warn('[Audit Log] Failed to record edit log:', logErr);
        }

        uiClose();
        uiToast('success', 'Profile Saved', `${updatedData['Full Name'] || 'Youth profile'} has been updated.`);
        initializeApp();
    } catch (err) {
        console.error('[Edit Save Error]', err);
        uiAlert({ type: 'error', title: 'Update Failed', text: 'Failed to update record in Firestore: ' + err.message });
    }
}

async function confirmDelete(uid) {
    const target = globalData.find(r => r.uid === uid);
    const result = await uiConfirm({
        type: 'warning',
        title: 'Delete Youth Profile?',
        html: `Permanently delete the profile of <strong>${escapeHtml(target ? target['Full Name'] : 'this youth')}</strong>? This action cannot be undone.`,
        confirmText: 'Yes, Delete Profile',
        danger: true
    });

    if (result.isConfirmed) {
        uiLoading('Deleting Profile', 'Removing record from Cloud Firestore...');
        try {
            await db.collection('youth_profiles').doc(uid).delete();

            await db.collection('audit_logs').add({
                action: 'DELETE',
                recordName: target ? target['Full Name'] : 'Unknown',
                details: 'Record was permanently deleted from Firestore.',
                barangay: target ? (target['Barangay'] || 'All') : (USER_BRGY || 'All'),
                user: USERNAME,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            uiClose();
            uiToast('success', 'Profile Deleted', 'The record has been permanently removed.');
            initializeApp();
        } catch (err) {
            uiAlert({ type: 'error', title: 'Delete Failed', text: 'Could not delete record: ' + err.message });
        }
    }
}

// --- AUDIT TRAIL LOGS ---

let allLogs = [];

async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></td></tr>';

    try {
        let query = db.collection('audit_logs').orderBy('timestamp', 'desc').limit(100);
        if (USER_ROLE !== 'Admin' && USER_BRGY) {
            query = query.where('barangay', '==', USER_BRGY);
        }

        const snapshot = await query.get();
        allLogs = [];
        snapshot.forEach(doc => {
            const log = doc.data();
            log.id = doc.id;
            allLogs.push(log);
        });

        filterLogs();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">Failed to load logs from Firestore: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function filterLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('logSearchInput')?.value || '').toLowerCase().trim();
    const actionFilter = document.getElementById('logActionFilter')?.value || '';

    const filtered = allLogs.filter(log => {
        const matchesAction = !actionFilter || log.action === actionFilter;
        const matchesSearch = !searchTerm ||
            (log.recordName && String(log.recordName).toLowerCase().includes(searchTerm)) ||
            (log.details && String(log.details).toLowerCase().includes(searchTerm)) ||
            (log.user && String(log.user).toLowerCase().includes(searchTerm)) ||
            (log.action && String(log.action).toLowerCase().includes(searchTerm));
        return matchesAction && matchesSearch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2 opacity-25"></i>No matching audit logs found</td></tr>';
        return;
    }

    let html = '';
    filtered.forEach(log => {
        let actionClass = 'bg-secondary text-white';
        if (log.action === 'DELETE' || log.action === 'USER_DELETE' || log.action === 'USER_REJECT') actionClass = 'bg-danger text-white';
        else if (log.action === 'CSV_IMPORT' || log.action === 'USER_APPROVE') actionClass = 'bg-success text-white';
        else if (log.action === 'EDIT' || log.action === 'SYNC') actionClass = 'bg-primary text-white';
        else if (log.action === 'USER_DEACTIVATE') actionClass = 'bg-warning text-dark';

        const dateStr = log.timestamp && log.timestamp.toDate ? log.timestamp.toDate().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

        html += `<tr>
            <td class="small text-secondary fw-medium">${escapeHtml(dateStr)}</td>
            <td><span class="badge badge-modern ${actionClass}">${escapeHtml(log.action || '-')}</span></td>
            <td><div class="fw-semibold text-dark">${escapeHtml(log.recordName || '-')}</div>${log.user ? `<small class="text-muted">By: ${escapeHtml(log.user)}</small>` : ''}</td>
            <td class="text-secondary small">${escapeHtml(log.details || '-')}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// --- DRAG AND DROP CSV UPLOADER ---

function handleCsvFileSelected(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            uiLoading('Parsing CSV File', 'Expanding Malungon shortcodes and validating rows...');
            const records = await parseAndNormalizeCsvText(e.target.result);
            uiClose();

            pendingCsvRecords = records;
            const detectedBrgy = records[0]?.Barangay || 'Unknown';

            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileStats').textContent = `${records.length} valid youth records found (${(file.size / 1024).toFixed(1)} KB)`;
            document.getElementById('detectedBrgyBadge').textContent = `Barangay: ${detectedBrgy}`;
            document.getElementById('csvFileInfo').style.display = 'flex';
            document.getElementById('btnStartImport').disabled = false;
        } catch (err) {
            uiAlert({ type: 'error', title: 'Error Parsing CSV', text: err.message });
        }
    };
    reader.readAsText(file);
}

async function startCsvImport() {
    if (!pendingCsvRecords.length) return;
    const btn = document.getElementById('btnStartImport');
    btn.disabled = true;
    document.getElementById('uploadProgressSection').style.display = 'block';

    try {
        const importCount = pendingCsvRecords.length;
        await uploadRecordsToFirestore(pendingCsvRecords, (processed, total) => {
            const pct = Math.round((processed / total) * 100);
            document.getElementById('uploadProgressBar').style.width = `${pct}%`;
            document.getElementById('uploadProgressPercent').textContent = `${pct}% (${processed}/${total})`;
        });

        bootstrap.Modal.getInstance(document.getElementById('csvModal')).hide();
        uiToast('success', 'CSV Import Complete', `Successfully imported ${importCount} youth records into Cloud Firestore.`);

        pendingCsvRecords = [];
        document.getElementById('csvFileInput').value = '';
        document.getElementById('csvFileInfo').style.display = 'none';
        document.getElementById('uploadProgressSection').style.display = 'none';
        btn.disabled = false;

        initializeApp();
    } catch (err) {
        uiAlert({ type: 'error', title: 'Import Error', text: 'Failed to save to Firestore: ' + err.message });
        btn.disabled = false;
    }
}


function updateSyncNotification(count) {
    const num = Number(count) || 0;
    const navBadge = document.getElementById('registrySyncBadge');
    const btnBadge = document.getElementById('syncBtnBadge');
    const banner = document.getElementById('syncNoticeBanner');
    const bannerText = document.getElementById('syncNoticeText');

    if (USER_ROLE !== 'Admin' || num <= 0) {
        navBadge?.classList.add('d-none');
        btnBadge?.classList.add('d-none');
        banner?.classList.add('d-none');
        return;
    }

    const label = num > 99 ? '99+' : String(num);
    if (navBadge) {
        navBadge.textContent = label;
        navBadge.classList.remove('d-none');
    }
    if (btnBadge) {
        btnBadge.textContent = label;
        btnBadge.classList.remove('d-none');
    }
    if (banner && bannerText) {
        bannerText.innerHTML = `<strong>${num.toLocaleString()}</strong> new web form ${num === 1 ? 'submission is' : 'submissions are'} available to sync to Staging.`;
        banner.classList.remove('d-none');
    }

    if (!syncToastShown && typeof uiToast === 'function') {
        syncToastShown = true;
        uiToast('info', 'Pending Web Submissions', `${num.toLocaleString()} new web form ${num === 1 ? 'record is' : 'records are'} ready to sync.`, 4500);
    }
}

async function checkPendingSync() {
    if (USER_ROLE !== 'Admin') return;
    try {
        const snap = await db.collection('online_submissions').get();
        updateSyncNotification(snap.size);
    } catch (err) {
        console.warn('Could not check online submissions:', err);
    }
}

// --- ONLINE SUBMISSIONS SYNC (eProfiling) ---

function normalizeSubmissionForMaster(doc) {
    const raw = doc.data() || {};
    const keyMap = {
        barangay: 'Barangay',
        fullName: 'Full Name',
        name: 'Full Name',
        contactNumber: 'Contact Number',
        sitio: 'Sitio/Purok',
        sex: 'Sex',
        dateOfBirth: 'Date of Birth',
        civilStatus: 'Civil Status',
        tribe: 'Tribe',
        educationalStatus: 'Educational Status',
        highestEducationalAttainment: 'Highest Educational Attainment',
        employmentStatus: 'Employment Status',
        youthSector: 'Youth Sector',
        formNo: 'FormNo.'
    };
    const ignoredKeys = new Set(['createdAt', 'submittedAt']);
    const normalized = {};

    Object.keys(raw).forEach(k => {
        if (ignoredKeys.has(k)) return;
        const targetKey = keyMap[k] || k;
        if (normalized[targetKey] === undefined || normalized[targetKey] === '') {
            normalized[targetKey] = raw[k];
        }
    });

    if (normalized['Date of Birth']) {
        const age = calculateAgeFromDob(normalized['Date of Birth']);
        if (age !== null) {
            normalized.calculatedAge = age;
            normalized.ageBracket = getAgeBracketLabel(age);
        }
    }

    normalized.uid = doc.id;
    normalized.approvedAt = firebase.firestore.FieldValue.serverTimestamp();
    return normalized;
}

async function triggerWebSync() {
    if (USER_ROLE !== 'Admin') {
        uiAlert({ type: 'error', title: 'Access Denied', text: 'Only the System Admin can sync web forms.' });
        return;
    }

    uiLoading('Checking Online Submissions', 'Querying pending eProfiling registrations...');

    try {
        const snap = await db.collection('online_submissions').get();
        if (snap.empty) {
            uiClose();
            uiToast('info', 'Up to Date', 'No new online self-registrations waiting in the intake queue.');
            return;
        }

        const count = snap.size;
        const result = await uiConfirm({
            type: 'question',
            title: `Found ${count} Online Submission${count === 1 ? '' : 's'}`,
            text: `Approve and merge ${count} youth registration${count === 1 ? '' : 's'} into the Master Database?`,
            confirmText: 'Yes, Approve All'
        });

        if (result.isConfirmed) {
            uiLoading('Merging into Master Registry', `Syncing ${count} records to Cloud Firestore...`);

            // Chunk into 3 docs (6 write ops) per batch to stay well under Firestore's 20 get()/exists() rules call limit per batch
            const docs = snap.docs;
            const CHUNK_SIZE = 3;
            for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
                const chunk = docs.slice(i, i + CHUNK_SIZE);
                const batch = db.batch();
                chunk.forEach(doc => {
                    const masterRef = db.collection('youth_profiles').doc(doc.id);
                    batch.set(masterRef, normalizeSubmissionForMaster(doc), { merge: true });
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }

            await db.collection('audit_logs').add({
                action: 'SYNC',
                recordName: 'Web Forms Batch',
                details: `Approved ${count} online self-registrations to Master Database.`,
                barangay: 'All',
                user: USERNAME,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            uiClose();
            updateSyncNotification(0);
            uiToast('success', 'Web Sync Complete', `Approved and merged ${count} record${count === 1 ? '' : 's'} into Cloud Firestore.`);
            initializeApp();
        }
    } catch (err) {
        uiAlert({ type: 'error', title: 'Sync Error', text: err.message });
    }
}

// --- OFFICIAL REPORT GENERATION ---

function setReportType(type, btn) {
    currentReportType = type;
    document.querySelectorAll('#reports-view button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function generateReportPreview() {
    const barangay = USER_ROLE === 'Admin' ? document.getElementById('reportBarangaySelect').value : USER_BRGY;
    const eligibility = document.getElementById('reportEligibilitySelect').value;
    const employment = document.getElementById('reportEmploymentSelect').value;
    const tribe = document.getElementById('reportTribeSelect').value;
    const previewArea = document.getElementById('reportPreviewArea');

    let data = barangay ? globalData.filter(r => r.Barangay === barangay) : globalData;
    if (eligibility === 'qualified') data = data.filter(r => r.calculatedAge >= 15 && r.calculatedAge <= 30);
    else if (eligibility === 'overaged') data = data.filter(r => r.calculatedAge > 30);
    if (employment !== 'all') data = data.filter(r => r['Employment Status'] === employment);
    if (tribe !== '') data = data.filter(r => r.Tribe === tribe);

    let filterLabels = [eligibility === 'all' ? 'ALL AGES' : eligibility.toUpperCase(), employment === 'all' ? 'ALL EMPLOYMENT' : employment.toUpperCase()];
    if (tribe) filterLabels.push(tribe.toUpperCase());
    const subtitleText = filterLabels.join(' • ');

    const pageSize = 20;
    const totalPages = currentReportType === 'summary' ? 1 : (Math.ceil(data.length / pageSize) || 1);
    let fullHtml = "";

    for (let i = 0; i < totalPages; i++) {
        const start = i * pageSize;
        const pageData = data.slice(start, start + pageSize);
        const isLast = (i === totalPages - 1);

        fullHtml += `
            <div class="print-page ${!isLast ? 'page-break' : ''}">
                ${i === 0 ? getOfficialHeader(barangay) : ''}
                <div class="text-center mb-4">
                    <h5 class="fw-bold text-uppercase mb-1" style="color: #000; letter-spacing: 1px;">
                        ${currentReportType === 'masterlist' ? 'YOUTH MASTER LIST' : 'DEMOGRAPHIC SUMMARY'}
                    </h5>
                    <div class="small fw-bold text-secondary">${subtitleText}</div>
                    <small class="text-muted fst-italic">Page ${i + 1} of ${totalPages}</small>
                </div>
                ${currentReportType === 'masterlist' ? getMasterListTable(pageData, start) : getSummaryContent(data)}
                ${isLast ? getSignatureBlock() : '<div class="text-center small mt-4 text-muted fst-italic">... Continued on next page</div>'}
            </div>
        `;
    }
    previewArea.innerHTML = fullHtml;
}

function getOfficialHeader(barangay) {
    const brgyText = barangay ? `BARANGAY ${barangay.toUpperCase()}` : "MUNICIPAL WIDE REPORT";
    return `
        <div class="d-flex justify-content-center align-items-center gap-4 mb-4 border-bottom border-dark border-2 pb-3">
            <img src="favicon_LGUMalungon/android-chrome-512x512.png" style="width: 80px; height: 80px; object-fit: contain;" alt="LGU Malungon Seal">
            <div class="text-center text-dark">
                <div class="small text-uppercase">Republic of the Philippines</div>
                <div class="small text-uppercase">Province of Sarangani</div>
                <div class="fw-bold">MUNICIPALITY OF MALUNGON</div>
                <div class="fw-bold fs-5 mt-1">${escapeHtml(brgyText)}</div>
            </div>
            <img src="favicon_SKFED/android-chrome-512x512.png" style="width: 80px; height: 80px; object-fit: contain;" alt="SK Federation Malungon Logo">
        </div>
    `;
}

function getMasterListTable(data, startIndex) {
    if (!data.length) return '<p class="text-center fst-italic">No records found.</p>';
    const rows = data.map((r, i) => `
        <tr style="font-size: 11px;">
            <td class="text-center border border-dark p-1">${startIndex + i + 1}</td>
            <td class="border border-dark p-1 fw-bold">${escapeHtml(r['Full Name'] || '')}</td>
            <td class="text-center border border-dark p-1">${escapeHtml(r['Sex']?.charAt(0) || '')}</td>
            <td class="text-center border border-dark p-1">${escapeHtml(r.calculatedAge || '')}</td>
            <td class="border border-dark p-1">${escapeHtml(r['Tribe'] || '')}</td>
            <td class="border border-dark p-1">${escapeHtml(r['Youth Sector'] || '')}</td>
            <td class="border border-dark p-1">${escapeHtml(r['Employment Status'] || '')}</td>
        </tr>
    `).join('');
    return `<table class="w-100 border-collapse border border-dark mb-3"><thead class="bg-light text-uppercase fw-bold" style="font-size: 10px;"><tr><th class="border border-dark p-2 text-center" style="width:30px">#</th><th class="border border-dark p-2">Name</th><th class="border border-dark p-2 text-center" style="width:30px">Sex</th><th class="border border-dark p-2 text-center" style="width:30px">Age</th><th class="border border-dark p-2">Tribe</th><th class="border border-dark p-2">Sector</th><th class="border border-dark p-2">Employment</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function getSummaryContent(data) {
    const stats = {
        total: data.length,
        males: data.filter(r => r.Sex === 'Male').length,
        females: data.filter(r => r.Sex === 'Female').length,
        employed: data.filter(r => r['Employment Status'] === 'Employed').length,
        students: data.filter(r => r['Employment Status'] === 'Student').length
    };
    return `
        <div class="row g-3 mb-4">
            <div class="col-4 text-center p-3 border border-dark rounded"><div class="display-6 fw-bold text-primary">${stats.total}</div><div class="small fw-bold text-uppercase">Total Records</div></div>
            <div class="col-4 text-center p-3 border border-dark rounded"><div class="display-6 fw-bold text-success">${stats.males}</div><div class="small fw-bold text-uppercase">Males</div></div>
            <div class="col-4 text-center p-3 border border-dark rounded"><div class="display-6 fw-bold text-danger">${stats.females}</div><div class="small fw-bold text-uppercase">Females</div></div>
            <div class="col-6 text-center p-3 border border-dark rounded"><div class="fs-2 fw-bold text-dark">${stats.employed}</div><div class="small fw-bold text-uppercase">Employed</div></div>
            <div class="col-6 text-center p-3 border border-dark rounded"><div class="fs-2 fw-bold text-dark">${stats.students}</div><div class="small fw-bold text-uppercase">Students</div></div>
        </div>
    `;
}

function getSignatureBlock() {
    return `<div class="d-flex justify-content-between mt-5 pt-5"><div class="text-center" style="width: 200px;"><div class="border-top border-dark fw-bold pt-1">SK SECRETARY</div><div class="small fst-italic">Prepared By</div></div><div class="text-center" style="width: 200px;"><div class="border-top border-dark fw-bold pt-1">SK CHAIRPERSON</div><div class="small fst-italic">Attested By</div></div></div>`;
}

function printReport() {
    const content = document.getElementById('reportPreviewArea').innerHTML;
    if (!content.includes('print-page')) {
        uiToast('info', 'Preview Required', 'Please generate a report preview before printing.');
        return;
    }
    document.getElementById('printArea').innerHTML = content;
    document.body.classList.add('is-printing');
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('is-printing');
            document.getElementById('printArea').innerHTML = '';
        }, 500);
    }, 150);
}

function printProfile() {
    const data = window.currentPrintData;
    if (!data) return;
    const printHtml = `
        <div class="print-page">
            ${getOfficialHeader(data.Barangay)}
            <h3 class="text-center fw-bold mb-5 text-decoration-underline">INDIVIDUAL PROFILE</h3>
            <div class="px-5">
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">NAME:</div><div class="col-8">${escapeHtml(safeGet(data, 'Full Name') || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">SEX / AGE:</div><div class="col-8">${escapeHtml(safeGet(data, 'Sex') || '-')} / ${escapeHtml(data.calculatedAge || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">ADDRESS:</div><div class="col-8">${escapeHtml(safeGet(data, 'Barangay') || '-')}${safeGet(data, 'sitio/purok') ? ', ' + escapeHtml(safeGet(data, 'sitio/purok')) : ''}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">TRIBE:</div><div class="col-8">${escapeHtml(safeGet(data, 'Tribe') || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">CIVIL STATUS:</div><div class="col-8">${escapeHtml(safeGet(data, 'Civil Status') || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">CONTACT:</div><div class="col-8">${escapeHtml(safeGet(data, 'Contact Number') || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">EDUC. STATUS:</div><div class="col-8">${escapeHtml(safeGet(data, 'Educational Status') || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">EDUCATION:</div><div class="col-8">${escapeHtml(safeGet(data, 'Highest Educational Attainment') || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">EMPLOYMENT:</div><div class="col-8">${escapeHtml(safeGet(data, 'Employment Status') || '-')}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">YOUTH SECTOR:</div><div class="col-8">${escapeHtml(safeGet(data, 'Youth Sector') || '-')}</div></div>
            </div>
            ${getSignatureBlock()}
        </div>
    `;
    const modalInstance = bootstrap.Modal.getInstance(document.getElementById('viewModal'));
    if (modalInstance) modalInstance.hide();

    setTimeout(() => {
        document.getElementById('printArea').innerHTML = printHtml;
        document.body.classList.add('is-printing');
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.body.classList.remove('is-printing');
                document.getElementById('printArea').innerHTML = '';
            }, 500);
        }, 150);
    }, 400);
}

// ===============================================================
// USER MANAGEMENT & ACCOUNT APPROVALS (MUNICIPAL ADMIN)
// ===============================================================

let allUsersList = [];

// Fallback age calculators if csv-parser.js loads after or is delayed
if (typeof calculateAgeFromDob !== 'function') {
    window.calculateAgeFromDob = function(dateOfBirth) {
        if (!dateOfBirth) return null;
        const birthDate = new Date(dateOfBirth);
        if (isNaN(birthDate.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        return age;
    };
}

if (typeof getAgeBracketLabel !== 'function') {
    window.getAgeBracketLabel = function(age) {
        if (age === null || age === undefined || isNaN(age)) return 'Unknown';
        if (age < 15) return 'Below 15';
        if (age >= 15 && age <= 17) return 'Youth (15–17)';
        if (age >= 18 && age <= 24) return 'Youth (18–24)';
        if (age >= 25 && age <= 29) return 'Youth (25–29)';
        return '30+';
    };
}

async function checkPendingUsersCount() {
    if (USER_ROLE !== 'Admin') return;
    try {
        const snap = await db.collection('users').where('status', '==', 'Pending').get();
        const count = snap.size;
        const badge = document.getElementById('pendingUsersBadge');
        const banner = document.getElementById('pendingUsersBanner');
        const bannerText = document.getElementById('pendingUsersBannerText');

        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }

        if (banner && bannerText) {
            if (count > 0) {
                bannerText.innerHTML = `<strong>${count}</strong> account registration ${count === 1 ? 'is' : 'are'} pending your review and approval.`;
                banner.classList.remove('d-none');
            } else {
                banner.classList.add('d-none');
            }
        }
    } catch (err) {
        console.warn('[Users] Error checking pending users:', err);
    }
}

async function loadUsers() {
    if (USER_ROLE !== 'Admin') return;
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></td></tr>';

    try {
        const snap = await db.collection('users').get();
        allUsersList = [];
        snap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            allUsersList.push(data);
        });

        // Sort: Pending first, then by createdAt desc
        allUsersList.sort((a, b) => {
            const aPending = (a.status === 'Pending') ? 1 : 0;
            const bPending = (b.status === 'Pending') ? 1 : 0;
            if (aPending !== bPending) return bPending - aPending;

            const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
        });

        checkPendingUsersCount();
        filterUsersTable();
    } catch (err) {
        console.error('[Users] Load Error:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-danger">Failed to load accounts from Firestore: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function filterUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('userStatusFilter')?.value || '';
    const roleFilter = document.getElementById('userRoleFilter')?.value || '';

    const filtered = allUsersList.filter(u => {
        const status = u.status || 'Approved';
        const role = u.role || 'Barangay User';

        if (statusFilter && status !== statusFilter) return false;
        if (roleFilter && role !== roleFilter) return false;

        if (searchTerm) {
            const username = (u.username || '').toLowerCase();
            const fullName = (u.fullName || '').toLowerCase();
            const brgy = (u.barangay || '').toLowerCase();
            const contact = (u.contactNumber || '').toLowerCase();
            if (!username.includes(searchTerm) && !fullName.includes(searchTerm) && !brgy.includes(searchTerm) && !contact.includes(searchTerm)) {
                return false;
            }
        }
        return true;
    });

    renderUsersTable(filtered);
}

function filterUsersByStatus(status) {
    const sel = document.getElementById('userStatusFilter');
    if (sel) sel.value = status;
    filterUsersTable();
}

function clearUsersFilters() {
    const searchInput = document.getElementById('userSearchInput');
    const statusFilter = document.getElementById('userStatusFilter');
    const roleFilter = document.getElementById('userRoleFilter');
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    if (roleFilter) roleFilter.value = '';
    filterUsersTable();
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted"><i class="bi bi-people fs-1 d-block mb-2 opacity-25"></i>No matching user accounts found.</td></tr>';
        return;
    }

    let html = '';
    users.forEach(u => {
        const status = u.status || 'Approved';
        const userDisplayName = u.username || u.email || 'User';
        const isGoogleUser = (u.authProvider === 'google');
        const providerBadge = isGoogleUser 
            ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle ms-1" style="font-size:0.7rem;" title="Signed in with Google"><i class="bi bi-google me-1"></i>Google</span>' 
            : '';

        let badgeHtml = '';
        if (status === 'Pending') {
            badgeHtml = '<span class="badge bg-warning text-dark py-1 px-2"><i class="bi bi-clock-history me-1"></i>Pending Approval</span>';
        } else if (status === 'Approved') {
            badgeHtml = '<span class="badge bg-success py-1 px-2"><i class="bi bi-check-circle me-1"></i>Approved</span>';
        } else if (status === 'Rejected') {
            badgeHtml = '<span class="badge bg-danger py-1 px-2"><i class="bi bi-x-circle me-1"></i>Rejected</span>';
        } else if (status === 'Deactivated') {
            badgeHtml = '<span class="badge bg-secondary py-1 px-2"><i class="bi bi-slash-circle me-1"></i>Deactivated</span>';
        }

        const dateStr = u.createdAt && u.createdAt.toDate ? u.createdAt.toDate().toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
        const contactDetails = [u.fullName, u.email, u.contactNumber].filter(Boolean);
        const contactInfo = contactDetails.length > 0 ? contactDetails.map(escapeHtml).join(' &bull; ') : '<span class="text-muted fst-italic">Not specified</span>';

        let actionsHtml = '<div class="btn-group btn-group-sm">';
        const brgyVal = u.barangay || '';

        if (status === 'Pending') {
            actionsHtml += `
                <button type="button" class="btn btn-sm btn-success" data-user-action="approve" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(userDisplayName)}" data-barangay="${escapeHtml(brgyVal)}" title="Approve Account">
                    <i class="bi bi-check-lg me-1"></i>Approve
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-user-action="reject" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(userDisplayName)}" data-barangay="${escapeHtml(brgyVal)}" title="Reject Request">
                    <i class="bi bi-x-lg me-1"></i>Reject
                </button>
            `;
        } else if (status === 'Approved') {
            actionsHtml += `
                <button type="button" class="btn btn-sm btn-light border text-warning" data-user-action="deactivate" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(userDisplayName)}" title="Deactivate User">
                    <i class="bi bi-pause-circle"></i> Deactivate
                </button>
                <button type="button" class="btn btn-sm btn-light border text-danger" data-user-action="delete" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(userDisplayName)}" title="Delete User">
                    <i class="bi bi-trash"></i>
                </button>
            `;
        } else if (status === 'Rejected' || status === 'Deactivated') {
            actionsHtml += `
                <button type="button" class="btn btn-sm btn-outline-success" data-user-action="approve" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(userDisplayName)}" data-barangay="${escapeHtml(brgyVal)}" title="Reactivate & Approve">
                    <i class="bi bi-check2-circle me-1"></i>Reactivate
                </button>
                <button type="button" class="btn btn-sm btn-light border text-danger" data-user-action="delete" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(userDisplayName)}" title="Delete User">
                    <i class="bi bi-trash"></i>
                </button>
            `;
        }
        actionsHtml += '</div>';

        html += `<tr>
            <td class="fw-bold text-dark font-monospace">${escapeHtml(userDisplayName)}${providerBadge}</td>
            <td class="small">${contactInfo}</td>
            <td><span class="badge bg-light text-dark border">${escapeHtml(u.barangay || 'All')}</span></td>
            <td><span class="badge ${u.role === 'Admin' ? 'bg-primary' : 'bg-info bg-opacity-10 text-primary border'}">${escapeHtml(u.role || 'Barangay User')}</span></td>
            <td class="small text-secondary">${escapeHtml(dateStr)}</td>
            <td>${badgeHtml}</td>
            <td class="text-end">${actionsHtml}</td>
        </tr>`;
    });

    tbody.innerHTML = html;

    if (!tbody.dataset.delegatedBound) {
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-user-action][data-user-id]');
            if (!btn) return;
            const action = btn.dataset.userAction;
            const userId = btn.dataset.userId;
            const uname = btn.dataset.username || 'User';
            const brgy = btn.dataset.barangay || '';
            if (action === 'approve') approveUser(userId, uname, brgy);
            else if (action === 'reject') rejectUser(userId, uname, brgy);
            else if (action === 'deactivate') toggleUserDeactivate(userId, uname, 'Approved');
            else if (action === 'delete') deleteUserAccount(userId, uname);
        });
        tbody.dataset.delegatedBound = 'true';
    }
}

async function approveUser(userId, username, barangay) {
    if (USER_ROLE !== 'Admin') return;

    const result = await uiConfirm({
        type: 'success',
        title: 'Approve User Account?',
        html: `Approve and activate the account for <strong>${escapeHtml(username)}</strong> (${escapeHtml(barangay ? 'Barangay ' + barangay : 'Admin')})?`,
        confirmText: 'Yes, Approve Account'
    });

    if (result.isConfirmed) {
        uiLoading('Activating Account', `Approving ${username}...`);
        try {
            await db.collection('users').doc(userId).set({
                status: 'Approved',
                isApproved: true,
                approvedBy: USERNAME,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                password: firebase.firestore.FieldValue.delete(),
                passwordHash: firebase.firestore.FieldValue.delete()
            }, { merge: true });

            await db.collection('audit_logs').add({
                action: 'USER_APPROVE',
                recordName: username,
                details: `Approved account for ${username} (${barangay || 'All'})`,
                barangay: barangay || 'All',
                user: USERNAME,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            uiClose();
            uiToast('success', 'Account Approved', `${username} is now active.`);
            loadUsers();
        } catch (err) {
            uiAlert({ type: 'error', title: 'Approval Failed', text: 'Failed to approve user: ' + err.message });
        }
    }
}

async function rejectUser(userId, username, barangay) {
    if (USER_ROLE !== 'Admin') return;

    const result = await uiConfirm({
        type: 'warning',
        title: 'Reject Registration?',
        html: `Decline the account registration request for <strong>${escapeHtml(username)}</strong>?`,
        confirmText: 'Yes, Reject',
        danger: true
    });

    if (result.isConfirmed) {
        uiLoading('Updating Status', `Rejecting registration for ${username}...`);
        try {
            await db.collection('users').doc(userId).set({
                status: 'Rejected',
                isApproved: false,
                rejectedBy: USERNAME,
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                password: firebase.firestore.FieldValue.delete(),
                passwordHash: firebase.firestore.FieldValue.delete()
            }, { merge: true });

            await db.collection('audit_logs').add({
                action: 'USER_REJECT',
                recordName: username,
                details: `Rejected registration request for ${username} (${barangay || 'All'})`,
                barangay: barangay || 'All',
                user: USERNAME,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            uiClose();
            uiToast('info', 'Registration Rejected', `Request for ${username} has been declined.`);
            loadUsers();
        } catch (err) {
            uiAlert({ type: 'error', title: 'Action Failed', text: 'Failed to reject user: ' + err.message });
        }
    }
}

async function toggleUserDeactivate(userId, username, currentStatus) {
    if (USER_ROLE !== 'Admin') return;

    const newStatus = (currentStatus === 'Approved') ? 'Deactivated' : 'Approved';
    const actionLabel = (newStatus === 'Deactivated') ? 'Deactivate' : 'Reactivate';

    const result = await uiConfirm({
        type: newStatus === 'Deactivated' ? 'warning' : 'question',
        title: `${actionLabel} Account?`,
        html: `Are you sure you want to ${actionLabel.toLowerCase()} the account for <strong>${escapeHtml(username)}</strong>?`,
        confirmText: `Yes, ${actionLabel}`,
        danger: newStatus === 'Deactivated'
    });

    if (result.isConfirmed) {
        uiLoading('Updating Account', `${actionLabel}ing ${username}...`);
        try {
            await db.collection('users').doc(userId).set({
                status: newStatus,
                isApproved: (newStatus === 'Approved'),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                password: firebase.firestore.FieldValue.delete(),
                passwordHash: firebase.firestore.FieldValue.delete()
            }, { merge: true });

            await db.collection('audit_logs').add({
                action: newStatus === 'Deactivated' ? 'USER_DEACTIVATE' : 'USER_APPROVE',
                recordName: username,
                details: `${actionLabel}d account for ${username}`,
                barangay: 'All',
                user: USERNAME,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            uiClose();
            uiToast('success', `Account ${actionLabel}d`, `${username} has been ${actionLabel.toLowerCase()}d.`);
            loadUsers();
        } catch (err) {
            uiAlert({ type: 'error', title: 'Update Failed', text: 'Failed to update user: ' + err.message });
        }
    }
}

async function deleteUserAccount(userId, username) {
    if (USER_ROLE !== 'Admin') return;
    if (userId === CURRENT_UID) {
        uiAlert({ type: 'warning', title: 'Action Blocked', text: 'You cannot delete your own active administrator account.' });
        return;
    }

    const result = await uiConfirm({
        type: 'warning',
        title: 'Delete Account?',
        html: `Permanently delete user <strong>${escapeHtml(username)}</strong> from Cloud Firestore? This cannot be undone.`,
        confirmText: 'Yes, Delete Permanently',
        danger: true
    });

    if (result.isConfirmed) {
        uiLoading('Deleting Account', `Removing ${username} from Firestore...`);
        try {
            await db.collection('users').doc(userId).delete();

            await db.collection('audit_logs').add({
                action: 'USER_DELETE',
                recordName: username,
                details: `Permanently deleted user account for ${username}`,
                barangay: 'All',
                user: USERNAME,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            uiClose();
            uiToast('success', 'User Deleted', `${username} has been permanently deleted.`);
            loadUsers();
        } catch (err) {
            uiAlert({ type: 'error', title: 'Delete Failed', text: 'Failed to delete user: ' + err.message });
        }
    }
}
