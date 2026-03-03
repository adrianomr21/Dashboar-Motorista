import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, getDocs, orderBy, where, doc, getDoc, setDoc, updateDoc, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    DEFAULT_CONFIG, 
    formatCurrency, getDayOfWeek, calculateKmTotal, 
    calculateFuelCost, calculateDashboardMetrics,
    getLocalDate, getFirstDayOfMonth
} from "./utils.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAANN3J8E5Ed9q9dldnPyzGUoo7G3WGCzE",
  authDomain: "motorista-a0806.firebaseapp.com",
  projectId: "motorista-a0806",
  storageBucket: "motorista-a0806.firebasestorage.app",
  messagingSenderId: "39959074339",
  appId: "1:39959074339:web:522f2ca4dcbc85f24f8396"
};

// Inicialização
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let charts = {};
let currentUser = null;
let userConfig = DEFAULT_CONFIG;
const CACHE_KEY = 'driver_dash_form_cache';

// Elementos da UI
const sections = {
    login: document.getElementById('section-login'),
    signup: document.getElementById('section-signup'),
    cadastro: document.getElementById('section-cadastro'),
    dashboard: document.getElementById('section-dashboard'),
    config: document.getElementById('section-config')
};

const tabs = {
    cadastro: document.getElementById('tab-cadastro'),
    dashboard: document.getElementById('tab-dashboard'),
    config: document.getElementById('tab-config')
};

const mainHeader = document.getElementById('main-header');

// Inicialização do App
document.addEventListener('DOMContentLoaded', () => {
    setupAuthListener();
    registerServiceWorker();
    setupPWAInstall();
    setupAuthToggles();
});

function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            showApp(true);
            initApp();
        } else {
            currentUser = null;
            showApp(false);
            setupLoginForm();
            setupSignupForm();
        }
    });
}

function showApp(isLoggedIn) {
    mainHeader.style.display = isLoggedIn ? 'block' : 'none';
    
    // Esconde absolutamente tudo primeiro
    Object.values(sections).forEach(section => {
        if (section) section.style.display = 'none';
    });

    if (isLoggedIn) {
        switchTab('cadastro');
    } else {
        sections.login.style.display = 'block';
    }
}

function setupAuthToggles() {
    document.getElementById('link-to-signup').onclick = (e) => {
        e.preventDefault();
        sections.login.style.display = 'none';
        sections.signup.style.display = 'block';
    };

    document.getElementById('link-to-login').onclick = (e) => {
        e.preventDefault();
        sections.signup.style.display = 'none';
        sections.login.style.display = 'block';
    };
}

function setupLoginForm() {
    const loginForm = document.getElementById('form-login');
    const errorEl = document.getElementById('login-error');

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        showLoader(true, 'Autenticando...');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            errorEl.style.display = 'none';
        } catch (error) {
            console.error(error);
            errorEl.textContent = 'Erro ao entrar. Verifique seu e-mail e senha.';
            errorEl.style.display = 'block';
        } finally {
            showLoader(false);
        }
    };
}

function setupSignupForm() {
    const signupForm = document.getElementById('form-signup');
    const errorEl = document.getElementById('signup-error');

    signupForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        if (password !== confirmPassword) {
            errorEl.textContent = 'As senhas não coincidem.';
            errorEl.style.display = 'block';
            return;
        }

        showLoader(true, 'Criando conta...');
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            errorEl.style.display = 'none';
            alert('Conta criada com sucesso!');
        } catch (error) {
            console.error(error);
            let message = 'Erro ao criar conta.';
            if (error.code === 'auth/email-already-in-use') message = 'Este e-mail já está em uso.';
            if (error.code === 'auth/weak-password') message = 'A senha deve ter pelo menos 6 caracteres.';
            
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        } finally {
            showLoader(false);
        }
    };
}

