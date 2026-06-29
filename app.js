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
let localVeiculos = [];
let localCartoes = [];
let selectedVeiculoIdHist = null;
let selectedCartaoIdHist = null;
const CACHE_KEY = 'driver_dash_form_cache';
const LAST_ENTRY_KEY = 'driver_dash_last_entry';
const ACTIVE_SHIFT_KEY = 'driver_dash_active_shift';

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

    // Configura botões e form de caixinhas
    const formTransCaixinha = document.getElementById('form-transacao-caixinha');
    if (formTransCaixinha) {
        formTransCaixinha.onsubmit = (e) => salvarTransacaoCaixinha(e);
    }
    
    const closeTransCaixinhaBtn = document.getElementById('closeTransCaixinhaBtn');
    if (closeTransCaixinhaBtn) closeTransCaixinhaBtn.onclick = () => fecharModalTransacaoCaixinha();
    
    const closeTransCaixinhaFooterBtn = document.getElementById('closeTransCaixinhaFooterBtn');
    if (closeTransCaixinhaFooterBtn) closeTransCaixinhaFooterBtn.onclick = () => fecharModalTransacaoCaixinha();

    const closeHistAbsBtn = document.getElementById('closeHistAbsBtn');
    if (closeHistAbsBtn) closeHistAbsBtn.onclick = () => document.getElementById('modal-historico-abastecimento').style.display = 'none';
    
    const closeHistAbsFooterBtn = document.getElementById('closeHistAbsFooterBtn');
    if (closeHistAbsFooterBtn) closeHistAbsFooterBtn.onclick = () => document.getElementById('modal-historico-abastecimento').style.display = 'none';

    const closeHistOutrosBtn = document.getElementById('closeHistOutrosBtn');
    if (closeHistOutrosBtn) closeHistOutrosBtn.onclick = () => document.getElementById('modal-historico-outros-gastos').style.display = 'none';
    
    const closeHistOutrosFooterBtn = document.getElementById('closeHistOutrosFooterBtn');
    if (closeHistOutrosFooterBtn) closeHistOutrosFooterBtn.onclick = () => document.getElementById('modal-historico-outros-gastos').style.display = 'none';

    const closeHistManutBtn = document.getElementById('closeHistManutBtn');
    if (closeHistManutBtn) closeHistManutBtn.onclick = () => document.getElementById('modal-historico-manutencao').style.display = 'none';
    
    const closeHistManutFooterBtn = document.getElementById('closeHistManutFooterBtn');
    if (closeHistManutFooterBtn) closeHistManutFooterBtn.onclick = () => document.getElementById('modal-historico-manutencao').style.display = 'none';

    const btnNovoAbsHist = document.getElementById('btnNovoAbsHist');
    if (btnNovoAbsHist) btnNovoAbsHist.onclick = () => {
        document.getElementById('modal-historico-abastecimento').style.display = 'none';
        openAbastecimentoModal(null, selectedVeiculoIdHist);
    };

    const btnNovoGastoHist = document.getElementById('btnNovoGastoHist');
    if (btnNovoGastoHist) btnNovoGastoHist.onclick = () => {
        document.getElementById('modal-historico-outros-gastos').style.display = 'none';
        openGastoGeralModal(null, selectedCartaoIdHist);
    };

    setupNovasFinancas();

    const btnAddRevisao = document.getElementById('btnAddRevisaoFinancas');
    if (btnAddRevisao) {
        btnAddRevisao.onclick = () => {
            switchTab('config');
            const anchor = document.getElementById('anchor-manutencao');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
        };
    }


    document.getElementById('updateBtn').onclick = () => {
        if (currentTab === 'dashboard') loadDashboardData();
        if (currentTab === 'abastecimento') loadFinancas();
        if (currentTab === 'relatorio') loadRelatorioData();
    };
    document.getElementById('logoutBtn').onclick = () => handleLogout();
    document.getElementById('field-data').onchange = updateDayOfWeek;
    document.getElementById('form-config').onsubmit = (e) => saveUserConfig(e);
    document.getElementById('form-manutencao').onsubmit = (e) => saveManutencao(e);
    document.getElementById('cancelManutBtn').onclick = () => resetManutForm();
    document.getElementById('manut-km-total').addEventListener('input', updateDataLimiteVisibility);
    updateDataLimiteVisibility();
    document.getElementById('cancelEditBtn').onclick = () => {
        const isEditing = !!document.getElementById('field-id').value;
        const activeShift = localStorage.getItem(ACTIVE_SHIFT_KEY);
        
        if (isEditing) {
            resetCadastroForm();
        } else if (activeShift) {
            if (confirm('Deseja voltar para o expediente em andamento? (A hora de encerramento será limpa)')) {
                document.getElementById('field-hora-fim').value = '';
                document.getElementById('display-horas-total').value = '0:00';
                saveFormCache();
                updateFormStateUI();
            }
        } else {
            resetCadastroForm();
        }
    };
    document.getElementById('closeModalBtn').onclick = () => closeModal();
    document.getElementById('closeModalFooterBtn').onclick = () => closeModal();
    document.getElementById('closeSummaryBtn').onclick = () => closeSummaryModal();
    document.getElementById('closeSummaryFooterBtn').onclick = () => closeSummaryModal();
    window.onclick = (event) => {
        const modalDet = document.getElementById('modal-detalhes');
        const modalAbs = document.getElementById('modal-abastecimento');
        const modalGasto = document.getElementById('modal-gasto-geral');
        const modalSummary = document.getElementById('modal-resumo-registro');
        const modalHistAbs = document.getElementById('modal-historico-abastecimento');
        const modalHistOutros = document.getElementById('modal-historico-outros-gastos');
        const modalHistManut = document.getElementById('modal-historico-manutencao');
        const modalTransCaixinha = document.getElementById('modal-transacao-caixinha');
        if (event.target == modalDet) closeModal();
        if (event.target == modalAbs) closeAbastecimentoModal();
        if (event.target == modalGasto) closeGastoGeralModal();
        if (event.target == modalSummary) closeSummaryModal();
        if (event.target == modalHistAbs) modalHistAbs.style.display = 'none';
        if (event.target == modalHistOutros) modalHistOutros.style.display = 'none';
        if (event.target == modalHistManut) modalHistManut.style.display = 'none';
        if (event.target == modalTransCaixinha) modalTransCaixinha.style.display = 'none';
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
        await loadFinancas(); // Carrega finanças (usa datas default inicial)
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
        const mergedConfig = { ...userConfig, ...newConfig };
        await setDoc(doc(db, "configs", currentUser.uid), mergedConfig);
        userConfig = mergedConfig;
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
        loadFinancas();
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

    // Se entrar na aba de cadastro:
    if (target === 'cadastro') {
        const id = document.getElementById('field-id').value;
        if (!id) {
            loadFormCache();
        }
        updateFormStateUI();
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

    const btnAddAbs = document.getElementById('btnAddAbastecimento');
    if (btnAddAbs) btnAddAbs.onclick = () => openAbastecimentoModal();
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
    const pagamentoSelect = document.getElementById('gasto-pagamento');
    const parceladoContainer = document.getElementById('gasto-parcelado-container');
    const numParcelasContainer = document.getElementById('gasto-num-parcelas-container');
    const parceladoCheckbox = document.getElementById('gasto-parcelado');

    pagamentoSelect.addEventListener('change', () => {
        const cartaoId = pagamentoSelect.value;
        const cartaoObj = localCartoes.find(c => c.id === cartaoId);
        if (cartaoObj && cartaoObj.permite_parcelamento) {
            parceladoContainer.style.display = 'flex';
        } else {
            parceladoContainer.style.display = 'none';
            parceladoCheckbox.checked = false;
            numParcelasContainer.style.display = 'none';
        }
    });

    parceladoCheckbox.addEventListener('change', () => {
        if (parceladoCheckbox.checked) {
            numParcelasContainer.style.display = 'block';
        } else {
            numParcelasContainer.style.display = 'none';
        }
    });

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

    const btnAddGasto = document.getElementById('btnAddGastoGeral');
    if (btnAddGasto) btnAddGasto.onclick = () => openGastoGeralModal();

    document.getElementById('closeGastoGeralBtn').onclick = () => closeGastoGeralModal();
    document.getElementById('closeGastoFooterBtn').onclick = () => closeGastoGeralModal();

    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveGastoGeral();
    };
}

