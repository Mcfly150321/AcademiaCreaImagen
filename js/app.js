const API_URL = "/api";

// --- CONFIGURACIÓN DE MESES Y AÑOS ---
const yearsGrid = [2026, 2027];
const monthsGrid = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// --- AQUÍ PUEDES AGREGAR MÁS TIPOS DE PAGO ---
// Ejemplo: { id: 'uniforme', label: 'Uniforme' }
const specialTypesGrid = [
    { id: 'inscripcion', label: 'Inscripción' },
    { id: 'gastos_varios', label: 'Gastos Varios' }
];

// Navigation Logic
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('page-title');

// Modal Elements
const wsModal = document.getElementById('workshop-modal');
const closeBtn = document.querySelector('.close-btn');
let currentWsId = null;
let currentWorkshopPackages = []; // Cache for packages
let currentDraftProducts = []; // Products for the package currently being edited

// Global Server Time (synchronized via stats)
let serverYear = new Date().getFullYear();
let serverMonth = new Date().getMonth() + 1;

closeBtn.onclick = () => {
    wsModal.style.display = "none";
    currentWsId = null;
};
window.onclick = (event) => {
    if (event.target == wsModal) {
        wsModal.style.display = "none";
        currentWsId = null;
    }
};

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.dataset.target;
        
        // Update UI
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(target).classList.add('active');
        
        pageTitle.textContent = link.textContent.trim();
        
        // Load data
        if (target === 'dashboard') updateDashboardStats();
        if (target === 'pagos') loadPayments();
        if (target === 'bodega') { loadAlerts(); loadAllproducts(); }
        if (target === 'paquetes') { loadAllPackages(); } // Ahora cargan aquí
        if (target === 'talleres') loadWorkshops();
    });
});

async function updateDashboardStats() {
    try {
        const res = await fetch(`${API_URL}/stats/`);
        const stats = await res.json();
        document.getElementById('stat-students').textContent = stats.students;
        document.getElementById('stat-alerts').textContent = stats.alerts;
        document.getElementById('stat-pending').textContent = stats.pending_payments;
        
        // Sync time
        if (stats.server_year && stats.server_month) {
            serverYear = stats.server_year;
            serverMonth = stats.server_month;
            console.log(`Server time synced: ${serverMonth}/${serverYear}`);
        }
    } catch (e) {
        console.error("Dashboard error:", e);
    }
}

// Initial stats
updateDashboardStats();

// Registration Logic
const regForm = document.getElementById('registration-form');
const ageInput = document.getElementById('age');
const guardianFields = document.getElementById('guardian-fields');

ageInput.addEventListener('input', () => {
    const age = parseInt(ageInput.value);
    guardianFields.style.display = age < 18 ? 'block' : 'none';
});

function renderRegPaymentGrid() {
    const container = document.getElementById('reg-payment-grid');
    if (!container) return;
    
    container.innerHTML = `
        <div class="payment-grid-container" style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                ${specialTypesGrid.map(type => `
                    <button type="button" class="btn-pay-item" onclick="this.classList.toggle('paid')" data-type="${type.id}" data-month="0" data-year="0">
                        ${type.label}
                    </button>
                `).join('')}
            </div>
            ${yearsGrid.map(year => `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: bold; font-size: 12px; min-width: 40px;">${year}:</span>
                    <div style="display: flex; gap: 2px; flex-wrap: wrap;">
                        ${monthsGrid.map((m, i) => `
                            <button type="button" class="btn-month-item" onclick="this.classList.toggle('paid')" data-type="mensualidad" data-month="${i+1}" data-year="${year}">
                                ${m}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}
renderRegPaymentGrid();

regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(regForm);
    const data = Object.fromEntries(formData.entries());
    data.age = parseInt(data.age);
    data.is_adult = data.age >= 18;

    try {
        const response = await fetch(`${API_URL}/students/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Error al inscribir");
        }

        const student = await response.json();
        
        // Procesar pagos seleccionados en el grid de registro
        const selectedPayments = document.querySelectorAll('#reg-payment-grid .paid');
        for (const btn of selectedPayments) {
            const m = btn.getAttribute('data-month');
            const y = btn.getAttribute('data-year');
            const t = btn.getAttribute('data-type');
            await togglePay(student.carnet, m, y, t);
        }

        alert(`Alumna inscrita con éxito. Carnet: ${student.carnet}`);
        regForm.reset();
        renderRegPaymentGrid(); // Reset grid
        updateDashboardStats();
    } catch (error) {
        console.error("Error al inscribir:", error);
        alert("Fallo al inscribir alumna: " + error.message);
    }
});

