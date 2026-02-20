import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, getDocs, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Configurações de Custos Fixos (Mantenha conforme sua necessidade)
const PRESTACAO = 1200;
const IPVA = 300;
const MANUTENCAO = 500;
const CUSTO_FIXO_TOTAL = PRESTACAO + IPVA + MANUTENCAO;

let charts = {};
const CACHE_KEY = 'driver_dash_form_cache';

// Elementos da UI
const sections = {
    cadastro: document.getElementById('section-cadastro'),
    dashboard: document.getElementById('section-dashboard')
};

const tabs = {
    cadastro: document.getElementById('tab-cadastro'),
    dashboard: document.getElementById('tab-dashboard')
};

// Inicialização do App
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    registerServiceWorker();
    setupPWAInstall();
});

function initApp() {
    setupNavigation();
    setupForm();
    setupDateFilters();
    loadFormCache();
    
    document.getElementById('updateBtn').addEventListener('click', () => loadDashboardData());
    document.getElementById('field-data').addEventListener('change', updateDayOfWeek);
}

// Navegação entre Abas
function setupNavigation() {
    tabs.cadastro.addEventListener('click', () => switchTab('cadastro'));
    tabs.dashboard.addEventListener('click', () => {
        switchTab('dashboard');
        loadDashboardData();
    });
}

function switchTab(target) {
    Object.keys(sections).forEach(key => {
        sections[key].style.display = key === target ? 'block' : 'none';
        tabs[key].classList.toggle('active', key === target);
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
    if (!dateVal) return;
    
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const date = new Date(dateVal + 'T00:00:00');
    document.getElementById('field-dia-semana').value = days[date.getDay()];
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
        const kmInicial = parseFloat(document.getElementById('field-km-inicial').value) || 0;
        const kmFinal = parseFloat(document.getElementById('field-km-final').value) || 0;
        
        const dataDoc = {
            data: document.getElementById('field-data').value,
            km_inicial: kmInicial,
            km_final: kmFinal,
            km_total: kmFinal - kmInicial,
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
            timestamp: new Date()
        };

        await addDoc(collection(db, "registros"), dataDoc);
        alert('✅ Dados salvos com sucesso!');
        // Limpa apenas KM inicial (seta como o final anterior) e dinheiro
        document.getElementById('field-km-inicial').value = dataDoc.km_final;
        document.getElementById('field-dinheiro').value = '';
        saveFormCache();
    } catch (e) {
        console.error("Erro ao salvar: ", e);
        alert('❌ Erro ao salvar dados. Verifique o console.');
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
            data.push(doc.data());
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
    // Processamento dos dados para as métricas
    const totals = data.reduce((acc, curr) => {
        acc.ganhos += curr.dinheiro;
        // Cálculo estimado de combustível (exemplo: consumo médio de 10km/l se não houver campo específico)
        // Aqui usamos o preco_combustivel informado no dia * litros (baseado em KM total)
        // Vamos assumir um consumo médio de 10km/L para o cálculo do dashboard se não tivermos gasto direto
        const litrosEstimados = curr.km_total / 10; 
        acc.combustivel += litrosEstimados * curr.preco_combustivel;
        
        acc.km += curr.km_total;
        acc.horas += curr.horas;
        acc.dias.add(curr.data);
        return acc;
    }, { ganhos: 0, combustivel: 0, km: 0, horas: 0, dias: new Set() });

    const lucroReal = totals.ganhos - totals.combustivel;
    const restante = lucroReal - CUSTO_FIXO_TOTAL;
    const mediaRK = totals.km > 0 ? totals.ganhos / totals.km : 0;

    // Atualizar UI
    document.getElementById('totalArrecadado').textContent = formatCurrency(totals.ganhos);
    document.getElementById('totalCombustivel').textContent = formatCurrency(totals.combustivel);
    document.getElementById('totalKM').textContent = `${totals.km.toFixed(1)} km`;
    document.getElementById('totalRestante').textContent = formatCurrency(restante);
    document.getElementById('custoMedioKM').textContent = formatCurrency(mediaRK);
    document.getElementById('lucroReal').textContent = formatCurrency(lucroReal);
    document.getElementById('totalHoras').textContent = `${totals.horas.toFixed(1)}h`;
    document.getElementById('totalDias').textContent = totals.dias.size;

    updateStatusChecks(lucroReal);
    renderCharts(data);
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

    check('statusPrestacao', PRESTACAO);
    check('statusIPVA', IPVA);
    check('statusManutencao', MANUTENCAO);
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

function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