async function openGastoGeralModal(data = null, preSelectedCartaoId = null) {
    const modal = document.getElementById('modal-gasto-geral');
    const form = document.getElementById('form-gasto-geral');
    form.reset();

    const pagamentoSelect = document.getElementById('gasto-pagamento');
    const parceladoContainer = document.getElementById('gasto-parcelado-container');
    const numParcelasContainer = document.getElementById('gasto-num-parcelas-container');
    const parceladoCheckbox = document.getElementById('gasto-parcelado');

    if (data) {
        document.getElementById('gasto-id').value = data.id;
        document.getElementById('gasto-data').value = data.data;
        document.getElementById('gasto-tipo').value = data.tipo;
        document.getElementById('gasto-descricao').value = data.descricao;
        document.getElementById('gasto-valor').value = data.valor.toFixed(2).replace('.', ',');
        
        const targetCartaoId = data.cartao_id || "";
        pagamentoSelect.value = targetCartaoId;
        
        const cartaoObj = localCartoes.find(c => c.id === targetCartaoId);
        if (cartaoObj && cartaoObj.permite_parcelamento) {
            parceladoContainer.style.display = 'flex';
            parceladoCheckbox.checked = data.parcelado || false;
            if (data.parcelado) {
                numParcelasContainer.style.display = 'block';
                document.getElementById('gasto-num-parcelas').value = data.num_parcelas || 1;
            } else {
                numParcelasContainer.style.display = 'none';
                document.getElementById('gasto-num-parcelas').value = 1;
            }
        } else {
            parceladoContainer.style.display = 'none';
            parceladoCheckbox.checked = false;
            numParcelasContainer.style.display = 'none';
            document.getElementById('gasto-num-parcelas').value = 1;
        }
        document.querySelector('#modal-gasto-geral h3').textContent = '💸 Editar Gasto';
    } else {
        document.getElementById('gasto-id').value = '';
        document.getElementById('gasto-data').value = getLocalDate();
        
        if (preSelectedCartaoId) {
            pagamentoSelect.value = preSelectedCartaoId;
        } else if (localCartoes.length > 0) {
            const dinheiroCard = localCartoes.find(c => c.nome === 'Dinheiro');
            pagamentoSelect.value = dinheiroCard ? dinheiroCard.id : localCartoes[0].id;
        }
        
        parceladoContainer.style.display = 'none';
        parceladoCheckbox.checked = false;
        numParcelasContainer.style.display = 'none';
        document.getElementById('gasto-num-parcelas').value = 1;
        document.querySelector('#modal-gasto-geral h3').textContent = '💸 Registrar Gasto';
        
        pagamentoSelect.dispatchEvent(new Event('change'));
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
    const cartaoId = document.getElementById('gasto-pagamento').value;
    const cartaoObj = localCartoes.find(c => c.id === cartaoId);
    const fpNome = cartaoObj ? cartaoObj.nome : 'Dinheiro';
    const permiteParcelas = cartaoObj ? cartaoObj.permite_parcelamento : false;
    const parcelado = permiteParcelas && document.getElementById('gasto-parcelado').checked;
    const numParcelas = parcelado ? (parseInt(document.getElementById('gasto-num-parcelas').value) || 1) : 1;
    const descOriginal = document.getElementById('gasto-descricao').value;
    const dataOriginalStr = document.getElementById('gasto-data').value;
    const tipoGasto = document.getElementById('gasto-tipo').value;

    try {
        if (id) {
            const updateData = {
                data: dataOriginalStr,
                tipo: tipoGasto,
                descricao: descOriginal,
                valor: valorVal,
                forma_pagamento: fpNome,
                cartao_id: cartaoId,
                parcelado: parcelado,
                num_parcelas: numParcelas,
                uid: currentUser.uid,
                updatedAt: new Date()
            };
            await updateDoc(doc(db, "gastos_gerais", id), updateData);
        } else {
            if (parcelado && numParcelas > 1) {
                const grupoId = 'g_' + new Date().getTime();
                const baseVal = Math.floor((valorVal / numParcelas) * 100) / 100;
                const diff = parseFloat((valorVal - (baseVal * numParcelas)).toFixed(2));

                for (let i = 1; i <= numParcelas; i++) {
                    const valParc = (i === numParcelas) ? parseFloat((baseVal + diff).toFixed(2)) : baseVal;
                    
                    const dataCompra = new Date(dataOriginalStr + 'T00:00:00');
                    const dataVenc = new Date(dataCompra.getFullYear(), dataCompra.getMonth() + (i - 1), dataCompra.getDate());
                    const y = dataVenc.getFullYear();
                    const m = String(dataVenc.getMonth() + 1).padStart(2, '0');
                    const d = String(dataVenc.getDate()).padStart(2, '0');
                    const dataVencStr = `${y}-${m}-${d}`;

                    const dataGasto = {
                        data: dataVencStr,
                        tipo: tipoGasto,
                        descricao: `${descOriginal} (${i}/${numParcelas})`,
                        valor: valParc,
                        forma_pagamento: fpNome,
                        cartao_id: cartaoId,
                        parcelado: true,
                        parcela_numero: i,
                        num_parcelas: numParcelas,
                        grupo_id: grupoId,
                        pago: false,
                        uid: currentUser.uid,
                        createdAt: new Date()
                    };
                    await addDoc(collection(db, "gastos_gerais"), dataGasto);
                }
            } else {
                const dataGasto = {
                    data: dataOriginalStr,
                    tipo: tipoGasto,
                    descricao: descOriginal,
                    valor: valorVal,
                    forma_pagamento: fpNome,
                    cartao_id: cartaoId,
                    parcelado: false,
                    num_parcelas: 1,
                    pago: !permiteParcelas,
                    uid: currentUser.uid,
                    createdAt: new Date()
                };
                await addDoc(collection(db, "gastos_gerais"), dataGasto);
            }
        }
        
        closeGastoGeralModal();
        if (currentTab === 'abastecimento') {
            await loadFinancas();
        } else {
            await loadAbastecimentos();
        }
        if (currentTab === 'dashboard') loadDashboardData();
    } catch (e) {
        console.error("Erro ao salvar gasto:", e);
        alert('Erro ao salvar gasto.');
    } finally {
        showLoader(false);
    }
}

async function openAbastecimentoModal(data = null, preSelectedVeiculoId = null) {
    const modal = document.getElementById('modal-abastecimento');
    const form = document.getElementById('form-abastecimento');
    form.reset();
    
    // Certifica-se de popular o select de veículos antes
    popularSelectVeiculos();
    
    if (data) {
        document.getElementById('abs-id').value = data.id;
        document.getElementById('abs-data').value = data.data;
        document.getElementById('abs-km-anterior').value = data.km_anterior || 0;
        document.getElementById('abs-km-atual').value = data.km_atual || 0;
        document.getElementById('abs-valor-total').value = data.valor_total.toFixed(2).replace('.', ',');
        document.getElementById('abs-preco-litro').value = data.preco_litro.toFixed(2).replace('.', ',');
        
        document.getElementById('abs-veiculo-id').value = data.veiculo_id || "";
        
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
        
        if (preSelectedVeiculoId) {
            document.getElementById('abs-veiculo-id').value = preSelectedVeiculoId;
        } else if (localVeiculos.length > 0) {
            document.getElementById('abs-veiculo-id').value = localVeiculos[0].id;
        }
        
        showLoader(true, 'Buscando KM anterior...');
        try {
            let lastKm = 0;
            const currentVeiculoId = document.getElementById('abs-veiculo-id').value;
            if (currentVeiculoId) {
                const qAbs = query(
                    collection(db, "abastecimentos"),
                    where("uid", "==", currentUser.uid),
                    where("veiculo_id", "==", currentVeiculoId),
                    orderBy("km_atual", "desc"),
                    limit(1)
                );
                const snapAbs = await getDocs(qAbs);
                if (!snapAbs.empty) {
                    lastKm = snapAbs.docs[0].data().km_atual || 0;
                }
            }

            if (lastKm === 0) {
                const qReg = query(collection(db, "registros"), where("uid", "==", currentUser.uid), orderBy("km_final", "desc"), limit(1));
                const snapReg = await getDocs(qReg);
                if (!snapReg.empty) lastKm = snapReg.docs[0].data().km_final || 0;
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
    const veiculoId = document.getElementById('abs-veiculo-id').value;

    const data = {
        data: document.getElementById('abs-data').value,
        valor_total: totalVal,
        preco_litro: precoVal,
        km_anterior: kmAnt,
        km_atual: kmAtu,
        veiculo_id: veiculoId,
        uid: currentUser.uid,
        timestamp: new Date()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "abastecimentos", id), data);
        } else {
            await addDoc(collection(db, "abastecimentos"), data);
            
            // Atualizar o km_atual do veículo na config se for maior
            if (userConfig.veiculos && Array.isArray(userConfig.veiculos)) {
                let alterado = false;
                userConfig.veiculos = userConfig.veiculos.map(v => {
                    if (v.id === veiculoId) {
                        const currentVeiculoKm = parseFloat(v.km_atual) || 0;
                        if (kmAtu > currentVeiculoKm) {
                            alterado = true;
                            return { ...v, km_atual: kmAtu };
                        }
                    }
                    return v;
                });
                if (alterado) {
                    await setDoc(doc(db, "configs", currentUser.uid), userConfig);
                }
            }
        }
        closeAbastecimentoModal();
        if (currentTab === 'abastecimento') {
            await loadFinancas();
        } else {
            await loadAbastecimentos();
        }
        if (currentTab === 'dashboard') loadDashboardData();
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
    showLoader(true, 'Excluindo...');
    try {
        const docRef = doc(db, "gastos_gerais", id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.grupo_id) {
                if (confirm('Este gasto faz parte de uma compra parcelada.\n\nDeseja excluir TODAS as parcelas deste parcelamento?\n(Clique em Cancelar para excluir apenas a parcela atual)')) {
                    // Exclui todas as parcelas do grupo
                    const q = query(collection(db, "gastos_gerais"), where("grupo_id", "==", data.grupo_id));
                    const snap = await getDocs(q);
                    const batchPromises = [];
                    snap.forEach(d => {
                        batchPromises.push(deleteDoc(doc(db, "gastos_gerais", d.id)));
                    });
                    await Promise.all(batchPromises);
                } else {
                    // Exclui apenas a parcela selecionada
                    await deleteDoc(docRef);
                }
            } else {
                // Gasto comum
                if (confirm('Deseja excluir este gasto?')) {
                    await deleteDoc(docRef);
                } else {
                    showLoader(false);
                    return;
                }
            }
        }
        
        if (currentTab === 'abastecimento') {
            await loadFinancas();
        } else {
            await loadAbastecimentos();
        }
        if (currentTab === 'dashboard') loadDashboardData();
    } catch (e) {
        console.error("Erro ao excluir gasto:", e);
        alert('Erro ao excluir gasto.');
    } finally {
        showLoader(false);
    }
}

async function deleteAbastecimento(id) {
    if (!confirm('Deseja excluir este abastecimento?')) return;
    showLoader(true, 'Excluindo...');
    try {
        await deleteDoc(doc(db, "abastecimentos", id));
        if (currentTab === 'abastecimento') {
            await loadFinancas();
        } else {
            await loadAbastecimentos();
        }
    } catch (e) {
        console.error(e);
    } finally {
        showLoader(false);
    }
}

// Atualiza a visibilidade das seções do formulário baseado no estado do expediente
function updateFormStateUI() {
    const isEditing = !!document.getElementById('field-id').value;
    const activeShiftStr = localStorage.getItem(ACTIVE_SHIFT_KEY);
    const activeShift = activeShiftStr ? JSON.parse(activeShiftStr) : null;
    const horaFim = document.getElementById('field-hora-fim').value;

    const cardAndamento = document.getElementById('card-expediente-andamento');
    const kmInicialContainer = document.getElementById('section-km-inicial-container');
    const btnIniciar = document.getElementById('btn-iniciar-expediente');
    const btnParar = document.getElementById('btn-parar-expediente');
    const sectionDadosFinalizar = document.getElementById('section-dados-finalizar');

    if (!cardAndamento || !kmInicialContainer || !btnIniciar || !btnParar || !sectionDadosFinalizar) {
        console.warn('Elementos da interface de expediente não encontrados.');
        return;
    }

    if (isEditing) {
        // MODO EDIÇÃO DE REGISTRO EXISTENTE
        cardAndamento.style.display = 'none';
        kmInicialContainer.style.display = 'block';
        btnIniciar.style.display = 'none';
        btnParar.style.display = 'none';
        sectionDadosFinalizar.style.display = 'block';
        
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'block';
            cancelBtn.textContent = 'Cancelar';
        }
        document.getElementById('saveBtn').textContent = 'Atualizar Registro';
    } else if (activeShift) {
        // TEM EXPEDIENTE ATIVO
        if (horaFim) {
            // Clicou em "Parar" e está finalizando o preenchimento
            cardAndamento.style.display = 'none';
            kmInicialContainer.style.display = 'block';
            btnIniciar.style.display = 'none';
            btnParar.style.display = 'none';
            sectionDadosFinalizar.style.display = 'block';
            
            const cancelBtn = document.getElementById('cancelEditBtn');
            if (cancelBtn) {
                cancelBtn.style.display = 'block';
                cancelBtn.textContent = 'Voltar';
            }
            document.getElementById('saveBtn').textContent = 'Salvar Registro';
        } else {
            // Expediente iniciado mas não finalizado (Em Andamento)
            const parts = activeShift.data.split('-');
            const dataFormatada = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : activeShift.data;
            document.getElementById('info-expediente-data').textContent = dataFormatada;
            document.getElementById('info-expediente-hora').textContent = activeShift.hora_inicio;
            document.getElementById('info-expediente-km').textContent = `${activeShift.km_inicial.toFixed(1)} km`;

            cardAndamento.style.display = 'block';
            kmInicialContainer.style.display = 'none';
            btnIniciar.style.display = 'none';
            btnParar.style.display = 'block';
            sectionDadosFinalizar.style.display = 'none';
            
            const cancelBtn = document.getElementById('cancelEditBtn');
            if (cancelBtn) {
                cancelBtn.style.display = 'none';
            }
        }
    } else {
        // EXPEDIENTE NÃO INICIADO
        cardAndamento.style.display = 'none';
        kmInicialContainer.style.display = 'block';
        btnIniciar.style.display = 'block';
        btnParar.style.display = 'none';
        sectionDadosFinalizar.style.display = 'none';
        
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
        document.getElementById('saveBtn').textContent = 'Salvar Registro';
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
        
        //if (!startField.value) startField.value = '';
        //if (!endField.value) endField.value = '';
        refreshDefaultTurno();
    }

    const updateCalculatedHours = () => {
        const diff = calculateTimeDiff(startField.value, endField.value);
        displayTotal.value = diff.formatted;
    };

    // Lógica de Clique Curto e Longo para Horas
    const setupTimeFieldEvents = (field) => {
        let pressTimer;
        let isLongPress = false;

        const startPress = (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                handleManualEdit(field);
            }, 600); // 600ms para clique longo
        };

        const endPress = (e) => {
            clearTimeout(pressTimer);
            if (!isLongPress) {
                field.value = getCurrentTime();
                updateCalculatedHours();
                saveFormCache();
            }
        };

        field.addEventListener('mousedown', startPress);
        field.addEventListener('mouseup', endPress);
        field.addEventListener('touchstart', (e) => {
            // e.preventDefault(); // Pode interferir no scroll
            startPress(e);
        }, { passive: true });
        field.addEventListener('touchend', (e) => {
            endPress(e);
        }, { passive: true });
    };

    const handleManualEdit = (field) => {
        const currentVal = field.value || getCurrentTime();
        const newVal = prompt("Digite a hora (HH:MM):", currentVal);
        if (newVal !== null && /^([01]\d|2[0-3]):?([0-5]\d)$/.test(newVal)) {
            let formatted = newVal;
            if (!formatted.includes(':')) {
                formatted = formatted.slice(0, 2) + ':' + formatted.slice(2);
            }
            field.value = formatted;
            updateCalculatedHours();
            saveFormCache();
        } else if (newVal !== null) {
            alert("Formato inválido. Use HH:MM");
        }
    };

    setupTimeFieldEvents(startField);
    setupTimeFieldEvents(endField);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveToFirebase();
    });

    // Salvar cache ao mudar campos
    form.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('input', saveFormCache);
    });

    // Evento de Iniciar Expediente
    document.getElementById('btn-iniciar-expediente').addEventListener('click', () => {
        const kmInicialVal = parseFloat(document.getElementById('field-km-inicial').value);
        if (isNaN(kmInicialVal) || kmInicialVal < 0) {
            alert('⚠️ Por favor, preencha o KM Inicial com um valor válido antes de iniciar o expediente.');
            document.getElementById('field-km-inicial').focus();
            return;
        }

        const activeShift = {
            data: getLocalDate(),
            hora_inicio: getCurrentTime(),
            km_inicial: kmInicialVal
        };
        localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(activeShift));

        // Preenche os campos reais do formulário
        document.getElementById('field-data').value = activeShift.data;
        updateDayOfWeek();
        document.getElementById('field-hora-inicio').value = activeShift.hora_inicio;
        
        // Salva no cache do formulário também
        saveFormCache();
        
        // Atualiza a interface
        updateFormStateUI();
    });

    // Evento de Parar Expediente
    document.getElementById('btn-parar-expediente').addEventListener('click', () => {
        const activeShiftStr = localStorage.getItem(ACTIVE_SHIFT_KEY);
        if (!activeShiftStr) return;
        const activeShift = JSON.parse(activeShiftStr);

        // Preenche a hora de fim com a hora atual
        const horaFim = getCurrentTime();
        document.getElementById('field-hora-fim').value = horaFim;
        
        // Atualiza o display de horas totais
        const diff = calculateTimeDiff(activeShift.hora_inicio, horaFim);
        document.getElementById('display-horas-total').value = diff.formatted;

        // Configura o turno padrão com base na hora atual de encerramento
        refreshDefaultTurno();

        // Salva o progresso do formulário no cache
        saveFormCache();

        // Atualiza a interface (agora com hora-fim preenchida, vai mostrar a tela de finalização)
        updateFormStateUI();
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
        // Agora inclui as horas no cache conforme solicitado
        if (field.id !== 'field-data' && field.id !== 'field-turno' && field.id !== 'field-dia-semana') {
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
            if (el && id !== 'field-data' && id !== 'field-id' && id !== 'field-turno' && id !== 'field-dia-semana') { 
                el.value = data[id];
            }
        });
    }

    // Sobrescreve com o expediente ativo se ele existir no localStorage
    const activeShiftStr = localStorage.getItem(ACTIVE_SHIFT_KEY);
    if (activeShiftStr) {
        const activeShift = JSON.parse(activeShiftStr);
        document.getElementById('field-data').value = activeShift.data;
        updateDayOfWeek();
        document.getElementById('field-km-inicial').value = activeShift.km_inicial;
        document.getElementById('field-hora-inicio').value = activeShift.hora_inicio;
        
        // Se tiver hora fim preenchida, calcula as horas totais
        const horaFim = document.getElementById('field-hora-fim').value;
        if (horaFim) {
            const diff = calculateTimeDiff(activeShift.hora_inicio, horaFim);
            document.getElementById('display-horas-total').value = diff.formatted;
        } else {
            document.getElementById('display-horas-total').value = '0:00';
        }
    }
    updateFormStateUI();
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
            preco_combustivel: parseFloat(document.getElementById('field-combustivel').value.replace(',', '.')) || 0,
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
            
            // Busca manutenções para o cálculo do resumo
            const qManut = query(collection(db, "manutencoes"), where("uid", "==", currentUser.uid));
            const manutSnap = await getDocs(qManut);
            const manuts = [];
            manutSnap.forEach(d => manuts.push(d.data()));
            
            showSummaryModal(dataDoc, manuts);
            
            // Remove o expediente ativo apenas se for um novo registro
            localStorage.removeItem(ACTIVE_SHIFT_KEY);
        }

        // Limpa formulário e atualiza alertas
        resetCadastroForm();
        checkMaintenanceAlerts(); // Atualiza alertas imediatamente após salvar
        updateFormStateUI();
    } catch (e) {
        console.error("Erro ao salvar: ", e);
        alert('❌ Erro ao salvar dados.');
    } finally {
        showLoader(false);
    }
}