// Payments Logic
async function loadPayments(plan = 'todos') {
    const tbody = document.getElementById('payments-table-body');
    try {
        const response = await fetch(`${API_URL}/students/${plan}`);
        if (!response.ok) throw new Error("No se pudierón cargar las alumnas");
        const students = await response.json();
        
        tbody.innerHTML = '';
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2">No hay alumnas en este plan</td></tr>';
            return;
        }

        students.forEach(student => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${student.names} ${student.lastnames}</strong><br>
                    <small style="color: #64748b;">Carnet: ${student.carnet}</small>
                    <div style="margin-top: 5px;">
                        <button class="btn-secondary btn-delete-student" 
                                style="color: red; border-color: #fca5a5; padding: 2px 8px; font-size: 10px;" 
                                data-carnet="${student.carnet}">
                            Eliminar Alumna
                        </button>
                    </div>
                </td>
                <td>
                    <div class="payment-grid-container" style="display: flex; flex-direction: column; gap: 10px;">
                        <!-- Pagos Especiales -->
                        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                            ${specialTypesGrid.map(type => `
                                <button id="pay-${student.carnet}-${type.id}" 
                                        class="btn-pay-item" 
                                        onclick="togglePay('${student.carnet}', 0, 0, '${type.id}')">
                                    ${type.label}
                                </button>
                            `).join('')}
                        </div>
                        
                        <!-- Años -->
                        ${yearsGrid.map(year => `
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: bold; font-size: 12px; min-width: 40px;">${year}:</span>
                                <div style="display: flex; gap: 2px; flex-wrap: wrap;">
                                    ${monthsGrid.map((m, i) => `
                                        <button id="pay-${student.carnet}-${year}-${i+1}" 
                                                class="btn-month-item" 
                                                title="${m} ${year}"
                                                onclick="togglePay('${student.carnet}', ${i+1}, ${year}, 'mensualidad')">
                                            ${m}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
            checkAllPayments(student.carnet);
        });
    } catch (error) {
        console.error("Error al cargar pagos:", error);
        tbody.innerHTML = '<tr><td colspan="2" style="color: red;">Error al cargar datos</td></tr>';
    }
}

// Event Delegation for Payments Table
document.getElementById('payments-table-body').addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-delete-student')) {
        const carnet = e.target.getAttribute('data-carnet');
        deleteStudent(carnet);
    }
});

async function checkAllPayments(studentId) {
    try {
        const response = await fetch(`${API_URL}/payments/${studentId}`);
        const payments = await response.json();
        
        // Marcar mensuales
        yearsGrid.forEach(year => {
            for (let m = 1; m <= 12; m++) {
                const isPaid = payments.find(p => p.month === m && p.year === year && p.payment_type === 'mensualidad');
                const btn = document.getElementById(`pay-${studentId}-${year}-${m}`);
                if (btn) {
                    btn.classList.toggle('paid', !!isPaid);
                }
            }
        });

        // Marcar especiales
        specialTypesGrid.forEach(s => {
            const isPaid = payments.find(p => p.payment_type === s.id);
            const btn = document.getElementById(`pay-${studentId}-${s.id}`);
            if (btn) {
                btn.classList.toggle('paid', !!isPaid);
            }
        });

    } catch (e) {
        console.error("Error checkAllPayments:", e);
    }
}

async function togglePay(studentId, month, year, type = 'mensualidad') {
    try {
        const response = await fetch(`${API_URL}/payments/toggle/?student_id=${studentId}&month=${month}&year=${year}&payment_type=${type}`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error("Error toggling payment");
        
        // Actualizar UI del botón individualmente para que sea instantáneo
        const btnId = month === 0 ? `pay-${studentId}-${type}` : `pay-${studentId}-${year}-${month}`;
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.toggle('paid');
        }

        updateDashboardStats();
    } catch (e) {
        console.error("Toggle pay error:", e);
        alert("No se pudo actualizar el pago");
    }
}

