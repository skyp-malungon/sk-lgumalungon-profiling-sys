// ===============================================================
// SK YOUTH MANAGEMENT SYSTEM - FIREBASE FIRESTORE CONTROLLER
// Municipality of Malungon, Province of Sarangani
// ===============================================================

// --- AUTHENTICATION CHECK ---
if (!sessionStorage.getItem('sk_auth_token')) {
    window.location.href = 'login.html';
}

const USER_ROLE = sessionStorage.getItem('sk_user_role') || 'Barangay User';
const USER_BRGY = sessionStorage.getItem('sk_user_barangay') || '';
const USERNAME = sessionStorage.getItem('sk_username') || 'User';

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
    sessionStorage.clear();
    localStorage.clear();
    if (typeof auth !== 'undefined' && auth.signOut) {
        auth.signOut().catch(() => {});
    }
    window.location.replace('login.html');
}

// --- Global State ---
let globalData = [];
let filteredData = [];
let filteredTableData = [];
let currentPage = 1;
const rowsPerPage = 10;
let googleChartsLoaded = false;
let currentReportType = 'masterlist';
let currentEditData = null;
let currentChartData = null;
let pendingCsvRecords = [];

// Clock
setInterval(() => {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}, 1000);

google.charts.load('current', { 'packages': ['corechart'] });
google.charts.setOnLoadCallback(() => {
    googleChartsLoaded = true;
    initializeApp();
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

        const totalRecordsLabel = document.getElementById('totalRecordsLabel');
        if (totalRecordsLabel) {
            totalRecordsLabel.textContent = `${globalData.length} total records in Cloud Firestore`;
        }
    } catch (err) {
        console.error('[Firestore Error]:', err);
        Swal.fire('Connection Error', 'Could not fetch data from Cloud Firestore. ' + err.message, 'error');
    }
}