function showSummaryModal(data, manuts) {
    const modal = document.getElementById('modal-resumo-registro');
    
    // Cálculos
    const gastoComb = calculateFuelCost(data.km_total, data.preco_combustivel, userConfig.consumoMedio);
    const gastoCarro = calculateVariableKmCosts(data.km_total, userConfig, manuts);
    const custosTotais = gastoComb + gastoCarro;
    const lucroLiquido = data.dinheiro - custosTotais;
    
    const valPorKm = data.km_total > 0 ? (data.dinheiro / data.km_total) : 0;
    const valPorHora = data.horas > 0 ? (data.dinheiro / data.horas) : 0;

    // Popular campos
    document.getElementById('resumo-lucro-liquido').textContent = formatCurrency(lucroLiquido);
    document.getElementById('resumo-ganhos').textContent = formatCurrency(data.dinheiro);
    document.getElementById('resumo-custo-combustivel').textContent = formatCurrency(gastoComb);
    document.getElementById('resumo-custo-carro').textContent = formatCurrency(gastoCarro);
    
    document.getElementById('resumo-valor-km').textContent = formatCurrency(valPorKm);
    document.getElementById('resumo-distancia').textContent = `${data.km_total.toFixed(1)} km rodados`;
    document.getElementById('resumo-km-faixa').textContent = `${data.km_inicial} → ${data.km_final}`;
    
    document.getElementById('resumo-valor-hora').textContent = formatCurrency(valPorHora);
    document.getElementById('resumo-tempo-total').textContent = `${formatDecimalHours(data.horas)} trabalhadas`;
    document.getElementById('resumo-hora-faixa').textContent = `${data.hora_inicio} → ${data.hora_fim}`;

    // Estilo do Lucro
    document.getElementById('resumo-lucro-liquido').style.color = lucroLiquido >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    modal.style.display = 'flex';
}

function closeSummaryModal() {
    document.getElementById('modal-resumo-registro').style.display = 'none';
}

function resetCadastroForm() {
    const form = document.getElementById('form-cadastro');
    const lastEntry = localStorage.getItem(LAST_ENTRY_KEY);
    const cashEntry2 = localStorage.getItem(CACHE_KEY);
    const activeShiftStr = localStorage.getItem(ACTIVE_SHIFT_KEY);
    
    form.reset();
    document.getElementById('field-id').value = '';
    document.getElementById('saveBtn').textContent = 'Salvar';
    document.getElementById('cancelEditBtn').style.display = 'none';

    if (activeShiftStr) {
        const activeShift = JSON.parse(activeShiftStr);
        document.getElementById('field-data').value = activeShift.data;
        updateDayOfWeek();
        document.getElementById('field-km-inicial').value = activeShift.km_inicial;
        document.getElementById('field-hora-inicio').value = activeShift.hora_inicio;
        document.getElementById('field-hora-fim').value = '';
        document.getElementById('display-horas-total').value = '0:00';
        
        // Preenche os outros campos com o histórico
        if (lastEntry) {
            const data = JSON.parse(lastEntry);
            document.getElementById('field-movimentacao').value = data.movimentacao || 'Média';
            document.getElementById('field-perfil').value = data.perfil_passageiro || 'Trabalhador';
            document.getElementById('field-app').value = data.app || 'Uber';
            document.getElementById('field-transito').value = data.transito || 'Moderado';
            
            const precoComb = data.preco_combustivel;
            document.getElementById('field-combustivel').value = precoComb ? precoComb.toFixed(2).replace('.', ',') : '';
        }
    } else {
        // Fluxo padrão sem expediente ativo
        if (lastEntry) {
            const data = JSON.parse(lastEntry);
            const datacash2 = JSON.parse(cashEntry2);
            document.getElementById('field-km-inicial').value = data.km_final || datacash2['field-km-inicial'] || '';
            document.getElementById('field-km-final').value = '';
            document.getElementById('field-dinheiro').value = '';
            document.getElementById('field-hora-inicio').value = '';
            document.getElementById('field-hora-fim').value = '';
            document.getElementById('display-horas-total').value = '0:00';
            document.getElementById('field-movimentacao').value = data.movimentacao || 'Média';
            document.getElementById('field-perfil').value = data.perfil_passageiro || 'Trabalhador';
            document.getElementById('field-app').value = data.app || 'Uber';
            document.getElementById('field-transito').value = data.transito || 'Moderado';
            
            const precoComb = data.preco_combustivel;
            document.getElementById('field-combustivel').value = precoComb ? precoComb.toFixed(2).replace('.', ',') : '';
            document.getElementById('field-obs').value = '';
        } else {
            document.getElementById('field-hora-inicio').value = '';
            document.getElementById('field-hora-fim').value = '';
            document.getElementById('display-horas-total').value = '0:00';
        }
        
        document.getElementById('field-data').value = getLocalDate();
        updateDayOfWeek();
        refreshDefaultTurno();
    }
    
    saveFormCache();
    updateFormStateUI();
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
    updateFormStateUI();
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
    const kmTotal = parseFloat(document.getElementById('manut-km-total').value) || 0;
    const data = {
        nome: document.getElementById('manut-nome').value,
        km_inicial: parseFloat(document.getElementById('manut-km-inicial').value) || 0,
        km_total: kmTotal,
        valor: parseFloat(document.getElementById('manut-valor').value) || 0,
        data_limite: kmTotal === 0 ? document.getElementById('manut-data-limite').value : '',
        uid: currentUser.uid,
        updatedAt: new Date()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "manutencoes", id), data);
        } else {
            // Inicializa novo registro com alerta e histórico de caixinha
            data.alerta_ativo = true;
            data.historico = [];
            await addDoc(collection(db, "manutencoes"), data);
        }
        resetManutForm();
        await loadManutencoes();
        if (currentTab === 'abastecimento' || currentTab === 'financas') {
            await loadFinancas();
        }
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
        if (currentTab === 'abastecimento' || currentTab === 'financas') {
            await loadFinancas();
        }
        checkMaintenanceAlerts();
    }
}