async function deleteStudent(carnet) {
    if (!confirm(`¿Estás segura de eliminar a la alumna con carnet ${carnet}? Se borrarán también sus registros de pagos y talleres.`)) return;
    try {
        const response = await fetch(`${API_URL}/students/${carnet}`, { method: 'DELETE' });
        if (response.ok) {
            alert("Alumna eliminada");
            loadPayments(document.getElementById('filter-plan').value);
            updateDashboardStats();
        } else {
            alert("Error al eliminar");
        }
    } catch (e) {
        console.error("Delete student error:", e);
    }
}

document.getElementById('filter-plan').addEventListener('change', (e) => {
    loadPayments(e.target.value);
});

// Bodega Logic
const productForm = document.getElementById('product-form');
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        code: document.getElementById('prod-code').value,
        description: document.getElementById('prod-desc').value,
        cost: parseFloat(document.getElementById('prod-cost').value),
        units: parseInt(document.getElementById('prod-units').value)
    };

    try {
        const response = await fetch(`${API_URL}/products/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            alert("Producto guardado");
            productForm.reset();
            loadAlerts();
            loadAllproducts();
            updateDashboardStats();
        } else {
            const err = await response.json();
            alert("Error al guardar: " + (err.detail || "Error desconocido"));
        }
    } catch (e) {
        console.error("Error bodega:", e);
        alert("Error de conexión con el servidor");
    }
});

// --- NUEVA FUNCIÓN DE BÚSQUEDA FLEXIBLE (FUZZY SEARCH) ---
async function searchInventory() {
    const searchTerm = document.getElementById('barcode-scan').value.trim().toLowerCase();
    const list = document.getElementById('main-products-list');

    // Si el campo está vacío, cargamos todo el inventario normalmente
    if (!searchTerm) {
        loadAllproducts();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/products/`);
        const allProducts = await response.json();

        // Aplicamos el "colador" (filtro inteligente)
        const filterResults = allProducts.filter(p => {
            const nameMatch = String(p.description).toLowerCase().includes(searchTerm);
            const codeMatch = String(p.code).toLowerCase().includes(searchTerm);
            return nameMatch || codeMatch;
        });

        // Ordenamos alfabéticamente los resultados
        const sortedResults = filterResults.sort((a, b) => a.description.localeCompare(b.description));

        if (sortedResults.length === 0) {
            list.innerHTML = `<p style="padding: 20px; color: #64748b;">No se encontraron coincidencias para "${searchTerm}"</p>`;
            return;
        }

        // Pintamos el HTML (usando exactamente el mismo estilo que loadAllproducts)
        list.innerHTML = sortedResults.map(p => `
            <div class="card" style="margin-bottom: 10px; border-left: 5px solid #6366f1;">
                <div class="card-body">
                    <p class="card-text">Nombre: ${p.description}</p>
                    <p class="card-text">Costo: ${p.cost}</p>
                    <p class="card-text">Unidades: ${p.units}</p>
                    <p class="card-text">Código: ${p.code}</p>
                    <div class="card-footer">
                        <button type="button" class="btn-primary" style="padding: 5px 15px;" onclick="editProduct(${p.id})">Editar</button>
                        <button type="button" class="btn-secondary" style="padding: 5px 15px; color: red;" onclick="deleteProduct(${p.id})">Eliminar</button>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error("Error en búsqueda:", e);
        list.innerHTML = '<p style="color: red;">Error al procesar la búsqueda.</p>';
    }
}

// Vinculamos el botón de búsqueda
document.getElementById('search-product').onclick = searchInventory;

// Permitir buscar al presionar "Enter"
document.getElementById('barcode-scan').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchInventory();
    }
});

// Lógica del botón Reiniciar
document.getElementById('reset-search').onclick = () => {
    document.getElementById('barcode-scan').value = '';
    loadAllproducts();
};

async function loadAlerts() {
    const container = document.getElementById('inventory-alerts-container');
    try {
        const response = await fetch(`${API_URL}/inventory/alerts/`);
        if (!response.ok) throw new Error("Error fetching alerts");
        const alerts = await response.json();
        
        container.innerHTML = ''; // <--- IMPORTANTE: Esto limpia el contenedor antes de poner las nuevas

        // <--- AGREGAR ESTO: Para que el usuario sepa que no hay problemas
        if (alerts.length === 0) {
            container.innerHTML = '<p style="color: green; font-size: 13px;">✅ Todo el stock está al día.</p>';
            return;
        }

        alerts.forEach(prod => {
            const div = document.createElement('div');
            div.className = 'alert-item';
            div.innerHTML = `
                <span>${prod.description} (Cód: ${prod.code})</span>
                <strong>Quedan ${prod.units}</strong>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error("Error alerts:", e);
        container.innerHTML = '<p style="color: red">Error al cargar alertas</p>';
    }
}