function initApp() {
    setupNavigation();
    setupForm();
    setupDateFilters();
    loadFormCache();
    loadUserConfig();
    
    document.getElementById('updateBtn').onclick = () => loadDashboardData();
    document.getElementById('logoutBtn').onclick = () => handleLogout();
    document.getElementById('field-data').onchange = updateDayOfWeek;
    document.getElementById('form-config').onsubmit = (e) => saveUserConfig(e);
    document.getElementById('form-manutencao').onsubmit = (e) => saveManutencao(e);
    document.getElementById('cancelManutBtn').onclick = () => resetManutForm();
    document.getElementById('cancelEditBtn').onclick = () => resetCadastroForm();
    document.getElementById('closeModalBtn').onclick = () => closeModal();
    document.getElementById('closeModalFooterBtn').onclick = () => closeModal();
    window.onclick = (event) => {
        const modal = document.getElementById('modal-detalhes');
        if (event.target == modal) closeModal();
    };

    // Lógica de Importação
    const btnImport = document.getElementById('btnShowImport');
    const fileInput = document.getElementById('importFile');

    btnImport.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            window.importFromMD(event.target.result);
            fileInput.value = ''; // Reseta o input
        };
        reader.readAsText(file);
    };
}

async function loadUserConfig() {
    if (!currentUser) return;
    try {
        const configDoc = await getDoc(doc(db, "configs", currentUser.uid));
        if (configDoc.exists()) {
            userConfig = { ...DEFAULT_CONFIG, ...configDoc.data() };
        } else {
            userConfig = DEFAULT_CONFIG;
        }
        fillConfigForm();
        await loadManutencoes(); // Aguarda manutenções carregarem
        checkMaintenanceAlerts(); // Agora checa os alertas
    } catch (e) {
        console.error("Erro ao carregar configs:", e);
    }
}

function fillConfigForm() {
    document.getElementById('cfg-media-km-dia').value = userConfig.mediaKmDia;
    document.getElementById('cfg-media-consumo').value = userConfig.consumoMedio;
    document.getElementById('cfg-dias-mes').value = userConfig.diasTrabalhadosMes;
    document.getElementById('cfg-lucro-alvo').value = userConfig.lucroAlvo;
    document.getElementById('cfg-fixo-parcela').value = userConfig.fixoParcela;
    document.getElementById('cfg-fixo-ipva').value = userConfig.fixoIpva;
    document.getElementById('cfg-fixo-seguro').value = userConfig.fixoSeguro;
    document.getElementById('cfg-fixo-manutencao').value = userConfig.fixoManutencao;
}

async function saveUserConfig(e) {
    e.preventDefault();
    showLoader(true, 'Salvando configurações...');
    
    const newConfig = {
        mediaKmDia: parseFloat(document.getElementById('cfg-media-km-dia').value) || 0,
        consumoMedio: parseFloat(document.getElementById('cfg-media-consumo').value) || 0,
        diasTrabalhadosMes: parseFloat(document.getElementById('cfg-dias-mes').value) || 0,
        lucroAlvo: parseFloat(document.getElementById('cfg-lucro-alvo').value) || 0,
        fixoParcela: parseFloat(document.getElementById('cfg-fixo-parcela').value) || 0,
        fixoIpva: parseFloat(document.getElementById('cfg-fixo-ipva').value) || 0,
        fixoSeguro: parseFloat(document.getElementById('cfg-fixo-seguro').value) || 0,
        fixoManutencao: parseFloat(document.getElementById('cfg-fixo-manutencao').value) || 0,
        updatedAt: new Date()
    };

    try {
        await setDoc(doc(db, "configs", currentUser.uid), newConfig);
        userConfig = newConfig;
        alert('✅ Configurações salvas!');
    } catch (e) {
        console.error("Erro ao salvar config:", e);
        alert('❌ Erro ao salvar configurações.');
    } finally {
        showLoader(false);
    }
}

async function handleLogout() {
    if (confirm('Deseja realmente sair?')) {
        await signOut(auth);
    }
}

// Navegação entre Abas
function setupNavigation() {
    tabs.cadastro.addEventListener('click', () => switchTab('cadastro'));
    tabs.dashboard.addEventListener('click', () => {
        switchTab('dashboard');
        loadDashboardData();
    });
    tabs.config.addEventListener('click', () => {
        switchTab('config');
    });
}