function renderManutCards(manuts) {
    const container = document.getElementById('manutencao-cards');
    container.innerHTML = '';

    manuts.forEach(m => {
        const card = document.createElement('div');
        card.className = 'maintenance-card';
        
        const isLivre = (parseFloat(m.km_total) || 0) === 0;

        card.innerHTML = `
            <h4>${m.nome}</h4>
            <div class="maintenance-info">
                <div>KM Inicial: <b>${isLivre ? 'Meta Financeira' : m.km_inicial}</b></div>
                <div>Intervalo: <b>${isLivre ? 'Sem KM' : m.km_total + ' km'}</b></div>
                <div>Valor: <b>${formatCurrency(m.valor)}</b></div>
                <div>Próxima em: <b>${isLivre ? '--' : (m.km_inicial + m.km_total) + ' km'}</b></div>
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

function updateDataLimiteVisibility() {
    const totalKmVal = parseFloat(document.getElementById('manut-km-total').value);
    const isLivre = isNaN(totalKmVal) || totalKmVal === 0;
    const container = document.getElementById('container-manut-data-limite');
    if (container) {
        container.style.display = isLivre ? 'block' : 'none';
    }
}

function editManut(m) {
    document.getElementById('manut-id').value = m.id;
    document.getElementById('manut-nome').value = m.nome;
    document.getElementById('manut-km-inicial').value = m.km_inicial;
    document.getElementById('manut-km-total').value = m.km_total;
    document.getElementById('manut-valor').value = m.valor;
    
    // Campo de data limite
    document.getElementById('manut-data-limite').value = m.data_limite || '';
    updateDataLimiteVisibility();
    
    document.getElementById('saveManutBtn').textContent = 'Atualizar Manutenção';
    document.getElementById('cancelManutBtn').style.display = 'block';
    
    // Rola suavemente até o formulário
    document.getElementById('anchor-manutencao').scrollIntoView({ behavior: 'smooth' });
}

function resetManutForm() {
    document.getElementById('form-manutencao').reset();
    document.getElementById('manut-id').value = '';
    updateDataLimiteVisibility();
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
            
            // Ignora o alerta se estiver desativado nas caixinhas
            const alertaAtivo = m.alerta_ativo !== false;
            if (!alertaAtivo) return;
            
            const kmIntervalo = parseFloat(m.km_total) || 0;
            if (kmIntervalo === 0) {
                // Alerta por Data Limite (Meta Livre)
                const limiteStr = m.data_limite;
                if (limiteStr) {
                    const dataLimite = new Date(limiteStr + 'T23:59:59');
                    const hoje = new Date();
                    
                    const d1 = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
                    const d2 = Date.UTC(dataLimite.getFullYear(), dataLimite.getMonth(), dataLimite.getDate());
                    const diffMs = d2 - d1;
                    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    
                    const hist = m.historico || [];
                    const saldo = hist.reduce((acc, curr) => {
                        return curr.tipo === 'entrada' ? acc + parseFloat(curr.valor) : acc - parseFloat(curr.valor);
                    }, 0);
                    
                    if (saldo < parseFloat(m.valor)) {
                        if (diffDias < 0) {
                            hasAlerts = true;
                            createAlertItem(alertsContainer, `🚨 Prazo vencido: Juntar dinheiro para ${m.nome}! (Prazo: ${limiteStr.split('-').reverse().join('/')})`, 'danger', mId);
                        } else if (diffDias <= 30) {
                            hasAlerts = true;
                            createAlertItem(alertsContainer, `⚠️ Atenção: Prazo de ${m.nome} termina em ${diffDias} dias. (Falta ${formatCurrency(m.valor - saldo)})`, 'warning', mId);
                        }
                    }
                }
            } else {
                // Alerta por Quilometragem (Revisão tradicional)
                const kmTroca = parseFloat(m.km_inicial) || 0;
                const kmLimite = kmTroca + kmIntervalo;
                const kmRestante = kmLimite - currentKm;
                
                if (kmRestante <= 0) {
                    hasAlerts = true;
                    createAlertItem(alertsContainer, `🚨 Hora de: ${m.nome}! (Vencido há ${Math.abs(kmRestante).toFixed(0)} km)`, 'danger', mId);
                } else if (kmRestante <= 500) {
                    hasAlerts = true;
                    createAlertItem(alertsContainer, `⚠️ Atenção: ${m.nome} em ${kmRestante.toFixed(0)} km.`, 'warning', mId);
                }
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

// --- SISTEMA DE FINANÇAS UNIFICADAS (CAIXINHAS) ---
let currentManutencaoId = null;

async function loadFinancas() {
    if (!currentUser) return;
    showLoader(true, 'Carregando finanças...');
    try {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;

        // 1. Garantir veículos e cartões básicos cadastrados (migração/inicialização silenciosa)
        await verificarEMigrarDadosPadrao();

        // 2. Obter Odômetro Atual (Maior KM final registrado)
        const qLast = query(collection(db, "registros"), where("uid", "==", currentUser.uid));
        const lastSnap = await getDocs(qLast);
        let currentKm = 0;
        if (!lastSnap.empty) {
            lastSnap.forEach(doc => {
                const km = parseFloat(doc.data().km_final) || 0;
                if (km > currentKm) currentKm = km;
            });
        }

        // 3. Obter Veículos do usuário (da config local)
        localVeiculos = userConfig.veiculos || [];

        // 4. Obter Cartões do usuário (da config local)
        localCartoes = userConfig.cartoes || [];

        // Atualizar seletores nos formulários de cadastro
        popularSelectVeiculos();
        popularSelectCartoes();

        // 5. Buscar Abastecimentos do período (1 única query)
        const qAbs = query(
            collection(db, "abastecimentos"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end)
        );
        const absSnap = await getDocs(qAbs);
        const abastecimentos = [];
        let totalAbsVal = 0;
        absSnap.forEach((doc) => {
            const data = doc.data();
            abastecimentos.push({ id: doc.id, collection: 'abastecimentos', ...data });
            totalAbsVal += parseFloat(data.valor_total) || 0;
        });

        // 6. Buscar Gastos Gerais do período (1 única query)
        const qGeral = query(
            collection(db, "gastos_gerais"),
            where("uid", "==", currentUser.uid),
            where("data", ">=", start),
            where("data", "<=", end)
        );
        const geralSnap = await getDocs(qGeral);
        const gastosGerais = [];
        let totalGastosVal = 0;
        geralSnap.forEach((doc) => {
            const data = doc.data();
            gastosGerais.push({ id: doc.id, collection: 'gastos_gerais', ...data });
            totalGastosVal += parseFloat(data.valor) || 0;
        });

        // 7. Buscar Manutenções/Revisões/Metas Ativas
        const qManut = query(
            collection(db, "manutencoes"), 
            where("uid", "==", currentUser.uid)
        );
        const manutSnap = await getDocs(qManut);
        const manuts = [];
        let totalJuntadoManut = 0;
        manutSnap.forEach((doc) => {
            const data = doc.data();
            // Ignorar itens arquivados
            if (data.arquivado === true) return;

            let saldo = 0;
            if (data.historico && Array.isArray(data.historico)) {
                data.historico.forEach(t => {
                    if (t.tipo === 'entrada') saldo += parseFloat(t.valor) || 0;
                    else if (t.tipo === 'saida') saldo -= parseFloat(t.valor) || 0;
                });
            }
            totalJuntadoManut += saldo;
            manuts.push({ id: doc.id, saldo, ...data });
        });

        // 8. Atualizar Painel de Resumos Gerais
        document.getElementById('financas-total-abastecido').textContent = formatCurrency(totalAbsVal);
        document.getElementById('financas-total-outros').textContent = formatCurrency(totalGastosVal);
        document.getElementById('financas-total-juntado').textContent = formatCurrency(totalJuntadoManut);

        // 9. Renderizar as 4 seções
        renderVeiculosCarousel(localVeiculos, abastecimentos);
        renderCartoesCarousel(localCartoes, gastosGerais);
        renderMetasCarousel(manuts.filter(m => (parseFloat(m.km_total) || 0) === 0));
        renderRevisoesCarousel(manuts.filter(m => (parseFloat(m.km_total) || 0) > 0), currentKm);

    } catch (err) {
        console.error("Erro ao carregar finanças:", err);
    } finally {
        showLoader(false);
    }
}

async function verificarEMigrarDadosPadrao() {
    if (!currentUser) return;

    let alterado = false;
    const updatePayload = {};

    // 1. Verificar/Migrar Veículos
    if (!userConfig.veiculos || !Array.isArray(userConfig.veiculos) || userConfig.veiculos.length === 0) {
        const defaultVeiculo = {
            id: 'v_default_' + new Date().getTime(),
            nome: "Meu Carro (Padrão)",
            consumo_medio: parseFloat(userConfig.consumoMedio) || 10.0
        };
        userConfig.veiculos = [defaultVeiculo];
        updatePayload.veiculos = userConfig.veiculos;
        alterado = true;

        // Migrar abastecimentos históricos sem veiculo_id (busca e atualiza silenciosamente)
        try {
            const qAbsSemVeiculo = query(collection(db, "abastecimentos"), where("uid", "==", currentUser.uid));
            const snapAbs = await getDocs(qAbsSemVeiculo);
            for (const docAbs of snapAbs.docs) {
                const dataAbs = docAbs.data();
                if (!dataAbs.veiculo_id) {
                    await updateDoc(doc(db, "abastecimentos", docAbs.id), {
                        veiculo_id: defaultVeiculo.id
                    });
                }
            }
        } catch (e) {
            console.error("Erro na migração de abastecimentos legados:", e);
        }
    }

    // 2. Verificar/Migrar Cartões/Métodos
    if (!userConfig.cartoes || !Array.isArray(userConfig.cartoes) || userConfig.cartoes.length === 0) {
        const metodosPadrao = [
            { id: 'c_dinheiro', nome: "Dinheiro", permite_parcelamento: false },
            { id: 'c_pix', nome: "Pix", permite_parcelamento: false },
            { id: 'c_debito', nome: "Débito", permite_parcelamento: false },
            { id: 'c_sicredi', nome: "Sicredi", permite_parcelamento: true },
            { id: 'c_bradesco', nome: "Bradesco", permite_parcelamento: true },
            { id: 'c_nubank', nome: "Nubank", permite_parcelamento: true },
            { id: 'c_caixa', nome: "Caixa", permite_parcelamento: true }
        ];
        userConfig.cartoes = metodosPadrao;
        updatePayload.cartoes = userConfig.cartoes;
        alterado = true;

        // Migrar gastos_gerais históricos sem cartao_id
        try {
            const qGastosSemCartao = query(collection(db, "gastos_gerais"), where("uid", "==", currentUser.uid));
            const snapGastos = await getDocs(qGastosSemCartao);
            
            const mapNomeToId = {};
            metodosPadrao.forEach(m => mapNomeToId[m.nome] = m.id);

            for (const docGasto of snapGastos.docs) {
                const dataGasto = docGasto.data();
                if (!dataGasto.cartao_id) {
                    const fp = dataGasto.forma_pagamento || "Dinheiro";
                    const targetId = mapNomeToId[fp] || mapNomeToId["Dinheiro"];
                    await updateDoc(doc(db, "gastos_gerais", docGasto.id), {
                        cartao_id: targetId
                    });
                }
            }
        } catch (e) {
            console.error("Erro na migração de despesas legadas:", e);
        }
    }

    if (alterado) {
        try {
            await setDoc(doc(db, "configs", currentUser.uid), { ...userConfig, ...updatePayload });
            userConfig = { ...userConfig, ...updatePayload };
        } catch (e) {
            console.error("Erro ao persistir migração em configs:", e);
        }
    }
}

function popularSelectVeiculos() {
    const select = document.getElementById('abs-veiculo-id');
    if (!select) return;
    select.innerHTML = '';
    localVeiculos.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.textContent = v.nome;
        select.appendChild(option);
    });
}

function popularSelectCartoes() {
    const select = document.getElementById('gasto-pagamento');
    if (!select) return;
    select.innerHTML = '';
    localCartoes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.nome;
        select.appendChild(option);
    });
}

function renderVeiculosCarousel(veiculos, abastecimentos) {
    const container = document.getElementById('carousel-veiculos');
    if (!container) return;
    container.innerHTML = '';

    if (veiculos.length === 0) {
        container.innerHTML = `<p style="padding: 20px; color: #888; text-align: center; width: 100%;">Nenhum veículo cadastrado.</p>`;
        return;
    }

    veiculos.forEach(v => {
        const absCarro = abastecimentos.filter(a => a.veiculo_id === v.id);
        const totalAbastecido = absCarro.reduce((acc, curr) => acc + (parseFloat(curr.valor_total) || 0), 0);

        let somaDistancia = 0;
        let somaLitros = 0;
        absCarro.forEach(item => {
            const kmAnt = parseFloat(item.km_anterior) || 0;
            const kmAtu = parseFloat(item.km_atual) || 0;
            const precoLitro = parseFloat(item.preco_litro) || 0;
            const valorTotal = parseFloat(item.valor_total) || 0;

            const dist = kmAtu - kmAnt;
            const litros = precoLitro > 0 ? (valorTotal / precoLitro) : 0;

            if (dist > 0 && litros > 0) {
                somaDistancia += dist;
                somaLitros += litros;
            }
        });

        const mediaPeriodo = somaLitros > 0 ? (somaDistancia / somaLitros) : 0;
        const mediaExibida = mediaPeriodo > 0 ? `${mediaPeriodo.toFixed(1).replace('.', ',')} KM/L` : `${parseFloat(v.consumo_medio).toFixed(1).replace('.', ',')} KM/L (Médio)`;

        const card = document.createElement('div');
        card.className = 'financas-card abastecimento-card-new';
        card.innerHTML = `
            <div>
                <h3 style="display: flex; justify-content: space-between; align-items: center;">
                    <span>🚗 ${v.nome}</span>
                    <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
                        <button class="btn-edit-veiculo btn-small" style="background: none; border: none; color: #888; font-size: 1.1rem; cursor: pointer; padding: 0;">✏️</button>
                        <button class="btn-delete-veiculo btn-small" style="background: none; border: none; color: var(--danger-color); font-size: 1.1rem; cursor: pointer; padding: 0;" title="Excluir Veículo">🗑️</button>
                    </div>
                </h3>
                <div class="financas-card-content">
                    <div class="financas-metric-row">
                        <span>Gasto no período:</span>
                        <b style="color: var(--primary-color);">${formatCurrency(totalAbastecido)}</b>
                    </div>
                    <div class="financas-metric-row">
                        <span>Consumo Médio:</span>
                        <b style="color: var(--success-color);">${mediaExibida}</b>
                    </div>
                    <div class="financas-metric-row">
                        <span>Abastecimentos:</span>
                        <b>${absCarro.length}</b>
                    </div>
                    
                    <div class="financas-card-actions" onclick="event.stopPropagation()">
                        <button class="financas-btn-small trocar btn-abastecer-veiculo" style="flex: 1;">⛽ Abastecer</button>
                    </div>
                </div>
            </div>
        `;

        card.onclick = () => {
            selectedVeiculoIdHist = v.id;
            abrirModalHistoricoAbastecimentoFiltrado(absCarro, v.nome);
        };

        card.querySelector('.btn-abastecer-veiculo').onclick = () => {
            openAbastecimentoModal(null, v.id);
        };

        card.querySelector('.btn-edit-veiculo').onclick = () => {
            openVeiculoModal(v);
        };

        card.querySelector('.btn-delete-veiculo').onclick = () => {
            excluirVeiculoDireto(v.id, v.nome);
        };

        container.appendChild(card);
    });
}

function renderCartoesCarousel(cartoes, gastos) {
    const container = document.getElementById('carousel-cartoes');
    if (!container) return;
    container.innerHTML = '';

    if (cartoes.length === 0) {
        container.innerHTML = `<p style="padding: 20px; color: #888; text-align: center; width: 100%;">Nenhum cartão cadastrado.</p>`;
        return;
    }

    cartoes.forEach(c => {
        const gastosCartao = gastos.filter(g => g.cartao_id === c.id || (!g.cartao_id && g.forma_pagamento === c.nome));
        const totalGastos = gastosCartao.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);

        const card = document.createElement('div');
        card.className = 'financas-card outros-gastos-card-new';
        card.innerHTML = `
            <div>
                <h3 style="display: flex; justify-content: space-between; align-items: center;">
                    <span>💳 ${c.nome}</span>
                    <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
                        <button class="btn-edit-cartao btn-small" style="background: none; border: none; color: #888; font-size: 1.1rem; cursor: pointer; padding: 0;">✏️</button>
                        <button class="btn-delete-cartao btn-small" style="background: none; border: none; color: var(--danger-color); font-size: 1.1rem; cursor: pointer; padding: 0;" title="Excluir Cartão">🗑️</button>
                    </div>
                </h3>
                <div class="financas-card-content">
                    <div class="financas-metric-row">
                        <span>Total no período:</span>
                        <b style="color: var(--accent-color);">${formatCurrency(totalGastos)}</b>
                    </div>
                    <div class="financas-metric-row">
                        <span>Despesas no período:</span>
                        <b>${gastosCartao.length}</b>
                    </div>
                    <div class="financas-metric-row">
                        <span>Tipo:</span>
                        <span style="color: #aaa; font-size: 0.8rem;">${c.permite_parcelamento ? 'Crédito' : 'À Vista'}</span>
                    </div>
                    
                    <div class="financas-card-actions" onclick="event.stopPropagation()">
                        <button class="financas-btn-small trocar btn-gasto-cartao" style="flex: 1; background: var(--accent-color); color: white; border-color: var(--accent-color);">💳 + Compra</button>
                    </div>
                </div>
            </div>
        `;

        card.onclick = () => {
            selectedCartaoIdHist = c.id;
            abrirModalHistoricoOutrosGastosFiltrados(gastosCartao, c.nome);
        };

        card.querySelector('.btn-gasto-cartao').onclick = () => {
            openGastoGeralModal(null, c.id);
        };

        card.querySelector('.btn-edit-cartao').onclick = () => {
            openCartaoModal(c);
        };

        card.querySelector('.btn-delete-cartao').onclick = () => {
            excluirCartaoDireto(c.id, c.nome);
        };

        container.appendChild(card);
    });
}

function renderMetasCarousel(manutencoes) {
    const container = document.getElementById('carousel-metas');
    if (!container) return;
    container.innerHTML = '';

    if (manutencoes.length === 0) {
        container.innerHTML = `<p style="padding: 20px; color: #888; text-align: center; width: 100%;">Nenhuma meta cadastrada.</p>`;
        return;
    }

    manutencoes.forEach(m => {
        const percentualFin = Math.min(100, Math.max(0, (m.saldo / m.valor) * 100));
        
        let diasRestantesText = 'Sem prazo';
        let diasClasse = '';
        if (m.data_limite) {
            const dataFim = new Date(m.data_limite + 'T23:59:59');
            const dataHoje = new Date();
            dataFim.setHours(0,0,0,0);
            dataHoje.setHours(0,0,0,0);

            const diffTime = dataFim - dataHoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                diasRestantesText = `Vencido há ${Math.abs(diffDays)} dias!`;
                diasClasse = 'color: var(--danger-color); font-weight: bold;';
            } else if (diffDays === 0) {
                diasRestantesText = 'Vence hoje!';
                diasClasse = 'color: #ffc107; font-weight: bold;';
            } else {
                diasRestantesText = `${diffDays} dias restantes`;
                diasClasse = 'color: #aaa;';
            }
        }
        
        const prazoBr = m.data_limite ? m.data_limite.split('-').reverse().join('/') : 'Sem prazo';

        const card = document.createElement('div');
        card.className = 'financas-card manutencao-card-new';
        card.innerHTML = `
            <div>
                <h3>
                    <span>🎯 ${m.nome}</span>
                    <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
                        <button class="btn-edit-meta-fin btn-small" style="background: none; border: none; color: #888; font-size: 1.1rem; cursor: pointer; padding: 0;">✏️</button>
                        <button class="btn-delete-meta-fin btn-small" style="background: none; border: none; color: var(--danger-color); font-size: 1.1rem; cursor: pointer; padding: 0;" title="Excluir Definitivamente">🗑️</button>
                    </div>
                </h3>
                
                <div class="financas-card-content">
                    <div class="financas-progress-container">
                        <div class="financas-progress-label">
                            <span>Progresso (${percentualFin.toFixed(0)}%)</span>
                            <span>${formatCurrency(m.saldo)} / ${formatCurrency(m.valor)}</span>
                        </div>
                        <div class="financas-progress-bar-bg">
                            <div class="financas-progress-bar ok" style="width: ${percentualFin}%"></div>
                        </div>
                    </div>

                    <div class="financas-metric-row">
                        <span>Prazo Final:</span>
                        <b>${prazoBr}</b>
                    </div>
                    <div class="financas-metric-row">
                        <span>Tempo Restante:</span>
                        <span style="${diasClasse}">${diasRestantesText}</span>
                    </div>
                    
                    <div class="financas-card-actions" onclick="event.stopPropagation()">
                        <button class="financas-btn-small poupar btn-poupar-meta" data-id="${m.id}">+ Poupar</button>
                        <button class="financas-btn-small trocar btn-arquivar-meta" data-id="${m.id}" style="background: #2b2b2b; color: #ccc; border-color: #444;">📁 Arquivar</button>
                    </div>
                </div>
            </div>
        `;

        card.onclick = () => abrirModalHistoricoManutencao(m);

        card.querySelector('.btn-poupar-meta').onclick = () => {
            abrirModalTransacaoCaixinha(m, 'entrada');
        };

        card.querySelector('.btn-arquivar-meta').onclick = () => {
            arquivarMetaOuRevisao(m.id, m.nome);
        };

        card.querySelector('.btn-edit-meta-fin').onclick = () => {
            openMetaFinModal(m);
        };

        card.querySelector('.btn-delete-meta-fin').onclick = () => {
            excluirCaixinhaDireto(m.id, m.nome);
        };

        container.appendChild(card);
    });
}

function renderRevisoesCarousel(manutencoes, currentKm) {
    const container = document.getElementById('carousel-revisoes');
    if (!container) return;
    container.innerHTML = '';

    if (manutencoes.length === 0) {
        container.innerHTML = `<p style="padding: 20px; color: #888; text-align: center; width: 100%;">Nenhuma revisão cadastrada.</p>`;
        return;
    }

    manutencoes.forEach(m => {
        const percentualDinheiro = Math.min(100, Math.max(0, (m.saldo / m.valor) * 100));
        
        const kmAndado = currentKm - m.km_inicial;
        const kmIntervalo = m.km_total;
        const percentualKm = Math.min(100, Math.max(0, (kmAndado / kmIntervalo) * 100));
        const kmRestante = kmIntervalo - kmAndado;

        let statusText = '';
        let progressClass = '';
        if (kmRestante <= 0) {
            statusText = `🚨 Vencido há ${Math.abs(kmRestante).toFixed(0)} km!`;
            progressClass = 'danger';
        } else if (kmRestante <= 500) {
            statusText = `⚠️ Vence em ${kmRestante.toFixed(0)} km!`;
            progressClass = 'warning';
        } else {
            statusText = `${kmRestante.toFixed(0)} km restantes`;
            progressClass = 'ok';
        }

        const card = document.createElement('div');
        card.className = 'financas-card manutencao-card-new';
        card.innerHTML = `
            <div class="revisao-card-layout">
                <div class="progress-vertical-wrapper" title="Dinheiro Arrecadado: ${percentualDinheiro.toFixed(0)}%">
                    <div class="progress-vertical-bg">
                        <div class="progress-vertical-bar ${percentualDinheiro >= 100 ? 'ok' : ''}" style="height: ${percentualDinheiro}%"></div>
                    </div>
                    <span class="progress-vertical-label">${percentualDinheiro.toFixed(0)}%</span>
                </div>

                <div class="revisao-card-main-content">
                    <div>
                        <h3 style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <span>🔧 ${m.nome}</span>
                            <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
                                <button class="btn-edit-revisao btn-small" style="background: none; border: none; color: #888; font-size: 1.1rem; cursor: pointer; padding: 0;">✏️</button>
                                <button class="btn-delete-revisao btn-small" style="background: none; border: none; color: var(--danger-color); font-size: 1.1rem; cursor: pointer; padding: 0;" title="Excluir Definitivamente">🗑️</button>
                            </div>
                        </h3>
                        <div class="financas-card-content">
                            <div class="financas-metric-row" style="margin-bottom: 4px;">
                                <span>Saldo / Custo:</span>
                                <b style="color: #00d1b2;">${formatCurrency(m.saldo)} / ${formatCurrency(m.valor)}</b>
                            </div>
                            <div class="financas-metric-row" style="margin-bottom: 4px;">
                                <span>KM para troca:</span>
                                <b>${kmIntervalo.toFixed(0)} km</b>
                            </div>
                            <div class="financas-metric-row" style="margin-bottom: 4px;">
                                <span>Faltam:</span>
                                <b style="color: ${progressClass === 'danger' ? 'var(--danger-color)' : progressClass === 'warning' ? '#ffc107' : 'var(--success-color)'}">${statusText}</b>
                            </div>
                        </div>
                    </div>

                    <div class="progress-horizontal-base">
                        <div class="financas-progress-label" style="font-size: 0.72rem; margin-bottom: 2px;">
                            <span>Progresso KM (${percentualKm.toFixed(0)}%)</span>
                            <span>${kmAndado.toFixed(0)} / ${kmIntervalo.toFixed(0)} km</span>
                        </div>
                        <div class="financas-progress-bar-bg" style="height: 6px;">
                            <div class="financas-progress-bar ${progressClass}" style="width: ${percentualKm}%"></div>
                        </div>
                    </div>

                    <div class="financas-card-actions" onclick="event.stopPropagation()" style="margin-top: 12px; font-size: 0.8rem;">
                        <button class="financas-btn-small poupar btn-poupar-revisao" style="padding: 4px 6px;">+ Poupar</button>
                        <button class="financas-btn-small duplicar btn-duplicar-revisao" style="padding: 4px 6px; background: rgba(50, 115, 220, 0.2); color: var(--accent-color); border-color: rgba(50, 115, 220, 0.3);">📋 Duplicar</button>
                        <button class="financas-btn-small arquivar btn-arquivar-revisao" style="padding: 4px 6px; background: #2b2b2b; color: #ccc; border-color: #444;">📁 Arquivar</button>
                    </div>
                </div>
            </div>
        `;

        card.onclick = () => abrirModalHistoricoManutencao(m);

        card.querySelector('.btn-poupar-revisao').onclick = () => {
            abrirModalTransacaoCaixinha(m, 'entrada');
        };

        card.querySelector('.btn-duplicar-revisao').onclick = () => {
            duplicarRevisao(m);
        };

        card.querySelector('.btn-arquivar-revisao').onclick = () => {
            arquivarMetaOuRevisao(m.id, m.nome);
        };

        card.querySelector('.btn-edit-revisao').onclick = () => {
            openRevisaoKmModal(m);
        };

        card.querySelector('.btn-delete-revisao').onclick = () => {
            excluirCaixinhaDireto(m.id, m.nome);
        };

        container.appendChild(card);
    });
}

function abrirModalHistoricoAbastecimentoFiltrado(abastecimentos, nomeVeiculo) {
    const tituloEl = document.querySelector('#modal-historico-abastecimento h3');
    if (tituloEl) tituloEl.innerHTML = `<span>⛽ Histórico - ${nomeVeiculo}</span>`;
    abrirModalHistoricoAbastecimento(abastecimentos);
}

function abrirModalHistoricoOutrosGastosFiltrados(outrosGastos, nomeCartao) {
    const tituloEl = document.querySelector('#modal-historico-outros-gastos h3');
    if (tituloEl) tituloEl.innerHTML = `<span>💳 Histórico - ${nomeCartao}</span>`;
    abrirModalHistoricoOutrosGastos(outrosGastos);
}

async function toggleAlertaManutencao(id, checked) {
    try {
        await updateDoc(doc(db, "manutencoes", id), {
            alerta_ativo: checked
        });
        checkMaintenanceAlerts();
    } catch (e) {
        console.error("Erro ao alternar alerta:", e);
    }
}

function abrirModalTransacaoCaixinha(manut, tipo) {
    currentManutencaoId = manut.id;
    
    const modal = document.getElementById('modal-transacao-caixinha');
    const form = document.getElementById('form-transacao-caixinha');
    form.reset();
    
    document.getElementById('trans-caixinha-tipo').value = tipo;
    document.getElementById('trans-caixinha-manut-id').value = manut.id;
    document.getElementById('trans-caixinha-data').value = getLocalDate();
    
    const titulo = document.getElementById('trans-caixinha-titulo');
    const valorInput = document.getElementById('trans-caixinha-valor');
    const descInput = document.getElementById('trans-caixinha-desc');
    
    const applyMask = (input, decimals) => {
        const clone = input.cloneNode(true);
        input.parentNode.replaceChild(clone, input);
        
        clone.addEventListener('input', (e) => {
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
    
    if (tipo === 'entrada') {
        titulo.textContent = `💰 Depositar em: ${manut.nome}`;
        descInput.placeholder = "Ex: Poupança semanal para manutenção";
        const restante = Math.max(0, manut.valor - manut.saldo);
        if (restante > 0) {
            document.getElementById('trans-caixinha-valor').value = restante.toFixed(2).replace('.', ',');
        }
    } else {
        titulo.textContent = `🔧 Registrar Gasto/Troca em: ${manut.nome}`;
        descInput.placeholder = "Ex: Compra/Troca efetuada";
        document.getElementById('trans-caixinha-valor').value = manut.valor.toFixed(2).replace('.', ',');
    }
    
    modal.style.display = 'flex';
}

function fecharModalTransacaoCaixinha() {
    document.getElementById('modal-transacao-caixinha').style.display = 'none';
}

async function salvarTransacaoCaixinha(e) {
    e.preventDefault();
    showLoader(true, 'Salvando transação...');
    
    const manutId = document.getElementById('trans-caixinha-manut-id').value;
    const tipo = document.getElementById('trans-caixinha-tipo').value;
    const data = document.getElementById('trans-caixinha-data').value;
    const valorVal = parseFloat(document.getElementById('trans-caixinha-valor').value.replace(',', '.')) || 0;
    const desc = document.getElementById('trans-caixinha-desc').value;
    
    try {
        const docRef = doc(db, "manutencoes", manutId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const manutData = docSnap.data();
            const historico = manutData.historico || [];
            const isLivre = (parseFloat(manutData.km_total) || 0) === 0;
            
            const tId = 't_' + new Date().getTime();
            historico.push({
                id: tId,
                data: data,
                tipo: tipo,
                valor: valorVal,
                descricao: desc || (tipo === 'entrada' ? 'Poupança/Depósito' : (isLivre ? 'Resgate/Gasto' : 'Troca efetuada'))
            });
            
            const updateObj = { historico: historico };
            
            let reiniciarKm = false;
            let metaArquivada = false;
            
            if (tipo === 'saida') {
                if (isLivre) {
                    if (confirm(`Deseja arquivar esta caixinha?\n\nIsso irá:\n1. Registrar permanentemente o pagamento de ${formatCurrency(valorVal)} no Histórico Geral de Despesas.\n2. Limpar o histórico interno desta caixinha para que você comece a poupar para o próximo ano do zero.`)) {
                        const dataGasto = {
                            descricao: `${manutData.nome} (Arquivado/Pago)`,
                            valor: valorVal,
                            data: data,
                            tipo: 'Outros',
                            uid: currentUser.uid,
                            forma_pagamento: 'Pix',
                            createdAt: new Date()
                        };
                        await addDoc(collection(db, "gastos_gerais"), dataGasto);
                        updateObj.historico = []; // Zera para o próximo ciclo
                        metaArquivada = true;
                    }
                } else {
                    const qLast = query(collection(db, "registros"), where("uid", "==", currentUser.uid));
                    const lastSnap = await getDocs(qLast);
                    let currentKm = parseFloat(manutData.km_inicial) || 0;
                    if (!lastSnap.empty) {
                        lastSnap.forEach(d => {
                            const km = parseFloat(d.data().km_final) || 0;
                            if (km > currentKm) currentKm = km;
                        });
                    }
                    
                    if (confirm(`Deseja atualizar o KM Inicial de ${manutData.km_inicial} para ${currentKm} (KM atual do carro)?\nIsso irá zerar a contagem de quilômetros para a próxima revisão.`)) {
                        updateObj.km_inicial = currentKm;
                        reiniciarKm = true;
                    }
                }
            }
            
            await updateDoc(docRef, updateObj);
            fecharModalTransacaoCaixinha();
            document.getElementById('modal-historico-manutencao').style.display = 'none';
            await loadFinancas();
            checkMaintenanceAlerts();
            
            if (reiniciarKm) {
                alert('Revisão realizada e KM inicial reiniciado com sucesso!');
            }
            if (metaArquivada) {
                alert('Meta arquivada com sucesso! O pagamento foi registrado no seu Histórico Geral de Despesas.');
            }
        }
    } catch (e) {
        console.error("Erro ao salvar transação de caixinha:", e);
        alert("Erro ao salvar transação.");
    } finally {
        showLoader(false);
    }
}

function abrirModalHistoricoAbastecimento(abastecimentos) {
    const modal = document.getElementById('modal-historico-abastecimento');
    const tbody = document.getElementById('tbody-hist-abastecimento');
    tbody.innerHTML = '';
    
    abastecimentos.forEach(item => {
        const litros = item.valor_total / item.preco_litro;
        const dist = (item.km_atual && item.km_anterior) ? (item.km_atual - item.km_anterior) : 0;
        const kml = (litros > 0 && dist > 0) ? (dist / litros) : 0;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.data.split('-').reverse().join('/')}</td>
            <td>${item.km_anterior}</td>
            <td>${item.km_atual}</td>
            <td style="color: var(--primary-color); font-weight: bold;">${formatCurrency(item.valor_total)}</td>
            <td>${kml > 0 ? kml.toFixed(1) + ' KM/L' : '--'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-edit-abs btn-small" style="background: rgba(50, 115, 220, 0.2); color: var(--accent-color);">✏️</button>
                    <button class="btn-del-abs btn-small btn-delete">🗑️</button>
                </div>
            </td>
        `;
        
        tr.querySelector('.btn-edit-abs').onclick = () => {
            modal.style.display = 'none';
            openAbastecimentoModal(item);
        };
        
        tr.querySelector('.btn-del-abs').onclick = async () => {
            if (confirm('Deseja excluir este abastecimento?')) {
                showLoader(true, 'Excluindo...');
                try {
                    await deleteDoc(doc(db, "abastecimentos", item.id));
                    modal.style.display = 'none';
                    await loadFinancas();
                } catch (e) {
                    console.error(e);
                } finally {
                    showLoader(false);
                }
            }
        };
        tbody.appendChild(tr);
    });
    modal.style.display = 'flex';
}

