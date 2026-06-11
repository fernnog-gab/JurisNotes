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

    function fecharPainel() {
        // Captura todas as alterações antes de ocultar o DOM
        sincronizarEstadoInterno();
        
        document.getElementById('balanca-modal-backdrop').style.display = 'none';
        document.getElementById('balanca-painel').style.display = 'none';
        
        // Aciona o salvamento automático para persistir no .json
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
            atualizarUI();
            
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

    function atualizarUI() {
        const btn = document.getElementById('btn-balanca-justica');
        if (!btn) return;
        
        if (htmlState) {
            btn.classList.add('is-loaded');
        } else {
            btn.classList.remove('is-loaded');
        }
    }

    /**
     * ALGORITMO DE EXTRAÇÃO SEGURA:
     * Varre o iframe e consolida visual (value) no HTML nativo (attributes)
     * Previne vulnerabilidades de XSS substituindo innerHTML por textContent em textareas.
     */
    function sincronizarEstadoInterno() {
        const iframe = document.getElementById('balanca-iframe');
        if (!iframe || !htmlState) return;

        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            
            // 1. Textareas (Prevenção XSS via textContent)
            doc.querySelectorAll('textarea').forEach(el => {
                el.textContent = el.value; 
            });

            // 2. Inputs de Texto e Número
            doc.querySelectorAll('input[type="text"], input[type="number"], input[type="hidden"]').forEach(el => {
                el.setAttribute('value', el.value);
            });

            // 3. Inputs Booleanos (Checkbox/Radio)
            doc.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(el => {
                if (el.checked) el.setAttribute('checked', 'checked');
                else el.removeAttribute('checked');
            });

            // 4. Selects (Comboboxes)
            doc.querySelectorAll('select').forEach(select => {
                Array.from(select.options).forEach(opt => {
                    if (opt.selected) opt.setAttribute('selected', 'selected');
                    else opt.removeAttribute('selected');
                });
            });

            // Extrai o snapshot final limpo e renderizável
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
        atualizarUI();
    }

    return { 
        abrirPainel, 
        fecharPainel, 
        processarUpload, 
        getHtmlState, 
        restoreHtmlState
    };
})();