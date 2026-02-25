# Guia de Segurança - Proteção de Credenciais Firebase

Em aplicações Web/PWA, o arquivo `firebaseConfig` fica visível no código-fonte do navegador. Para garantir que seus dados estejam protegidos, você deve seguir estes passos de segurança:

## 1. Restrição de API Key (Essencial)

Embora a chave seja visível, você pode restringir onde ela pode ser usada:

1. Acesse o [Console do Google Cloud](https://console.cloud.google.com/).
2. Selecione seu projeto do Firebase.
3. Vá em **APIs e Serviços > Credenciais**.
4. Localize a "Chave de API" usada pelo seu projeto e clique em **Editar**.
5. Em **Restrições de aplicativos**, selecione **Websites**.
6. Adicione os domínios onde seu app está hospedado (ex: `localhost`, `seu-app.web.app`).
7. Isso impede que alguém use sua chave em outros sites.

## 2. Regras de Segurança do Firestore (Crítico)

A segurança real do Firebase não está em esconder a chave, mas sim em quem pode ler/escrever no banco de dados. Configure estas regras no console do Firebase:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Regras para Configurações: Apenas o dono pode ler/escrever sua config
    match /configs/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Regras para Registros: Apenas o dono pode acessar seus próprios registros
    match /registros/{docId} {
      allow read, update, delete: if request.auth != null && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
    }
  }
}
```

## 3. Uso de Variáveis de Ambiente (Para Desenvolvedores)

Se você decidir automatizar o deploy (via GitHub Actions, Vercel ou Firebase Hosting), não comite as chaves no Git:

1. Crie um arquivo `.env` (não comitar este arquivo).
2. Use um "bundler" (como Vite ou Webpack) para injetar as chaves durante o build.
3. No entanto, para o funcionamento básico deste PWA via CDN, o método da **Restrição de Domínio (Passo 1)** é a solução padrão recomendada pelo Google.

## 4. Ocultação no Repositório Público

Se o seu repositório for público no GitHub:
- Substitua os valores reais em `app.js` por strings vazias ou `process.env.FIREBASE_KEY`.
- Instrua os usuários a preencherem suas próprias chaves ou use segredos do GitHub para o deploy.