// Workshops Logic
const workshopForm = document.getElementById('workshop-form');
workshopForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('ws-name').value,
        description: document.getElementById('ws-desc').value
    };

    const response = await fetch(`${API_URL}/workshops/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (response.ok) {
        alert("Taller creado");
        workshopForm.reset();
        loadWorkshops();
    }
});

async function loadWorkshops() {
    const list = document.getElementById('workshop-list');
    try {
        const response = await fetch(`${API_URL}/workshops/`);
        if (!response.ok) throw new Error("Error loading workshops");
        const workshops = await response.json();
        
        if (!Array.isArray(workshops)) {
            console.error("Workshops is not an array:", workshops);
            list.innerHTML = '<p>Error en el formato de datos</p>';
            return;
        }
        list.innerHTML = workshops.length === 0 ? '<p>No hay talleres creados</p>' : '';
        workshops.forEach(ws => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `
                <h3>${ws.name}</h3>
                <p>${ws.description}</p>
                <div id="ws-students-${ws.id}"></div>
                <div class="ws-actions" style="margin-top: 1rem; display: flex; gap: 1rem;">
                    <button class="btn-primary" onclick="openWorkshopDetail(${ws.id})">Abrir Detalle / Paquetes</button>
                    <button class="btn-secondary" onclick="generateDiplomas(${ws.id})">Generar Diplomas (Canva)</button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        console.error("Workshops error:", e);
        list.innerHTML = '<p style="color:red">Error al cargar talleres</p>';
    }
}

