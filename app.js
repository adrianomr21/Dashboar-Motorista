import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, getDocs, orderBy, where, doc, getDoc, setDoc, updateDoc, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    DEFAULT_CONFIG, 
    formatCurrency, getDayOfWeek, calculateKmTotal, 
    calculateFuelCost, calculateDashboardMetrics, calculateVariableKmCosts,
    getLocalDate, getFirstDayOfMonth, getCurrentTime, calculateTimeDiff,
    formatDecimalHours
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

// Configura persistência local para a sessão durar mais
setPersistence(auth, browserLocalPersistence)
    .catch((error) => console.error("Erro ao configurar persistência:", error));

let charts = {};
let currentUser = null;
let userConfig = DEFAULT_CONFIG;
let currentTab = 'cadastro';
const CACHE_KEY = 'driver_dash_form_cache';
const LAST_ENTRY_KEY = 'driver_dash_last_entry';

// Elementos da UI
const sections = {
    login: document.getElementById('section-login'),
    signup: document.getElementById('section-signup'),
    cadastro: document.getElementById('section-cadastro'),
    dashboard: document.getElementById('section-dashboard'),
    abastecimento: document.getElementById('section-abastecimento'),
    relatorio: document.getElementById('section-relatorio'),
    config: document.getElementById('section-config')
};

const tabs = {
    cadastro: document.getElementById('tab-cadastro'),
    dashboard: document.getElementById('tab-dashboard'),
    abastecimento: document.getElementById('tab-abastecimento'),
    relatorio: document.getElementById('tab-relatorio'),
    config: document.getElementById('tab-config')
};

const mainHeader = document.getElementById('main-header');

// Inicialização do App
document.addEventListener('DOMContentLoaded', () => {
    // Mostra loader inicial enquanto verifica auth
    showLoader(true, 'Verificando sessão...');
    setupAuthListener();
    registerServiceWorker();
    setupPWAInstall();
    setupAuthToggles();
    setupLoginForm();
    setupSignupForm();
});

function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        // Autenticação silenciosa: só mostra loader se não houver usuário e estivermos na tela de login
        // ou se for uma ação explícita de login/cadastro.
        const isLoggingIn = sections.login.style.display === 'block' || sections.signup.style.display === 'block';
        if (!user && !isLoggingIn) {
            // Se perdeu a sessão mas não estava tentando logar, mostra login sem travar tudo
            showApp(false);
        } else if (user) {
            currentUser = user;
            showApp(true);
            initApp();
        }
        showLoader(false);
    });
}

function showApp(isLoggedIn) {
    mainHeader.style.display = isLoggedIn ? 'block' : 'none';
    const globalFilters = document.getElementById('global-filters');
    
    // Esconde absolutamente tudo primeiro
    Object.values(sections).forEach(section => {
        if (section) section.style.display = 'none';
    });

    if (isLoggedIn) {
        switchTab('cadastro'); // Isso já deve esconder o filtro se não for dashboard/abastecimento
    } else {
        sections.login.style.display = 'block';
        if (globalFilters) globalFilters.style.display = 'none';
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
    setupAbastecimento();
    setupGastoGeral();

    document.getElementById('updateBtn').onclick = () => {
        if (currentTab === 'dashboard') loadDashboardData();
        if (currentTab === 'abastecimento') loadAbastecimentos();
        if (currentTab === 'relatorio') loadRelatorioData();
    };
    document.getElementById('logoutBtn').onclick = () => handleLogout();
    document.getElementById('field-data').onchange = updateDayOfWeek;
    document.getElementById('form-config').onsubmit = (e) => saveUserConfig(e);
    document.getElementById('form-manutencao').onsubmit = (e) => saveManutencao(e);
    document.getElementById('cancelManutBtn').onclick = () => resetManutForm();
    document.getElementById('cancelEditBtn').onclick = () => resetCadastroForm();
    document.getElementById('closeModalBtn').onclick = () => closeModal();
    document.getElementById('closeModalFooterBtn').onclick = () => closeModal();
    window.onclick = (event) => {
        const modalDet = document.getElementById('modal-detalhes');
        const modalAbs = document.getElementById('modal-abastecimento');
        const modalGasto = document.getElementById('modal-gasto-geral');
        if (event.target == modalDet) closeModal();
        if (event.target == modalAbs) closeAbastecimentoModal();
        if (event.target == modalGasto) closeGastoGeralModal();
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
        await loadAbastecimentos(); // Carrega abastecimentos (usa datas default inicial)
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
    tabs.abastecimento.addEventListener('click', () => {
        switchTab('abastecimento');
        loadAbastecimentos();
    });
    tabs.relatorio.addEventListener('click', () => {
        switchTab('relatorio');
        loadRelatorioData();
    });
    tabs.config.addEventListener('click', () => {
        switchTab('config');
    });

    document.getElementById('btnPrintRelatorio').onclick = () => window.print();
}

function switchTab(target) {
    currentTab = target;
    Object.keys(sections).forEach(key => {
        if (sections[key]) {
            sections[key].style.display = key === target ? 'block' : 'none';
        }
        if (tabs[key]) {
            tabs[key].classList.toggle('active', key === target);
        }
    });

    // Se entrar na aba de cadastro e não estiver editando, garante data/hora atualizadas
    if (target === 'cadastro') {
        const id = document.getElementById('field-id').value;
        if (!id) {
            document.getElementById('field-data').value = getLocalDate();
            updateDayOfWeek();
            // A hora de início só atualiza se estiver vazia para não perder o que o usuário digitou
            // Mas o turno pode ser recalculado
            const startField = document.getElementById('field-hora-inicio');
            if (!startField.value) {
                startField.value = getCurrentTime();
            }
            refreshDefaultTurno();
        }
    }

    // Mostra filtros globais apenas no Dashboard, Abastecimento e Relatório
    const globalFilters = document.getElementById('global-filters');
    if (target === 'dashboard' || target === 'abastecimento' || target === 'relatorio') {
        globalFilters.style.display = 'block';
    } else {
        globalFilters.style.display = 'none';
    }
}

/**
 * Recalcula o turno baseado na hora atual (Fuso SP)
 */
function refreshDefaultTurno() {
    const spTime = getCurrentTime();
    const currentHour = parseInt(spTime.split(':')[0]);
    let defaultTurno = 'Manhã';

    if (currentHour >= 0 && currentHour < 6) defaultTurno = 'Madrugada';
    else if (currentHour >= 6 && currentHour < 12) defaultTurno = 'Manhã';
    else if (currentHour >= 12 && currentHour < 14) defaultTurno = 'Meio-dia';
    else if (currentHour >= 14 && currentHour < 16) defaultTurno = 'Tarde';
    else if (currentHour >= 16 && currentHour <= 23) defaultTurno = 'Noite';

    document.getElementById('field-turno').value = defaultTurno;
}

// Lógica de Abastecimento
function setupAbastecimento() {
    const form = document.getElementById('form-abastecimento');
    const totalInput = document.getElementById('abs-valor-total');
    const priceInput = document.getElementById('abs-preco-litro');
    const litersInput = document.getElementById('abs-litros');
    const kmAnteriorInput = document.getElementById('abs-km-anterior');
    const kmAtualInput = document.getElementById('abs-km-atual');
    const consumoInput = document.getElementById('abs-consumo-kml');

    const updateCalculations = () => {
        const total = parseFloat(totalInput.value.replace(',', '.')) || 0;
        const price = parseFloat(priceInput.value.replace(',', '.')) || 0;
        const kmAnt = parseFloat(kmAnteriorInput.value) || 0;
        const kmAtu = parseFloat(kmAtualInput.value) || 0;
        
        let litros = 0;
        if (price > 0) {
            litros = total / price;
            litersInput.value = litros.toFixed(2).replace('.', ',') + ' L';
        } else {
            litersInput.value = '0,00 L';
        }

        if (litros > 0 && kmAtu > kmAnt) {
            const dist = kmAtu - kmAnt;
            const kml = dist / litros;
            consumoInput.value = kml.toFixed(1).replace('.', ',') + ' KM/L';
        } else {
            consumoInput.value = '0,0';
        }
    };

    const applyMask = (input, decimals) => {
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') {
                e.target.value = '';
                updateCalculations();
                return;
            }
            const divisor = Math.pow(10, decimals);
            value = (parseInt(value) / divisor).toFixed(decimals);
            e.target.value = value.replace('.', ',');
            updateCalculations();
        });
    };

    applyMask(totalInput, 2);
    applyMask(priceInput, 2);
    kmAnteriorInput.addEventListener('input', updateCalculations);
    kmAtualInput.addEventListener('input', updateCalculations);

    document.getElementById('btnAddAbastecimento').onclick = () => openAbastecimentoModal();
    document.getElementById('closeAbastecimentoBtn').onclick = () => closeAbastecimentoModal();
    document.getElementById('closeAbsFooterBtn').onclick = () => closeAbastecimentoModal();

    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveAbastecimento();
    };
}

