// ==========================================
// 1. SET YOUR NEW API URL HERE
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbw28DvpQIRp1tzo1-HzCkelBOY9ypfjTPWti-4fyWP44NScbEO6y2LJx80Xar034VJI/exec"; // REPLACE THIS!

// --- AUTHENTICATION CHECK ---
if (!sessionStorage.getItem('sk_auth_token')) {
    window.location.href = 'login.html';
}

// Global User Info Setup
const USER_ROLE = sessionStorage.getItem('sk_user_role');
const USER_BRGY = sessionStorage.getItem('sk_user_barangay');

const safeGet = (obj, searchKey) => {
    if (!obj) return '';
    const key = Object.keys(obj).find(k => k.trim().toLowerCase() === searchKey.toLowerCase());
    return key && obj[key] !== null && obj[key] !== undefined ? obj[key].toString() : '';
};

function logout() {
    sessionStorage.clear();
    localStorage.clear();
    window.location.replace('login.html');
}

// --- Custom fetch Wrappers ---
async function apiGet(action, params = {}) {
    const url = new URL(API_URL);
    url.searchParams.append('action', action);
    url.searchParams.append('token', sessionStorage.getItem('sk_auth_token')); 
    for (const key in params) {
        url.searchParams.append(key, params[key]);
    }
    const response = await fetch(url);
    return await response.json();
}

async function apiPost(action, payload) {
    const url = new URL(API_URL);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
            action: action, 
            token: sessionStorage.getItem('sk_auth_token'), 
            ...payload 
        })
    });
    return await response.json();
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

setInterval(() => {
    const now = new Date();
    document.getElementById('clock').innerText =
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);

google.charts.load('current', {'packages':['corechart']});
google.charts.setOnLoadCallback(() => {
    googleChartsLoaded = true;
    initializeApp();
});

async function initializeApp() {
    document.getElementById('registryTableBody').innerHTML = `
        ${Array(5).fill('').map(() => `<tr><td colspan="8" class="p-3"><div class="skeleton skeleton-text w-100"></div></td></tr>`).join('')}
    `;

    // Apply UI restrictions if not an admin
    applyRoleBasedUI();

    try {
        const response = await apiGet('getDashboardData');
        if (response.success) {
            globalData = response.rawData;
            filteredData = [...globalData];
            filteredTableData = [...globalData];
            currentChartData = response.charts;
            
            // Populate filters, but respect locks
            populateFilters(response.filters);
            
            renderDashboardStats(response.stats);
            renderCharts(currentChartData);
            renderTable();
            document.getElementById('totalRecordsLabel').textContent = `${globalData.length} total records found`;
        } else {
            if (response.message.includes("Unauthorized")) {
                Swal.fire('Session Expired', 'Please log in again.', 'warning').then(() => logout());
            } else {
                Swal.fire('Error', response.message || 'Failed to load data.', 'error');
            }
        }
    } catch (err) {
        console.error('Error:', err);
        Swal.fire('Error', 'Connection failed. Check API URL.', 'error');
    }
}

// Locks UI based on role
function applyRoleBasedUI() {
    if (USER_ROLE !== 'Admin') {
        const brgyHeader = document.querySelector('.brand-section p');
        brgyHeader.innerText = `Barangay ${USER_BRGY}, Municipality of Malungon`;

        // Lock Barangay Filters to their specific barangay
        const filterBrgy = document.getElementById('barangayFilter');
        filterBrgy.innerHTML = `<option value="${USER_BRGY}">${USER_BRGY}</option>`;
        filterBrgy.disabled = true;

        const reportBrgy = document.getElementById('reportBarangaySelect');
        reportBrgy.innerHTML = `<option value="${USER_BRGY}">${USER_BRGY}</option>`;
        reportBrgy.disabled = true;
        document.getElementById('btnSyncWeb')?.style.setProperty('display', 'none', 'important');
    }
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
        opt.value = item; opt.textContent = item;
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
            brgySelect.addEventListener('change', () => {
                updateSitioDropdown(brgySelect.value);
            });
            brgySelect.dataset.hasChangeListener = 'true';
        }
    }
    
    const activeBrgy = USER_ROLE === 'Admin' ? (document.getElementById('barangayFilter')?.value || '') : USER_BRGY;
    updateSitioDropdown(activeBrgy);
    
    const tSelect = document.getElementById('tribeFilter');
    while (tSelect.options.length > 1) tSelect.remove(1);
    filters.tribes.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item; opt.textContent = item;
        tSelect.appendChild(opt);
    });

    const rtSelect = document.getElementById('reportTribeSelect');
    while (rtSelect.options.length > 1) rtSelect.remove(1);
    filters.tribes.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item; opt.textContent = item;
        rtSelect.appendChild(opt);
    });
}

