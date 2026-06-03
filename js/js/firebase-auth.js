/* ================================================
   firebase-auth.js
   Módulo de integração futura com Firebase Auth
   ================================================ */
window.FirebaseAuth = (function() {
    'use strict';

    function init() {
        // Suporte a tecla Enter no campo de senha
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

        // [FUTURO]: signInWithEmailAndPassword(auth, email, senha)
        console.log(`[Firebase Auth - Stub] 🚀 Autenticação iniciada para: ${email}`);
        
        // Manipulação de Estado Visual
        const btn = document.getElementById('btn-login-user');
        if (btn) {
            btn.classList.add('is-logged-in');
            btn.title = `Conectado como: ${email}`;
        }
        
        document.getElementById('login-menu').style.display = 'none';
        
        // Limpa a senha por segurança
        document.getElementById('login-senha').value = '';
        
        if (window.exibirToast) exibirToast('Conectado à nuvem com sucesso!', 'sucesso');
    }

    return { init, realizarLogin };
})();

// Inicializa os listeners quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
    FirebaseAuth.init();
});