// Lógica de Gasto Geral (Acessórios, Manutenção, Revisão)
function setupGastoGeral() {
    const form = document.getElementById('form-gasto-geral');
    const valorInput = document.getElementById('gasto-valor');

    const applyMask = (input, decimals) => {
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') {
                e.target.value = '';
                return;
            }
            const divisor = Math.pow(10, decimals);
            value = (parseInt(value) / divisor).toFixed(decimals);
            e.target.value = value.replace('.', ',');
        });
    };

    applyMask(valorInput, 2);

    document.getElementById('btnAddGastoGeral').onclick = () => openGastoGeralModal();
    document.getElementById('closeGastoGeralBtn').onclick = () => closeGastoGeralModal();
    document.getElementById('closeGastoFooterBtn').onclick = () => closeGastoGeralModal();

    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveGastoGeral();
    };
}

async function openGastoGeralModal(data = null) {
    const modal = document.getElementById('modal-gasto-geral');
    const form = document.getElementById('form-gasto-geral');
    form.reset();

    if (data) {
        document.getElementById('gasto-id').value = data.id;
        document.getElementById('gasto-data').value = data.data;
        document.getElementById('gasto-tipo').value = data.tipo;
        document.getElementById('gasto-descricao').value = data.descricao;
        document.getElementById('gasto-valor').value = data.valor.toFixed(2).replace('.', ',');
        document.querySelector('#modal-gasto-geral h3').textContent = '💸 Editar Gasto';
    } else {
        document.getElementById('gasto-id').value = '';
        document.getElementById('gasto-data').value = getLocalDate();
        document.querySelector('#modal-gasto-geral h3').textContent = '💸 Registrar Gasto';
    }
    modal.style.display = 'flex';
}

function closeGastoGeralModal() {
    document.getElementById('modal-gasto-geral').style.display = 'none';
}

async function saveGastoGeral() {
    showLoader(true, 'Salvando gasto...');
    const id = document.getElementById('gasto-id').value;
    const valorVal = parseFloat(document.getElementById('gasto-valor').value.replace(',', '.')) || 0;

    const data = {
        data: document.getElementById('gasto-data').value,
        tipo: document.getElementById('gasto-tipo').value,
        descricao: document.getElementById('gasto-descricao').value,
        valor: valorVal,
        uid: currentUser.uid,
        timestamp: new Date()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "gastos_gerais", id), data);
        } else {
            await addDoc(collection(db, "gastos_gerais"), data);
        }
        closeGastoGeralModal();
        await loadAbastecimentos();
        if (currentTab === 'dashboard') loadDashboardData();
    } catch (e) {
        console.error("Erro ao salvar gasto:", e);
        alert('Erro ao salvar gasto.');
    } finally {
        showLoader(false);
    }
}