function abrirModalHistoricoOutrosGastos(outrosGastos) {
    const modal = document.getElementById('modal-historico-outros-gastos');
    const tbody = document.getElementById('tbody-hist-outros');
    tbody.innerHTML = '';
    
    outrosGastos.forEach(item => {
        const tr = document.createElement('tr');
        
        let parcelamentoHTML = '';
        if (item.forma_pagamento === 'Cartão de Crédito') {
            const isPaga = item.pago === true;
            parcelamentoHTML = `
                <div style="font-size: 0.8rem;">
                    <div class="instalment-list" style="margin-top: 5px;">
                        <div class="instalment-badge ${isPaga ? 'paga' : 'pendente'}" data-id="${item.id}">
                            <span>${item.parcelado ? `Parc. ${item.parcela_numero}/${item.num_parcelas}` : 'Única'}</span>
                            <span class="instalment-status-icon">${isPaga ? '✓' : '✗'}</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            parcelamentoHTML = `<span style="color: #666; font-size: 0.8rem;">À vista</span>`;
        }

        tr.innerHTML = `
            <td>${item.data.split('-').reverse().join('/')}</td>
            <td><span class="turno-badge" style="background: rgba(50, 115, 220, 0.15); color: var(--accent-color); padding: 3px 6px; font-size: 0.75rem;">${item.tipo}</span></td>
            <td>${item.descricao}</td>
            <td>${item.forma_pagamento || 'Outro'}</td>
            <td style="font-weight: bold; color: var(--accent-color);">${formatCurrency(item.valor)}</td>
            <td>${parcelamentoHTML}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-edit-gasto btn-small" style="background: rgba(50, 115, 220, 0.2); color: var(--accent-color);">✏️</button>
                    <button class="btn-del-gasto btn-small btn-delete">🗑️</button>
                </div>
            </td>
        `;

        tr.querySelectorAll('.instalment-badge').forEach(badge => {
            badge.onclick = async () => {
                const gastoId = badge.getAttribute('data-id');
                const isPaga = item.pago === true;
                
                showLoader(true, 'Atualizando status...');
                try {
                    const docRef = doc(db, "gastos_gerais", gastoId);
                    await updateDoc(docRef, { pago: !isPaga });
                    
                    const start = document.getElementById('startDate').value;
                    const end = document.getElementById('endDate').value;
                    
                    const qGeral = query(
                        collection(db, "gastos_gerais"),
                        where("uid", "==", currentUser.uid),
                        where("data", ">=", start),
                        where("data", "<=", end)
                    );
                    const snaps = await getDocs(qGeral);
                    const updatedGastos = [];
                    snaps.forEach(d => updatedGastos.push({ id: d.id, ...d.data() }));
                    
                    abrirModalHistoricoOutrosGastos(updatedGastos);
                    await loadFinancas();
                } catch (e) {
                    console.error("Erro ao atualizar status do gasto:", e);
                } finally {
                    showLoader(false);
                }
            };
        });

        tr.querySelector('.btn-edit-gasto').onclick = () => {
            modal.style.display = 'none';
            openGastoGeralModal(item);
        };

        tr.querySelector('.btn-del-gasto').onclick = async () => {
            if (confirm('Deseja excluir este gasto?')) {
                showLoader(true, 'Excluindo...');
                try {
                    await deleteDoc(doc(db, "gastos_gerais", item.id));
                    modal.style.display = 'none';
                    await loadFinancas();
                } catch (e) {
                    console.error(e);
                } finally {
                    showLoader(false);
                }
            }
        };
        tbody.appendChild(tr);
    });
    modal.style.display = 'flex';
}

function abrirModalHistoricoManutencao(manut) {
    currentManutencaoId = manut.id;
    
    const modal = document.getElementById('modal-historico-manutencao');
    document.getElementById('hist-manut-titulo').textContent = `🔧 Caixinha: ${manut.nome}`;
    document.getElementById('hist-manut-saldo').textContent = formatCurrency(manut.saldo);
    document.getElementById('hist-manut-meta').textContent = `Custo Estimado: ${formatCurrency(manut.valor)}`;
    
    const tbody = document.getElementById('tbody-hist-manutencao');
    tbody.innerHTML = '';
    
    document.getElementById('btnPouparHist').onclick = () => {
        abrirModalTransacaoCaixinha(manut, 'entrada');
    };
    
    document.getElementById('btnTrocarHist').onclick = () => {
        abrirModalTransacaoCaixinha(manut, 'saida');
    };
    
    const historico = manut.historico || [];
    const histOrdenado = [...historico].sort((a,b) => b.data.localeCompare(a.data));
    
    if (histOrdenado.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">Nenhuma transação registrada nesta caixinha.</td></tr>`;
    } else {
        histOrdenado.forEach(t => {
            const tr = document.createElement('tr');
            const isEntrada = t.tipo === 'entrada';
            
            tr.innerHTML = `
                <td>${t.data.split('-').reverse().join('/')}</td>
                <td>
                    <span class="turno-badge" style="background: ${isEntrada ? 'rgba(35, 209, 96, 0.15)' : 'rgba(255, 56, 96, 0.15)'}; color: ${isEntrada ? 'var(--success-color)' : 'var(--danger-color)'}; padding: 3px 6px; font-size: 0.75rem;">
                        ${isEntrada ? 'Depósito (+)' : 'Retirada/Gasto (-)'}
                    </span>
                </td>
                <td style="font-weight: bold; color: ${isEntrada ? 'var(--success-color)' : 'var(--danger-color)'};">
                    ${isEntrada ? '+' : '-'}${formatCurrency(t.valor)}
                </td>
                <td>${t.descricao}</td>
                <td>
                    <button class="btn-del-trans btn-small btn-delete" data-tid="${t.id}">🗑️</button>
                </td>
            `;
            
            tr.querySelector('.btn-del-trans').onclick = async () => {
                if (confirm('Deseja excluir esta transação da caixinha?')) {
                    showLoader(true, 'Excluindo transação...');
                    try {
                        const docRef = doc(db, "manutencoes", manut.id);
                        const docSnap = await getDoc(docRef);
                        
                        if (docSnap.exists()) {
                            const currentHist = docSnap.data().historico || [];
                            const updatedHist = currentHist.filter(item => item.id !== t.id);
                            
                            await updateDoc(docRef, { historico: updatedHist });
                            modal.style.display = 'none';
                            await loadFinancas();
                        }
                    } catch (e) {
                        console.error(e);
                    } finally {
                        showLoader(false);
                    }
                }
            };
            tbody.appendChild(tr);
        });
    }
    modal.style.display = 'flex';
}

// --- SISTEMA DE FINANÇAS: NOVOS CADASTROS E SUPORTE A CARROSSEIS ---

function setupNovasFinancas() {
    const btnVeiculo = document.getElementById('btnNovoVeiculo');
    if (btnVeiculo) btnVeiculo.onclick = () => openVeiculoModal();

    const btnCartao = document.getElementById('btnNovoCartao');
    if (btnCartao) btnCartao.onclick = () => openCartaoModal();

    const btnMeta = document.getElementById('btnNovaMetaFin');
    if (btnMeta) btnMeta.onclick = () => openMetaFinModal();

    const btnRevisao = document.getElementById('btnNovaRevisaoKm');
    if (btnRevisao) btnRevisao.onclick = () => openRevisaoKmModal();

    const btnArquivados = document.getElementById('btnConsultarArquivados');
    if (btnArquivados) btnArquivados.onclick = () => openArquivadosModal();

    document.getElementById('closeVeiculoBtn').onclick = () => fecharVeiculoModal();
    document.getElementById('closeVeiculoFooterBtn').onclick = () => fecharVeiculoModal();
    document.getElementById('form-veiculo').onsubmit = (e) => saveVeiculo(e);

    document.getElementById('closeCartaoBtn').onclick = () => fecharCartaoModal();
    document.getElementById('closeCartaoFooterBtn').onclick = () => fecharCartaoModal();
    document.getElementById('form-cartao').onsubmit = (e) => saveCartao(e);

    document.getElementById('closeMetaFinBtn').onclick = () => fecharMetaFinModal();
    document.getElementById('closeMetaFinFooterBtn').onclick = () => fecharMetaFinModal();
    document.getElementById('form-meta-financeira').onsubmit = (e) => saveMetaFin(e);

    document.getElementById('closeRevisaoKmBtn').onclick = () => fecharRevisaoKmModal();
    document.getElementById('closeRevisaoKmFooterBtn').onclick = () => fecharRevisaoKmModal();
    document.getElementById('form-revisao-km').onsubmit = (e) => saveRevisaoKm(e);

    document.getElementById('closeArquivadosBtn').onclick = () => document.getElementById('modal-arquivados').style.display = 'none';
    document.getElementById('closeArquivadosFooterBtn').onclick = () => document.getElementById('modal-arquivados').style.display = 'none';

    const applyMaskMoney = (input) => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') {
                e.target.value = '';
                return;
            }
            value = (parseInt(value) / 100).toFixed(2);
            e.target.value = value.replace('.', ',');
        });
    };

    applyMaskMoney(document.getElementById('meta-fin-valor'));
    applyMaskMoney(document.getElementById('revisao-km-valor'));

    const absValInput = document.getElementById('abs-valor-total');
    if (absValInput) {
        absValInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') {
                e.target.value = '';
                return;
            }
            value = (parseInt(value) / 100).toFixed(2);
            e.target.value = value.replace('.', ',');
        });
    }

    const absPriceInput = document.getElementById('abs-preco-litro');
    if (absPriceInput) {
        absPriceInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') {
                e.target.value = '';
                return;
            }
            value = (parseInt(value) / 100).toFixed(2);
            e.target.value = value.replace('.', ',');
        });
    }

    const gastoValInput = document.getElementById('gasto-valor');
    if (gastoValInput) {
        gastoValInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') {
                e.target.value = '';
                return;
            }
            value = (parseInt(value) / 100).toFixed(2);
            e.target.value = value.replace('.', ',');
        });
    }
    
    const absVeiculoSelect = document.getElementById('abs-veiculo-id');
    if (absVeiculoSelect) {
        absVeiculoSelect.addEventListener('change', async () => {
            const absId = document.getElementById('abs-id').value;
            if (!absId) {
                const currentVeiculoId = absVeiculoSelect.value;
                if (currentVeiculoId) {
                    showLoader(true, 'Buscando KM anterior do veículo...');
                    try {
                        let lastKm = 0;
                        const qAbs = query(
                            collection(db, "abastecimentos"),
                            where("uid", "==", currentUser.uid),
                            where("veiculo_id", "==", currentVeiculoId),
                            orderBy("km_atual", "desc"),
                            limit(1)
                        );
                        const snapAbs = await getDocs(qAbs);
                        if (!snapAbs.empty) {
                            lastKm = snapAbs.docs[0].data().km_atual || 0;
                        }
                        if (lastKm === 0) {
                            const qReg = query(collection(db, "registros"), where("uid", "==", currentUser.uid), orderBy("km_final", "desc"), limit(1));
                            const snapReg = await getDocs(qReg);
                            if (!snapReg.empty) lastKm = snapReg.docs[0].data().km_final || 0;
                        }
                        document.getElementById('abs-km-anterior').value = lastKm;
                        const evt = new Event('input');
                        document.getElementById('abs-km-anterior').dispatchEvent(evt);
                    } catch (e) {
                        console.error("Erro ao mudar veículo no select:", e);
                    } finally {
                        showLoader(false);
                    }
                }
            }
        });
    }
}

