# 🚀 DASHBOARD PWA MOTORISTA

Crie um sistema completo de Dashboard PWA em HTML, CSS e JavaScript puro (sem backend), pronto para ser hospedado no GitHub Pages.

Fonte de dados (Google Sheets CSV público):
https://docs.google.com/spreadsheets/d/e/2PACX-1vT0OvCx4V3eVUBT3-NHHGWAt7lL5k5QZ6-_DkILAsac_KQQklrRmeY4axO4wIgktlLo3m9wE9r2t0bQ/pub?gid=1216018905&single=true&output=csv

O sistema deve funcionar 100% no frontend e se comportar como um aplicativo instalável (PWA).

---

### 🎯 OBJETIVO

Criar um Dashboard Financeiro para motorista de aplicativo com:

* Filtro por período (data início e fim)
* Indicadores financeiros automáticos
* Gráficos interativos
* Verificação automática de viabilidade financeira
* Instalação como app no celular

---

# 📁 Estrutura obrigatória

Gerar os seguintes arquivos separados:

* index.html
* style.css
* app.js
* manifest.json
* service-worker.js

Código organizado, modularizado e comentado.

---

# 📅 FILTRO POR PERÍODO

* Campo data início
* Campo data fim
* Botão "Atualizar"
* Ao alterar período → recalcular tudo

---

# 📊 INDICADORES OBRIGATÓRIOS (CARDS)

Calcular dinamicamente:

* 💰 Total arrecadado
* ⛽ Total gasto combustível
* 🚗 Total KM rodados
* 💵 Dinheiro restante
* 📊 Custo médio por KM
* 📈 Lucro real
* ⏱ Total de horas trabalhadas
* 📅 Total de dias trabalhados

---

# 🧠 REGRAS DE NEGÓCIO

O sistema deve:

* Somar apenas registros dentro do período escolhido
* Calcular lucro = arrecadação - combustível - demais custos
* Calcular custo médio por km = combustível / km
* Contar dias únicos trabalhados
* Somar horas totais

---

# 🚨 VERIFICAÇÕES INTELIGENTES

Criar status visual (verde/vermelho) para:

* Pagou combustível?
* Pagou manutenção?
* Pagou prestação?
* Pagou IPVA?

Critério:
Se lucro ≥ custos fixos definidos → mostrar "Pago"
Se não → mostrar "Não Pago"

Permitir definir valores fixos no topo do código:

const PRESTACAO = 1200
const IPVA = 300
const MANUTENCAO = 500

---

# 📈 GRÁFICOS (Chart.js CDN)

Criar:

1. Linha → Ganhos por dia
2. Barras → Combustível vs Lucro
3. Linha → KM por dia

Responsivos.

---

# 📱 PWA OBRIGATÓRIO

Implementar:

manifest.json com:

* name
* short_name
* theme_color
* background_color
* display: standalone
* ícones 192x192 e 512x512

service-worker.js com:

* cache de arquivos estáticos
* cache-first strategy
* funcionamento offline após primeiro acesso

Registrar service worker no index.html.

Implementar botão "Instalar App" usando beforeinstallprompt.

---

# 🎨 DESIGN

* Layout estilo dashboard moderno
* Cards com sombra suave
* Responsivo mobile-first
* Visual profissional
* Tema escuro elegante

---

# 🔒 SEGURANÇA

* Tratar erro caso CSV falhe
* Validar valores numéricos
* Ignorar linhas inválidas
* Não usar bibliotecas pesadas

---

# 📦 ENTREGA FINAL

Entregar:

* Todos os arquivos completos
* Prontos para subir no GitHub
* Com instruções finais de publicação no GitHub Pages

