/* ================================================
   pdf-highlighter.js
   Módulo de injeção visual de Highlights e Marcadores
   ================================================ */
window.PdfHighlighter = (function () {
    'use strict';

    /**
     * Calcula as coordenadas relativas de uma seleção de texto
     */
    function capturarCoordenadasSelecao(pageContainer) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects());
        const containerRect = pageContainer.getBoundingClientRect();

        return rects.map(rect => ({
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            width: rect.width,
            height: rect.height
        }));
    }

    /**
     * Desenha as marcações em uma página física específica.
     */
    function aplicarMarcacoesNaPagina(pageNum, pageContainer, topicosGlobais) {
        if (!pageContainer || !topicosGlobais) return;

        // Cleanup seguro antes de re-renderizar
        pageContainer.querySelectorAll('.pdf-highlight, .pdf-marker').forEach(el => el.remove());

        topicosGlobais.forEach(topico => {
            topico.anotacoes.forEach(anotacao => {
                _desenharAnotacao(anotacao, topico, pageNum, pageContainer);
                
                if (anotacao.itensCorrelacionados) {
                    anotacao.itensCorrelacionados.forEach(corr => {
                        _desenharAnotacao(corr, topico, pageNum, pageContainer);
                    });
                }
            });
        });
    }

    function _desenharAnotacao(item, topico, pageNumAtual, container) {
        // Validação estrita usando a página física (Int) garantindo compatibilidade com PJe
        if (!item.coordenadas || item.paginaFisica !== pageNumAtual) return;

        // Usa Heurística global para descobrir a fase e associar a classe CSS correta
        const fase = (typeof identificarFaseMetodologica === 'function') 
            ? identificarFaseMetodologica(item.documento) 
            : 4;

        const rects = item.coordenadas.rects;
        if (!rects || rects.length === 0) return;

        // 1. Marca-texto (apenas para extração de texto)
        if (item.tipo === 'texto') {
            rects.forEach(rect => {
                const highlight = document.createElement('div');
                highlight.className = `pdf-highlight highlight-fase-${fase}`;
                highlight.style.top = `${rect.top}px`;
                highlight.style.left = `${rect.left}px`;
                highlight.style.width = `${rect.width}px`;
                highlight.style.height = `${rect.height}px`;
                container.appendChild(highlight);
            });
        }

        // 2. Selo Marcador (canto esquerdo do primeiro rect de imagem ou texto)
        const primeiroRect = rects[0];
        const marker = document.createElement('div');
        marker.className = 'pdf-marker';
        marker.style.backgroundColor = topico.cor; // Cor da tese/tópico
        marker.style.top = `${primeiroRect.top}px`;
        marker.style.left = `${primeiroRect.left}px`;
        marker.setAttribute('data-tooltip', topico.nome);
        container.appendChild(marker);
    }

    return {
        capturarCoordenadasSelecao,
        aplicarMarcacoesNaPagina
    };
})();