function openVeiculoModal(veiculo = null) {
    const modal = document.getElementById('modal-veiculo');
    const form = document.getElementById('form-veiculo');
    form.reset();

    const titulo = document.getElementById('veiculo-titulo');
    if (veiculo) {
        titulo.textContent = "🚗 Editar Veículo";
        document.getElementById('veiculo-id').value = veiculo.id;
        document.getElementById('veiculo-nome').value = veiculo.nome;
        document.getElementById('veiculo-consumo').value = veiculo.consumo_medio || 10.0;
    } else {
        titulo.textContent = "🚗 Novo Veículo";
        document.getElementById('veiculo-id').value = "";
        document.getElementById('veiculo-consumo').value = "10.0";
    }
    modal.style.display = 'flex';
}

function fecharVeiculoModal() {
    document.getElementById('modal-veiculo').style.display = 'none';
}

async function saveVeiculo(e) {
    e.preventDefault();
    showLoader(true, 'Salvando veículo...');
    const id = document.getElementById('veiculo-id').value;
    const nome = document.getElementById('veiculo-nome').value;
    const consumo = parseFloat(document.getElementById('veiculo-consumo').value) || 10.0;

    try {
        if (!userConfig.veiculos || !Array.isArray(userConfig.veiculos)) {
            userConfig.veiculos = [];
        }

        if (id) {
            userConfig.veiculos = userConfig.veiculos.map(v => {
                if (v.id === id) {
                    return { ...v, nome: nome, consumo_medio: consumo };
                }
                return v;
            });
        } else {
            const newVeiculo = {
                id: 'v_' + new Date().getTime(),
                nome: nome,
                consumo_medio: consumo
            };
            userConfig.veiculos.push(newVeiculo);
        }

        await setDoc(doc(db, "configs", currentUser.uid), userConfig);

        fecharVeiculoModal();
        await loadFinancas();
    } catch (err) {
        console.error("Erro ao salvar veículo:", err);
        alert("Erro ao salvar veículo.");
    } finally {
        showLoader(false);
    }
}

