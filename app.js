// Configurações de Custos Fixos
const PRESTACAO = 1200;
const IPVA = 300;
const MANUTENCAO = 500;
const CUSTO_FIXO_TOTAL = PRESTACAO + IPVA + MANUTENCAO;

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT0OvCx4V3eVUBT3-NHHGWAt7lL5k5QZ6-_DkILAsac_KQQklrRmeY4axO4wIgktlLo3m9wE9r2t0bQ/pub?gid=1216018905&single=true&output=csv';

let rawData = [];
let charts = {};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    registerServiceWorker();
    setupPWAInstall();
});

async function initApp() {
    setupDateFilters();
    await fetchData();
    
    document.getElementById('updateBtn').addEventListener('click', updateDashboard);
}

function setupDateFilters() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('startDate').value = firstDayOfMonth.toISOString().split('T')[0];
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
}

async function fetchData() {
    showLoader(true);
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('Falha ao buscar dados');
        
        const text = await response.text();
        rawData = parseCSV(text);
        updateDashboard();
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar dados do Google Sheets. Verifique a conexão.');
    } finally {
        showLoader(false);
    }
}

function parseCSV(text) {
    const lines = text.split('');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Mapeamento flexível de colunas
    const map = {
        data: headers.findIndex(h => h.includes('data')),
        ganhos: headers.findIndex(h => h.includes('ganho') || h.includes('arrecad')),
        combustivel: headers.findIndex(h => h.includes('combust') || h.includes('gaso')),
        km: headers.findIndex(h => h.includes('km')),
        horas: headers.findIndex(h => h.includes('hora'))
    };

    return lines.slice(1).map(line => {
        const cols = line.split(',');
        if (cols.length < 2) return null;
        
        return {
            data: parseDate(cols[map.data]),
            ganhos: parseFloat(cols[map.ganhos]) || 0,
            combustivel: parseFloat(cols[map.combustivel]) || 0,
            km: parseFloat(cols[map.km]) || 0,
            horas: parseFloat(cols[map.horas]) || 0
        };
    }).filter(item => item !== null && !isNaN(item.data.getTime()));
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(NaN);
    // Tenta formato DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date(dateStr);
}

function updateDashboard() {
    const start = new Date(document.getElementById('startDate').value);
    const end = new Date(document.getElementById('endDate').value);
    end.setHours(23, 59, 59);

    const filtered = rawData.filter(d => d.data >= start && d.data <= end);
    
    calculateMetrics(filtered);
    renderCharts(filtered);
}

function calculateMetrics(data) {
    const totals = data.reduce((acc, curr) => {
        acc.ganhos += curr.ganhos;
        acc.combustivel += curr.combustivel;
        acc.km += curr.km;
        acc.horas += curr.horas;
        acc.dias.add(curr.data.toDateString());
        return acc;
    }, { ganhos: 0, combustivel: 0, km: 0, horas: 0, dias: new Set() });

    const lucroReal = totals.ganhos - totals.combustivel;
    const restante = lucroReal - CUSTO_FIXO_TOTAL;
    const custoMedioKM = totals.km > 0 ? totals.combustivel / totals.km : 0;

    // Atualizar UI
    document.getElementById('totalArrecadado').textContent = formatCurrency(totals.ganhos);
    document.getElementById('totalCombustivel').textContent = formatCurrency(totals.combustivel);
    document.getElementById('totalKM').textContent = `${totals.km.toFixed(1)} km`;
    document.getElementById('totalRestante').textContent = formatCurrency(restante);
    document.getElementById('custoMedioKM').textContent = formatCurrency(custoMedioKM);
    document.getElementById('lucroReal').textContent = formatCurrency(lucroReal);
    document.getElementById('totalHoras').textContent = `${totals.horas.toFixed(1)}h`;
    document.getElementById('totalDias').textContent = totals.dias.size;

    updateStatusChecks(lucroReal);
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
    // Agrupar por dia para os gráficos
    const dailyData = data.reduce((acc, curr) => {
        const day = curr.data.toLocaleDateString('pt-BR');
        if (!acc[day]) acc[day] = { ganhos: 0, combustivel: 0, km: 0 };
        acc[day].ganhos += curr.ganhos;
        acc[day].combustivel += curr.combustivel;
        acc[day].km += curr.km;
        return acc;
    }, {});

    const labels = Object.keys(dailyData);
    const ganhos = labels.map(l => dailyData[l].ganhos);
    const combustivel = labels.map(l => dailyData[l].combustivel);
    const lucro = labels.map(l => dailyData[l].ganhos - dailyData[l].combustivel);
    const km = labels.map(l => dailyData[l].km);

    // Gráfico de Ganhos
    createChart('ganhosChart', 'line', labels, [{
        label: 'Ganhos (R$)',
        data: ganhos,
        borderColor: '#00d1b2',
        backgroundColor: 'rgba(0, 209, 178, 0.1)',
        fill: true
    }]);

    // Gráfico Combustível vs Lucro
    createChart('combustivelLucroChart', 'bar', labels, [
        { label: 'Combustível (R$)', data: combustivel, backgroundColor: '#ff3860' },
        { label: 'Lucro (R$)', data: lucro, backgroundColor: '#23d160' }
    ]);

    // Gráfico KM
    createChart('kmChart', 'line', labels, [{
        label: 'KM Rodados',
        data: km,
        borderColor: '#3273dc',
        tension: 0.4
    }]);
}

function createChart(id, type, labels, datasets) {
    if (charts[id]) charts[id].destroy();
    
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: type,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' } }
            },
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

function showLoader(show) {
    document.getElementById('loader').style.display = show ? 'flex' : 'none';
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
                if (choiceResult.outcome === 'accepted') {
                    console.log('Usuário aceitou a instalação');
                }
                deferredPrompt = null;
                installBtn.style.display = 'none';
            });
        }
    });
}