async function showWsStudents(wsId) {
    const container = document.getElementById(`ws-students-${wsId}`);
    const response = await fetch(`${API_URL}/workshops/${wsId}/students/`);
    const students = await response.json();
    
    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Alumna</th>
                    <th>Taller Pagado</th>
                    <th>Paquete Pagado</th>
                </tr>
            </thead>
            <tbody>
                ${students.map(s => `
                    <tr>
                        <td>${s.names} ${s.lastnames}</td>
                        <td>
                            <label class="switch">
                                <input type="checkbox" ${s.workshop_paid ? 'checked' : ''} onchange="toggleWsPay(${wsId}, ${s.student_id}, 'workshop')">
                                <span class="slider"></span>
                            </label>
                        </td>
                        <td>
                            <label class="switch">
                                <input type="checkbox" ${s.package_paid ? 'checked' : ''} onchange="toggleWsPay(${wsId}, ${s.student_id}, 'package')">
                                <span class="slider"></span>
                            </label>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function toggleWsPay(wsId, studentId, type) {
    try {
        const response = await fetch(`${API_URL}/workshop-students/toggle/?workshop_id=${wsId}&student_id=${studentId}&payment_type=${type}`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error("Error updating workshop payment");
    } catch (e) {
        console.error("Toggle WS pay error:", e);
        alert("Error al actualizar pago de taller");
    }
}

async function generateDiplomas(wsId) {
    try {
        const response = await fetch(`${API_URL}/workshops/${wsId}/generate-diplomas/`, { method: 'POST' });
        if (!response.ok) throw new Error("Error generating diplomas");
        const result = await response.json();
        alert(result.message + "\nLink: " + result.canva_link);
    } catch (e) {
        console.error("Diplomas error:", e);
        alert("Error al generar diplomas.");
    }
}

// Workshop Modal Detail Logic
async function openWorkshopDetail(wsId) {
    currentWsId = wsId;
    wsModal.style.display = "block";
    console.log("Abriendo detalle de taller:", wsId);
    
    // Load WS Info
    try {
        const res = await fetch(`${API_URL}/workshops/`);
        const workshops = await res.json();
        const ws = workshops.find(w => w.id === wsId);
        if (ws) {
            document.getElementById('modal-ws-name').textContent = ws.name;
            document.getElementById('modal-ws-desc').textContent = ws.description;
        }

        await loadModalPackages();
        await loadGlobalPackagesForSelect();
        await loadModalStudents();
        await fillStudentSelect();
    } catch (e) {
        console.error("Error al abrir detalle:", e);
    }
}

async function fillStudentSelect() {
    try {
        console.log("Cargando lista de alumnas para el modal...");
        const res = await fetch(`${API_URL}/students/`);
        if (!res.ok) throw new Error("Error loading students for select");
        const students = await res.json();
        console.log("Alumnas recibidas:", students);
        const select = document.getElementById('modal-add-student-select');
        if (!Array.isArray(students) || students.length === 0) {
            select.innerHTML = '<option value="">Sin alumnas</option>';
        } else {
            select.innerHTML = students.map(s => `<option value="${s.carnet}">${s.names} ${s.lastnames} (${s.carnet})</option>`).join('');
        }
    } catch (e) {
        console.error("Error al llenar select de alumnas:", e);
    }
}

document.getElementById('btn-add-student-to-ws').onclick = async () => {
    const studentId = document.getElementById('modal-add-student-select').value;
    if (!studentId) return;
    try {
        const response = await fetch(`${API_URL}/workshops/${currentWsId}/students/${studentId}`, { method: 'POST' });
        if (response.ok) {
            loadModalStudents();
        } else {
            alert("Error al agregar alumna al taller");
        }
    } catch (e) {
        console.error("Error add student to WS:", e);
    }
};

async function loadModalStudents() {
    try {
        const res = await fetch(`${API_URL}/workshops/${currentWsId}/students/`);
        if (!res.ok) throw new Error("Error loading workshop students");
        const students = await res.json();
        const container = document.getElementById('modal-ws-students-list');
        
        if (students.length === 0) {
            container.innerHTML = '<p>No hay alumnas inscritas en este taller</p>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Alumna</th>
                        <th>Taller</th>
                        <th>Pack (Selección)</th>
                        <th>Cobro</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(s => `
                        <tr>
                            <td>
                                ${s.names}<br>
                                <button class="btn-secondary" style="padding: 2px 5px; font-size: 10px; color: red;" onclick="removeStudentFromWorkshop(${currentWsId}, '${s.student_id}')">Quitar</button>
                            </td>
                            <td>
                                <label class="switch">
                                    <input type="checkbox" ${s.workshop_paid ? 'checked' : ''} onchange="toggleWsPay(${currentWsId}, '${s.student_id}', 'workshop')">
                                    <span class="slider"></span>
                                </label>
                            </td>
                            <td>
                                <select onchange="assignPackageToStudent(${currentWsId}, '${s.student_id}', this.value)" style="font-size: 12px; padding: 2px;">
                                    <option value="">Ninguno</option>
                                    ${currentWorkshopPackages.map(p => `
                                        <option value="${p.id}" ${s.package_id == p.id ? 'selected' : ''}>${p.name}</option>
                                    `).join('')}
                                </select>
                            </td>
                            <td>
                                <label class="switch">
                                    <input type="checkbox" ${s.package_paid ? 'checked' : ''} ${!s.package_id ? 'disabled' : ''} onchange="toggleWsPay(${currentWsId}, '${s.student_id}', 'package')">
                                    <span class="slider"></span>
                                </label>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        console.error("Load modal students error:", e);
    }
}

async function removeStudentFromWorkshop(wsId, studentId) {
    if (!confirm("¿Quitar alumna de este taller?")) return;
    try {
        const res = await fetch(`${API_URL}/workshops/${wsId}/students/${studentId}`, { method: 'DELETE' });
        if (res.ok) {
            loadModalStudents();
        }
    } catch (e) {
        console.error(e);
    }
}

async function assignPackageToStudent(wsId, studentId, pkgId) {
    try {
        const url = `${API_URL}/workshop-students/assign-package/?workshop_id=${wsId}&student_id=${studentId}&package_id=${pkgId || ''}`;
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error("Error assigning package");
        loadModalStudents(); 
    } catch (e) {
        console.error(e);
        alert("Error al asignar paquete");
    }
}

// --- GESTIÓN GLOBAL DE Productos ---
async function loadAllproducts(){

    const list = document.getElementById('main-products-list');
    try {
        const res = await fetch(`${API_URL}/products/`);
        const allProducts = await res.json();

        if (allProducts.length === 0) {
            list.innerHTML = '<p>No hay productos creados todavía.</p>';
            return;
        }
        const sortedProducts = allProducts.sort((a, b) => a.description.localeCompare(b.description));
        list.innerHTML = sortedProducts.map(p => `
            <div class="card" style="margin-bottom: 10px; border-left: 5px solid #6366f1;">
                <div class="card-body">
                    <p class="card-text">Nombre: ${p.description}</p>
                    <p class="card-text">Costo: ${p.cost}</p>
                    <p class="card-text">Unidades: ${p.units}</p>
                    <p class="card-text">Código: ${p.code}</p>
                    <div class="card-footer">
                        <button type="button" class="btn btn-primary" onclick="editProduct(${p.id})">Editar</button>
                        <button type="button" class="btn btn-danger" onclick="deleteProduct(${p.id})">Eliminar</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Load products error:", e);
    }
}
// --- GESTIÓN GLOBAL DE PAQUETES ---
async function loadAllPackages() {
    const list = document.getElementById('main-packages-list');
    try {
        const res = await fetch(`${API_URL}/packages/`);
        const allPackages = await res.json();

        if (allPackages.length === 0) {
            list.innerHTML = '<p>No hay paquetes creados todavía.</p>';
            return;
        }

        list.innerHTML = allPackages.map(p => `
            <div class="card" style="margin-bottom: 10px; border-left: 5px solid #6366f1;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h4 style="margin: 0;">${p.name}</h4>
                        <p style="margin: 5px 0; font-size: 13px;">${p.description}</p>
                        <div style="font-size: 11px; background: #f8fafc; padding: 5px; border-radius: 4px;">
                            <strong>Productos:</strong> ${p.products?.length > 0 ? p.products.map(pr => `${pr.product_description} (x${pr.quantity})`).join(', ') : 'Ninguno'}
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="editPackageMain(${p.id}, '${p.name}', '${p.description}', ${JSON.stringify(p.products || []).replace(/"/g, '&quot;')})" class="btn-secondary" style="padding: 2px 8px;">Editar</button>
                        <button onclick="deletePackageMain(${p.id})" class="btn-secondary" style="padding: 2px 8px; color: red;">Eliminar</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p style="color:red;">Error al cargar paquetes.</p>';
    }
}

