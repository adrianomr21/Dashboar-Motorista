# Implementação do Sistema de Manutenção e Alertas

Este documento descreve as funcionalidades adicionadas para o controle de despesas variáveis e alertas de manutenção baseados em quilometragem.

## 🚀 Funcionalidades

### 1. Gerenciamento de Despesas Variáveis (Cards)
- **Localização:** Integrado na aba "Configurações".
- **Campos:**
  - **Item:** Identificação da despesa (ex: Troca de Óleo, Pneus).
  - **Km Inicial:** O odômetro do veículo no momento em que o item foi trocado/realizado pela última vez.
  - **Total Km (Intervalo):** A cada quantos quilômetros este item deve ser repetido.
  - **Valor (R$):** O custo para a realização deste item.
- **Ações:** Adicionar, Editar e Excluir cards diretamente nas Configurações.

### 2. Alertas em Tempo Real
- **Gatilho:** Os alertas são verificados automaticamente ao carregar o dashboard.
- **Lógica:**
  - O app utiliza o último KM final registrado no histórico como odômetro atual.
  - Alerta de **vencimento** quando `Odômetro Atual >= (Km Inicial + Intervalo)`.
  - Alerta de **atenção** quando faltam menos de 500km para o vencimento.
- **Exibição:** Lista de alertas no topo da aba "Dashboard".

### 3. Integração Financeira Dinâmica
- O "Gasto Est. Carro" no Dashboard agora é 100% baseado nos cards de Despesas Variáveis.
- O custo por KM é a soma de `(Valor / Intervalo)` de todos os cards cadastrados.
- **Importante:** Se não houver cards cadastrados, o sistema utiliza valores padrão de fallback definidos internamente.

## 🛠️ Detalhes Técnicos

### Banco de Dados (Firestore)
- **Coleção:** `manutencoes`
- **Estrutura do Documento:**
  ```json
  {
    "nome": "Troca de Óleo",
    "km_inicial": 50000,
    "km_total": 10000,
    "valor": 250.00,
    "uid": "ID_DO_USUARIO",
    "updatedAt": "Timestamp"
  }
  ```

### Lógica de Cálculo (utils.js)
A função `calculateVariableKmCosts` agora aceita uma lista opcional de manutenções:
```javascript
export function calculateVariableKmCosts(kmTotal, config, manuts) {
    if (manuts.length > 0) {
        const custoPorKm = manuts.reduce((acc, m) => acc + (m.valor / m.km_total), 0);
        return kmTotal * custoPorKm;
    }
    // Fallback para config padrão...
}
```

## 📅 Histórico de Alterações
- **27/02/2026:** Implementação inicial da aba de manutenções, lógica de alertas e cards editáveis.