function switchTab(target) {
    Object.keys(sections).forEach(key => {
        if (sections[key]) {
            sections[key].style.display = key === target ? 'block' : 'none';
        }
        if (tabs[key]) {
            tabs[key].classList.toggle('active', key === target);
        }
    });
}

// Gerenciamento do Formulário
function setupForm() {
    const form = document.getElementById('form-cadastro');
    const dateField = document.getElementById('field-data');
    
    // Data atual por padrão
    if (!dateField.value) {
        dateField.value = getLocalDate();
        updateDayOfWeek();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveToFirebase();
    });

    // Salvar cache ao mudar campos
    form.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('input', saveFormCache);
    });
}

function updateDayOfWeek() {
    const dateVal = document.getElementById('field-data').value;
    document.getElementById('field-dia-semana').value = getDayOfWeek(dateVal);
}

function saveFormCache() {
    const formData = {};
    document.querySelectorAll('#form-cadastro [id^="field-"]').forEach(field => {
        if (field.id !== 'field-data') {
            formData[field.id] = field.value;
        }
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(formData));
}

function loadFormCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        const data = JSON.parse(cached);
        Object.keys(data).forEach(id => {
            const el = document.getElementById(id);
            if (el && id !== 'field-data' && id !== 'field-id') { 
                el.value = data[id];
            }
        });
    }
}

async function saveToFirebase() {
    showLoader(true, 'Salvando dados...');
    try {
        const id = document.getElementById('field-id').value;
        const kmInicial = parseFloat(document.getElementById('field-km-inicial').value) || 0;
        const kmFinal = parseFloat(document.getElementById('field-km-final').value) || 0;
        
        const dataDoc = {
            data: document.getElementById('field-data').value,
            km_inicial: kmInicial,
            km_final: kmFinal,
            km_total: calculateKmTotal(kmInicial, kmFinal),
            dinheiro: parseFloat(document.getElementById('field-dinheiro').value) || 0,
            horas: parseFloat(document.getElementById('field-horas').value) || 0,
            dia_semana: document.getElementById('field-dia-semana').value,
            turno: document.getElementById('field-turno').value,
            movimentacao: document.getElementById('field-movimentacao').value,
            perfil_passageiro: document.getElementById('field-perfil').value,
            app: document.getElementById('field-app').value,
            transito: document.getElementById('field-transito').value,
            preco_combustivel: parseFloat(document.getElementById('field-combustivel').value) || 0,
            observacoes: document.getElementById('field-obs').value,
            uid: currentUser.uid,
            timestamp: new Date()
        };

        if (id) {
            await updateDoc(doc(db, "registros", id), dataDoc);
            alert('✅ Registro atualizado!');
        } else {
            await addDoc(collection(db, "registros"), dataDoc);
            alert('✅ Dados salvos!');
        }

        // Limpa formulário e atualiza alertas
        resetCadastroForm();
        checkMaintenanceAlerts(); // Atualiza alertas imediatamente após salvar
    } catch (e) {
        console.error("Erro ao salvar: ", e);
        alert('❌ Erro ao salvar dados.');
    } finally {
        showLoader(false);
    }
}

function resetCadastroForm() {
    const form = document.getElementById('form-cadastro');
    form.reset();
    document.getElementById('field-id').value = '';
    document.getElementById('saveBtn').textContent = 'Salvar';
    document.getElementById('cancelEditBtn').style.display = 'none';
    
    // Setup para próxima entrada
    document.getElementById('field-data').value = getLocalDate();
    updateDayOfWeek();
    saveFormCache();
}

// Dashboard e Filtros
function setupDateFilters() {
    document.getElementById('startDate').value = getFirstDayOfMonth();
    document.getElementById('endDate').value = getLocalDate();
}

async function loadDashboardData() {
    showLoader(true, 'Buscando dados...');
    try {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        const q = query(
            collection(db, "registros"),
            where("data", ">=", start),
            where("data", "<=", end),
            orderBy("data", "asc")
        );

        const querySnapshot = await getDocs(q);
        const data = [];
        querySnapshot.forEach((doc) => {
            const item = doc.data();
            item.id = doc.id;
            data.push(item);
        });

        // Buscar manutenções ativas para o cálculo dinâmico
        const qManut = query(collection(db, "manutencoes"), where("uid", "==", currentUser.uid));
        const manutSnap = await getDocs(qManut);
        const manuts = [];
        manutSnap.forEach(d => manuts.push(d.data()));

        updateDashboard(data, manuts);
        checkMaintenanceAlerts();
    } catch (e) {
        console.error("Erro ao carregar: ", e);
        alert('Erro ao carregar dados do Firebase.');
    } finally {
        showLoader(false);
    }
}