async function openAbastecimentoModal(data = null) {
    const modal = document.getElementById('modal-abastecimento');
    const form = document.getElementById('form-abastecimento');
    form.reset();
    
    if (data) {
        document.getElementById('abs-id').value = data.id;
        document.getElementById('abs-data').value = data.data;
        document.getElementById('abs-km-anterior').value = data.km_anterior || 0;
        document.getElementById('abs-km-atual').value = data.km_atual || 0;
        document.getElementById('abs-valor-total').value = data.valor_total.toFixed(2).replace('.', ',');
        document.getElementById('abs-preco-litro').value = data.preco_litro.toFixed(2).replace('.', ',');
        
        const litros = data.valor_total / data.preco_litro;
        document.getElementById('abs-litros').value = litros.toFixed(2).replace('.', ',') + ' L';
        
        if (litros > 0 && data.km_atual > data.km_anterior) {
            const kml = (data.km_atual - data.km_anterior) / litros;
            document.getElementById('abs-consumo-kml').value = kml.toFixed(1).replace('.', ',') + ' KM/L';
        } else {
            document.getElementById('abs-consumo-kml').value = '0,0';
        }
        
        document.querySelector('#modal-abastecimento h3').textContent = '⛽ Editar Abastecimento';
    } else {
        document.getElementById('abs-id').value = '';
        document.getElementById('abs-data').value = getLocalDate();
        document.getElementById('abs-litros').value = '0,00 L';
        document.getElementById('abs-consumo-kml').value = '0,0';
        document.querySelector('#modal-abastecimento h3').textContent = '⛽ Registrar Abastecimento';
        
        // Busca o último KM registrado
        showLoader(true, 'Buscando KM anterior...');
        try {
            // Verifica maior KM em registros de viagens
            const qReg = query(collection(db, "registros"), where("uid", "==", currentUser.uid), orderBy("km_final", "desc"), limit(1));
            const snapReg = await getDocs(qReg);
            let lastKm = 0;
            if (!snapReg.empty) lastKm = snapReg.docs[0].data().km_final || 0;

            // Verifica maior KM em abastecimentos
            const qAbs = query(collection(db, "abastecimentos"), where("uid", "==", currentUser.uid), orderBy("km_atual", "desc"), limit(1));
            const snapAbs = await getDocs(qAbs);
            if (!snapAbs.empty) {
                const absKm = snapAbs.docs[0].data().km_atual || 0;
                if (absKm > lastKm) lastKm = absKm;
            }

            document.getElementById('abs-km-anterior').value = lastKm;
            document.getElementById('abs-km-atual').value = '';
        } catch (e) {
            console.error("Erro ao buscar último KM:", e);
        } finally {
            showLoader(false);
        }
    }
    
    modal.style.display = 'flex';
}

function closeAbastecimentoModal() {
    document.getElementById('modal-abastecimento').style.display = 'none';
}

async function saveAbastecimento() {
    showLoader(true, 'Salvando abastecimento...');
    const id = document.getElementById('abs-id').value;
    const totalVal = parseFloat(document.getElementById('abs-valor-total').value.replace(',', '.')) || 0;
    const precoVal = parseFloat(document.getElementById('abs-preco-litro').value.replace(',', '.')) || 0;
    const kmAnt = parseFloat(document.getElementById('abs-km-anterior').value) || 0;
    const kmAtu = parseFloat(document.getElementById('abs-km-atual').value) || 0;

    const data = {
        data: document.getElementById('abs-data').value,
        valor_total: totalVal,
        preco_litro: precoVal,
        km_anterior: kmAnt,
        km_atual: kmAtu,
        uid: currentUser.uid,
        timestamp: new Date()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "abastecimentos", id), data);
        } else {
            await addDoc(collection(db, "abastecimentos"), data);
        }
        closeAbastecimentoModal();
        await loadAbastecimentos();
        if (currentTab === 'dashboard') loadDashboardData(); // Atualiza dashboard se estiver lá
    } catch (e) {
        console.error("Erro ao salvar abastecimento:", e);
        alert('Erro ao salvar abastecimento.');
    } finally {
        showLoader(false);
    }
}

async function loadAbastecimentos() {
    if (!currentUser) return;
    showLoader(true, 'Buscando gastos...');
    try {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        // Buscar Abastecimentos
        const qAbs = query(
            collection(db, "abastecimentos"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end),
            orderBy("data", "desc")
        );
        const absSnap = await getDocs(qAbs);
        const abastecimentos = [];
        absSnap.forEach((doc) => {
            abastecimentos.push({ id: doc.id, collection: 'abastecimentos', ...doc.data() });
        });

        // Buscar Gastos Gerais
        const qGeral = query(
            collection(db, "gastos_gerais"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end),
            orderBy("data", "desc")
        );
        const geralSnap = await getDocs(qGeral);
        const gastosGerais = [];
        geralSnap.forEach((doc) => {
            gastosGerais.push({ id: doc.id, collection: 'gastos_gerais', ...doc.data() });
        });

        // Combinar e ordenar por data
        const todosGastos = [...abastecimentos, ...gastosGerais].sort((a, b) => b.data.localeCompare(a.data));
        renderAbastecimentoCards(todosGastos);
    } catch (e) {
        console.error("Erro ao carregar abastecimentos:", e);
    } finally {
        showLoader(false);
    }
}