function openCartaoModal(cartao = null) {
    const modal = document.getElementById('modal-cartao');
    const form = document.getElementById('form-cartao');
    form.reset();

    const titulo = document.getElementById('cartao-titulo');
    if (cartao) {
        titulo.textContent = "💳 Editar Cartão / Método";
        document.getElementById('cartao-id').value = cartao.id;
        document.getElementById('cartao-nome').value = cartao.nome;
        document.getElementById('cartao-parcelado-perm').checked = cartao.permite_parcelamento || false;
    } else {
        titulo.textContent = "💳 Novo Cartão / Método";
        document.getElementById('cartao-id').value = "";
        document.getElementById('cartao-parcelado-perm').checked = false;
    }
    modal.style.display = 'flex';
}

function fecharCartaoModal() {
    document.getElementById('modal-cartao').style.display = 'none';
}

async function saveCartao(e) {
    e.preventDefault();
    showLoader(true, 'Salvando cartão...');
    const id = document.getElementById('cartao-id').value;
    const nome = document.getElementById('cartao-nome').value;
    const parceladoPerm = document.getElementById('cartao-parcelado-perm').checked;

    try {
        if (!userConfig.cartoes || !Array.isArray(userConfig.cartoes)) {
            userConfig.cartoes = [];
        }

        if (id) {
            userConfig.cartoes = userConfig.cartoes.map(c => {
                if (c.id === id) {
                    return { ...c, nome: nome, permite_parcelamento: parceladoPerm };
                }
                return c;
            });
        } else {
            const newCartao = {
                id: 'c_' + new Date().getTime(),
                nome: nome,
                permite_parcelamento: parceladoPerm
            };
            userConfig.cartoes.push(newCartao);
        }

        await setDoc(doc(db, "configs", currentUser.uid), userConfig);

        fecharCartaoModal();
        await loadFinancas();
    } catch (err) {
        console.error("Erro ao salvar cartão:", err);
        alert("Erro ao salvar cartão.");
    } finally {
        showLoader(false);
    }
}