// Logic for Main Package Section (Bodega)
let mainDraftProducts = [];
let mainSearchedProduct = null;

document.getElementById('btn-main-search-prod').onclick = async () => {
    const code = document.getElementById('main-pkg-prod-code').value;
    if (!code) return;
    try {
        const res = await fetch(`${API_URL}/products/${code}`);
        if (!res.ok) throw new Error("Producto no encontrado");
        mainSearchedProduct = await res.json();
        document.getElementById('main-pkg-prod-item-desc').textContent = `${mainSearchedProduct.description} (Costo: Q${mainSearchedProduct.cost})`;
        document.getElementById('main-pkg-prod-item-form').style.display = 'block';
    } catch (e) {
        alert(e.message);
        document.getElementById('main-pkg-prod-item-form').style.display = 'none';
    }
};

document.getElementById('btn-main-add-prod').onclick = () => {
    const qty = parseInt(document.getElementById('main-pkg-prod-item-qty').value);
    if (!qty || qty <= 0 || !mainSearchedProduct) return;
    
    mainDraftProducts.push({
        product_id: mainSearchedProduct.id,
        quantity: qty,
        product_description: mainSearchedProduct.description
    });
    
    renderMainDraftProducts();
    document.getElementById('main-pkg-prod-item-form').style.display = 'none';
    document.getElementById('main-pkg-prod-code').value = '';
    mainSearchedProduct = null;
};