function renderAbastecimentoCards(data) {
    const container = document.getElementById('abastecimento-cards');
    container.innerHTML = '';

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'abastecimento-card';

        if (item.collection === 'abastecimentos') {
            const litros = item.valor_total / item.preco_litro;
            const dist = (item.km_atual && item.km_anterior) ? (item.km_atual - item.km_anterior) : 0;
            const kml = (litros > 0 && dist > 0) ? (dist / litros) : 0;

            card.innerHTML = `
                <div class="abastecimento-header">
                    <span class="abastecimento-date">${item.data.split('-').reverse().join('/')}</span>
                    <span class="abastecimento-value" style="color: var(--primary-color)">${formatCurrency(item.valor_total)}</span>
                </div>
                <div class="abastecimento-details">
                    <div style="grid-column: span 2; font-weight: bold; color: var(--success-color); margin-bottom: 5px;">⛽ Abastecimento</div>
                    <div>Preço/L: <b>${formatCurrency(item.preco_litro)}</b></div>
                    <div>Litros: <b>${litros.toFixed(2)} L</b></div>
                    <div>KM: <b>${item.km_anterior} → ${item.km_atual}</b></div>
                    <div>Consumo: <b style="color: var(--success-color)">${kml > 0 ? kml.toFixed(1) + ' KM/L' : '--'}</b></div>
                </div>
                <div class="card-actions">
                    <button class="btn-edit-abs btn-small" style="background: rgba(50, 115, 220, 0.2); color: var(--accent-color);">Editar</button>
                    <button class="btn-del-abs btn-small btn-delete">Excluir</button>
                </div>
            `;
            card.querySelector('.btn-edit-abs').onclick = () => openAbastecimentoModal(item);
            card.querySelector('.btn-del-abs').onclick = () => deleteAbastecimento(item.id);
        } else {
            // Gasto Geral
            card.innerHTML = `
                <div class="abastecimento-header">
                    <span class="abastecimento-date">${item.data.split('-').reverse().join('/')}</span>
                    <span class="abastecimento-value" style="color: var(--accent-color)">${formatCurrency(item.valor)}</span>
                </div>
                <div class="abastecimento-details">
                    <div style="grid-column: span 2; font-weight: bold; color: var(--accent-color); margin-bottom: 5px;">💸 ${item.tipo}</div>
                    <div style="grid-column: span 2;">Descrição: <b>${item.descricao}</b></div>
                </div>
                <div class="card-actions">
                    <button class="btn-edit-gasto btn-small" style="background: rgba(50, 115, 220, 0.2); color: var(--accent-color);">Editar</button>
                    <button class="btn-del-gasto btn-small btn-delete">Excluir</button>
                </div>
            `;
            card.querySelector('.btn-edit-gasto').onclick = () => openGastoGeralModal(item);
            card.querySelector('.btn-del-gasto').onclick = () => deleteGastoGeral(item.id);
        }

        container.appendChild(card);
    });
}

async function deleteGastoGeral(id) {
    if (!confirm('Deseja excluir este gasto?')) return;
    showLoader(true, 'Excluindo...');
    try {
        await deleteDoc(doc(db, "gastos_gerais", id));
        await loadAbastecimentos();
        if (currentTab === 'dashboard') loadDashboardData();
    } catch (e) {
        console.error(e);
    } finally {
        showLoader(false);
    }
}

async function deleteAbastecimento(id) {
    if (!confirm('Deseja excluir este abastecimento?')) return;
    showLoader(true, 'Excluindo...');
    try {
        await deleteDoc(doc(db, "abastecimentos", id));
        await loadAbastecimentos();
    } catch (e) {
        console.error(e);
    } finally {
        showLoader(false);
    }
}

// Gerenciamento do Formulário
function setupForm() {
    const form = document.getElementById('form-cadastro');
    const dateField = document.getElementById('field-data');
    const moneyField = document.getElementById('field-dinheiro');
    const startField = document.getElementById('field-hora-inicio');
    const endField = document.getElementById('field-hora-fim');
    const displayTotal = document.getElementById('display-horas-total');
    const fuelPriceField = document.getElementById('field-combustivel');
    
    // Máscara de Moeda
    moneyField.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value === '') {
            e.target.value = '';
            return;
        }
        value = (parseInt(value) / 100).toFixed(2);
        e.target.value = value.replace('.', ',');
    });

    // Máscara de Preço de Combustível (2 casas decimais, permite digitar até 3 dígitos)
    fuelPriceField.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        
        if (value === '') {
            e.target.value = '';
            return;
        }
        
        value = (parseInt(value) / 100).toFixed(2);
        e.target.value = value.replace('.', ',');
    });

    // Configurações Iniciais
    const idField = document.getElementById('field-id');
    if (!idField.value) {
        dateField.value = getLocalDate();
        updateDayOfWeek();
        if (!startField.value) {
            startField.value = getCurrentTime();
        }
        refreshDefaultTurno();
    }

    const updateCalculatedHours = () => {
        const diff = calculateTimeDiff(startField.value, endField.value);
        displayTotal.value = diff.formatted;
    };

    // Novos Botões de Registro de Tempo
    const btnRecordInicio = document.getElementById('btn-record-inicio');
    const btnRecordFim = document.getElementById('btn-record-fim');

    btnRecordInicio.addEventListener('click', () => {
        startField.value = getCurrentTime();
        updateCalculatedHours();
        saveFormCache();
    });

    btnRecordFim.addEventListener('click', () => {
        endField.value = getCurrentTime();
        updateCalculatedHours();
        saveFormCache();
    });

    startField.addEventListener('input', updateCalculatedHours);
    endField.addEventListener('input', updateCalculatedHours);

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
    const dayName = getDayOfWeek(dateVal);
    document.getElementById('field-dia-semana').value = dayName;
    
    // Atualiza o novo badge visual
    const displayBadge = document.getElementById('display-dia-semana');
    if (displayBadge) {
        displayBadge.textContent = dayName;
    }
}