async function applyFilters() {
    const barangay = USER_ROLE === 'Admin' ? document.getElementById('barangayFilter').value : USER_BRGY;
    const sitio = document.getElementById('sitioFilter').value; // NEW
    const sex = document.getElementById('sexFilter').value;
    const tribe = document.getElementById('tribeFilter').value;
    const eligibility = document.getElementById('eligibilityFilter').value;

    const applyBtn = document.querySelector('button[onclick="applyFilters()"]');
    const originalBtnHtml = applyBtn.innerHTML;
    applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Applying...';
    applyBtn.disabled = true;

    document.getElementById('dashboardStats').innerHTML = `
        <div class="col-md-3"><div class="skeleton skeleton-block"></div></div>
        <div class="col-md-3"><div class="skeleton skeleton-block"></div></div>
        <div class="col-md-3"><div class="skeleton skeleton-block"></div></div>
        <div class="col-md-3"><div class="skeleton skeleton-block"></div></div>
    `;

    filteredData = globalData.filter(record => {
        let match = true;
        const age = record.calculatedAge;
        if (barangay && record.Barangay !== barangay) match = false;
        
        // NEW: Check Sitio Match
        if (sitio && safeGet(record, 'sitio/purok').trim() !== sitio) match = false;
        
        if (sex && record.Sex !== sex) match = false;
        if (tribe && record.Tribe !== tribe) match = false;
        if (eligibility === 'qualified' && (age < 15 || age > 30)) match = false;
        if (eligibility === 'overaged' && age <= 30) match = false;
        return match;
    });

    filteredTableData = [...filteredData];
    currentPage = 1;
    renderTable();

    try {
        // NEW: Sent "sitio" to the backend API request
        const response = await apiGet('getFilteredDashboardData', { barangay, sitio, sex, tribe, eligibility });
        if (response.success) {
            currentChartData = response.charts;
            renderDashboardStats(response.stats);
            renderCharts(currentChartData);
        } else {
            Swal.fire('Error', response.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Connection failed.', 'error');
    } finally {
        applyBtn.innerHTML = originalBtnHtml;
        applyBtn.disabled = false;
    }
}

function clearFilters() {
    if (USER_ROLE === 'Admin') document.getElementById('barangayFilter').value = '';
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

    // Uses global safeGet helper

    filteredData.forEach(r => {
        // Count Employment
        const empStatus = safeGet(r, 'employment status').toLowerCase();
        if (empStatus === 'employed' || empStatus === 'self-employed') employedCount++;
        
        // Count Educational Status (Looking explicitly for "in-school")
        const eduStatus = safeGet(r, 'educational status').toLowerCase();
        if (eduStatus.includes('in-school') || eduStatus.includes('in school')) {
            inSchoolCount++;
        }

        // Count Barangays
        const brgy = r.Barangay || 'Unknown';
        barangayCounts[brgy] = (barangayCounts[brgy] || 0) + 1;
        if (barangayCounts[brgy] > topBarangay.count) {
            topBarangay.name = brgy;
            topBarangay.count = barangayCounts[brgy];
        }

        // Count Sitio/Purok safely
        let sitio = safeGet(r, 'sitio/purok').trim();
        if (sitio !== '' && sitio.toLowerCase() !== 'unknown' && sitio.toLowerCase() !== 'n/a') {
            sitioCounts[sitio] = (sitioCounts[sitio] || 0) + 1;
            if (sitioCounts[sitio] > topSitio.count) {
                topSitio.name = sitio;
                topSitio.count = sitioCounts[sitio];
            }
        }
    });

    // Calculate Percentages
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

    let cardsHtml = '';

    if (USER_ROLE === 'Admin') {
        // ADMIN VIEW: Changed 'Barangays' to 'Educational Status'
        cardsHtml = [
            createCard('Total Youth', stats.totalYouth, genderSubtext, 'bi-people-fill', '#2563eb', '#eff6ff'),
            createCard('Educational Status', inSchoolPercent, `${inSchoolCount} In-School Youths`, 'bi-book-fill', '#10b981', '#f0fdf4'),
            createCard('Employment', employmentPercent, `${employedCount} out of ${total} Employed`, 'bi-briefcase-fill', '#f59e0b', '#fffbeb'),
            createCard('Top Brgy', topBrgyPercent, `${topBarangay.name} (${topBarangay.count} youths)`, 'bi-award-fill', '#ef4444', '#fef2f2')
        ].join('');
    } else {
        // BARANGAY ADMIN VIEW: Shows Education and Top Sitio/Purok
        cardsHtml = [
            createCard('Total Youth', stats.totalYouth, genderSubtext, 'bi-people-fill', '#2563eb', '#eff6ff'),
            createCard('Educational Status', inSchoolPercent, `${inSchoolCount} In-School Youths`, 'bi-book-fill', '#10b981', '#f0fdf4'),
            createCard('Employment', employmentPercent, `${employedCount} out of ${total} Employed`, 'bi-briefcase-fill', '#f59e0b', '#fffbeb'),
            createCard('Top Sitio/Purok', topSitioPercent, `${topSitio.name} (${topSitio.count} youths)`, 'bi-house-heart-fill', '#ef4444', '#fef2f2')
        ].join('');
    }

    document.getElementById('dashboardStats').innerHTML = cardsHtml;
}

function renderCharts(charts) {
    if(!googleChartsLoaded) return;
    const commonOpts = { chartArea: { width: '85%', height: '75%' }, legend: { position: 'bottom', textStyle: { fontSize: 11, color: '#64748b' } }, colors: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'], fontName: 'Inter' };

    new google.visualization.ColumnChart(document.getElementById('barangayChart')).draw(google.visualization.arrayToDataTable([['Barangay', 'Count'], ...charts.barangay]), { ...commonOpts, legend: { position: 'none' }, colors: ['#2563eb'], hAxis: { slantedText: true, slantedTextAngle: 45, textStyle: { fontSize: 10 } } });
    new google.visualization.PieChart(document.getElementById('employmentChart')).draw(google.visualization.arrayToDataTable([['Status', 'Count'], ...charts.employment]), { ...commonOpts, pieHole: 0.4 });
    new google.visualization.PieChart(document.getElementById('educationChart')).draw(google.visualization.arrayToDataTable([['Level', 'Count'], ...charts.education]), commonOpts);
    new google.visualization.ColumnChart(document.getElementById('ageChart')).draw(google.visualization.arrayToDataTable([['Age', 'Count'], ...charts.ageBracket]), { ...commonOpts, legend: { position: 'none' }, colors: ['#8b5cf6'] });
    new google.visualization.PieChart(document.getElementById('tribeChart')).draw(google.visualization.arrayToDataTable([['Tribe', 'Count'], ...charts.tribe]), { ...commonOpts, pieHole: 0.4 });
    new google.visualization.PieChart(document.getElementById('sectorChart')).draw(google.visualization.arrayToDataTable([['Sector', 'Count'], ...charts.sector]), { ...commonOpts, pieHole: 0.4, colors: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'] });
}

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (googleChartsLoaded && currentChartData && document.getElementById('dashboard-view').classList.contains('active')) renderCharts(currentChartData);
    }, 250);
});

document.querySelector('button[data-bs-target="#dashboard-view"]').addEventListener('shown.bs.tab', function () {
    if (googleChartsLoaded && currentChartData) renderCharts(currentChartData);
});

function renderTable() {
    const tbody = document.getElementById('registryTableBody');
    tbody.innerHTML = '';
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredTableData.slice(start, end);

    if(pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2 opacity-25"></i>No records found</td></tr>';
        document.getElementById('startIdx').innerText = 0; document.getElementById('endIdx').innerText = 0; document.getElementById('totalIdx').innerText = 0; return;
    }

    pageData.forEach(row => {
        const isOverAged = row.calculatedAge > 30;
        const tr = document.createElement('tr');
        if (isOverAged) tr.classList.add('row-overaged');
        
        tr.innerHTML = `
            <td class="text-secondary small font-monospace">${row['FormNo.'] || '-'}</td>
            <td><div class="fw-semibold text-dark">${row['Full Name'] || 'N/A'}</div>${isOverAged ? '<span class="badge bg-danger text-white py-1" style="font-size: 0.65rem;">OVER-AGED</span>' : ''}</td>
            <td>${row.calculatedAge || '-'}</td>
            <td><span class="badge badge-modern ${row['Sex'] === 'Male' ? 'bg-info bg-opacity-10 text-info' : 'bg-danger bg-opacity-10 text-danger'}">${row['Sex']}</span></td>
            <td>${row['Barangay'] || ''}</td>
            <td><span class="badge badge-modern bg-light text-dark border">${row['Tribe'] || '-'}</span></td>
            <td class="small text-secondary">${row['Civil Status'] || '-'}</td>
            <td class="text-end">
                <div class="btn-group">
                    <button class="btn btn-sm btn-light border text-primary" onclick="openViewModal('${row.uid}')" title="View Profile"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-sm btn-light border text-warning" onclick="openEditModal('${row.uid}')" title="Edit Record"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-light border text-danger" onclick="confirmDelete('${row.uid}')" title="Delete Record"><i class="bi bi-trash"></i></button>
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

function changePage(page) { currentPage = page; renderTable(); }

function filterTable() {
    const term = document.getElementById('tableSearch').value.toLowerCase();
    filteredTableData = filteredData.filter(row => 
        (row['Full Name'] && row['Full Name'].toLowerCase().includes(term)) ||
        (row['Barangay'] && row['Barangay'].toLowerCase().includes(term)) ||
        (row['FormNo.'] && row['FormNo.'].toString().toLowerCase().includes(term))
    );
    currentPage = 1; renderTable();
}

function exportToCSV() {
    if (!filteredTableData || filteredTableData.length === 0) { Swal.fire('Info', 'No data to export.', 'info'); return; }
    const columns = ['FormNo.', 'Full Name', 'Sex', 'Date of Birth', 'calculatedAge', 'Barangay', 'Sitio/Purok', 'Tribe', 'Civil Status', 'Contact Number', 'Educational Status', 'Highest Educational Attainment', 'Employment Status', 'Youth Sector', 'Member of Youth Organization'];
    const headers = ['Form Number', 'Full Name', 'Sex', 'Date of Birth', 'Age', 'Barangay', 'Sitio/Purok', 'Tribe', 'Civil Status', 'Contact Number', 'Educational Status', 'Education', 'Employment', 'Sector', 'Org Member'];

    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
    filteredTableData.forEach(row => {
        const rowData = columns.map(col => {
            let val = row[col] === null || row[col] === undefined ? '' : String(row[col]);
            if (col === 'Date of Birth' && val && val.includes('T')) { const d = new Date(val); val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
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

function openViewModal(uid) {
    const data = globalData.find(r => r.uid === uid);
    if(!data) return;
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
    fields.forEach(([label, key]) => { html += `<div class="col-md-6"><div class="p-2 border-bottom"><label class="d-block small text-secondary text-uppercase fw-bold" style="font-size: 0.7rem;">${label}</label><span class="text-dark fw-medium">${safeGet(data, key) || '-'}</span></div></div>`; });
    html += '</div>';
    document.getElementById('viewModalBody').innerHTML = html;
    new bootstrap.Modal(document.getElementById('viewModal')).show();
}

function openEditModal(uid) {
    const data = globalData.find(r => r.uid === uid);
    if(!data) return;
    currentEditData = data;
    const fields = [
        { label: 'Full Name', key: 'Full Name', type: 'text', col: 12 },
        { label: 'Date of Birth', key: 'Date of Birth', type: 'date', col: 6 },
        { label: 'Sex', key: 'Sex', type: 'select', options: ['Male', 'Female'], col: 6 },
        { label: 'Civil Status', key: 'Civil Status', type: 'select', options: ['Single', 'Married', 'Widowed', 'Separated'], col: 6 },
        { label: 'Tribe', key: 'Tribe', type: 'text', col: 6 },
        { label: 'Contact', key: 'Contact Number', type: 'text', col: 6 },
        { label: 'Barangay', key: 'Barangay', type: 'text', col: 6, locked: USER_ROLE !== 'Admin' },
        { label: 'Sitio/Purok', key: 'Sitio/Purok', type: 'text', col: 6 },
        { label: 'Educational Status', key: 'Educational Status', type: 'select', options: ['In-School Youth', 'Out-of-School Youth'], col: 6 },
        { label: 'Employment', key: 'Employment Status', type: 'select', options: ['Employed', 'Unemployed', 'Student', 'Self-employed'], col: 6 },
        { label: 'Sector', key: 'Youth Sector', type: 'text', col: 6 }
    ];

    let html = '<form id="editForm"><div class="row g-3">';
    fields.forEach(field => {
        let input = '';
        if (field.type === 'select') {
            input = `<select class="form-select form-control-modern" id="edit_${field.key}">`;
            field.options.forEach(opt => { input += `<option value="${opt}" ${data[field.key] === opt ? 'selected' : ''}>${opt}</option>`; });
            input += '</select>';
        } else {
            let val = safeGet(data, field.key) || '';
            if (field.type === 'date' && val) { 
                const d = new Date(val); 
                if (!isNaN(d.getTime())) {
                    val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                } else {
                    val = '';
                }
            }
            
            const disabledState = field.locked ? 'disabled' : '';
            input = `<input type="${field.type}" class="form-control form-control-modern" id="edit_${field.key}" value="${val}" ${disabledState}>`;
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
        updatedData[input.id.replace('edit_', '')] = input.value;
    });

    if (USER_ROLE !== 'Admin') {
        updatedData['Barangay'] = USER_BRGY;
    }

    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    Swal.fire({ title: 'Saving...', didOpen: () => Swal.showLoading() });

    try {
        const result = await apiPost('updateRecord', { uid: currentEditData.uid, updatedData: updatedData });
        if (result.success) {
            Swal.fire({ icon: 'success', title: 'Saved!', showConfirmButton: false, timer: 1500 });
            initializeApp();
        } else {
            Swal.fire('Error', result.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Failed to communicate with server.', 'error');
    }
}

function confirmDelete(uid) {
    Swal.fire({
        title: 'Are you sure?', text: "It will be permanently deleted.", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, delete it!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Deleting...', didOpen: () => Swal.showLoading() });
            try {
                const res = await apiPost('deleteRecord', { uid: uid });
                if (res.success) {
                    Swal.fire('Deleted!', 'The record has been deleted.', 'success');
                    initializeApp();
                    if(document.getElementById('logs-view').classList.contains('active')) loadLogs();
                } else {
                    Swal.fire('Error', res.message, 'error');
                }
            } catch (err) {
                Swal.fire('Error', 'Server communication failed.', 'error');
            }
        }
    });
}

async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></td></tr>';
    
    try {
        const res = await apiGet('getAuditLogs');
        const logs = res.logs;
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2 opacity-25"></i>No logs found</td></tr>';
            return;
        }
        let html = '';
        logs.forEach(log => {
            const actionClass = log.Action === 'DELETE' ? 'bg-danger text-white' : 'bg-warning text-dark';
            html += `<tr><td class="small text-secondary fw-medium">${log.Timestamp || '-'}</td><td><span class="badge badge-modern ${actionClass}">${log.Action || '-'}</span></td><td class="fw-semibold text-dark">${log['Record Name'] || '-'}</td><td class="text-secondary small">${log.Details || '-'}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">Failed to load logs.</td></tr>`;
    }
}

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
                <div class="fw-bold fs-5 mt-1">${brgyText}</div>
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
            <td class="border border-dark p-1 fw-bold">${r['Full Name'] || ''}</td>
            <td class="text-center border border-dark p-1">${r['Sex']?.charAt(0) || ''}</td>
            <td class="text-center border border-dark p-1">${r.calculatedAge || ''}</td>
            <td class="border border-dark p-1">${r['Tribe'] || ''}</td>
            <td class="border border-dark p-1">${r['Youth Sector'] || ''}</td>
            <td class="border border-dark p-1">${r['Employment Status'] || ''}</td>
        </tr>
    `).join('');
    return `<table class="w-100 border-collapse border border-dark mb-3"><thead class="bg-light text-uppercase fw-bold" style="font-size: 10px;"><tr><th class="border border-dark p-2 text-center" style="width:30px">#</th><th class="border border-dark p-2">Name</th><th class="border border-dark p-2 text-center" style="width:30px">Sex</th><th class="border border-dark p-2 text-center" style="width:30px">Age</th><th class="border border-dark p-2">Tribe</th><th class="border border-dark p-2">Sector</th><th class="border border-dark p-2">Employment</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function getSummaryContent(data) {
    const stats = { total: data.length, males: data.filter(r => r.Sex === 'Male').length, females: data.filter(r => r.Sex === 'Female').length, employed: data.filter(r => r['Employment Status'] === 'Employed').length, students: data.filter(r => r['Employment Status'] === 'Student').length };
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
    if(!content.includes('print-page')) { Swal.fire('Info', 'Please generate a preview first!', 'info'); return; }
    document.getElementById('printArea').innerHTML = content;
    document.body.classList.add('is-printing');
    setTimeout(() => {
        window.print();
        setTimeout(() => { document.body.classList.remove('is-printing'); document.getElementById('printArea').innerHTML = ''; }, 500);
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
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">NAME:</div><div class="col-8">${safeGet(data, 'Full Name') || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">SEX / AGE:</div><div class="col-8">${safeGet(data, 'Sex') || '-'} / ${data.calculatedAge || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">ADDRESS:</div><div class="col-8">${safeGet(data, 'Barangay') || '-'}${safeGet(data, 'sitio/purok') ? ', ' + safeGet(data, 'sitio/purok') : ''}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">TRIBE:</div><div class="col-8">${safeGet(data, 'Tribe') || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">CIVIL STATUS:</div><div class="col-8">${safeGet(data, 'Civil Status') || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">CONTACT:</div><div class="col-8">${safeGet(data, 'Contact Number') || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">EDUC. STATUS:</div><div class="col-8">${safeGet(data, 'Educational Status') || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">EDUCATION:</div><div class="col-8">${safeGet(data, 'Highest Educational Attainment') || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">EMPLOYMENT:</div><div class="col-8">${safeGet(data, 'Employment Status') || '-'}</div></div>
                <div class="row mb-3 border-bottom pb-2"><div class="col-4 fw-bold">YOUTH SECTOR:</div><div class="col-8">${safeGet(data, 'Youth Sector') || '-'}</div></div>
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
            setTimeout(() => { document.body.classList.remove('is-printing'); document.getElementById('printArea').innerHTML = ''; }, 500);
        }, 150);
    }, 400); 
}

// --- WEB FORM SYNC LOGIC ---
async function triggerWebSync() {
    // Double check it's an admin
    if (USER_ROLE !== 'Admin') {
        Swal.fire('Access Denied', 'Only the System Admin can sync web forms.', 'error');
        return;
    }

    Swal.fire({
        title: 'Sync Web Submissions?',
        text: "This will pull new data from the live public forms into the Staging tab of your database.",
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, Sync Now'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Syncing Data...', text: 'Please wait, checking for new submissions.', didOpen: () => Swal.showLoading() });
            
            try {
                const res = await apiPost('syncOnlineData', {});
                
                if (res.success) {
                    if (res.count > 0) {
                        Swal.fire('Sync Complete!', res.message + '<br><br>Please check the <b>Online_Staging</b> tab in Google Sheets to review them.', 'success');
                    } else {
                        Swal.fire('Up to Date', res.message, 'info');
                    }
                } else {
                    Swal.fire('Sync Failed', res.message, 'error');
                }
            } catch (err) {
                Swal.fire('Error', 'Failed to connect to the server during sync.', 'error');
            }
        }
    });
}