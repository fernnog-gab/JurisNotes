/* ================================================
   topics-manager.js  —  v2.0
   Gerenciador do Fichário de Tópicos e Anotações
   ================================================ */
window.TopicsManager = (function () {
    'use strict';

    // Paleta de 25 cores suaves para as abas de tópicos
    const CORES_TOPICOS = [
        '#E3F2FD', '#F3E5F5', '#FBE9E7', '#E8F5E9', '#FFF3E0',
        '#E0F7FA', '#FCE4EC', '#F1F8E9', '#EFEBE9', '#FFF8E1',
        '#EDF2F4', '#FADADD', '#D5E8D4', '#FFE6CC', '#E1D5E7',
        '#DAE8FC', '#FFF2CC', '#F8CECC', '#E6D0DE', '#D0CEE2',
        '#CDEBFA', '#D9E0F2', '#EAE5D9', '#F5D0A9', '#D1E8E2'
    ];

    let activeTabId = null;

    /**
     * Retorna uma cor da paleta com suporte a módulo (infinitos tópicos).
     */
    function obterCor(index) {
        return CORES_TOPICOS[index % CORES_TOPICOS.length];
    }

    /**
     * Converte a string do polo em uma classe CSS válida.
     */
    function poloParaClasse(polo) {
        return 'tag-' + polo
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') 
            .replace(/[^a-z0-9]+/g, '-')     
            .replace(/^-|-$/g, '');          
    }

    /**
     * Fábrica de cards no formato de balão de linha do tempo.
     */
    function criarCard(anotacao, index) {
        const numero   = index + 1;
        const tagClass = poloParaClasse(anotacao.polo);
        const hora     = new Date(anotacao.timestamp)
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const htmlConteudo = anotacao.tipo === 'texto'
            ? `<p class="card-texto">"${anotacao.conteudo}"</p>`
            : `<img class="card-imagem" src="${anotacao.conteudo}" alt="Recorte — Pág. ${anotacao.pagina}">`;

        return `
            <div class="timeline-item">
                <div class="timeline-number">${numero}</div>
                <div class="annotation-card">
                    <div class="card-header">
                        <span class="polo-tag ${tagClass}">${anotacao.polo}</span>
                        <span class="card-meta">${hora} — Pág. ${anotacao.pagina}</span>
                    </div>
                    ${htmlConteudo}
                </div>
            </div>
        `;
    }

    /**
     * Re-renderiza o fichário inteiro.
     */
    function renderizarFichario(topicosArray) {
        const headerEl  = document.getElementById('topics-tabs-header');
        const contentEl = document.getElementById('topics-tab-content');

        if (!headerEl || !contentEl) return;

        // Estado vazio: nenhum tópico criado ainda
        if (topicosArray.length === 0) {
            headerEl.innerHTML = '';
            contentEl.innerHTML = `
                <p class="empty-state">
                    Nenhum tópico criado.<br>
                    Use o botão <strong>+</strong> na barra lateral para criar um Tópico Recursal.
                </p>`;
            contentEl.style.borderTop       = 'none';
            contentEl.style.backgroundColor = 'transparent';
            return;
        }

        // Resiliência: garante que sempre há uma aba ativa válida
        if (!activeTabId || !topicosArray.some(t => t.id === activeTabId)) {
            activeTabId = topicosArray[0].id;
        }

        // 1. Construir as abas do fichário
        headerEl.innerHTML = '';
        topicosArray.forEach(topico => {
            const isActive = topico.id === activeTabId;
            const btn      = document.createElement('div');

            btn.className        = `topic-tab-btn ${isActive ? 'active' : ''}`;
            btn.textContent      = topico.nome;
            btn.title            = topico.nome; 
            btn.style.backgroundColor = topico.cor;

            if (isActive) {
                contentEl.style.borderTop       = `3px solid ${topico.cor}`;
                contentEl.style.backgroundColor = '#ffffff';
            }

            btn.onclick = () => {
                activeTabId = topico.id;
                renderizarFichario(topicosArray);
            };

            headerEl.appendChild(btn);
        });

        // 2. Construir o conteúdo do tópico ativo
        const topicoAtivo = topicosArray.find(t => t.id === activeTabId);
        if (!topicoAtivo) return;

        if (topicoAtivo.anotacoes.length === 0) {
            contentEl.innerHTML = `
                <p class="empty-state" style="margin-top: 20px;">
                    Tópico vazio. Adicione extrações do documento.
                </p>`;
        } else {
            const cardsHTML = topicoAtivo.anotacoes.map(criarCard).join('');
            contentEl.innerHTML = `<div class="timeline-container">${cardsHTML}</div>`;
        }
    }

    // API pública do módulo
    return {
        obterCor,
        renderizarFichario
    };

})();
