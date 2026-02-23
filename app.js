import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, getDocs, orderBy, where, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    DEFAULT_CONFIG, 
    formatCurrency, getDayOfWeek, calculateKmTotal, 
    calculateFuelCost, calculateDashboardMetrics 
} from "./utils.js";

// Configuração do Firebase
// ... (mantenha o resto das variáveis iguais)
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
    sections.login.style.display = isLoggedIn ? 'none' : 'block';
    sections.signup.style.display = 'none'; // Sempre esconde signup ao mudar estado de auth
    
    if (isLoggedIn) {
        switchTab('cadastro');
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
    document.getElementById('cfg-km-revisao').value = userConfig.kmRevisao;
    document.getElementById('cfg-custo-revisao').value = userConfig.custoRevisao;
    document.getElementById('cfg-km-pneu').value = userConfig.kmPneu;
    document.getElementById('cfg-custo-pneu').value = userConfig.custoPneu;
    document.getElementById('cfg-km-oleo').value = userConfig.kmOleo;
    document.getElementById('cfg-custo-oleo').value = userConfig.custoOleo;
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
        kmRevisao: parseFloat(document.getElementById('cfg-km-revisao').value) || 0,
        custoRevisao: parseFloat(document.getElementById('cfg-custo-revisao').value) || 0,
        kmPneu: parseFloat(document.getElementById('cfg-km-pneu').value) || 0,
        custoPneu: parseFloat(document.getElementById('cfg-custo-pneu').value) || 0,
        kmOleo: parseFloat(document.getElementById('cfg-km-oleo').value) || 0,
        custoOleo: parseFloat(document.getElementById('cfg-custo-oleo').value) || 0,
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
        const today = new Date().toISOString().split('T')[0];
        dateField.value = today;
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
        formData[field.id] = field.value;
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(formData));
}

function loadFormCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        const data = JSON.parse(cached);
        Object.keys(data).forEach(id => {
            const el = document.getElementById(id);
            if (el && id !== 'field-data') { // Não sobrescreve data atual se for cache antigo
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

        // Limpa formulário
        document.getElementById('form-cadastro').reset();
        document.getElementById('field-id').value = '';
        
        // Setup para próxima entrada
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('field-data').value = today;
        document.getElementById('field-km-inicial').value = dataDoc.km_final;
        updateDayOfWeek();
        saveFormCache();
    } catch (e) {
        console.error("Erro ao salvar: ", e);
        alert('❌ Erro ao salvar dados.');
    } finally {
        showLoader(false);
    }
}

// Dashboard e Filtros
function setupDateFilters() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('startDate').value = firstDayOfMonth.toISOString().split('T')[0];
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
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

        updateDashboard(data);
    } catch (e) {
        console.error("Erro ao carregar: ", e);
        alert('Erro ao carregar dados do Firebase.');
    } finally {
        showLoader(false);
    }
}

function updateDashboard(data) {
    const metrics = calculateDashboardMetrics(data, userConfig);

    // Atualizar UI
    document.getElementById('totalArrecadado').textContent = formatCurrency(metrics.ganhos);
    document.getElementById('totalCombustivel').textContent = formatCurrency(metrics.combustivel);
    document.getElementById('totalKM').textContent = `${metrics.km.toFixed(1)} km`;
    document.getElementById('totalRestante').textContent = formatCurrency(metrics.restante);
    document.getElementById('custoMedioKM').textContent = formatCurrency(metrics.mediaRK);
    document.getElementById('lucroReal').textContent = formatCurrency(metrics.lucroReal);
    document.getElementById('totalHoras').textContent = `${metrics.horas.toFixed(1)}h`;
    document.getElementById('totalDias').textContent = metrics.totalDias;

    updateStatusChecks(metrics.lucroReal);
    renderCharts(data);
    renderHistoryTable(data);
}

function renderHistoryTable(data) {
    const tbody = document.querySelector('#table-history tbody');
    tbody.innerHTML = '';

    // Ordena por data decrescente para o histórico
    const sortedData = [...data].sort((a, b) => b.data.localeCompare(a.data));

    sortedData.forEach(item => {
        const tr = document.createElement('tr');
        
        // Calcula lucro da linha
        const litros = item.km_total / (userConfig.consumoMedio || 10);
        const custoComb = litros * item.preco_combustivel;
        const variaveis = (item.km_total * (userConfig.custoRevisao/userConfig.kmRevisao + userConfig.custoPneu/userConfig.kmPneu + userConfig.custoOleo/userConfig.kmOleo)) || 0;
        const lucroItem = item.dinheiro - custoComb - variaveis;

        tr.innerHTML = `
            <td>${item.data.split('-').reverse().join('/')}</td>
            <td>${item.km_total.toFixed(1)}</td>
            <td>${formatCurrency(item.dinheiro)}</td>
            <td style="color: ${lucroItem >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${formatCurrency(lucroItem)}</td>
            <td><button class="btn-edit" data-id="${item.id}">Editar</button></td>
        `;

        tr.querySelector('.btn-edit').onclick = () => editRecord(item);
        tbody.appendChild(tr);
    });
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

function updateStatusChecks(lucro) {
    const check = (id, cost) => {
        const el = document.getElementById(id).querySelector('.badge');
        if (lucro >= cost) {
            el.textContent = 'Pago';
            el.className = 'badge success';
        } else {
            el.textContent = 'Não Pago';
            el.className = 'badge danger';
        }
    };

    check('statusPrestacao', userConfig.fixoParcela);
    check('statusIPVA', userConfig.fixoIpva);
    check('statusManutencao', userConfig.fixoManutencao);
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
