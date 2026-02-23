import { describe, it, expect } from 'vitest';
import { 
    formatCurrency, 
    getDayOfWeek, 
    calculateKmTotal, 
    calculateFuelCost, 
    calculateDashboardMetrics,
    DEFAULT_CONFIG
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
