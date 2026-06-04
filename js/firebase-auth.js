/* ================================================
   firebase-auth.js
   Módulo de integração REAL com Firebase Auth
   ================================================ */
// 1. Importamos as ferramentas do Google (direto da nuvem)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 2. COLE AQUI AS SUAS CHAVES DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDusDV1kmPIB6NomSDGdZ5HFDdcn3iVLSc",
  authDomain: "juris-notes.firebaseapp.com",
  projectId: "juris-notes",
  storageBucket: "juris-notes.firebasestorage.app",
  messagingSenderId: "60876452493",
  appId: "1:60876452493:web:4cffa6d226823aea0ee8c4",
  measurementId: "G-4W0B7832FN"
};

// 3. Inicializamos o Firebase com as suas chaves
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 4. O nosso módulo que conversa com a interface (HTML)
window.FirebaseAuth = (function() {
    'use strict';

    function init() {
        const senhaInput = document.getElementById('login-senha');
        if (senhaInput) {
            senhaInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') realizarLogin();
            });
        }
    }

    function realizarLogin() {
        const email = document.getElementById('login-email').value.trim();
        const senha = document.getElementById('login-senha').value;
        
        if (!email || !senha) {
            if (window.exibirToast) exibirToast('Preencha e-mail e senha.', 'aviso');
            return;
        }

        // ==========================================
        // CONEXÃO REAL COM O BANCO DE DADOS AQUI
        // ==========================================
        signInWithEmailAndPassword(auth, email, senha)
            .then((userCredential) => {
                // SUCESSO: O Google validou a senha!
                const user = userCredential.user;
                console.log(`[Firebase] Conectado com sucesso: ${user.email}`);
                
                // Muda a cor do botão para verde-limão
                const btn = document.getElementById('btn-login-user');
                if (btn) {
                    btn.classList.add('is-logged-in');
                    btn.title = `Conectado como: ${user.email}`;
                }
                
                document.getElementById('login-menu').style.display = 'none';
                document.getElementById('login-senha').value = ''; // Limpa a senha
                
                if (window.exibirToast) exibirToast('Conectado à nuvem com sucesso!', 'sucesso');
            })
            .catch((error) => {
                // ERRO: Senha errada ou usuário não existe
                console.error("[Firebase Erro]", error.code, error.message);
                
                if (error.code === 'auth/invalid-credential') {
                    if (window.exibirToast) exibirToast('E-mail ou senha incorretos.', 'erro');
                } else {
                    if (window.exibirToast) exibirToast('Erro ao tentar conectar.', 'erro');
                }
            });
    }

    return { init, realizarLogin };
})();

document.addEventListener("DOMContentLoaded", () => {
    FirebaseAuth.init();
});