function updateDashboard(data, manuts = []) {
    const metrics = calculateDashboardMetrics(data, userConfig, manuts);

    // Atualizar UI
    document.getElementById('totalArrecadado').textContent = formatCurrency(metrics.ganhos);
    document.getElementById('totalCombustivel').textContent = formatCurrency(metrics.combustivel);
    document.getElementById('totalKM').textContent = `${metrics.km.toFixed(1)} km`;
    document.getElementById('gastoEstimadoCarro').textContent = formatCurrency(metrics.custosVariaveisKm);
    document.getElementById('custoMedioKM').textContent = formatCurrency(metrics.mediaRK);
    document.getElementById('lucroReal').textContent = formatCurrency(metrics.lucroReal);
    document.getElementById('totalHoras').textContent = `${metrics.horas.toFixed(1)}h`;
    document.getElementById('totalDias').textContent = metrics.totalDias;

    renderCharts(data);
    renderHistoryTable(data, manuts);
}

function renderHistoryTable(data, manuts = []) {
    const tbody = document.querySelector('#table-history tbody');
    tbody.innerHTML = '';

    // Ordena por data decrescente para o histórico
    const sortedData = [...data].sort((a, b) => b.data.localeCompare(a.data));

    sortedData.forEach(item => {
        const tr = document.createElement('tr');
        
        // Calcula lucro da linha
        const litros = item.km_total / (userConfig.consumoMedio || 10);
        const custoComb = litros * item.preco_combustivel;
        
        let custoManutKm = 0;
        if (manuts.length > 0) {
            custoManutKm = manuts.reduce((acc, m) => acc + (m.valor / m.km_total), 0);
        } else {
            custoManutKm = (userConfig.custoRevisao/userConfig.kmRevisao + userConfig.custoPneu/userConfig.kmPneu + userConfig.custoOleo/userConfig.kmOleo);
        }
        
        const variaveis = (item.km_total * custoManutKm) || 0;
        const lucroItem = item.dinheiro - custoComb - variaveis;

        tr.innerHTML = `
            <td>${item.data.split('-').reverse().join('/')}</td>
            <td>${item.km_total.toFixed(1)}</td>
            <td>${formatCurrency(item.dinheiro)}</td>
            <td style="color: ${lucroItem >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatCurrency(lucroItem)}</td>
            <td class="table-actions">
                <button class="btn-view-record" title="Visualizar">👁️</button>
                <button class="btn-edit" title="Editar">✏️</button>
                <button class="btn-delete-record" title="Excluir">🗑️</button>
            </td>
        `;

        tr.querySelector('.btn-view-record').onclick = () => showRecordDetails(item, manuts);
        tr.querySelector('.btn-edit').onclick = () => editRecord(item);
        tr.querySelector('.btn-delete-record').onclick = () => deleteRecord(item.id);
        tbody.appendChild(tr);
    });
}

