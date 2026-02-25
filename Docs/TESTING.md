# Guia de Testes Unitários - DriverDash

Este documento descreve como executar e manter os testes unitários do sistema.

## 🛠️ Pré-requisitos

Para rodar os testes, você precisa ter o **Node.js** instalado em sua máquina.

## 🚀 Como Executar os Testes

1.  **Instalação de Dependências:**
    Se você acabou de clonar o projeto ou ainda não instalou as ferramentas de teste, execute:
    ```bash
    npm install
    ```

2.  **Executar os Testes (Modo Único):**
    Para rodar todos os testes uma única vez:
    ```bash
    npm test
    ```

3.  **Executar os Testes (Modo Watch/Desenvolvimento):**
    Para manter o testador aberto e rodar automaticamente a cada alteração nos arquivos:
    ```bash
    npx vitest
    ```

## 📁 Estrutura de Arquivos

-   `utils.js`: Contém toda a lógica de negócio pura (cálculos, formatações, manipulação de datas). **Este é o arquivo alvo dos testes.**
-   `utils.test.js`: Contém as suítes de teste escritas em Vitest.

## 🧪 O que está sendo testado?

Atualmente, cobrimos:
-   **Formatação:** Verificação da máscara de moeda BRL.
-   **Datas:** Cálculo correto do dia da semana a partir de strings ISO.
-   **KM:** Lógica de cálculo de distância percorrida (incluindo tratamento de erros).
-   **Combustível:** Cálculo de custo baseado no consumo médio de 10km/L.
-   **Dashboard:** Agregação de múltiplos registros e cálculo de lucro real e média por KM.

## ✍️ Adicionando Novos Testes

Sempre que adicionar uma nova função de cálculo ou utilitário em `utils.js`, lembre-se de adicionar um caso de teste correspondente em `utils.test.js` para garantir que a lógica permaneça íntegra durante futuras manutenções.
