# Dashboard PWA Motorista (DriverDash)

Um Progressive Web App (PWA) projetado para motoristas de aplicativo monitorarem seus ganhos, quilometragem e despesas operacionais em tempo real, com sincronização em nuvem via Firebase.

## 🚀 Funcionalidades Principal

### 1. Cadastro de Atividades
- Registro detalhado de turnos: Data, KM Inicial/Final, Ganhos (R$), Horas Trabalhadas.
- Contexto da jornada: Dia da semana (auto-calculado), Turno, Movimentação, Perfil de Passageiro, Aplicativo utilizado, Trânsito.
- Controle de custos: Preço do combustível no dia.
- Observações gerais.
- **Cache Local:** Salva o rascunho do formulário automaticamente para evitar perda de dados antes do envio.

### 2. Dashboard de Performance
- **Indicadores Financeiros:** Total Arrecadado, Gasto Estimado (baseado em consumo médio de 10km/L), Lucro Real, Valor Restante após custos fixos.
- **Métricas de Eficiência:** Média de R$ por KM rodado.
- **Estatísticas de Trabalho:** Total de Horas e Dias trabalhados no período selecionado.
- **Filtros Temporais:** Consulta por intervalo de datas.

### 3. Visualização de Dados (Gráficos)
- Evolução de Ganhos diários.
- Comparativo entre Combustível vs Lucro Estimado.
- Histórico de KM Rodados.

### 4. Gestão de Custos Fixos
- Monitoramento de metas para pagamento de custos recorrentes:
    - Prestação: R$ 1.200,00
    - IPVA: R$ 300,00
    - Manutenção: R$ 500,00

### 5. Capacidades PWA
- **Funcionamento Offline:** Utiliza Service Worker para cachear assets essenciais (HTML, CSS, JS, Manifest e Chart.js).
- **Instalável:** Configurado com manifest para exibição em modo `standalone` com tema escuro.
- **Estratégia de Cache:** Cache-first para recursos estáticos, garantindo carregamento rápido mesmo com conexão instável.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+).
- **Gráficos:** [Chart.js](https://www.chart.js.org/).
- **Backend/Database:** [Firebase Firestore](https://firebase.google.com/products/firestore).
- **PWA:** Service Workers e Web App Manifest.
- **Ícones:** Icons8.

### 6. Design & UI
- **Paleta de Cores:** Fundo escuro (`#121212`) com acentos em Verde Turquesa (`#00d1b2`) para ações primárias e Azul (`#3273dc`) para métricas.
- **Responsividade:** Layout adaptável para dispositivos móveis, utilizando Grid e Flexbox.
- **Componentes:** Sistema de cards para indicadores e gráficos, badges coloridos para status.

## 📁 Estrutura do Projeto

```text
.
├── app.js               # Lógica principal, integração Firebase e Charts
├── index.html           # Estrutura da UI (Cadastro e Dashboard)
├── style.css            # Estilização (Dark Theme e Layout Responsivo)
├── manifest.json        # Configurações de instalação PWA
├── service-worker.js    # Estratégia de cache e funcionamento offline
└── package.json         # Dependências do projeto
```

## ⚙️ Configuração e Instalação

### Pré-requisitos
- Node.js (opcional, para servidor local).
- Conta no Firebase para o banco de dados.

### Inicialização Rápida
1. Clone o repositório.
2. O projeto utiliza CDN para as principais bibliotecas, então não é necessário `npm install` para funcionamento básico (exceto se for rodar ferramentas de desenvolvimento).
3. Abra o `index.html` em um servidor local (ex: Live Server do VS Code).

### Configuração do Firebase
As credenciais atuais estão no `app.js`. Para usar seu próprio banco:
1. Crie um projeto no Console do Firebase.
2. Ative o Firestore Database.
3. Substitua a `const firebaseConfig` no topo do `app.js` com as suas credenciais.

## 📋 Regras de Negócio Implementadas

- **Cálculo de KM:** O sistema calcula automaticamente `km_total = km_final - km_inicial`.
- **Custo Combustível:** Estimativa baseada em um consumo fixo de **10km/L**. O cálculo é: `(km_total / 10) * preco_combustivel_do_dia`.
- **Status de Pagamento:** Os badges no dashboard mudam para "Pago" (verde) assim que o Lucro Real atinge o valor individual de cada custo fixo definido.

## 🤖 Diretrizes do Gemini

- **Idioma:** Sempre responder em Português do Brasil (pt-BR).
- **Testes:** Priorizar a manutenção da cobertura de testes unitários ao modificar a lógica em `utils.js`.