function renderMainDraftProducts() {
    const container = document.getElementById('main-pkg-prods-list');
    container.innerHTML = mainDraftProducts.map((p, i) => `
        <div style="font-size: 12px; display: flex; justify-content: space-between; background: #fff; padding: 5px 10px; border: 1px solid #e2e8f0; border-radius: 4px;">
            <span>${p.product_description} <strong>x${p.quantity}</strong></span>
            <button type="button" onclick="removeMainDraftProduct(${i})" style="color: red; border: none; background: none; cursor: pointer; font-weight: bold;">×</button>
        </div>
    `).join('');
}

function removeMainDraftProduct(index) {
    mainDraftProducts.splice(index, 1);
    renderMainDraftProducts();
}

document.getElementById('main-package-form').onsubmit = async (e) => {
    e.preventDefault();
    const pkgId = document.getElementById('main-package-id').value;
    
    // Preparar el objeto atómico (JSON completo)
    const data = {
        name: document.getElementById('main-pkg-name').value,
        description: document.getElementById('main-pkg-desc').value,
        products: mainDraftProducts.map(p => ({
            product_id: p.product_id,
            quantity: p.quantity
        }))
    };

    const method = pkgId ? 'PUT' : 'POST';
    const url = pkgId ? `${API_URL}/packages/${pkgId}` : `${API_URL}/packages/`;

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Error al guardar el paquete");
        }

        alert("Paquete guardado con éxito");
        cancelMainPackageEdit();
        loadAllPackages();
    } catch (e) {
        alert(e.message);
    }
};

function editPackageMain(id, name, desc, products = []) {
    document.getElementById('main-package-id').value = id;
    document.getElementById('main-pkg-name').value = name;
    document.getElementById('main-pkg-desc').value = desc;
    document.getElementById('btn-main-cancel-pkg').style.display = 'inline-block';
    mainDraftProducts = [...products];
    renderMainDraftProducts();
}

function cancelMainPackageEdit() {
    document.getElementById('main-package-id').value = '';
    document.getElementById('main-package-form').reset();
    document.getElementById('btn-main-cancel-pkg').style.display = 'none';
    mainDraftProducts = [];
    renderMainDraftProducts();
}

document.getElementById('btn-main-cancel-pkg').onclick = cancelMainPackageEdit;

async function deletePackageMain(id) {
    if (!confirm("¿Eliminar este paquete por completo?")) return;
    try {
        await fetch(`${API_URL}/packages/${id}`, { method: 'DELETE' });
        loadAllPackages();
    } catch (e) { console.error(e); }
}

// --- LOGICA DE TALLERES + PAQUETES ---

async function loadGlobalPackagesForSelect() {
    try {
        const res = await fetch(`${API_URL}/packages/`);
        const pkgs = await res.json();
        const select = document.getElementById('modal-link-package-select');
        select.innerHTML = pkgs.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    } catch (e) { console.error(e); }
}

document.getElementById('btn-link-package-to-ws').onclick = async () => {
    const pkgId = document.getElementById('modal-link-package-select').value;
    if (!pkgId) return;
    try {
        const res = await fetch(`${API_URL}/workshops/${currentWsId}/packages/${pkgId}`, { method: 'POST' });
        if (res.ok) {
            loadModalPackages();
            loadModalStudents(); // Refresh to update student package dropdown
        }
    } catch (e) { console.error(e); }
};

