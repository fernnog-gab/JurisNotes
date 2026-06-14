/* ================================================
   ai_balanca-manager.js
   Módulo de Integração Segura de Painéis HTML Externos (AI)
   ================================================ */
window.BalancaManager = (function() {
    'use strict';
    
    let htmlState = null;
    let pendingTasksCount = 0;

    // ATUALIZAÇÃO: Atalho Alt + B protegido e inteligente
    document.addEventListener('keydown', function(e) {
        if (e.altKey && (e.key === 'b' || e.key === 'B')) {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const isTyping = activeTag === 'input' || activeTag === 'textarea' || document.activeElement.isContentEditable;
            
            if (!isTyping) {
                e.preventDefault();
                htmlState ? abrirPainel() : resetToGenerator();
            }
        }
    });

    // NOVO: Validação estrita de segurança e listener de mensagens
    window.addEventListener('message', function(event) {
        const allowedOrigins = [window.location.origin, 'http://localhost', 'http://127.0.0.1'];
        if (!allowedOrigins.some(origin => event.origin.startsWith(origin))) return;

        if (event.data && event.data.type === 'DOSSIE_GENERATED') {
            htmlState = event.data.html;
            
            const iframe = document.getElementById('balanca-iframe');
            iframe.removeAttribute('src'); 
            iframe.srcdoc = htmlState;     

            atualizarInterface();
            
            if (typeof window.salvarBackupAutomatico === 'function') {
                window.salvarBackupAutomatico();
            }
            if (typeof window.exibirToast === 'function') {
                window.exibirToast('Dossiê vinculado com sucesso!', 'sucesso');
            }
        }
    });

    function abrirPainel() {
        document.getElementById('balanca-modal-backdrop').style.display = 'block';
        document.getElementById('balanca-painel').style.display = 'flex';

        const iframe = document.getElementById('balanca-iframe');
        if (htmlState) {
            iframe.removeAttribute('src');
            iframe.srcdoc = htmlState;
        } else {
            iframe.removeAttribute('srcdoc');
            iframe.src = '../dossie/index.html'; // Puxa o gerador da raiz
        }
    }

    // NOVO: Função protegida contra perda de dados
    function resetToGenerator() {
        if (htmlState !== null) {
            const confirmacao = confirm("⚠️ Atenção:\n\nIsso substituirá o Dossiê atual. Se você fez marcações de checkbox que não foram salvas no backup principal, elas serão perdidas.\n\nDeseja gerar um novo dossiê?");
            if (!confirmacao) return;
        }
        
        htmlState = null;
        pendingTasksCount = 0;
        const iframe = document.getElementById('balanca-iframe');
        if (iframe) {
            iframe.removeAttribute('srcdoc');
            iframe.src = '../dossie/index.html';
        }
        abrirPainel();
        atualizarInterface();
    }

    // ==========================================
    // MOTOR DE LEITURA DE TAREFAS PRECISO
    // ==========================================
    function avaliarTarefasPendentes() {
        let count = 0;
        const iframe = document.getElementById('balanca-iframe');

        // TENTATIVA 1: Ler do Iframe AO VIVO (Garante dados frescos se o painel estiver aberto na hora da exportação)
        if (iframe && iframe.contentDocument) {
            try {
                const doc = iframe.contentDocument;
                const obsList = doc.getElementById('obs-list'); // Lê exatamente do HTML importado
                if (obsList) {
                    // Conta os checkboxes de tarefas que NÃO estão checados
                    const tarefasAbertas = obsList.querySelectorAll('.chk-input:not(:checked)');
                    count = tarefasAbertas.length;
                    return count;
                }
            } catch (e) {
                // Silencia erros de CORS temporários
            }
        }

        // TENTATIVA 2: Fallback para a string salva via DOMParser (Caso o painel esteja fechado)
        if (htmlState) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlState, 'text/html');
                const obsList = doc.getElementById('obs-list');
                if (obsList) {
                    const tarefasAbertas = obsList.querySelectorAll('.chk-input:not(:checked)');
                    count = tarefasAbertas.length;
                }
            } catch (e) {
                console.warn("[Juris Notes AI] Erro ao analisar tarefas do HTML salvo.", e);
            }
        }

        return count;
    }

    // ==========================================
    // ATUALIZAÇÃO VISUAL CENTRALIZADA
    // ==========================================
    function atualizarInterface() {
        const btnBalanca = document.getElementById('btn-balanca-justica');
        const btnLembrete = document.getElementById('btn-lembretes-tarefa');
        const badge = document.getElementById('badge-tarefas');
        
        if (!btnBalanca || !btnLembrete) return;

        // Regra 1: O ícone da balança só fica carregado (Fúcsia no ED) se houver HTML
        if (htmlState) {
            btnBalanca.classList.add('is-loaded');
            btnLembrete.disabled = false;
        } else {
            btnBalanca.classList.remove('is-loaded');
            btnLembrete.disabled = true;
        }

        // Regra 2: Computa e pinta as tarefas (Amarelo Semântico de Alerta)
        pendingTasksCount = avaliarTarefasPendentes();

        if (pendingTasksCount > 0) {
            btnLembrete.classList.add('has-tasks');
            if (badge) {
                badge.style.display = 'flex';
                badge.textContent = pendingTasksCount > 99 ? '99+' : pendingTasksCount;
            }
        } else {
            btnLembrete.classList.remove('has-tasks');
            if (badge) badge.style.display = 'none';
        }
    }

    function fecharPainel() {
        sincronizarEstadoInterno(); 
        atualizarInterface(); // Atualiza a bolinha vermelha ao fechar o painel
        
        document.getElementById('balanca-modal-backdrop').style.display = 'none';
        document.getElementById('balanca-painel').style.display = 'none';
        
        if (typeof window.salvarBackupAutomatico === 'function') {
            window.salvarBackupAutomatico();
        }
    }

    function processarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            htmlState = e.target.result;
            renderizarIframe(htmlState);
            atualizarInterface(); // Atualiza UI ao carregar
            
            if (typeof window.exibirToast === 'function') {
                window.exibirToast('Painel HTML importado e ancorado com sucesso!', 'sucesso');
            }
            abrirPainel(); 
        };
        reader.readAsText(file);
        event.target.value = ''; 
    }

    function renderizarIframe(conteudoHTML) {
        const iframe = document.getElementById('balanca-iframe');
        if (iframe) iframe.srcdoc = conteudoHTML;
    }

    function sincronizarEstadoInterno() {
        const iframe = document.getElementById('balanca-iframe');
        if (!iframe || !htmlState) return;

        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            
            doc.querySelectorAll('textarea').forEach(el => el.textContent = el.value);
            doc.querySelectorAll('input[type="text"], input[type="number"], input[type="hidden"]').forEach(el => el.setAttribute('value', el.value));
            
            // Tratamento Crítico de Checkboxes (Onde ficam as tarefas)
            doc.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(el => {
                if (el.checked) el.setAttribute('checked', 'checked');
                else el.removeAttribute('checked');
            });

            doc.querySelectorAll('select').forEach(select => {
                Array.from(select.options).forEach(opt => {
                    if (opt.selected) opt.setAttribute('selected', 'selected');
                    else opt.removeAttribute('selected');
                });
            });

            htmlState = doc.documentElement.outerHTML;

        } catch (e) {
            console.error("[Juris Notes AI] Sincronização do painel falhou.", e);
        }
    }

    function getHtmlState() {
        return htmlState;
    }

    function restoreHtmlState(htmlData) {
        htmlState = htmlData || null;
        if (htmlState) {
            renderizarIframe(htmlState);
        }
        // Timeout breve para dar tempo do Iframe renderizar antes de contar as tarefas no restore
        setTimeout(atualizarInterface, 100); 
    }

    function resetarEstado() {
        htmlState = null;
        pendingTasksCount = 0;
        const iframe = document.getElementById('balanca-iframe');
        if (iframe) iframe.srcdoc = '';
        atualizarInterface();
    }

    return { 
        abrirPainel, 
        fecharPainel, 
        processarUpload, 
        getHtmlState, 
        restoreHtmlState,
        resetarEstado,
        resetToGenerator,
        getPendingTasks: avaliarTarefasPendentes // Exporta a função "AO VIVO" para o Guardrail
    };
})();
