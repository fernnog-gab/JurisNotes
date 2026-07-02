/* ================================================
   balanca-manager.js
   Módulo de Integração Segura de Painéis HTML Externos
   ================================================ */
window.BalancaManager = (function() {
    'use strict';
    
    let htmlState = null;
    let pendingTasksCount = 0;

    // Active Element Guard: Atalho Alt + B (Balança) protegido
    document.addEventListener('keydown', function(e) {
        if (e.altKey && (e.key === 'b' || e.key === 'B')) {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const isTyping = activeTag === 'input' || activeTag === 'textarea' || document.activeElement.isContentEditable;
            
            if (!isTyping) {
                e.preventDefault();
                // Se já tem HTML, apenas abre. Se não, abre o gerador.
                htmlState ? abrirPainel() : resetToGenerator();
            }
        }
    });

    // NOVO: Validação estrita de segurança e listener de mensagens
    window.addEventListener('message', function(event) {
        // Aceita a própria origem (Produção) ou localhost (Dev)
        const allowedOrigins = [window.location.origin, 'http://localhost', 'http://127.0.0.1'];
        if (!allowedOrigins.some(origin => event.origin.startsWith(origin))) return;

        if (event.data && event.data.type === 'DOSSIE_GENERATED') {
            htmlState = event.data.html;
            
            const iframe = document.getElementById('balanca-iframe');
            iframe.removeAttribute('src'); // Limpa URL do gerador
            iframe.srcdoc = htmlState;     // Injeta Dossiê renderizado

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
            iframe.src = '../dossie/index.html'; // Caminho realocado do gerador
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
    // NOVO: MOTOR DE LEITURA DE TAREFAS PRECISO
    // ==========================================
    function avaliarTarefasPendentes() {
        let count = 0;
        const iframe = document.getElementById('balanca-iframe');

        // TENTATIVA 1: Ler do Iframe AO VIVO (Garante dados frescos se o painel estiver aberto na hora da exportação)
        if (iframe && iframe.contentDocument) {
            try {
                const doc = iframe.contentDocument;
                const obsList = doc.getElementById('obs-list'); // Lê exatamente do seu HTML
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
                console.warn("[Juris Notes] Erro ao analisar tarefas do HTML salvo.", e);
            }
        }

        return count;
    }

    // ==========================================
    // NOVO: ATUALIZAÇÃO VISUAL CENTRALIZADA
    // ==========================================
    function atualizarInterface() {
        const btnBalanca = document.getElementById('btn-balanca-justica');
        const btnLembrete = document.getElementById('btn-lembretes-tarefa');
        const badge = document.getElementById('badge-tarefas');
        
        if (!btnBalanca || !btnLembrete) return;

        // Regra 1: O ícone da balança só fica amarelo se houver HTML carregado
        if (htmlState) {
            btnBalanca.classList.add('is-loaded');
            btnLembrete.disabled = false;
        } else {
            btnBalanca.classList.remove('is-loaded');
            btnLembrete.disabled = true;
        }

        // Regra 2: Computa e pinta as tarefas
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
        atualizarInterface(); // <--- ATUALIZA A BOLINHA VERMELHA AO FECHAR O PAINEL
        
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
            atualizarInterface(); // <--- ATUALIZA UI AO CARREGAR
            
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
            console.error("[Juris Notes] Sincronização do painel falhou.", e);
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

    /**
     * Valida tarefas pendentes e emite um alerta nativo síncrono se houver pendências.
     * @param {string} acaoDesejada - Texto descritivo da ação (ex: "copiar o pacote para a IA").
     * @returns {boolean} - Retorna true se puder prosseguir (sem tarefas ou usuário confirmou), false se abortado.
     */
    function executarGuardrailDeTarefas(acaoDesejada) {
        // PERFOMANCE: Chamada única ao DOM para evitar layout thrashing
        const count = avaliarTarefasPendentes(); 
        
        if (count > 0) {
            const msg = `ATENÇÃO: Existem ${count} tarefa(s) pendente(s) não concluídas no Painel da Balança.\n\nTem certeza de que deseja ${acaoDesejada} mesmo assim?`;
            return confirm(msg); // Bloqueia a thread e retorna a decisão do usuário
        }
        return true; // Passe livre se não houver tarefas
    }

    // ==========================================
    // NOVO: MOTOR DE EXTRAÇÃO DE ABAS (ULTRA-RESILIENTE)
    // ==========================================
    function extrairAbasEmLote() {
        const iframe = document.getElementById('balanca-iframe');
        if (!iframe || !iframe.contentDocument) {
            if (typeof window.exibirToast === 'function') window.exibirToast('Não foi possível ler o documento do Dossiê.', 'erro');
            return;
        }

        const doc = iframe.contentDocument;
        let nomesExtraidos = [];
        let headerNode = null;

        try {
            // PASSO 1: Varredura Profunda para achar o texto, não importando a tag (h1, strong, div, p...)
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null, false);
            while (walker.nextNode()) {
                const el = walker.currentNode;
                // Evita nós gigantes (body, main) e foca em elementos que contêm o texto diretamente
                if (el.children.length <= 2 && el.textContent.length < 150) { 
                    const textoLimpo = el.textContent.toLowerCase();
                    if (textoLimpo.includes('trilha') && textoLimpo.includes('julgamento')) {
                        headerNode = el;
                        break; // Achou o ponto de ancoragem!
                    }
                }
            }

            if (headerNode) {
                // PASSO 2: Acha a primeira Lista HTML (ul, ol) que aparece fisicamente DEPOIS do título
                let targetList = null;
                const allLists = Array.from(doc.querySelectorAll('ul, ol'));
                
                for (let list of allLists) {
                    // compareDocumentPosition = 4 significa que a lista está DEPOIS do título no HTML
                    if (headerNode.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING) {
                        targetList = list;
                        break;
                    }
                }

                // Se achou uma lista padrão de HTML, extrai os <li>
                if (targetList) {
                    const items = targetList.querySelectorAll('li');
                    items.forEach(li => {
                        const text = Array.from(li.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE)
                            .map(node => node.textContent)
                            .join('')
                            .trim()
                            .replace(/\s+/g, ' '); // Tira espaços múltiplos
                        if (text.length > 2) nomesExtraidos.push(text);
                    });
                } 
                
                // PASSO 3 (FALLBACK DE INTELIGÊNCIA): E se o Dossiê usar caixas de texto (textarea)?
                if (nomesExtraidos.length === 0) {
                    const allTextareas = Array.from(doc.querySelectorAll('textarea'));
                    for (let ta of allTextareas) {
                        if (headerNode.compareDocumentPosition(ta) & Node.DOCUMENT_POSITION_FOLLOWING) {
                            // Pega o texto da textarea, quebra por linhas (Enters)
                            const linhas = ta.value.split('\n');
                            linhas.forEach(linha => {
                                // Limpa caracteres que o usuário possa ter usado (hífen, pontos, números ex: "1. ", "- ")
                                const linhaLimpa = linha.replace(/^[-*•\d.)\]]+\s*/, '').trim();
                                if (linhaLimpa.length > 2) nomesExtraidos.push(linhaLimpa);
                            });
                            break; // Pega apenas a primeira textarea após o título
                        }
                    }
                }
            }

            // PASSO 4: Validação Final e Envio
            if (nomesExtraidos.length === 0) {
                throw new Error("Marcador 'Trilha de Julgamento' encontrado, mas nenhuma lista ou texto localizado após ele.");
            }

            if (typeof window.criarTopicosEmLote === 'function') {
                window.criarTopicosEmLote(nomesExtraidos);
            }

        } catch (e) {
            console.warn("[Juris Notes] Detalhe do Erro na Extração em Lote:", e);
            if (typeof window.exibirToast === 'function') {
                window.exibirToast('Trilha de Julgamento não localizada ou está vazia no documento atual.', 'aviso');
            }
        }
    }

    return { 
        abrirPainel, 
        fecharPainel, 
        processarUpload, 
        getHtmlState, 
        restoreHtmlState,
        resetarEstado,
        resetToGenerator,
        getPendingTasks: avaliarTarefasPendentes,
        executarGuardrailDeTarefas, // <--- NOVA FUNÇÃO EXPORTADA
        extrairAbasEmLote           // <--- EXPORTAÇÃO DA EXTRAÇÃO LOTE
    };
})();
