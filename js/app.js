const API_URL = "/api";

// Navigation Logic
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('page-title');

// Modal Elements
const wsModal = document.getElementById('workshop-modal');
const closeBtn = document.querySelector('.close-btn');
let currentWsId = null;

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
        if (target === 'bodega') loadAlerts();
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
        alert(`Alumna inscrita con éxito. Carnet: ${student.carnet}`);
        regForm.reset();
        updateDashboardStats();
    } catch (error) {
        console.error("Error al inscribir:", error);
        alert("Fallo al inscribir alumna: " + error.message);
    }
});

// Payments Logic
async function loadPayments(plan = 'todos') {
    const tbody = document.getElementById('payments-table-body');
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/students/${plan}`);
        if (!response.ok) throw new Error("No se pudierón cargar las alumnas");
        const students = await response.json();
        
        tbody.innerHTML = '';
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No hay alumnas en este plan</td></tr>';
            return;
        }
        students.forEach(student => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${student.carnet}</td>
                <td>${student.names} ${student.lastnames}</td>
                <td id="status-${student.id}">Cargando...</td>
                <td>
                    <button class="btn-secondary" onclick="togglePay(${student.id})">Cambiar Estado</button>
                </td>
            `;
            tbody.appendChild(tr);
            checkPaymentStatus(student.id);
        });
    } catch (error) {
        console.error("Error al cargar pagos:", error);
        tbody.innerHTML = '<tr><td colspan="4" style="color: red;">Error al cargar datos</td></tr>';
    }
}

async function checkPaymentStatus(studentId) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const response = await fetch(`${API_URL}/payments/${studentId}`);
    const payments = await response.json();
    
    const paidThisMonth = payments.find(p => p.month === month && p.year === year && p.is_paid);
    const statusCell = document.getElementById(`status-${studentId}`);
    statusCell.textContent = paidThisMonth ? '✅ Pagado' : '❌ Pendiente';
    statusCell.style.color = paidThisMonth ? 'green' : 'red';
}

async function togglePay(studentId) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    try {
        const response = await fetch(`${API_URL}/payments/toggle/?student_id=${studentId}&month=${month}&year=${year}`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error("Error toggling payment");
        const result = await response.json();
        checkPaymentStatus(studentId);
        updateDashboardStats();
    } catch (e) {
        console.error("Toggle pay error:", e);
        alert("No se pudo actualizar el pago");
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

async function loadAlerts() {
    const container = document.getElementById('inventory-alerts-container');
    try {
        const response = await fetch(`${API_URL}/inventory/alerts/`);
        if (!response.ok) throw new Error("Error fetching alerts");
        const alerts = await response.json();
        
        container.innerHTML = '<h3>Alertas de Stock Bajo</h3>';
        if (alerts.length === 0) {
            container.innerHTML += '<p>No hay alertas de stock</p>';
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
        container.innerHTML = '<h3>Error al cargar alertas</h3>';
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

        await loadModalStudents();
        await loadModalPackages();
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
            select.innerHTML = students.map(s => `<option value="${s.id}">${s.names} ${s.lastnames}</option>`).join('');
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
                        <th>Pack</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(s => `
                        <tr>
                            <td>${s.names}</td>
                            <td>
                                <label class="switch">
                                    <input type="checkbox" ${s.workshop_paid ? 'checked' : ''} onchange="toggleWsPay(${currentWsId}, ${s.student_id}, 'workshop')">
                                    <span class="slider"></span>
                                </label>
                            </td>
                            <td>
                                <label class="switch">
                                    <input type="checkbox" ${s.package_paid ? 'checked' : ''} onchange="toggleWsPay(${currentWsId}, ${s.student_id}, 'package')">
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

// Package Management
document.getElementById('modal-package-form').onsubmit = async (e) => {
    e.preventDefault();
    const pkgId = document.getElementById('modal-package-id').value;
    const data = {
        name: document.getElementById('modal-pkg-name').value,
        description: document.getElementById('modal-pkg-desc').value,
        workshop_id: currentWsId
    };

    const method = pkgId ? 'PUT' : 'POST';
    const url = pkgId ? `${API_URL}/packages/${pkgId}` : `${API_URL}/workshops/${currentWsId}/packages/`;

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error("Error saving package");
        
        cancelPackageEdit();
        loadModalPackages();
    } catch (e) {
        console.error("Save package error:", e);
        alert("Error al guardar paquete");
    }
};

async function loadModalPackages() {
    try {
        const res = await fetch(`${API_URL}/workshops/${currentWsId}/packages/`);
        if (!res.ok) throw new Error("Error loading packages");
        const pkgs = await res.json();
        const container = document.getElementById('modal-ws-packages-list');
        
        if (pkgs.length === 0) {
            container.innerHTML = '<p>No hay paquetes para este taller</p>';
            return;
        }

        container.innerHTML = pkgs.map(p => `
            <div class="alert-item" style="color: black; background: #f1f5f9; border: 1px solid #cbd5e1; margin-bottom: 0.5rem;">
                <div>
                    <strong>${p.name}</strong><br>
                    <small>${p.description}</small>
                </div>
                <div>
                    <button onclick="editPackage(${p.id}, '${p.name}', '${p.description}')" class="btn-secondary" style="padding: 2px 8px;">Edit</button>
                    <button onclick="deletePackage(${p.id})" class="btn-secondary" style="padding: 2px 8px; color: red;">X</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Load packages error:", e);
    }
}

function editPackage(id, name, desc) {
    document.getElementById('modal-package-id').value = id;
    document.getElementById('modal-pkg-name').value = name;
    document.getElementById('modal-pkg-desc').value = desc;
    document.getElementById('btn-cancel-edit-pkg').style.display = 'inline-block';
}

function cancelPackageEdit() {
    document.getElementById('modal-package-id').value = '';
    document.getElementById('modal-package-form').reset();
    document.getElementById('btn-cancel-edit-pkg').style.display = 'none';
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
