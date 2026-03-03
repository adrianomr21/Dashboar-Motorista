import { describe, it, expect } from 'vitest';
import { 
    formatCurrency, 
    getDayOfWeek, 
    calculateKmTotal, 
    calculateFuelCost, 
    calculateDashboardMetrics,
    DEFAULT_CONFIG,
    getLocalDate,
    getFirstDayOfMonth
} from './utils';

describe('Utils - Formatação e Datas', () => {
    it('deve formatar moeda corretamente para BRL', () => {
        const result = formatCurrency(1250.5);
        expect(result).toContain('R$');
        expect(result).toContain('1.250,50');
    });

    it('deve retornar o dia da semana correto', () => {
        expect(getDayOfWeek('2024-03-04')).toBe('Segunda');
        expect(getDayOfWeek('2024-03-03')).toBe('Domingo');
        expect(getDayOfWeek('')).toBe('');
    });

    it('deve retornar a data no formato YYYY-MM-DD', () => {
        const result = getLocalDate();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('deve retornar o primeiro dia do mês no formato YYYY-MM-DD', () => {
        const result = getFirstDayOfMonth();
        expect(result).toMatch(/^\d{4}-\d{2}-01$/);
    });
});

describe('Utils - Cálculos de KM e Combustível', () => {
    it('deve calcular KM total corretamente', () => {
        expect(calculateKmTotal(100, 150)).toBe(50);
        expect(calculateKmTotal(200, 200)).toBe(0);
        expect(calculateKmTotal(300, 200)).toBe(0);
    });

    it('deve calcular custo de combustível corretamente', () => {
        expect(calculateFuelCost(100, 5, 10)).toBe(50);
        expect(calculateFuelCost(50, 6, 10)).toBe(30);
    });
});

describe('Utils - Despesas Variáveis e Manutenção', () => {
    const testConfig = { ...DEFAULT_CONFIG, kmRevisao: 10000, custoRevisao: 200, kmPneu: 20000, custoPneu: 400, kmOleo: 5000, custoOleo: 100 };
    
    it('deve usar valores padrão quando não há lista de manutenções', () => {
        const kmTotal = 1000;
        // Custo por KM padrão: (200/10000) + (400/20000) + (100/5000) = 0.02 + 0.02 + 0.02 = 0.06
        // 1000 * 0.06 = 60
        const result = calculateDashboardMetrics([{ km_total: 1000, dinheiro: 500, preco_combustivel: 0 }], testConfig);
        expect(result.custosVariaveisKm).toBeCloseTo(60);
    });

    it('deve calcular custo dinâmico baseado nos cards de manutenção', () => {
        const manuts = [
            { nome: 'Óleo', km_total: 10000, valor: 300 }, // 0.03 por KM
            { nome: 'Pneu', km_total: 50000, valor: 1000 }  // 0.02 por KM
        ];
        // Total: 0.05 por KM. Para 1000km = 50.
        const metrics = calculateDashboardMetrics([{ km_total: 1000, dinheiro: 500, preco_combustivel: 0 }], testConfig, manuts);
        expect(metrics.custosVariaveisKm).toBe(50);
    });
});

describe('Utils - Métricas do Dashboard', () => {
    const mockData = [
        {
            data: '2024-03-01',
            km_total: 100,
            dinheiro: 300,
            horas: 8,
            preco_combustivel: 5
        }
    ];

    const testConfig = {
        ...DEFAULT_CONFIG,
        consumoMedio: 10,
        fixoParcela: 1000,
        fixoIpva: 0,
        fixoSeguro: 0,
        fixoManutencao: 0,
        kmRevisao: 10000,
        custoRevisao: 0,
        kmPneu: 60000,
        custoPneu: 0,
        kmOleo: 10000,
        custoOleo: 0
    };

    it('deve calcular métricas totais com config personalizada', () => {
        const metrics = calculateDashboardMetrics(mockData, testConfig);

        expect(metrics.ganhos).toBe(300);
        expect(metrics.km).toBe(100);
        
        // Combustível: (100/10)*5 = 50
        expect(metrics.combustivel).toBe(50);

        // Lucro Real: 300 - 50 - 0 (variáveis) = 250
        expect(metrics.lucroReal).toBe(250);

        // Restante: 250 - 1000 = -750
        expect(metrics.restante).toBe(-750);
    });

    it('deve lidar com lista vazia', () => {
        const metrics = calculateDashboardMetrics([], testConfig);
        expect(metrics.ganhos).toBe(0);
        expect(metrics.km).toBe(0);
        expect(metrics.restante).toBe(-1000);
    });
});