function openMetaFinModal(meta = null) {
    const modal = document.getElementById('modal-meta-financeira');
    const form = document.getElementById('form-meta-financeira');
    form.reset();

    const titulo = document.getElementById('meta-fin-titulo');
    if (meta) {
        titulo.textContent = "🎯 Editar Meta Financeira";
        document.getElementById('meta-fin-id').value = meta.id;
        document.getElementById('meta-fin-nome').value = meta.nome;
        document.getElementById('meta-fin-valor').value = meta.valor.toFixed(2).replace('.', ',');
        document.getElementById('meta-fin-data-limite').value = meta.data_limite || "";
    } else {
        titulo.textContent = "🎯 Nova Meta Financeira";
        document.getElementById('meta-fin-id').value = "";
        document.getElementById('meta-fin-data-limite').value = getLocalDate();
    }
    modal.style.display = 'flex';
}

function fecharMetaFinModal() {
    document.getElementById('modal-meta-financeira').style.display = 'none';
}

async function saveMetaFin(e) {
    e.preventDefault();
    showLoader(true, 'Salvando meta...');
    const id = document.getElementById('meta-fin-id').value;
    const nome = document.getElementById('meta-fin-nome').value;
    const valor = parseFloat(document.getElementById('meta-fin-valor').value.replace(',', '.')) || 0;
    const dataLimite = document.getElementById('meta-fin-data-limite').value;

    try {
        const data = {
            nome: nome,
            valor: valor,
            km_total: 0,
            km_inicial: 0,
            data_limite: dataLimite,
            uid: currentUser.uid,
            updatedAt: new Date()
        };

        if (id) {
            await updateDoc(doc(db, "manutencoes", id), data);
        } else {
            data.alerta_ativo = true;
            data.historico = [];
            data.arquivado = false;
            await addDoc(collection(db, "manutencoes"), data);
        }

        fecharMetaFinModal();
        await loadFinancas();
        checkMaintenanceAlerts();
    } catch (err) {
        console.error("Erro ao salvar meta:", err);
        alert("Erro ao salvar meta.");
    } finally {
        showLoader(false);
    }
}

function openRevisaoKmModal(revisao = null) {
    const modal = document.getElementById('modal-revisao-km');
    const form = document.getElementById('form-revisao-km');
    form.reset();

    const titulo = document.getElementById('revisao-km-titulo');
    if (revisao) {
        titulo.textContent = "🔧 Editar Revisão por KM";
        document.getElementById('revisao-km-id').value = revisao.id;
        document.getElementById('revisao-km-nome').value = revisao.nome;
        document.getElementById('revisao-km-valor').value = revisao.valor.toFixed(2).replace('.', ',');
        document.getElementById('revisao-km-inicial').value = revisao.km_inicial;
        document.getElementById('revisao-km-total').value = revisao.km_total;
    } else {
        titulo.textContent = "🔧 Nova Revisão por KM";
        document.getElementById('revisao-km-id').value = "";
        
        let currentKm = 0;
        document.getElementById('revisao-km-inicial').value = currentKm;
        document.getElementById('revisao-km-total').value = "10000";
        
        const qLast = query(collection(db, "registros"), where("uid", "==", currentUser.uid));
        getDocs(qLast).then(lastSnap => {
            let lastKm = 0;
            if (!lastSnap.empty) {
                lastSnap.forEach(d => {
                    const km = parseFloat(d.data().km_final) || 0;
                    if (km > lastKm) lastKm = km;
                });
            }
            document.getElementById('revisao-km-inicial').value = lastKm;
        }).catch(err => console.error("Erro ao carregar odômetro padrão:", err));
    }
    modal.style.display = 'flex';
}

function fecharRevisaoKmModal() {
    document.getElementById('modal-revisao-km').style.display = 'none';
}

async function saveRevisaoKm(e) {
    e.preventDefault();
    showLoader(true, 'Salvando revisão...');
    const id = document.getElementById('revisao-km-id').value;
    const nome = document.getElementById('revisao-km-nome').value;
    const valor = parseFloat(document.getElementById('revisao-km-valor').value.replace(',', '.')) || 0;
    const kmInicial = parseFloat(document.getElementById('revisao-km-inicial').value) || 0;
    const kmTotal = parseFloat(document.getElementById('revisao-km-total').value) || 0;

    try {
        const data = {
            nome: nome,
            valor: valor,
            km_inicial: kmInicial,
            km_total: kmTotal,
            data_limite: '',
            uid: currentUser.uid,
            updatedAt: new Date()
        };

        if (id) {
            await updateDoc(doc(db, "manutencoes", id), data);
        } else {
            data.alerta_ativo = true;
            data.historico = [];
            data.arquivado = false;
            await addDoc(collection(db, "manutencoes"), data);
        }

        fecharRevisaoKmModal();
        await loadFinancas();
        checkMaintenanceAlerts();
    } catch (err) {
        console.error("Erro ao salvar revisão:", err);
        alert("Erro ao salvar revisão.");
    } finally {
        showLoader(false);
    }
}

async function duplicarRevisao(revisao) {
    if (!confirm(`Deseja duplicar a revisão "${revisao.nome}"?\n\nIsso criará uma nova caixinha de revisão com o mesmo nome e valor alvo, zerada para a próxima troca.`)) return;
    
    showLoader(true, 'Duplicando revisão...');
    try {
        const qLast = query(collection(db, "registros"), where("uid", "==", currentUser.uid));
        const lastSnap = await getDocs(qLast);
        let currentKm = parseFloat(revisao.km_inicial) || 0;
        if (!lastSnap.empty) {
            lastSnap.forEach(d => {
                const km = parseFloat(d.data().km_final) || 0;
                if (km > currentKm) currentKm = km;
            });
        }

        const dataObj = {
            nome: revisao.nome,
            valor: revisao.valor,
            km_inicial: currentKm,
            km_total: revisao.km_total,
            data_limite: '',
            uid: currentUser.uid,
            alerta_ativo: true,
            historico: [],
            arquivado: false,
            updatedAt: new Date()
        };

        await addDoc(collection(db, "manutencoes"), dataObj);
        await loadFinancas();
        checkMaintenanceAlerts();
        alert(`Revisão "${revisao.nome}" duplicada com sucesso!`);
    } catch (e) {
        console.error("Erro ao duplicar revisão:", e);
        alert("Erro ao duplicar revisão.");
    } finally {
        showLoader(false);
    }
}

async function arquivarMetaOuRevisao(id, nome) {
    if (!confirm(`Deseja arquivar a caixinha "${nome}"?\n\nEla será ocultada desta tela, mas você poderá consultá-la e restaurá-la a qualquer momento em "Consultar Arquivados".`)) return;
    
    showLoader(true, 'Arquivando...');
    try {
        await updateDoc(doc(db, "manutencoes", id), {
            arquivado: true
        });
        await loadFinancas();
        checkMaintenanceAlerts();
    } catch (e) {
        console.error("Erro ao arquivar:", e);
        alert("Erro ao arquivar.");
    } finally {
        showLoader(false);
    }
}

async function openArquivadosModal() {
    const modal = document.getElementById('modal-arquivados');
    const tbody = document.getElementById('tbody-arquivados');
    tbody.innerHTML = '';

    showLoader(true, 'Buscando caixinhas arquivadas...');
    try {
        const q = query(
            collection(db, "manutencoes"),
            where("uid", "==", currentUser.uid),
            where("arquivado", "==", true)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888; padding: 20px;">Nenhuma caixinha arquivada.</td></tr>`;
        } else {
            snap.forEach(docSnap => {
                const item = docSnap.data();
                const id = docSnap.id;
                const isLivre = (parseFloat(item.km_total) || 0) === 0;
                
                let saldo = 0;
                if (item.historico && Array.isArray(item.historico)) {
                    item.historico.forEach(t => {
                        if (t.tipo === 'entrada') saldo += parseFloat(t.valor) || 0;
                        else if (t.tipo === 'saida') saldo -= parseFloat(t.valor) || 0;
                    });
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight: bold;">${item.nome}</td>
                    <td><span class="turno-badge" style="background: ${isLivre ? 'rgba(50, 115, 220, 0.2)' : 'rgba(0, 209, 178, 0.2)'}; color: ${isLivre ? 'var(--accent-color)' : 'var(--primary-color)'};">${isLivre ? 'Meta' : 'Revisão'}</span></td>
                    <td>${isLivre ? (item.data_limite ? item.data_limite.split('-').reverse().join('/') : '--') : `${item.km_total} KM`}</td>
                    <td style="font-weight: bold; color: var(--success-color);">${formatCurrency(saldo)} / ${formatCurrency(item.valor)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-desarquivar btn-small" title="Desarquivar (Restaurar)" style="background: rgba(35, 209, 96, 0.2); color: var(--success-color); border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">📂 Desarquivar</button>
                            <button class="btn-excluir-def btn-small btn-delete" title="Excluir Definitivamente" style="background: rgba(255, 56, 96, 0.2); color: var(--danger-color); border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-left: 5px;">🗑️ Excluir</button>
                        </div>
                    </td>
                `;

                tr.querySelector('.btn-desarquivar').onclick = async () => {
                    if (confirm(`Deseja restaurar a caixinha "${item.nome}" para o painel ativo?`)) {
                        showLoader(true, 'Restaurando...');
                        try {
                            await updateDoc(doc(db, "manutencoes", id), { arquivado: false });
                            modal.style.display = 'none';
                            await loadFinancas();
                            checkMaintenanceAlerts();
                        } catch (err) {
                            console.error(err);
                        } finally {
                            showLoader(false);
                        }
                    }
                };

                tr.querySelector('.btn-excluir-def').onclick = async () => {
                    if (confirm(`Deseja EXCLUIR DEFINITIVAMENTE a caixinha "${item.nome}" e todo o seu histórico?\n\nEsta ação NÃO pode ser desfeita!`)) {
                        showLoader(true, 'Excluindo permanentemente...');
                        try {
                            await deleteDoc(doc(db, "manutencoes", id));
                            modal.style.display = 'none';
                            await loadFinancas();
                            checkMaintenanceAlerts();
                        } catch (err) {
                            console.error(err);
                        } finally {
                            showLoader(false);
                        }
                    }
                };

                tbody.appendChild(tr);
            });
        }
        modal.style.display = 'flex';
    } catch (e) {
        console.error("Erro ao carregar arquivados:", e);
        alert("Erro ao buscar arquivados.");
    } finally {
        showLoader(false);
    }
}

async function excluirCaixinhaDireto(id, nome) {
    if (!confirm(`Deseja EXCLUIR DEFINITIVAMENTE a caixinha "${nome}" e todo o seu histórico de depósitos/retiradas?\n\nEsta ação NÃO pode ser desfeita!`)) return;

    showLoader(true, 'Excluindo caixinha...');
    try {
        await deleteDoc(doc(db, "manutencoes", id));
        await loadFinancas();
        checkMaintenanceAlerts();
    } catch (e) {
        console.error("Erro ao excluir caixinha:", e);
        alert("Erro ao excluir caixinha.");
    } finally {
        showLoader(false);
    }
}

async function excluirVeiculoDireto(id, nome) {
    if (!confirm(`Deseja realmente excluir o veículo "${nome}"?\n\nEle será removido das suas opções, mas os registros de abastecimentos anteriores associados a ele não serão apagados.`)) return;

    showLoader(true, 'Excluindo veículo...');
    try {
        if (userConfig.veiculos && Array.isArray(userConfig.veiculos)) {
            userConfig.veiculos = userConfig.veiculos.filter(v => v.id !== id);
            await setDoc(doc(db, "configs", currentUser.uid), userConfig);
            await loadFinancas();
        }
    } catch (e) {
        console.error("Erro ao excluir veículo:", e);
        alert("Erro ao excluir veículo.");
    } finally {
        showLoader(false);
    }
}

async function excluirCartaoDireto(id, nome) {
    if (!confirm(`Deseja realmente excluir o cartão/método "${nome}"?\n\nEle será removido das suas opções, mas as despesas anteriores associadas a ele não serão apagadas.`)) return;

    showLoader(true, 'Excluindo cartão...');
    try {
        if (userConfig.cartoes && Array.isArray(userConfig.cartoes)) {
            userConfig.cartoes = userConfig.cartoes.filter(c => c.id !== id);
            await setDoc(doc(db, "configs", currentUser.uid), userConfig);
            await loadFinancas();
        }
    } catch (e) {
        console.error("Erro ao excluir cartão:", e);
        alert("Erro ao excluir cartão.");
    } finally {
        showLoader(false);
    }
}

