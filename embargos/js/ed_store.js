/* ================================================
   ed_store.js
   Gerenciamento de Estado Centralizado (Redux-Pattern) - ED
   ================================================ */
window.Store = (function() {
    'use strict';
    
    let state = { topicos: window.topicos || [], activeTabId: null };
    const subscribers = [];
    
    function applyMiddlewares(action, oldState, newState) {
        const mutatingActions = [
            'ADD_SUB_ANNOTATION', 'DELETE_SUB_ANNOTATION', 'TOGGLE_REVISION',
            'DELETE_ITEM'
        ];
        
        if (mutatingActions.includes(action.type)) {
            // PONTE LEGADA: Atualiza a variável global APENAS se houve mutação real
            window.topicos = newState.topicos;

            // Desacopla o I/O da thread principal da UI
            setTimeout(() => {
                if (window.salvarBackupAutomatico) window.salvarBackupAutomatico();
                if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
            }, 0);
        }
    }

    function _resolveTargetNode(topico, parentIndex, viewSource) {
        if (parentIndex === null) {
            if (viewSource === 'global') return { subAnotacoes: topico.diretrizesGlobais };
            if (viewSource.startsWith('vicio:')) {
                const nomeVicio = viewSource.replace('vicio:', '');
                return { subAnotacoes: topico.diretrizesPorVicio[nomeVicio] };
            }
        }
        const cardMestre = topico.anotacoes[parentIndex];
        if (viewSource === 'main') return cardMestre;
        return cardMestre.itensCorrelacionados[parseInt(viewSource, 10)];
    }

    function dispatch(action) {
        const oldState = state;
        const newState = structuredClone(state); // Imutabilidade via V8 Clone

        switch (action.type) {
            case 'LOAD_BACKUP': {
                newState.topicos = action.payload;
                break;
            }
            case 'SET_TAB': {
                newState.activeTabId = action.payload;
                break;
            }
            case 'ADD_SUB_ANNOTATION': {
                const { topicoId, parentIndex, viewSource, noIdeia } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    const alvo = _resolveTargetNode(topico, parentIndex, viewSource);
                    if (!alvo.subAnotacoes) alvo.subAnotacoes = [];
                    alvo.subAnotacoes.push(noIdeia);
                }
                break;
            }
            case 'DELETE_SUB_ANNOTATION': {
                const { topicoId, parentIndex, viewSource, localIndex } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    const alvo = _resolveTargetNode(topico, parentIndex, viewSource);
                    if (alvo && alvo.subAnotacoes) alvo.subAnotacoes.splice(localIndex, 1);
                }
                break;
            }
            case 'TOGGLE_REVISION': {
                const { topicoId, parentIndex, viewSource, localIndex } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    const alvo = _resolveTargetNode(topico, parentIndex, viewSource);
                    const sub = alvo.subAnotacoes[localIndex];
                    if (sub) sub.revisada = !sub.revisada;
                }
                break;
            }
            case 'DELETE_ITEM': {
                const { topicoId, index } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) topico.anotacoes.splice(index, 1);
                break;
            }
        }

        state = newState;
        applyMiddlewares(action, oldState, newState);
        subscribers.forEach(sub => sub(state));
    }

    return { getState: () => state, dispatch, subscribe: (fn) => subscribers.push(fn) };
})();