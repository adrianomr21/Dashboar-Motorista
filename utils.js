/**
 * Utilitários e Lógica de Negócio para o DriverDash
 */

// Valores Padrão (Baseados no dados.md do usuário)
export const DEFAULT_CONFIG = {
    mediaKmDia: 110,
    consumoMedio: 10,
    diasTrabalhadosMes: 24,
    lucroAlvo: 19,
    fixoParcela: 1550,
    fixoIpva: 1150 / 12, // Convertido para mensal se o usuário preferir, mas mantendo conforme dados.md
    fixoSeguro: 0,
    fixoManutencao: 300,
    kmRevisao: 10000,
    custoRevisao: 300,
    kmPneu: 60000,
    custoPneu: 1700,
    kmOleo: 10000,
    custoOleo: 230
};

/**
 * Formata um valor numérico para moeda brasileira (BRL)
 */
export function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Retorna o dia da semana para uma determinada data
 */
export function getDayOfWeek(dateVal) {
    if (!dateVal) return '';
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const date = new Date(dateVal + 'T00:00:00');
    return days[date.getDay()];
}

/**
 * Retorna a data atual no formato YYYY-MM-DD para o fuso horário de São Paulo
 */
export function getLocalDate() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    return `${year}-${month}-${day}`;
}

/**
 * Retorna o primeiro dia do mês atual no formato YYYY-MM-DD para o fuso de SP
 */
export function getFirstDayOfMonth() {
    const localDate = getLocalDate();
    return localDate.substring(0, 8) + '01';
}

/**
 * Calcula o KM total rodado
 */
export function calculateKmTotal(kmInicial, kmFinal) {
    const total = kmFinal - kmInicial;
    return total > 0 ? total : 0;
}

/**
 * Calcula o custo de combustível baseado no consumo
 */
export function calculateFuelCost(kmTotal, precoCombustivel, consumoMedio = 10) {
    const litrosEstimados = kmTotal / (consumoMedio || 10);
    return litrosEstimados * precoCombustivel;
}

/**
 * Calcula os custos variáveis por KM baseado na lista de manutenções ou valores padrão.
 */
export function calculateVariableKmCosts(kmTotal, config = DEFAULT_CONFIG, manuts = []) {
    let custoPorKm = 0;
    
    if (manuts && manuts.length > 0) {
        // Se houver manutenções cadastradas, usa elas para calcular o custo por KM
        custoPorKm = manuts.reduce((acc, m) => {
            const mKm = parseFloat(m.km_total) || 0;
            const mValor = parseFloat(m.valor) || 0;
            return acc + (mKm > 0 ? (mValor / mKm) : 0);
        }, 0);
    } else {
        // Caso contrário, usa os valores padrão das configurações fixas
        const custoRevisaoKm = config.custoRevisao / config.kmRevisao;
        const custoPneuKm = config.custoPneu / config.kmPneu;
        const custoOleoKm = config.custoOleo / config.kmOleo;
        custoPorKm = (custoRevisaoKm || 0) + (custoPneuKm || 0) + (custoOleoKm || 0);
    }

    return kmTotal * custoPorKm;
}

/**
 * Retorna a hora atual no formato HH:MM (Fuso SP)
 */
export function getCurrentTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return formatter.format(now);
}

/**
 * Calcula a diferença entre duas strings de tempo (HH:MM)
 * Retorna { decimal, formatted }
 */
export function calculateTimeDiff(start, end) {
    if (!start || !end) return { decimal: 0, formatted: "0:00" };
    
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    
    let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    
    // Tratar virada de dia (ex: 22:00 até 02:00)
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    
    return {
        decimal: diffMinutes / 60,
        formatted: `${hours}:${mins.toString().padStart(2, '0')}`
    };
}

/**
 * Formata horas decimais (ex: 2.5) para string HH:MM
 */
export function formatDecimalHours(decimalHours) {
    if (!decimalHours || decimalHours <= 0) return "0:00";
    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calcula as métricas totais para o dashboard
 */
export function calculateDashboardMetrics(data, config = DEFAULT_CONFIG, manuts = []) {
    const totals = data.reduce((acc, curr) => {
        acc.ganhos += curr.dinheiro;
        
        const kmRodado = curr.km_total || 0;
        const precoComb = curr.preco_combustivel || 0;
        
        acc.combustivel += calculateFuelCost(kmRodado, precoComb, config.consumoMedio);
        acc.km += kmRodado;
        acc.horas += curr.horas || 0;
        acc.dias.add(curr.data);
        return acc;
    }, { ganhos: 0, combustivel: 0, km: 0, horas: 0, dias: new Set() });

    // Custos Fixos Totais (Mensais)
    const custosFixosMensais = (config.fixoParcela || 0) + 
                               (config.fixoIpva || 0) + 
                               (config.fixoSeguro || 0) + 
                               (config.fixoManutencao || 0);

    // Custos Variáveis por KM acumulado no período
    const custosVariaveisKm = calculateVariableKmCosts(totals.km, config, manuts);

    const lucroReal = totals.ganhos - totals.combustivel - custosVariaveisKm;
    const restante = lucroReal - custosFixosMensais;
    const mediaRK = totals.km > 0 ? totals.ganhos / totals.km : 0;

    return {
        ...totals,
        custosFixosMensais,
        custosVariaveisKm,
        lucroReal,
        restante,
        mediaRK,
        totalDias: totals.dias.size
    };
}