function applyRoleBasedUI() {
    if (USER_ROLE !== 'Admin') {
        const brgyHeader = document.querySelector('.brand-section p');
        if (brgyHeader) brgyHeader.innerText = `Barangay ${USER_BRGY}, Municipality of Malungon`;

        const filterBrgy = document.getElementById('barangayFilter');
        if (filterBrgy) {
            filterBrgy.innerHTML = `<option value="${USER_BRGY}">${USER_BRGY}</option>`;
            filterBrgy.disabled = true;
        }

        const reportBrgy = document.getElementById('reportBarangaySelect');
        if (reportBrgy) {
            reportBrgy.innerHTML = `<option value="${USER_BRGY}">${USER_BRGY}</option>`;
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
        createCard('Total Youth', stats.totalYouth, genderSubtext, 'bi-people-fill', '#2563eb', '#eff6ff'),
        createCard('Educational Status', inSchoolPercent, `${inSchoolCount} In-School Youths`, 'bi-book-fill', '#10b981', '#f0fdf4'),
        createCard('Employment', employmentPercent, `${employedCount} out of ${total} Employed`, 'bi-briefcase-fill', '#f59e0b', '#fffbeb'),
        createCard('Top Brgy', topBrgyPercent, `${escapeHtml(topBarangay.name)} (${topBarangay.count} youths)`, 'bi-award-fill', '#ef4444', '#fef2f2')
    ].join('') : [
        createCard('Total Youth', stats.totalYouth, genderSubtext, 'bi-people-fill', '#2563eb', '#eff6ff'),
        createCard('Educational Status', inSchoolPercent, `${inSchoolCount} In-School Youths`, 'bi-book-fill', '#10b981', '#f0fdf4'),
        createCard('Employment', employmentPercent, `${employedCount} out of ${total} Employed`, 'bi-briefcase-fill', '#f59e0b', '#fffbeb'),
        createCard('Top Sitio/Purok', topSitioPercent, `${escapeHtml(topSitio.name)} (${topSitio.count} youths)`, 'bi-house-heart-fill', '#ef4444', '#fef2f2')
    ].join('');

    const statsContainer = document.getElementById('dashboardStats');
    if (statsContainer) statsContainer.innerHTML = cardsHtml;
}

function renderCharts(charts) {
    if (!googleChartsLoaded || !charts) return;
    const commonOpts = { chartArea: { width: '85%', height: '75%' }, legend: { position: 'bottom', textStyle: { fontSize: 11, color: '#64748b' } }, colors: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'], fontName: 'Inter' };

    const safeArray = (arr, header1, header2) => {
        if (!arr || arr.length === 0) return [[header1, header2], ['None', 0]];
        return [[header1, header2], ...arr];
    };

    new google.visualization.ColumnChart(document.getElementById('barangayChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.barangay, 'Barangay', 'Count')), { ...commonOpts, legend: { position: 'none' }, colors: ['#2563eb'], hAxis: { slantedText: true, slantedTextAngle: 45, textStyle: { fontSize: 10 } } });
    new google.visualization.PieChart(document.getElementById('employmentChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.employment, 'Status', 'Count')), { ...commonOpts, pieHole: 0.4 });
    new google.visualization.PieChart(document.getElementById('educationChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.education, 'Level', 'Count')), commonOpts);
    new google.visualization.ColumnChart(document.getElementById('ageChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.ageBracket, 'Age', 'Count')), { ...commonOpts, legend: { position: 'none' }, colors: ['#8b5cf6'] });
    new google.visualization.PieChart(document.getElementById('tribeChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.tribe, 'Tribe', 'Count')), { ...commonOpts, pieHole: 0.4 });
    new google.visualization.PieChart(document.getElementById('sectorChart')).draw(google.visualization.arrayToDataTable(safeArray(charts.sector, 'Sector', 'Count')), { ...commonOpts, pieHole: 0.4, colors: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'] });
}

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
                    <button class="btn btn-sm btn-light border text-primary" onclick="openViewModal('${escapeHtml(row.uid)}')" title="View Profile"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-sm btn-light border text-warning" onclick="openEditModal('${escapeHtml(row.uid)}')" title="Edit Record"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-light border text-danger" onclick="confirmDelete('${escapeHtml(row.uid)}')" title="Delete Record"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

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

function filterTable() {
    const term = document.getElementById('tableSearch').value.toLowerCase();
    filteredTableData = filteredData.filter(row =>
        (row['Full Name'] && row['Full Name'].toLowerCase().includes(term)) ||
        (row['Barangay'] && row['Barangay'].toLowerCase().includes(term)) ||
        (row['FormNo.'] && row['FormNo.'].toString().toLowerCase().includes(term))
    );
    currentPage = 1;
    renderTable();
}

function exportToCSV() {
    if (!filteredTableData || filteredTableData.length === 0) {
        Swal.fire('Info', 'No data to export.', 'info');
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

function openEditModal(uid) {
    const data = globalData.find(r => r.uid === uid);
    if (!data) return;
    currentEditData = data;
    const fields = [
        { label: 'Full Name', key: 'Full Name', type: 'text', col: 12 },
        { label: 'Date of Birth', key: 'Date of Birth', type: 'date', col: 6 },
        { label: 'Sex', key: 'Sex', type: 'select', options: ['Male', 'Female', 'Prefer not to say'], col: 6 },
        { label: 'Civil Status', key: 'Civil Status', type: 'select', options: ['Single', 'Married', 'Widowed', 'Separated'], col: 6 },
        { label: 'Tribe', key: 'Tribe', type: 'text', col: 6 },
        { label: 'Contact', key: 'Contact Number', type: 'text', col: 6 },
        { label: 'Barangay', key: 'Barangay', type: 'text', col: 6, locked: USER_ROLE !== 'Admin' },
        { label: 'Sitio/Purok', key: 'Sitio/Purok', type: 'text', col: 6 },
        { label: 'Educational Status', key: 'Educational Status', type: 'select', options: ['In-School Youth', 'Out-of-School Youth'], col: 6 },
        { label: 'Employment', key: 'Employment Status', type: 'select', options: ['Employed', 'Unemployed', 'Student', 'Self-Employed'], col: 6 },
        { label: 'Sector', key: 'Youth Sector', type: 'text', col: 6 }
    ];

    let html = '<form id="editForm"><div class="row g-3">';
    fields.forEach(field => {
        let input = '';
        const cleanId = 'edit_' + field.key.replace(/[^a-zA-Z0-9]/g, '_');
        if (field.type === 'select') {
            input = `<select class="form-select form-control-modern" data-field-key="${escapeHtml(field.key)}" id="${cleanId}">`;
            field.options.forEach(opt => {
                input += `<option value="${opt}" ${data[field.key] === opt ? 'selected' : ''}>${opt}</option>`;
            });
            input += '</select>';
        } else {
            let val = safeGet(data, field.key) || '';
            const disabledState = field.locked ? 'disabled' : '';
            input = `<input type="${field.type}" class="form-control form-control-modern" data-field-key="${escapeHtml(field.key)}" id="${cleanId}" value="${escapeHtml(val)}" ${disabledState}>`;
        }
        html += `<div class="col-md-${field.col}"><label class="form-label-modern">${field.label}</label>${input}</div>`;
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
        updatedData[fieldKey] = input.value;
    });

    if (USER_ROLE !== 'Admin') {
        updatedData['Barangay'] = USER_BRGY;
    }

    if (updatedData['Date of Birth']) {
        const calculatedAge = calculateAgeFromDob(updatedData['Date of Birth']);
        updatedData.calculatedAge = calculatedAge;
        updatedData.ageBracket = getAgeBracketLabel(calculatedAge);
    }

    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    Swal.fire({ title: 'Saving to Cloud Firestore...', didOpen: () => Swal.showLoading() });

    try {
        await db.collection('youth_profiles').doc(currentEditData.uid).set(updatedData, { merge: true });

        // Audit Trail
        await db.collection('audit_logs').add({
            action: 'EDIT',
            recordName: updatedData['Full Name'] || 'Unknown',
            details: `Profile updated for ${updatedData['Full Name']}`,
            barangay: updatedData['Barangay'] || USER_BRGY,
            user: USERNAME,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        Swal.fire({ icon: 'success', title: 'Saved!', showConfirmButton: false, timer: 1500 });
        initializeApp();
    } catch (err) {
        Swal.fire('Error', 'Failed to update record in Firestore: ' + err.message, 'error');
    }
}

function confirmDelete(uid) {
    const target = globalData.find(r => r.uid === uid);
    Swal.fire({
        title: 'Are you sure?',
        text: `Permanently delete profile of ${target ? target['Full Name'] : 'this youth'}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, delete it!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Deleting from Firestore...', didOpen: () => Swal.showLoading() });
            try {
                await db.collection('youth_profiles').doc(uid).delete();

                await db.collection('audit_logs').add({
                    action: 'DELETE',
                    recordName: target ? target['Full Name'] : 'Unknown',
                    details: 'Record was permanently deleted from Firestore.',
                    barangay: target ? target['Barangay'] : USER_BRGY,
                    user: USERNAME,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                Swal.fire('Deleted!', 'The record has been permanently deleted.', 'success');
                initializeApp();
            } catch (err) {
                Swal.fire('Error', 'Could not delete record: ' + err.message, 'error');
            }
        }
    });
}

// --- AUDIT TRAIL LOGS ---

async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></td></tr>';

    try {
        let query = db.collection('audit_logs').orderBy('timestamp', 'desc').limit(50);
        if (USER_ROLE !== 'Admin' && USER_BRGY) {
            query = query.where('barangay', '==', USER_BRGY);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2 opacity-25"></i>No logs found in Firestore</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const log = doc.data();
            const actionClass = log.action === 'DELETE' ? 'bg-danger text-white' : (log.action === 'CSV_IMPORT' ? 'bg-success text-white' : 'bg-warning text-dark');
            const dateStr = log.timestamp && log.timestamp.toDate ? log.timestamp.toDate().toLocaleString() : '-';

            html += `<tr>
                <td class="small text-secondary fw-medium">${dateStr}</td>
                <td><span class="badge badge-modern ${actionClass}">${escapeHtml(log.action || '-')}</span></td>
                <td class="fw-semibold text-dark">${escapeHtml(log.recordName || '-')}</td>
                <td class="text-secondary small">${escapeHtml(log.details || '-')}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">Failed to load logs from Firestore.</td></tr>`;
    }
}

// --- DRAG AND DROP CSV UPLOADER ---

function handleCsvFileSelected(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            Swal.fire({ title: 'Parsing CSV & Expanding Shortcodes...', didOpen: () => Swal.showLoading() });
            const records = await parseAndNormalizeCsvText(e.target.result);
            Swal.close();

            pendingCsvRecords = records;
            const detectedBrgy = records[0]?.Barangay || 'Unknown';

            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileStats').textContent = `${records.length} valid youth records found (${(file.size / 1024).toFixed(1)} KB)`;
            document.getElementById('detectedBrgyBadge').textContent = `Barangay: ${detectedBrgy}`;
            document.getElementById('csvFileInfo').style.display = 'flex';
            document.getElementById('btnStartImport').disabled = false;
        } catch (err) {
            Swal.fire('Error Parsing CSV', err.message, 'error');
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
        await uploadRecordsToFirestore(pendingCsvRecords, (processed, total) => {
            const pct = Math.round((processed / total) * 100);
            document.getElementById('uploadProgressBar').style.width = `${pct}%`;
            document.getElementById('uploadProgressPercent').textContent = `${pct}% (${processed}/${total})`;
        });

        bootstrap.Modal.getInstance(document.getElementById('csvModal')).hide();
        Swal.fire({
            icon: 'success',
            title: 'Import Complete!',
            text: `Successfully imported ${pendingCsvRecords.length} records into Cloud Firestore.`,
            confirmButtonColor: '#2563eb'
        });

        pendingCsvRecords = [];
        document.getElementById('csvFileInput').value = '';
        document.getElementById('csvFileInfo').style.display = 'none';
        document.getElementById('uploadProgressSection').style.display = 'none';
        btn.disabled = false;

        initializeApp();
    } catch (err) {
        Swal.fire('Import Error', 'Failed to save to Firestore: ' + err.message, 'error');
        btn.disabled = false;
    }
}

// --- ONLINE SUBMISSIONS SYNC (eProfiling) ---

async function triggerWebSync() {
    if (USER_ROLE !== 'Admin') {
        Swal.fire('Access Denied', 'Only the System Admin can sync web forms.', 'error');
        return;
    }

    Swal.fire({ title: 'Checking Online Submissions...', didOpen: () => Swal.showLoading() });

    try {
        const snap = await db.collection('online_submissions').get();
        if (snap.empty) {
            Swal.fire('Up to Date', 'No new online self-registrations waiting in the intake queue.', 'info');
            return;
        }

        const count = snap.size;
        Swal.fire({
            title: `Found ${count} Online Submissions`,
            text: `Do you want to approve and merge these ${count} youth registrations into the Master Database?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Yes, Approve All'
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.fire({ title: 'Merging into Master Registry...', didOpen: () => Swal.showLoading() });

                const batch = db.batch();
                snap.forEach(doc => {
                    const data = doc.data();
                    const masterRef = db.collection('youth_profiles').doc(doc.id);
                    batch.set(masterRef, { ...data, approvedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    batch.delete(doc.ref);
                });

                await batch.commit();

                await db.collection('audit_logs').add({
                    action: 'SYNC',
                    recordName: 'Web Forms Batch',
                    details: `Approved ${count} online self-registrations to Master Database.`,
                    barangay: 'All',
                    user: USERNAME,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                Swal.fire('Success!', `Approved and merged ${count} records into Cloud Firestore.`, 'success');
                initializeApp();
            }
        });
    } catch (err) {
        Swal.fire('Sync Error', err.message, 'error');
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
            <img src="https://drive.google.com/thumbnail?id=1UqcRFlPUFnGarFC7LRfE4gMlz71ZYx6m&sz=s1000" style="width: 80px; height: 80px;">
            <div class="text-center text-dark">
                <div class="small text-uppercase">Republic of the Philippines</div>
                <div class="small text-uppercase">Province of Sarangani</div>
                <div class="fw-bold">MUNICIPALITY OF MALUNGON</div>
                <div class="fw-bold fs-5 mt-1">${escapeHtml(brgyText)}</div>
            </div>
            <img src="https://drive.google.com/thumbnail?id=1ovjAoz-t8OHyPkAPH37lmEsLmA4aow4C&sz=s1000" style="width: 80px; height: 80px;">
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
        Swal.fire('Info', 'Please generate a preview first!', 'info');
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
