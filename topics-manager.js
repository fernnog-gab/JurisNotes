/* ================================================
   topics-manager.js
   Gerenciador do Fichário de Tópicos e Anotações
   ================================================ */
window.TopicsManager = (function () {
    'use strict';

    // Paleta de 25 cores suaves para as abas
    const CORES_TOPICOS = [
        '#E3F2FD', '#F3E5F5', '#FBE9E7', '#E8F5E9', '#FFF3E0', 
        '#E0F7FA', '#FCE4EC', '#F1F8E9', '#EFEBE9', '#FFF8E1',
        '#EDF2F4', '#FADADD', '#D5E8D4', '#FFE6CC', '#E1D5E7',
        '#DAE8FC', '#FFF2CC', '#F8CECC', '#E6D0DE', '#D0CEE2',
        '#CDEBFA', '#D9E0F2', '#EAE5D9', '#F5D0A9', '#D1E8E2'
    ];

    let activeTabId = null;

    /**
     * Retorna uma cor da paleta com suporte a módulo (infinitos tópicos)
     */
    function obterCor(index) {
        return CORES_TOPICOS[index % CORES_TOPICOS.length];
    }

    /**
     * Fábrica de cards minimalistas integrados à nova paleta
     */
    function criarCard(anotacao) {
        const isAutora = anotacao.polo === 'Parte Autora';
        const classePolo = isAutora ? 'card-autora' : 'card-re';
        const data = new Date(anotacao.timestamp);
        const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const htmlConteudo = anotacao.tipo === 'texto'
            ? `<p class="card-texto">"${anotacao.conteudo}"</p>`
            : `<img class="card-imagem" src="${anotacao.conteudo}" alt="Recorte - Pág. ${anotacao.pagina}">`;

        return `
            <div class="annotation-card ${classePolo}">
                <div class="card-header">
                    <span class="polo-nome">[${anotacao.polo}]</span>
                    <span class="card-meta">${hora} — Pág. ${anotacao.pagina}</span>
                </div>
                ${htmlConteudo}
            </div>
        `;
    }

    /**
     * Re-renderiza o fichário inteiro, mantendo a Single Source of Truth do app.js
     */
    function renderizarFichario(topicosArray) {
        const headerEl = document.getElementById('topics-tabs-header');
        const contentEl = document.getElementById('topics-tab-content');

        if (!headerEl || !contentEl) return;

        // Estado Vazio
        if (topicosArray.length === 0) {
            headerEl.innerHTML = '';
            contentEl.innerHTML = `
                <p class="empty-state">
                    Nenhum tópico criado.<br>
                    Use o botão <strong>+</strong> na barra lateral para criar um Tópico Recursal.
                </p>`;
            contentEl.style.borderTopColor = 'transparent';
            contentEl.style.backgroundColor = 'transparent';
            return;
        }

        // Resiliência: se a aba ativa não existir ou foi apagada, assume a primeira
        if (!activeTabId || !topicosArray.some(t => t.id === activeTabId)) {
            activeTabId = topicosArray[0].id;
        }

        // 1. Construir Abas
        headerEl.innerHTML = '';
        topicosArray.forEach(topico => {
            const isActive = topico.id === activeTabId;
            const btn = document.createElement('div');
            
            btn.className = `topic-tab-btn ${isActive ? 'active' : ''}`;
            btn.textContent = topico.nome;
            btn.title = topico.nome; // Tooltip nativo
            btn.style.backgroundColor = topico.cor;

            // O pulo do gato do UI design: A aba ativa projeta sua cor na borda do painel inferior
            if (isActive) {
                contentEl.style.borderTop = `3px solid ${topico.cor}`;
                contentEl.style.backgroundColor = '#ffffff'; // Fundo branco imitando papel
            }

            // Bind do clique para alternância de aba
            btn.onclick = () => {
                activeTabId = topico.id;
                renderizarFichario(topicosArray); // Re-render controlado
            };

            headerEl.appendChild(btn);
        });

        // 2. Construir Conteúdo
        const topicoAtivo = topicosArray.find(t => t.id === activeTabId);
        if (topicoAtivo) {
            if (topicoAtivo.anotacoes.length === 0) {
                contentEl.innerHTML = `<p class="empty-state" style="margin-top:20px;">Tópico vazio. Adicione extrações do documento.</p>`;
            } else {
                contentEl.innerHTML = topicoAtivo.anotacoes.map(criarCard).join('');
            }
        }
    }

    // API Pública do Módulo
    return {
        obterCor,
        renderizarFichario
    };
})();