function showRecordDetails(item, manuts = []) {
    const modal = document.getElementById('modal-detalhes');
    document.getElementById('modal-data-titulo').textContent = `📅 Detalhes de ${item.data.split('-').reverse().join('/')}`;
    document.getElementById('modal-turno-badge').textContent = `Turno: ${item.turno || 'Não informado'}`;

    // Cálculos Individuais
    const kmTotal = item.km_total || 0;
    const precoComb = item.preco_combustivel || 0;
    
    const gastoComb = calculateFuelCost(kmTotal, precoComb, userConfig.consumoMedio);
    
    let custoManutKm = 0;
    if (manuts && manuts.length > 0) {
        custoManutKm = manuts.reduce((acc, m) => acc + (parseFloat(m.valor) / parseFloat(m.km_total)), 0);
    } else {
        const cRevisao = userConfig.custoRevisao / userConfig.kmRevisao || 0;
        const cPneu = userConfig.custoPneu / userConfig.kmPneu || 0;
        const cOleo = userConfig.custoOleo / userConfig.kmOleo || 0;
        custoManutKm = cRevisao + cPneu + cOleo;
    }
    
    const gastoCarro = kmTotal * custoManutKm;
    const lucro = item.dinheiro - gastoComb - gastoCarro;
    const mediaRK = kmTotal > 0 ? item.dinheiro / kmTotal : 0;

    // Preencher Modal
    document.getElementById('m-totalArrecadado').textContent = formatCurrency(item.dinheiro);
    document.getElementById('m-totalCombustivel').textContent = formatCurrency(gastoComb);
    document.getElementById('m-totalKM').textContent = `${kmTotal.toFixed(1)} km`;
    document.getElementById('m-gastoEstimadoCarro').textContent = formatCurrency(gastoCarro);
    document.getElementById('m-custoMedioKM').textContent = formatCurrency(mediaRK);
    document.getElementById('m-lucroReal').textContent = formatCurrency(lucro);
    document.getElementById('m-totalHoras').textContent = `${(item.horas || 0).toFixed(1)}h`;

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-detalhes').style.display = 'none';
}

async function deleteRecord(id) {
    if (!confirm('⚠️ Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.')) return;
    
    showLoader(true, 'Excluindo registro...');
    try {
        await deleteDoc(doc(db, "registros", id));
        alert('✅ Registro excluído com sucesso!');
        loadDashboardData(); // Recarrega os dados e atualiza o dashboard/alertas
    } catch (e) {
        console.error("Erro ao excluir registro:", e);
        alert('❌ Erro ao excluir o registro.');
    } finally {
        showLoader(false);
    }
}

function editRecord(item) {
    switchTab('cadastro');
    document.getElementById('field-id').value = item.id;
    document.getElementById('field-data').value = item.data;
    document.getElementById('field-km-inicial').value = item.km_inicial;
    document.getElementById('field-km-final').value = item.km_final;
    document.getElementById('field-dinheiro').value = item.dinheiro;
    document.getElementById('field-horas').value = item.horas;
    document.getElementById('field-dia-semana').value = item.dia_semana;
    document.getElementById('field-turno').value = item.turno;
    document.getElementById('field-movimentacao').value = item.movimentacao;
    document.getElementById('field-perfil').value = item.perfil_passageiro;
    document.getElementById('field-app').value = item.app;
    document.getElementById('field-transito').value = item.transito;
    document.getElementById('field-combustivel').value = item.preco_combustivel;
    document.getElementById('field-obs').value = item.observacoes;
    
    document.getElementById('saveBtn').textContent = 'Atualizar Registro';
    document.getElementById('cancelEditBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Função utilitária para importação (pode ser chamada no console ou via botão temporário)
window.importFromMD = async function(content) {
    if (!currentUser) return alert('Faça login primeiro');
    const lines = content.trim().split('\n');
    showLoader(true, 'Importando registros...');
    
    let count = 0;
    for (const line of lines) {
        if (line.includes('Carimbo de data/hora') || !line.trim()) continue;
        
        const cols = line.split('\t');
        if (cols.length < 10) continue;

        // Parse Data: 20/01/2026 -> 2026-01-20
        const dateParts = cols[0].split(' ')[0].split('/');
        const isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

        const dataDoc = {
            data: isoDate,
            km_inicial: parseFloat(cols[1]),
            km_final: parseFloat(cols[2]),
            km_total: parseFloat(cols[2]) - parseFloat(cols[1]),
            dinheiro: parseFloat(cols[3].replace('R$ ', '').replace(',', '.')),
            horas: parseFloat(cols[4].replace(',', '.')),
            dia_semana: cols[5],
            turno: cols[6],
            movimentacao: cols[7] || '',
            perfil_passageiro: cols[8] || '',
            observacoes: cols[9] || '',
            app: cols[10] || 'Uber',
            transito: cols[11] || '',
            preco_combustivel: parseFloat(cols[12].replace('R$ ', '').replace(',', '.')),
            uid: currentUser.uid,
            timestamp: new Date()
        };

        await addDoc(collection(db, "registros"), dataDoc);
        count++;
    }
    showLoader(false);
    alert(`${count} registros importados com sucesso!`);
    loadDashboardData();
}

function renderCharts(data) {
    const labels = data.map(d => d.data.split('-').reverse().slice(0,2).join('/')); // DD/MM
    const ganhos = data.map(d => d.dinheiro);
    const km = data.map(d => d.km_total);
    const lucro = data.map(d => {
        const litros = d.km_total / 10;
        return d.dinheiro - (litros * d.preco_combustivel);
    });

    createChart('ganhosChart', 'line', labels, [{
        label: 'Ganhos (R$)',
        data: ganhos,
        borderColor: '#00d1b2',
        backgroundColor: 'rgba(0, 209, 178, 0.1)',
        fill: true
    }]);

    createChart('combustivelLucroChart', 'bar', labels, [
        { label: 'Lucro Est. (R$)', data: lucro, backgroundColor: '#23d160' }
    ]);

    createChart('kmChart', 'line', labels, [{
        label: 'KM Rodados',
        data: km,
        borderColor: '#3273dc',
        tension: 0.4
    }]);
}

function createChart(id, type, labels, datasets) {
    if (charts[id]) charts[id].destroy();
    const el = document.getElementById(id);
    if (!el) return;
    
    const ctx = el.getContext('2d');
    charts[id] = new Chart(ctx, {
        type: type,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                y: { ticks: { color: '#888' }, grid: { color: '#333' } },
                x: { ticks: { color: '#888' }, grid: { color: '#333' } }
            }
        }
    });
}