async function loadModalPackages() {
    try {
        const res = await fetch(`${API_URL}/workshops/${currentWsId}/packages/`);
        if (!res.ok) throw new Error("Error loading packages");
        currentWorkshopPackages = await res.json();
        const container = document.getElementById('modal-ws-packages-list');
        
        if (currentWorkshopPackages.length === 0) {
            container.innerHTML = '<p style="font-size: 13px;">No hay paquetes vinculados a este taller.</p>';
            return;
        }

        container.innerHTML = currentWorkshopPackages.map(p => `
            <div class="alert-item" style="color: black; background: #f1f5f9; border: 1px solid #cbd5e1; margin-bottom: 0.5rem; padding: 8px;">
                <div style="font-size: 13px;">
                    <strong>${p.name}</strong><br>
                    <small>${p.description}</small>
                </div>
                <div>
                    <button onclick="unlinkPackageFromWorkshop(${p.id})" class="btn-secondary" style="padding: 2px 8px; color: red; font-size: 11px;">Quitar</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Load packages error:", e);
    }
}

async function unlinkPackageFromWorkshop(pkgId) {
    if (!confirm("¿Desvincular este paquete del taller?")) return;
    try {
        await fetch(`${API_URL}/workshops/${currentWsId}/packages/${pkgId}`, { method: 'DELETE' });
        loadModalPackages();
        loadModalStudents();
    } catch (e) { console.error(e); }
}

// Logic for Package Products (Drafts)
let searchedProduct = null;

document.getElementById('btn-search-prod-pack').onclick = async () => {
    const code = document.getElementById('modal-pkg-prod-code').value;
    if (!code) return;
    try {
        const res = await fetch(`${API_URL}/products/${code}`);
        if (!res.ok) throw new Error("Producto no encontrado");
        searchedProduct = await res.json();
        
        document.getElementById('modal-pkg-prod-item-desc').textContent = `${searchedProduct.description} (Q${searchedProduct.cost})`;
        document.getElementById('modal-pkg-prod-item-form').style.display = 'block';
    } catch (e) {
        alert(e.message);
        document.getElementById('modal-pkg-prod-item-form').style.display = 'none';
    }
};

document.getElementById('btn-add-prod-to-pack').onclick = () => {
    const qty = parseInt(document.getElementById('modal-pkg-prod-item-qty').value);
    if (!qty || qty <= 0 || !searchedProduct) return;
    
    currentDraftProducts.push({
        product_id: searchedProduct.id,
        quantity: qty,
        product_description: searchedProduct.description
    });
    
    renderDraftProducts();
    
    // Reset search
    document.getElementById('modal-pkg-prod-code').value = '';
    document.getElementById('modal-pkg-prod-item-form').style.display = 'none';
    searchedProduct = null;
};

function renderDraftProducts() {
    const container = document.getElementById('modal-pkg-prods-list');
    container.innerHTML = currentDraftProducts.map((p, i) => `
        <div style="font-size: 11px; display: flex; justify-content: space-between; background: #fff; padding: 2px 5px; margin-bottom: 2px; border: 1px solid #e2e8f0;">
            <span>${p.product_description} x ${p.quantity}</span>
            <button type="button" onclick="removeDraftProduct(${i})" style="color: red; border: none; background: none; cursor: pointer;">x</button>
        </div>
    `).join('');
}

function removeDraftProduct(index) {
    currentDraftProducts.splice(index, 1);
    renderDraftProducts();
}

function editPackage(id, name, desc, products = []) {
    document.getElementById('modal-package-id').value = id;
    document.getElementById('modal-pkg-name').value = name;
    document.getElementById('modal-pkg-desc').value = desc;
    document.getElementById('btn-cancel-edit-pkg').style.display = 'inline-block';
    
    currentDraftProducts = [...products];
    renderDraftProducts();
}

function cancelPackageEdit() {
    document.getElementById('modal-package-id').value = '';
    document.getElementById('modal-package-form').reset();
    document.getElementById('btn-cancel-edit-pkg').style.display = 'none';
    currentDraftProducts = [];
    renderDraftProducts();
}

document.getElementById('btn-cancel-edit-pkg').onclick = cancelPackageEdit;

async function deletePackage(id) {
    if (confirm("¿Eliminar este paquete?")) {
        await fetch(`${API_URL}/packages/${id}`, { method: 'DELETE' });
        loadModalPackages();
    }
}

// Photo Logic (Mock)
document.getElementById('take-photo').addEventListener('click', () => {
    alert("Iniciando cámara... (Integración con app de fotos)");
    // Aquí se conectaría con la app del carnet electrónico
});
