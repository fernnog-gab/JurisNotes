/* ================================================
   ed_balanca-manager.js
   Módulo de Integração Segura de Painéis HTML Externos (ED)
   ================================================ */
window.BalancaManager = (function() {
    'use strict';
    
    let htmlState = null;
    let pendingTasksCount = 0;

    // CONFIGURAÇÃO: Altere este seletor conforme o HTML real do seu template
    const BALANCA_CONFIG = {
        seletorTarefaAberta: 'input[type="checkbox"].tarefa-pendente:not(:checked)',
        seletorAlternativo: '.contador-de-tarefas-pendentes'
    };

    // Active Element Guard: Atalho Alt + B (Balança) protegido
    document.addEventListener('keydown', function(e) {
        if (e.altKey && (e.key === 'b' || e.key === 'B')) {
            // Verifica se o usuário está digitando ativamente em algum input nativo da aplicação
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const isTyping = activeTag === 'input' || activeTag === 'textarea' || document.activeElement.isContentEditable;
            
            if (!isTyping) {
                e.preventDefault();
                document.getElementById('upload-html-balanca').click();
            }
        }
    });

    function abrirPainel(event) {
        // Atalho via Ctrl+Clique no botão lateral
        if (event && event.ctrlKey) {
            document.getElementById('upload-html-balanca').click();
            return;
        }

        const backdrop = document.getElementById('balanca-modal-backdrop');
        const painel = document.getElementById('balanca-painel');
        const vazia = document.getElementById('balanca-vazia');
        const iframe = document.getElementById('balanca-iframe');

        backdrop.style.display = 'block';
        painel.style.display = 'flex';

        if (htmlState) {
            vazia.style.display = 'none';
            iframe.style.display = 'block';
        } else {
            vazia.style.display = 'flex';
            iframe.style.display = 'none';
        }
    }

    /**
     * Extrai tarefas usando o DOMParser estático. 
     * Evita problemas de Sandbox/CORS do Iframe e opera diretamente na string salva.
     */
    function extrairContadorDeTarefas(htmlString) {
        if (!htmlString) return 0;
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            
            const fallbackNode = doc.querySelector(BALANCA_CONFIG.seletorAlternativo);
            if (fallbackNode) {
                const num = parseInt(fallbackNode.textContent.trim(), 10);
                if (!isNaN(num)) return num;
            }

            const tarefas = doc.querySelectorAll(BALANCA_CONFIG.seletorTarefaAberta);
            return tarefas.length;
        } catch (e) {
            console.error("[Juris Notes ED] Erro ao parsear tarefas do HTML:", e);
            return 0;
        }
    }

    /**
     * Concentra toda a atualização de Interface (Single Source of Truth)
     */
    function atualizarInterfaceEContadores() {
        const btnBalanca = document.getElementById('btn-balanca-justica');
        const btnLembrete = document.getElementById('btn-lembretes-tarefa');
        const badge = document.getElementById('badge-tarefas');
        
        if (!btnBalanca || !btnLembrete) return;

        // Atualiza Estado da Balança (HTML Carregado)
        if (htmlState) {
            btnBalanca.classList.add('is-loaded');
            btnLembrete.disabled = false;
        } else {
            btnBalanca.classList.remove('is-loaded');
            btnLembrete.disabled = true;
        }

        // Computa e Atualiza Tarefas
        pendingTasksCount = extrairContadorDeTarefas(htmlState);

        if (pendingTasksCount > 0) {
            btnLembrete.classList.add('has-tasks');
            badge.style.display = 'flex';
            badge.textContent = pendingTasksCount > 99 ? '99+' : pendingTasksCount;
        } else {
            btnLembrete.classList.remove('has-tasks');
            badge.style.display = 'none';
        }
    }

    function fecharPainel() {
        sincronizarEstadoInterno();
        atualizarInterfaceEContadores(); // Atualiza contador e UI imediatamente após salvar
        
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
            atualizarInterfaceEContadores();
            
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
        iframe.srcdoc = conteudoHTML;
    }

    function sincronizarEstadoInterno() {
        const iframe = document.getElementById('balanca-iframe');
        if (!iframe || !htmlState) return;

        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            
            doc.querySelectorAll('textarea').forEach(el => { el.textContent = el.value; });
            doc.querySelectorAll('input[type="text"], input[type="number"], input[type="hidden"]').forEach(el => { el.setAttribute('value', el.value); });
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
            console.error("[Juris Notes ED] Sincronização do painel falhou. Possível bloqueio de Sandbox/CORS.", e);
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
        atualizarInterfaceEContadores(); // Garante o badge visível logo após recuperar o backup
    }

    function resetarEstado() {
        htmlState = null;
        pendingTasksCount = 0;
        const iframe = document.getElementById('balanca-iframe');
        if (iframe) iframe.srcdoc = '';
        atualizarInterfaceEContadores();
    }

    return { 
        abrirPainel, 
        fecharPainel, 
        processarUpload, 
        getHtmlState, 
        restoreHtmlState,
        resetarEstado,
        getPendingTasks: () => pendingTasksCount
    };
})();