// Gerenciamento de Manutenções
async function loadManutencoes() {
    if (!currentUser) return;
    try {
        const q = query(collection(db, "manutencoes"), where("uid", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        const manuts = [];
        querySnapshot.forEach((doc) => {
            manuts.push({ id: doc.id, ...doc.data() });
        });
        renderManutCards(manuts);
        return manuts;
    } catch (e) {
        console.error("Erro ao carregar manutenções:", e);
    }
}

async function saveManutencao(e) {
    e.preventDefault();
    showLoader(true, 'Salvando manutenção...');
    
    const id = document.getElementById('manut-id').value;
    const data = {
        nome: document.getElementById('manut-nome').value,
        km_inicial: parseFloat(document.getElementById('manut-km-inicial').value) || 0,
        km_total: parseFloat(document.getElementById('manut-km-total').value) || 0,
        valor: parseFloat(document.getElementById('manut-valor').value) || 0,
        uid: currentUser.uid,
        updatedAt: new Date()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "manutencoes", id), data);
        } else {
            await addDoc(collection(db, "manutencoes"), data);
        }
        resetManutForm();
        await loadManutencoes();
        checkMaintenanceAlerts(); // Re-verifica alertas ao mudar config
    } catch (e) {
        console.error("Erro ao salvar manutenção:", e);
        alert('Erro ao salvar manutenção.');
    } finally {
        showLoader(false);
    }
}

async function deleteManutencao(id) {
    if (!confirm('Deseja excluir esta manutenção?')) return;
    showLoader(true, 'Excluindo...');
    try {
        await deleteDoc(doc(db, "manutencoes", id));
    } catch (e) {
        console.error(e);
    } finally {
        showLoader(false);
        loadManutencoes();
        checkMaintenanceAlerts();
    }
}

function renderManutCards(manuts) {
    const container = document.getElementById('manutencao-cards');
    container.innerHTML = '';

    manuts.forEach(m => {
        const card = document.createElement('div');
        card.className = 'maintenance-card';
        card.innerHTML = `
            <h4>${m.nome}</h4>
            <div class="maintenance-info">
                <div>KM Inicial: <b>${m.km_inicial}</b></div>
                <div>Intervalo: <b>${m.km_total} km</b></div>
                <div>Valor: <b>${formatCurrency(m.valor)}</b></div>
                <div>Próxima em: <b>${m.km_inicial + m.km_total} km</b></div>
            </div>
            <div class="card-actions">
                <button class="btn-edit-manut btn-small" style="background: var(--accent-color); color: white;">Editar</button>
                <button class="btn-del-manut btn-small btn-delete">Excluir</button>
            </div>
        `;

        card.querySelector('.btn-edit-manut').onclick = () => editManut(m);
        card.querySelector('.btn-del-manut').onclick = () => deleteManutencao(m.id);
        container.appendChild(card);
    });
}

