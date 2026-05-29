# Dashboard PWA Motorista (DriverDash)

Um Progressive Web App (PWA) projetado para motoristas de aplicativo monitorarem seus ganhos, quilometragem e despesas operacionais em tempo real, com sincronização em nuvem via Firebase.

## 🚀 Funcionalidades Principal

### 1. Cadastro de Atividades
- Registro detalhado de turnos: Data, KM Inicial/Final, Ganhos (R$), Horas Trabalhadas.
- Contexto da jornada: Dia da semana (auto-calculado), Turno, Movimentação, Perfil de Passageiro, Aplicativo utilizado, Trânsito.
- Controle de custos: Preço do combustível no dia.
- Observações gerais.
- **Cache Local:** Salva o rascunho do formulário automaticamente (incluindo horários de início/fim).
- **Reset Inteligente:** Limpa campos de ganhos e horários após o salvamento para novos registros.
- **Gestão de Gastos:** Registro avulso de Acessórios, Manutenção, Revisão e Outros.

### 2. Dashboard de Performance
- **Indicadores Financeiros:** Total Arrecadado, Posto de Combustível (Real), Valor Restante, Lucro Real, Gasto Estimado Combustível, Gasto Estimado Carro.
- **Métricas de Eficiência:** Média de R$ por KM rodado.
- **Rankings:** Top 3 Dias mais lucrativos e Dia com maior eficiência (R$/km) por turno.
- **Estatísticas de Trabalho:** Total de Horas e Dias trabalhados no período.
- **Filtros Temporais:** Consulta por intervalo de datas.

### 3. Feedback Imediato (Resumo Pós-Registro)
- **Modal de Sucesso:** Exibição automática de um resumo profissional após cada salvamento.
- **Métricas Chave:** Lucro Líquido (detalhando Ganhos, Combustível e Desgaste), Valor por KM e Valor por Hora.
- **Contexto Rápido:** Visualização imediata da distância percorrida e tempo trabalhado.

### 3. Visualização de Dados (Gráficos)
- Evolução de Ganhos diários.
- Comparativo entre Combustível, Custo Carro e Lucro Real.
- Histórico de KM Rodados.

### 4. Histórico de Registros
- Tabela detalhada com R$/km por turno e lucro calculado.

### 5. Capacidades PWA
- **Funcionamento Offline:** Utiliza Service Worker para cachear assets essenciais.
- **Instalável:** Configurado com manifest para exibição em modo `standalone`.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+).
- **Gráficos:** [Chart.js](https://www.chart.js.org/).
- **Backend/Database:** [Firebase Firestore](https://firebase.google.com/products/firestore).
- **PWA:** Service Workers e Web App Manifest.

### 6. Design & UI
- **Paleta de Cores:** Fundo escuro (`#121212`) com acentos em Verde Turquesa (`#00d1b2`) para ações primárias e Azul (`#3273dc`) para métricas.
- **Responsividade:** Layout adaptável para dispositivos móveis, utilizando Grid e Flexbox.

## 📋 Regras de Negócio Implementadas

- **Cálculo de KM:** Automático: `km_total = km_final - km_inicial`.
- **Custo Combustível:** Estimativa baseada em consumo médio configurável (padrão 10km/L).
- **Eficiência:** Calculada como `Ganhos Brutos / KM Total`.
- **Valor Restante:** `Arrecadado - Gasto Combustível Est. - Gasto Carro Est.`.