function saveFormCache() {
    const formData = {};
    document.querySelectorAll('#form-cadastro [id^="field-"]').forEach(field => {
        // Exclui campos que não devem ser salvos no cache (conforme solicitado pelo usuário)
        if (field.id !== 'field-data' && field.id !== 'field-hora-inicio' && field.id !== 'field-turno' && field.id !== 'field-dia-semana') {
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
            // Também garante que não carregue se por acaso ainda estiver no cache antigo
            if (el && id !== 'field-data' && id !== 'field-id' && id !== 'field-hora-inicio' && id !== 'field-turno' && id !== 'field-dia-semana') { 
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
        
        const startVal = document.getElementById('field-hora-inicio').value;
        const endVal = document.getElementById('field-hora-fim').value;
        const timeDiff = calculateTimeDiff(startVal, endVal);

        // Converte valor formatado "0,00" para float
        const dinheiroVal = parseFloat(document.getElementById('field-dinheiro').value.replace(',', '.')) || 0;

        const dataDoc = {
            data: document.getElementById('field-data').value,
            km_inicial: kmInicial,
            km_final: kmFinal,
            km_total: calculateKmTotal(kmInicial, kmFinal),
            dinheiro: dinheiroVal,
            hora_inicio: startVal,
            hora_fim: endVal,
            horas: timeDiff.decimal, // Salva o decimal para métricas
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
            // Salva como último registro para facilitar o próximo preenchimento
            localStorage.setItem(LAST_ENTRY_KEY, JSON.stringify(dataDoc));
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
    const lastEntry = localStorage.getItem(LAST_ENTRY_KEY);
    
    form.reset();
    document.getElementById('field-id').value = '';
    document.getElementById('saveBtn').textContent = 'Salvar';
    document.getElementById('cancelEditBtn').style.display = 'none';

    // Se houver um registro anterior, pré-preenche alguns campos (conforme solicitado, hora e turno não são mais recuperados)
    if (lastEntry) {
        const data = JSON.parse(lastEntry);
        document.getElementById('field-km-inicial').value = data.km_final || '';
        document.getElementById('field-km-final').value = '';
        document.getElementById('field-dinheiro').value = '';
        document.getElementById('field-hora-inicio').value = getCurrentTime(); // Sempre atual
        document.getElementById('field-hora-fim').value = '';
        document.getElementById('display-horas-total').value = '0:00';
        document.getElementById('field-movimentacao').value = data.movimentacao || 'Média';
        document.getElementById('field-perfil').value = data.perfil_passageiro || 'Trabalhador';
        document.getElementById('field-app').value = data.app || 'Uber';
        document.getElementById('field-transito').value = data.transito || 'Moderado';
        document.getElementById('field-combustivel').value = data.preco_combustivel || '';
        document.getElementById('field-obs').value = '';
    } else {
        document.getElementById('field-hora-inicio').value = getCurrentTime();
        document.getElementById('display-horas-total').value = '0:00';
    }
    
    // Data, Turno e Dia da Semana sempre atuais (Fuso SP)
    document.getElementById('field-data').value = getLocalDate();
    updateDayOfWeek();
    refreshDefaultTurno();
    saveFormCache();
}

// Dashboard e Filtros
const FILTER_START_DATE_KEY = 'driver_dash_filter_start';

function setupDateFilters() {
    const savedStart = localStorage.getItem(FILTER_START_DATE_KEY);
    const start = savedStart || getFirstDayOfMonth();
    const end = getLocalDate();

    document.getElementById('startDate').value = start;
    document.getElementById('endDate').value = end;
}

async function loadDashboardData() {
    showLoader(true, 'Buscando dados...');
    try {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        // Salva a data inicial no localStorage para persistência
        localStorage.setItem(FILTER_START_DATE_KEY, start);

        const q = query(
            collection(db, "registros"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end),
            orderBy("data", "asc")
        );
// ... resto da função loadDashboardData permanece igual ...

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

        // Buscar apenas abastecimentos reais
        const qAbs = query(
            collection(db, "abastecimentos"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end)
        );
        const absSnap = await getDocs(qAbs);
        let totalAbsReal = 0;
        absSnap.forEach(d => {
            totalAbsReal += parseFloat(d.data().valor_total) || 0;
        });

        // Buscar outros gastos reais (Mês)
        const qGeral = query(
            collection(db, "gastos_gerais"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end)
        );
        const geralSnap = await getDocs(qGeral);
        let totalGeralReal = 0;
        geralSnap.forEach(d => {
            totalGeralReal += parseFloat(d.data().valor) || 0;
        });

        updateDashboard(data, manuts, totalAbsReal, totalGeralReal);
        checkMaintenanceAlerts();
    } catch (e) {
        console.error("Erro ao carregar: ", e);
        alert('Erro ao carregar dados do Firebase.');
    } finally {
        showLoader(false);
    }
}

function updateDashboard(data, manuts = [], totalAbsReal = 0, totalGeralReal = 0) {
    const metrics = calculateDashboardMetrics(data, userConfig, manuts);

    // Custos Fixos Totais da Configuração
    const custoFixoConfig = (userConfig.fixoParcela || 0) + 
                            (userConfig.fixoIpva || 0) + 
                            (userConfig.fixoSeguro || 0) + 
                            (userConfig.fixoManutencao || 0);

    // Lucro Real Final = Arrecadado - Combustível - Variáveis - Custos Fixos
    const lucroRealFinal = metrics.ganhos - metrics.combustivel - metrics.custosVariaveisKm - custoFixoConfig;
    // Valor Restante = Arrecadado - Gasto Estimado Combustível - Gasto Estimado Carro
    const valorRestante = metrics.ganhos - metrics.combustivel - metrics.custosVariaveisKm;

    // Atualizar UI
    document.getElementById('totalArrecadado').textContent = formatCurrency(metrics.ganhos);
    document.getElementById('totalCombustivel').textContent = formatCurrency(metrics.combustivel);
    document.getElementById('totalAbastecimentoReal').textContent = formatCurrency(totalAbsReal);
    document.getElementById('totalGeralReal').textContent = formatCurrency(totalGeralReal);
    document.getElementById('valorRestante').textContent = formatCurrency(valorRestante);
    document.getElementById('totalKM').textContent = `${metrics.km.toFixed(1)} km`;
    document.getElementById('gastoEstimadoCarro').textContent = formatCurrency(metrics.custosVariaveisKm);
    document.getElementById('custoMedioKM').textContent = formatCurrency(metrics.mediaRK);
    document.getElementById('lucroReal').textContent = formatCurrency(lucroRealFinal); 
    document.getElementById('totalHoras').textContent = formatDecimalHours(metrics.horas);
    document.getElementById('totalDias').textContent = metrics.totalDias;

    // Estilo do card Lucro Real
    document.getElementById('lucroReal').style.color = lucroRealFinal >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
    document.getElementById('valorRestante').style.color = valorRestante >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    // --- RANKINGS ---
    const dailyMap = {};
    const turnoMap = {};

    data.forEach(item => {
        if (!dailyMap[item.data]) dailyMap[item.data] = { ganhos_dia: 0, lucro: 0, km: 0, horas: 0 };
        
        const litros = item.km_total / (userConfig.consumoMedio || 10);
        const custoComb = litros * item.preco_combustivel;
        const custoVariavel = calculateVariableKmCosts(item.km_total, userConfig, manuts);
        const lucroItem = item.dinheiro - custoComb - custoVariavel;

        dailyMap[item.data].ganhos_dia += item.dinheiro;
        dailyMap[item.data].lucro += lucroItem;
        dailyMap[item.data].km += item.km_total;
        dailyMap[item.data].horas += (item.horas || 0);

        const key = `${item.data}|${item.dia_semana}|${item.turno || 'N/A'}`;
        if (!turnoMap[key]) {
            turnoMap[key] = { 
                ganhos: 0, 
                km: 0, 
                data: item.data, 
                dia: item.dia_semana, 
                turno: item.turno || 'N/A' 
            };
        }
        turnoMap[key].ganhos += item.dinheiro;
        turnoMap[key].km += item.km_total;
    });

    const sortedDays = Object.keys(dailyMap).map(date => ({ date, ...dailyMap[date] }));
    
    // Resumo do Último Dia (última data cronológica)
    const lastDay = sortedDays.sort((a, b) => b.date.localeCompare(a.date))[0];
    const summaryCard = document.getElementById('daily-summary-card');
    
    if (lastDay) {
        summaryCard.style.display = 'block';
        document.getElementById('summary-date').textContent = lastDay.date.split('-').reverse().slice(0, 2).join('/');
        document.getElementById('summary-lucro').textContent = formatCurrency(lastDay.lucro);
        document.getElementById('summary-lucro').style.color = lastDay.lucro >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        
        const rskm = lastDay.km > 0 ? (lastDay.ganhos_dia / lastDay.km) : 0;
        document.getElementById('summary-rskm').textContent = formatCurrency(rskm);
        document.getElementById('summary-km').textContent = `${lastDay.km.toFixed(1)} km`;
        document.getElementById('summary-horas').textContent = formatDecimalHours(lastDay.horas);
    } else {
        summaryCard.style.display = 'none';
    }

    // Top 3 Lucrativos
    const topLucro = [...sortedDays].sort((a, b) => b.lucro - a.lucro).slice(0, 3);
    const listEl = document.getElementById('top-lucro-list');
    listEl.innerHTML = topLucro.map((d, i) => {
        const diaSemana = getDayOfWeek(d.date);
        return `
            <li style="padding: 8px 0; border-bottom: 1px solid #333;">
                <b>${i+1}º</b> ${d.date.split('-').reverse().join('/')} (${diaSemana.substring(0, 3)}): ${formatCurrency(d.lucro)}
            </li>
        `;
    }).join('');

    // Top 3 Menos Lucrativos
    const bottomLucro = [...sortedDays].sort((a, b) => a.lucro - b.lucro).slice(0, 3);
    const bottomListEl = document.getElementById('bottom-lucro-list');
    bottomListEl.innerHTML = bottomLucro.map((d, i) => {
        const diaSemana = getDayOfWeek(d.date);
        return `
            <li style="padding: 8px 0; border-bottom: 1px solid #333;">
                <b>${i+1}º</b> ${d.date.split('-').reverse().join('/')} (${diaSemana.substring(0, 3)}): ${formatCurrency(d.lucro)}
            </li>
        `;
    }).join('');

    // Dia com Maior R$/KM
    const efficiencyDays = [...sortedDays].filter(d => d.km > 0).map(d => ({
        ...d,
        efficiency: d.ganhos_dia / d.km
    }));
    const bestEfficiencyDay = efficiencyDays.sort((a, b) => b.efficiency - a.efficiency)[0];
    
    document.getElementById('top-km-day').innerHTML = bestEfficiencyDay ? `
        <h3 style="color: var(--accent-color); margin: 0;">${formatCurrency(bestEfficiencyDay.efficiency)}/KM</h3>
        <p style="margin: 5px 0;">(${bestEfficiencyDay.date.split('-').reverse().join('/')} | ${getDayOfWeek(bestEfficiencyDay.date)})</p>
    ` : 'Sem dados suficientes';

    updateDistributionBar(metrics);
    renderCharts(data);
    renderHistoryTable(data, manuts);
}

function updateDistributionBar(metrics) {
    const totalArrecadado = metrics.ganhos || 0;
    
    // 1. Custos Totais Conforme Configuração
    const custoFixoConfig = (userConfig.fixoParcela || 0) + 
                            (userConfig.fixoIpva || 0) + 
                            (userConfig.fixoSeguro || 0) + 
                            (userConfig.fixoManutencao || 0);
    
    const custoGasolinaReal = metrics.combustivel || 0;
    const custoVariavelReal = metrics.custosVariaveisKm || 0;
    const custosTotais = custoGasolinaReal + custoVariavelReal + custoFixoConfig;

    // O Lucro Real é o que sobra após TODOS os custos. Se for negativo, o lucro é zero para o gráfico.
    const lucroRealFinal = Math.max(0, totalArrecadado - custosTotais);

    // O tamanho total da barra (100%) é a soma dos custos + o lucro real (se houver)
    // Se ainda não cobriu os custos, a barra total é a soma dos custos
    const baseCalculoMeta = Math.max(custosTotais, totalArrecadado);

    // 2. LARGURAS DAS ESTRUTURAS (As bordas que demarcam os limites)
    const setWidth = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.style.width = `${val}%`;
    };

    if (baseCalculoMeta > 0) {
        setWidth('dist-bar-fuel', (custoGasolinaReal / baseCalculoMeta) * 100);
        setWidth('dist-bar-variable', (custoVariavelReal / baseCalculoMeta) * 100);
        setWidth('dist-bar-fixed', (custoFixoConfig / baseCalculoMeta) * 100);
        setWidth('dist-bar-profit', (lucroRealFinal / baseCalculoMeta) * 100);

        // 3. PREENCHIMENTO REAL (Dinheiro que entrou ocupando os espaços)
        let saldo = totalArrecadado;
        const getFill = (metaDoBloco) => {
            if (saldo <= 0) return 0;
            if (metaDoBloco <= 0) return 100;
            const preenchimento = Math.min(100, (saldo / metaDoBloco) * 100);
            saldo -= metaDoBloco;
            return preenchimento;
        };

        const fFuel = getFill(custoGasolinaReal);
        const fVar = getFill(custoVariavelReal);
        const fFix = getFill(custoFixoConfig);
        const fProfit = getFill(lucroRealFinal);

        document.getElementById('dist-bar-fuel').style.setProperty('--fill-percent', `${fFuel}%`);
        document.getElementById('dist-bar-variable').style.setProperty('--fill-percent', `${fVar}%`);
        document.getElementById('dist-bar-fixed').style.setProperty('--fill-percent', `${fFix}%`);
        document.getElementById('dist-bar-profit').style.setProperty('--fill-percent', `${fProfit}%`);
    }

    // 4. LABELS
    document.getElementById('label-fuel').innerHTML = `<i class="dot fuel"></i> Gasolina: ${formatCurrency(custoGasolinaReal)}`;
    document.getElementById('label-variable').innerHTML = `<i class="dot variable"></i> Variáveis: ${formatCurrency(custoVariavelReal)}`;
    document.getElementById('label-fixed').innerHTML = `<i class="dot fixed"></i> Fixo Meta: ${formatCurrency(custoFixoConfig)}`;
    document.getElementById('label-profit').innerHTML = `<i class="dot profit"></i> Lucro Real: ${formatCurrency(lucroRealFinal)}`;
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
        const variaveis = calculateVariableKmCosts(item.km_total, userConfig, manuts);
        const lucroItem = item.dinheiro - custoComb - variaveis;
        const rsPorKm = item.km_total > 0 ? (item.dinheiro / item.km_total) : 0;

        tr.innerHTML = `
            <td>${item.data.split('-').reverse().join('/')}</td>
            <td>${item.km_total.toFixed(1)}</td>
            <td>${formatCurrency(item.dinheiro)}</td>
            <td>${formatCurrency(rsPorKm)}</td>
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
    const gastoCarro = calculateVariableKmCosts(kmTotal, userConfig, manuts);
    const lucro = item.dinheiro - gastoComb - gastoCarro;
    const mediaRK = kmTotal > 0 ? item.dinheiro / kmTotal : 0;

    // Preencher Modal
    document.getElementById('m-horaInicio').textContent = item.hora_inicio || '--:--';
    document.getElementById('m-horaFim').textContent = item.hora_fim || '--:--';
    document.getElementById('m-totalArrecadado').textContent = formatCurrency(item.dinheiro);
    document.getElementById('m-totalCombustivel').textContent = formatCurrency(gastoComb);
    document.getElementById('m-totalKM').textContent = `${kmTotal.toFixed(1)} km`;
    document.getElementById('m-gastoEstimadoCarro').textContent = formatCurrency(gastoCarro);
    document.getElementById('m-custoMedioKM').textContent = formatCurrency(mediaRK);
    document.getElementById('m-lucroReal').textContent = formatCurrency(lucro);
    document.getElementById('m-totalHoras').textContent = formatDecimalHours(item.horas || 0);

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
    
    // Formata o dinheiro para "0,00" ao editar
    document.getElementById('field-dinheiro').value = item.dinheiro.toFixed(2).replace('.', ',');
    
    document.getElementById('field-hora-inicio').value = item.hora_inicio || '';
    document.getElementById('field-hora-fim').value = item.hora_fim || '';
    document.getElementById('field-dia-semana').value = item.dia_semana;
    document.getElementById('field-turno').value = item.turno;
    document.getElementById('field-movimentacao').value = item.movimentacao;
    document.getElementById('field-perfil').value = item.perfil_passageiro;
    document.getElementById('field-app').value = item.app;
    document.getElementById('field-transito').value = item.transito;
    document.getElementById('field-combustivel').value = item.preco_combustivel;
    document.getElementById('field-obs').value = item.observacoes;
    
    // Atualiza o display de horas totais formatado
    const timeDiff = calculateTimeDiff(item.hora_inicio, item.hora_fim);
    document.getElementById('display-horas-total').value = timeDiff.formatted;
    
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
    
    // Calcula custos
    const combustivel = data.map(d => {
        const litros = d.km_total / (userConfig.consumoMedio || 10);
        return litros * d.preco_combustivel;
    });

    // Custos variáveis baseados em configuração simples se não houver registros de manutenção
    const custoVariavelKm = (userConfig.custoRevisao/userConfig.kmRevisao || 0) + 
                            (userConfig.custoPneu/userConfig.kmPneu || 0) + 
                            (userConfig.custoOleo/userConfig.kmOleo || 0);

    const custoCarro = data.map(d => d.km_total * custoVariavelKm);
    
    // Lucro = Ganho - Combustível - Custo Carro
    const lucro = data.map((d, i) => d.dinheiro - combustivel[i] - custoCarro[i]);

    createChart('ganhosChart', 'line', labels, [{
        label: 'Ganhos (R$)',
        data: ganhos,
        borderColor: '#00d1b2',
        backgroundColor: 'rgba(0, 209, 178, 0.1)',
        fill: true
    }]);

    createChart('combustivelLucroChart', 'bar', labels, [
        { label: 'Combustível (R$)', data: combustivel, backgroundColor: '#ff3860' },
        { label: 'Custo Carro (R$)', data: custoCarro, backgroundColor: '#f1c40f' },
        { label: 'Lucro Real (R$)', data: lucro, backgroundColor: '#23d160' }
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
    
    // Rola suavemente até o formulário
    document.getElementById('anchor-manutencao').scrollIntoView({ behavior: 'smooth' });
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

/**
 * Carrega e processa dados para a tela de Relatório (Cupom Único)
 */
async function loadRelatorioData() {
    if (!currentUser) return;
    showLoader(true, 'Gerando cupom fiscal...');
    try {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        const q = query(
            collection(db, "registros"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end),
            orderBy("data", "asc")
        );
        const querySnapshot = await getDocs(q);
        const registros = [];
        querySnapshot.forEach((doc) => registros.push(doc.data()));

        // Buscar manutenções para custo variável
        const qManut = query(collection(db, "manutencoes"), where("uid", "==", currentUser.uid));
        const manutSnap = await getDocs(qManut);
        const manuts = [];
        manutSnap.forEach(d => manuts.push(d.data()));

        renderSingleReceipt(registros, manuts, start, end);
    } catch (e) {
        console.error("Erro ao carregar relatório:", e);
        // Fallback se orderBy falhar
        if (e.code === 'failed-precondition' || e.message.includes('index')) {
            try {
                const start = document.getElementById('startDate').value;
                const end = document.getElementById('endDate').value;
                const qSimple = query(collection(db, "registros"), where("uid", "==", currentUser.uid));
                const snapSimple = await getDocs(qSimple);
                const regsSimple = [];
                snapSimple.forEach(doc => {
                    const d = doc.data();
                    if (d.data >= start && d.data <= end) regsSimple.push(d);
                });
                renderSingleReceipt(regsSimple, [], start, end);
            } catch (err) {
                alert("Erro ao carregar dados do relatório.");
            }
        }
    } finally {
        showLoader(false);
    }
}

function renderSingleReceipt(registros, manuts, start, end) {
    const container = document.getElementById('receipt-list');
    container.innerHTML = '';

    if (registros.length === 0) {
        container.innerHTML = '<div class="card" style="text-align: center;">Nenhum registro encontrado para este período.</div>';
        return;
    }

    // Totais do Período
    let totalGanhos = 0;
    let totalKm = 0;
    let totalCombustivel = 0;
    let totalVariaveis = 0;

    // Custos Fixos (Aplicados uma vez para o período filtrado, conforme padrão de fechamento)
    const fixoParcela = userConfig.fixoParcela || 0;
    const fixoIpva = userConfig.fixoIpva || 0;
    const fixoSeguro = userConfig.fixoSeguro || 0;
    const fixoManut = userConfig.fixoManutencao || 0;
    const custoFixoTotal = fixoParcela + fixoIpva + fixoSeguro + fixoManut;

    registros.forEach(r => {
        totalGanhos += r.dinheiro;
        totalKm += r.km_total;
        
        const litros = r.km_total / (userConfig.consumoMedio || 10);
        totalCombustivel += (litros * r.preco_combustivel);
        
        totalVariaveis += calculateVariableKmCosts(r.km_total, userConfig, manuts);
    });

    const lucro = totalGanhos - totalCombustivel - totalVariaveis - custoFixoTotal;
    const formatPeriod = (d) => d.split('-').reverse().join('/');

    const receipt = document.createElement('div');
    receipt.className = 'receipt-container';
    receipt.innerHTML = `
        <div class="receipt-header">
            <h2>🚀 DRIVER DASH</h2>
            <p>CUPOM FISCAL CONSOLIDADO</p>
            <p>PERÍODO: ${formatPeriod(start)} A ${formatPeriod(end)}</p>
            <p>--------------------------------</p>
        </div>
        
        <div class="receipt-title">ENTRADAS</div>
        <div class="receipt-line">
            <span>TOTAL ARRECADADO</span>
            <span>${formatCurrency(totalGanhos)}</span>
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-title">SAÍDAS (VARIÁVEIS)</div>
        <div class="receipt-line">
            <span>GASTO COMBUSTÍVEL</span>
            <span class="receipt-item-neg">-${formatCurrency(totalCombustivel)}</span>
        </div>
        <div class="receipt-line">
            <span>GASTO VARIÁVEL (KM)</span>
            <span class="receipt-item-neg">-${formatCurrency(totalVariaveis)}</span>
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-title">SAÍDAS (FIXAS)</div>
        <div class="receipt-line">
            <span>PARCELA VEÍCULO</span>
            <span class="receipt-item-neg">-${formatCurrency(fixoParcela)}</span>
        </div>
        <div class="receipt-line">
            <span>IPVA / TAXAS</span>
            <span class="receipt-item-neg">-${formatCurrency(fixoIpva)}</span>
        </div>
        <div class="receipt-line">
            <span>SEGURO</span>
            <span class="receipt-item-neg">-${formatCurrency(fixoSeguro)}</span>
        </div>
        <div class="receipt-line">
            <span>MANUTENÇÃO FIXA</span>
            <span class="receipt-item-neg">-${formatCurrency(fixoManut)}</span>
        </div>
        
        <div class="receipt-divider"></div>
        
        <div class="receipt-line">
            <span>DISTÂNCIA TOTAL</span>
            <span>${totalKm.toFixed(1)} KM</span>
        </div>
        <div class="receipt-line">
            <span>EFICIÊNCIA MÉDIA</span>
            <span>${formatCurrency(totalKm > 0 ? totalGanhos/totalKm : 0)}/KM</span>
        </div>
        <div class="receipt-line">
            <span>DIAS TRABALHADOS</span>
            <span>${new Set(registros.map(r => r.data)).size}</span>
        </div>
        
        <div class="receipt-total">
            <span>LUCRO REAL</span>
            <span style="color: ${lucro >= 0 ? '#000' : '#c00'}">${formatCurrency(lucro)}</span>
        </div>
        
        <div class="receipt-footer">
            <p>GERADO EM: ${new Date().toLocaleString('pt-BR')}</p>
            <p>--------------------------------</p>
        </div>
    `;
    container.appendChild(receipt);
}

// Remover funções antigas que não são mais usadas
function renderRelatorioApps(registros) {
    // Pode ser mantida se você quiser o resumo por app abaixo do cupom,
    // mas por enquanto vou deixar desativado para o visual de "apenas 1 recibo".
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