function editManut(m) {
    document.getElementById('manut-id').value = m.id;
    document.getElementById('manut-nome').value = m.nome;
    document.getElementById('manut-km-inicial').value = m.km_inicial;
    document.getElementById('manut-km-total').value = m.km_total;
    document.getElementById('manut-valor').value = m.valor;
    
    document.getElementById('saveManutBtn').textContent = 'Atualizar Manutenção';
    document.getElementById('cancelManutBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetManutForm() {
    document.getElementById('form-manutencao').reset();
    document.getElementById('manut-id').value = '';
    document.getElementById('saveManutBtn').textContent = 'Adicionar Manutenção';
    document.getElementById('cancelManutBtn').style.display = 'none';
}

// Lógica de Alertas
async function checkMaintenanceAlerts() {
    if (!currentUser) return;
    
    try {
        // Busca simples para evitar erros de índice composto no console Firebase
        const qLast = query(
            collection(db, "registros"),
            where("uid", "==", currentUser.uid)
        );
        const lastSnap = await getDocs(qLast);
        
        let currentKm = 0;
        if (!lastSnap.empty) {
            lastSnap.forEach(doc => {
                const km = parseFloat(doc.data().km_final) || 0;
                if (km > currentKm) currentKm = km;
            });
        }
        
        const qManut = query(collection(db, "manutencoes"), where("uid", "==", currentUser.uid));
        const manutSnap = await getDocs(qManut);
        
        const alertsContainer = document.getElementById('maintenance-alerts');
        alertsContainer.innerHTML = '';
        let hasAlerts = false;

        manutSnap.forEach((doc) => {
            const m = doc.data();
            const mId = doc.id;
            
            const kmTroca = parseFloat(m.km_inicial) || 0;
            const kmIntervalo = parseFloat(m.km_total) || 0;
            const kmLimite = kmTroca + kmIntervalo;
            const kmRestante = kmLimite - currentKm;
            
            if (kmRestante <= 0) {
                hasAlerts = true;
                createAlertItem(alertsContainer, `🚨 Hora de: ${m.nome}! (Vencido há ${Math.abs(kmRestante).toFixed(0)} km)`, 'danger', mId);
            } else if (kmRestante <= 500) {
                hasAlerts = true;
                createAlertItem(alertsContainer, `⚠️ Atenção: ${m.nome} em ${kmRestante.toFixed(0)} km.`, 'warning', mId);
            }
        });

        alertsContainer.style.display = hasAlerts ? 'block' : 'none';
    } catch (e) {
        console.error("Erro ao verificar alertas:", e);
    }
}

function createAlertItem(container, text, type, id) {
    const div = document.createElement('div');
    div.className = `alert-item ${type}`;
    div.innerHTML = `
        <div class="alert-content">
            <span>${text}</span>
        </div>
        <button class="alert-close" title="Fechar">✕</button>
    `;
    
    div.querySelector('.alert-close').onclick = () => {
        div.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => {
            div.remove();
            if (container.children.length === 0) container.style.display = 'none';
        }, 300);
    };

    container.appendChild(div);
}

function showLoader(show, text = 'Carregando...') {
    const loader = document.getElementById('loader');
    document.getElementById('loader-text').textContent = text;
    loader.style.display = show ? 'flex' : 'none';
}

// PWA e Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(() => console.log('Service Worker registrado'))
            .catch(err => console.log('Erro ao registrar SW:', err));
    }
}

function setupPWAInstall() {
    let deferredPrompt;
    const installBtn = document.getElementById('installBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'block';
    });

    installBtn.addEventListener('click', () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                deferredPrompt = null;
                installBtn.style.display = 'none';
            });
        }
    });
}
