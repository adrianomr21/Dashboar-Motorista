rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Função auxiliar para verificar se o usuário está autenticado
    function isSignedIn() {
      return request.auth != null;
    }

    // Configurações do usuário (o ID do documento é o próprio UID do usuário)
    match /configs/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }

    // Registros de atividades (cada documento possui um campo 'uid')
    match /registros/{docId} {
      allow read, delete: if isSignedIn() && resource.data.uid == request.auth.uid;
      allow create: if isSignedIn() && request.resource.data.uid == request.auth.uid;
      allow update: if isSignedIn() && resource.data.uid == request.auth.uid 
                    && request.resource.data.uid == request.auth.uid;
    }

    // Manutenções (cada documento possui um campo 'uid')
    match /manutencoes/{docId} {
      allow read, delete: if isSignedIn() && resource.data.uid == request.auth.uid;
      allow create: if isSignedIn() && request.resource.data.uid == request.auth.uid;
      allow update: if isSignedIn() && resource.data.uid == request.auth.uid 
                    && request.resource.data.uid == request.auth.uid;
    }

    // Bloqueia qualquer outro acesso por padrão
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
